import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// ---------------------------------------------------------------------------
// 客户端面板行为：真实产物 + 真实 slot seam
// ---------------------------------------------------------------------------

/**
 * 在 Node 里把 lib/client.js 当作浏览器产物跑起来，并接到真实注册的行配置组件。
 *
 * 为什么不引入 React 测试库：客户端产物是 CJS factory，宿主只给 props。
 * 用最小 createElement/useState 替身即可让函数组件真正执行，从而验证
 * 「开关点击 -> 三字段投影 -> form.mutate」这条真实行为，而不是源码文本。
 */
async function mountClientPanel() {
  const clientSource = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let captured
  const sandbox = {
    __ModuleLoader__: { load(entry) { captured = entry } },
  }
  const { runInNewContext } = await import('node:vm')
  runInNewContext(clientSource, { window: sandbox, console, Symbol, Object, Array, Set, JSON })
  assert.ok(captured, 'lib/client.js 未调用 __ModuleLoader__.load')

  const switches = []
  function createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.filter((c) => c !== null && c !== undefined) }
  }
  const reactStub = {
    createElement,
    useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}] },
    Fragment: Symbol('Fragment'),
  }
  const primitivesStub = {
    Switch(props) { switches.push(props); return createElement('switch-stub', props) },
    StateDot: () => null,
  }
  const exportsObj = captured.factory((name) => {
    if (name === 'react') return reactStub
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub
    throw new Error('unexpected require: ' + name)
  })

  const registered = []
  const dictionaries = []
  const ctx = {
    locale: {
      register(ns, dict) { dictionaries.push({ ns, dict }); return () => {} },
      bind() { return (key) => key },
    },
    slots: {
      inject(_name, callback) { return callback() },
      register(meta, component) { registered.push({ meta, component }); return () => {} },
    },
    effect(fn) { return fn() },
  }
  exportsObj.apply(ctx)

  const row = registered.find((entry) => entry.meta.name === 'plugins.row.config')
  assert.ok(row, '客户端未注册 plugins.row.config')
  assert.equal(row.meta.key, '@wenaixi/cfbridge#cfbridge')

  /** 递归执行函数组件，把它们返回的 element 树摊平成可断言的节点。 */
  function render(node) {
    if (node === null || node === undefined || typeof node === 'boolean') return []
    if (typeof node === 'string' || typeof node === 'number') return [node]
    if (Array.isArray(node)) return node.flatMap(render)
    if (typeof node.type === 'function') {
      return render(node.type(node.props))
    }
    return [node, ...node.children.flatMap(render)]
  }

  return { row, switches, render, dictionaries }
}

const ZERO_REVISION_STATE = (user, value) => ({
  state: { status: 'ready', value, user, revision: 7, writable: true },
})

/**
 * 把一次 mutate 的三个投影字段读成本地快照。
 */
function readProjection(entry) {
  const projection = {}
  for (const op of entry.ops) {
    assert.equal(op.op, 'set')
    projection[op.path[0]] = [...op.value]
  }
  return projection
}

test('skill switches and MCP switch project volatile fields through the real row panel', async () => {
  const { row, switches, render } = await mountClientPanel()
  switches.length = 0

  const mutated = []
  const form = {
    state: ZERO_REVISION_STATE(
      { disabledSkills: [], modelHiddenSkills: [], userHiddenSkills: [], mcpEnabled: true },
      { availableSkills: ['wrangler', 'cloudflare'] },
    ).state,
    mutate(ops, revision) { mutated.push({ ops, revision }); return Promise.resolve(true) },
  }

  render(row.component({ view: 'page', form, t: (key) => key, ui: {} }))
  // 1 个 MCP 总控开关 + 2 个单一技能开关（cloudflare, wrangler）
  assert.equal(switches.length, 3, '1 个 MCP 开关与 2 个技能开关')
  assert.equal(switches[0].label, 'mcpSection')
  assert.equal(switches[0].checked, true)
  assert.equal(switches[1].label, 'cloudflare')
  assert.equal(switches[1].checked, true)
  assert.equal(switches[2].label, 'wrangler')
  assert.equal(switches[2].checked, true)

  // 1. 关闭 wrangler 技能
  switches[2].onChange(false)
  await new Promise((r) => setImmediate(r))

  assert.equal(mutated.length, 1)
  const [entry1] = mutated
  assert.equal(entry1.revision, 7, '写入必须带上当前 revision')
  assert.deepEqual(readProjection(entry1), {
    disabledSkills: ['wrangler'],
    modelHiddenSkills: [],
    userHiddenSkills: [],
  })

  // 2. 关闭 MCP 总控开关
  mutated.length = 0
  switches[0].onChange(false)
  await new Promise((r) => setImmediate(r))

  assert.equal(mutated.length, 1)
  const [entry2] = mutated
  assert.equal(entry2.ops.length, 1)
  assert.equal(entry2.ops[0].op, 'set')
  assert.equal(entry2.ops[0].path[0], 'mcpEnabled')
  assert.equal(entry2.ops[0].value, false)
})

test('re-enabling skill cleans disabledSkills and hidden lists atomically', async () => {
  const { row, switches, render } = await mountClientPanel()
  switches.length = 0

  const mutated = []
  const form = {
    state: ZERO_REVISION_STATE(
      // 历史落盘形态：技能在 disabledSkills 里
      { disabledSkills: ['wrangler'], modelHiddenSkills: [], userHiddenSkills: [] },
      { availableSkills: ['wrangler', 'cloudflare'] },
    ).state,
    mutate(ops, revision) { mutated.push({ ops, revision }); return Promise.resolve(true) },
  }

  render(row.component({ view: 'page', form, t: (key) => key, ui: {} }))
  // cloudflare 开启，wrangler 关闭
  assert.equal(switches[1].checked, true)
  assert.equal(switches[2].checked, false)

  switches[2].onChange(true)
  await new Promise((r) => setImmediate(r))

  assert.equal(mutated.length, 1)
  assert.deepEqual(readProjection(mutated[0]), {
    disabledSkills: [],
    modelHiddenSkills: [],
    userHiddenSkills: [],
  })
})

test('mode card radio switches mutate loadMode field', async () => {
  const { row, render } = await mountClientPanel()
  const mutated = []
  const form = {
    state: ZERO_REVISION_STATE(
      { loadMode: 'global', disabledSkills: [], modelHiddenSkills: [], userHiddenSkills: [] },
      { availableSkills: ['cloudflare'] },
    ).state,
    mutate(ops, revision) { mutated.push({ ops, revision }); return Promise.resolve(true) },
  }

  const nodes = render(row.component({ view: 'page', form, t: (key) => key, ui: {} }))
  const radios = nodes.filter((n) => n.type === 'input' && n.props?.type === 'radio')
  assert.equal(radios.length, 2, '两个运行模式单选框')

  const presetRadio = radios.find((r) => r.props.value === 'preset')
  const globalRadio = radios.find((r) => r.props.value === 'global')
  assert.ok(presetRadio)
  assert.ok(globalRadio)
  assert.equal(globalRadio.props.checked, true)
  assert.equal(presetRadio.props.checked, false)

  presetRadio.props.onChange()
  await new Promise((r) => setImmediate(r))

  assert.equal(mutated.length, 1)
  const [entry] = mutated
  assert.equal(entry.ops.length, 1)
  assert.equal(entry.ops[0].op, 'set')
  assert.equal(entry.ops[0].path[0], 'loadMode')
  assert.equal(entry.ops[0].value, 'preset')
})

test('mode card radio defaults to preset when loadMode is unspecified', async () => {
  const { row, render } = await mountClientPanel()
  const mutated = []
  const form = {
    state: ZERO_REVISION_STATE(
      { disabledSkills: [], modelHiddenSkills: [], userHiddenSkills: [] },
      { availableSkills: ['cloudflare'] },
    ).state,
    mutate(ops, revision) { mutated.push({ ops, revision }); return Promise.resolve(true) },
  }

  const nodes = render(row.component({ view: 'page', form, t: (key) => key, ui: {} }))
  const radios = nodes.filter((n) => n.type === 'input' && n.props?.type === 'radio')
  assert.equal(radios.length, 2, '两个运行模式单选框')

  const presetRadio = radios.find((r) => r.props.value === 'preset')
  const globalRadio = radios.find((r) => r.props.value === 'global')
  assert.ok(presetRadio)
  assert.ok(globalRadio)
  assert.equal(presetRadio.props.checked, true, '默认必须选中 preset 模式')
  assert.equal(globalRadio.props.checked, false)

  globalRadio.props.onChange()
  await new Promise((r) => setImmediate(r))

  assert.equal(mutated.length, 1)
  const [entry] = mutated
  assert.equal(entry.ops.length, 1)
  assert.equal(entry.ops[0].op, 'set')
  assert.equal(entry.ops[0].path[0], 'loadMode')
  assert.equal(entry.ops[0].value, 'global')
})

test('panel renders search input and batch control buttons', async () => {
  const { row, render } = await mountClientPanel()
  const form = {
    state: ZERO_REVISION_STATE(
      { disabledSkills: [], modelHiddenSkills: [], userHiddenSkills: [] },
      { availableSkills: ['wrangler', 'cloudflare'] },
    ).state,
    mutate() { return Promise.resolve(true) },
  }

  const nodes = render(row.component({ view: 'page', form, t: (key) => key, ui: {} }))
  const inputs = nodes.filter((n) => n.type === 'input' && n.props?.type === 'text')
  assert.equal(inputs.length, 1, '存在实时搜索输入框')

  const buttons = nodes.filter((n) => n.type === 'button')
  assert.equal(buttons.length, 2, '存在全部启用与全部停用按钮')
})
