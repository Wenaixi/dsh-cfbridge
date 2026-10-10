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

  // 记录每次渲染出的开关。技能按名字排序渲染，每个技能两个开关，
  // 因此开关数组的下标可以稳定映射回技能与轴。
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
 *
 * lib/client.js 跑在独立 realm 里，它的数组原型与测试进程不同，直接
 * deepEqual 会退化成引用比较，因此这里显式拷贝成本地数组。
 */
function readProjection(entry) {
  const projection = {}
  for (const op of entry.ops) {
    assert.equal(op.op, 'set')
    projection[op.path[0]] = [...op.value]
  }
  return projection
}

test('skill switches project the three volatile fields through the real row panel', async () => {
  const { row, switches, render } = await mountClientPanel()
  switches.length = 0

  const mutated = []
  const form = {
    state: ZERO_REVISION_STATE(
      { disabledSkills: [], modelHiddenSkills: [], userHiddenSkills: [] },
      { availableSkills: ['wrangler', 'cloudflare'] },
    ).state,
    mutate(ops, revision) { mutated.push({ ops, revision }); return Promise.resolve(true) },
  }

  render(row.component({ view: 'page', form, t: (key) => key, ui: {} }))
  // 渲染按技能名排序：cloudflare 在前，wrangler 在后；每行两个开关（model, user）。
  assert.equal(switches.length, 4, '两个技能各两个开关')
  assert.deepEqual(switches.map((s) => s.label), ['model', 'user', 'model', 'user'])
  assert.deepEqual(switches.map((s) => s.checked), [true, true, true, true])

  const wranglerModel = switches[2]

  wranglerModel.onChange(false)
  await new Promise((r) => setImmediate(r))

  assert.equal(mutated.length, 1)
  const [entry] = mutated
  assert.equal(entry.revision, 7, '写入必须带上当前 revision')
  assert.deepEqual(readProjection(entry), {
    disabledSkills: [],
    modelHiddenSkills: ['wrangler'],
    userHiddenSkills: [],
  })
})

test('re-enabling one axis does not silently re-enable the other axis', async () => {
  const { row, switches, render } = await mountClientPanel()
  switches.length = 0

  const mutated = []
  const form = {
    state: ZERO_REVISION_STATE(
      // 历史落盘形态：技能只在 disabledSkills 里，两个隐藏名单均为空。
      { disabledSkills: ['wrangler'], modelHiddenSkills: [], userHiddenSkills: [] },
      { availableSkills: ['wrangler', 'cloudflare'] },
    ).state,
    mutate(ops, revision) { mutated.push({ ops, revision }); return Promise.resolve(true) },
  }

  render(row.component({ view: 'page', form, t: (key) => key, ui: {} }))
  // cloudflare 在前（两个开关都开），wrangler 在后（两个都关）。
  assert.deepEqual(switches.map((s) => s.checked), [true, true, false, false])
  const wranglerModel = switches[2]
  assert.equal(wranglerModel.label, 'model')

  wranglerModel.onChange(true)
  await new Promise((r) => setImmediate(r))

  assert.equal(mutated.length, 1)
  // 只打开模型轴：模型可调用、人类仍不可调用。
  // disabledSkills 的契约是「两轴都关」，此处不适用，只能用 userHiddenSkills 表达。
  assert.deepEqual(readProjection(mutated[0]), {
    disabledSkills: [],
    modelHiddenSkills: [],
    userHiddenSkills: ['wrangler'],
  })
})

test('re-enabling the user axis does not silently re-enable the model axis', async () => {
  const { row, switches, render } = await mountClientPanel()
  switches.length = 0

  const mutated = []
  const form = {
    state: ZERO_REVISION_STATE(
      { disabledSkills: ['wrangler'], modelHiddenSkills: [], userHiddenSkills: [] },
      { availableSkills: ['wrangler', 'cloudflare'] },
    ).state,
    mutate(ops, revision) { mutated.push({ ops, revision }); return Promise.resolve(true) },
  }

  render(row.component({ view: 'page', form, t: (key) => key, ui: {} }))
  const wranglerUser = switches[3]
  assert.equal(wranglerUser.label, 'user')
  assert.equal(wranglerUser.checked, false)

  wranglerUser.onChange(true)
  await new Promise((r) => setImmediate(r))

  assert.equal(mutated.length, 1)
  // 只打开人类轴：模型轴必须保持关闭。
  assert.deepEqual(readProjection(mutated[0]), {
    disabledSkills: [],
    modelHiddenSkills: ['wrangler'],
    userHiddenSkills: [],
  })
})

test('closing the last open axis upgrades to disabledSkills instead of two hidden lists', async () => {
  const { row, switches, render } = await mountClientPanel()
  switches.length = 0

  const mutated = []
  const form = {
    state: ZERO_REVISION_STATE(
      { disabledSkills: [], modelHiddenSkills: [], userHiddenSkills: [] },
      { availableSkills: ['wrangler', 'cloudflare'] },
    ).state,
    mutate(ops, revision) { mutated.push({ ops, revision }); return Promise.resolve(true) },
  }

  render(row.component({ view: 'page', form, t: (key) => key, ui: {} }))
  switches[2].onChange(false) // wrangler 的模型开关：关
  await new Promise((r) => setImmediate(r))
  assert.deepEqual(readProjection(mutated[0]), {
    disabledSkills: [],
    modelHiddenSkills: ['wrangler'],
    userHiddenSkills: [],
  })
})

test('mode radio switches mutate loadMode field', async () => {
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
  assert.equal(radios[0].props.value, 'global')
  assert.equal(radios[0].props.checked, true)
  assert.equal(radios[1].props.value, 'preset')
  assert.equal(radios[1].props.checked, false)

  radios[1].props.onChange()
  await new Promise((r) => setImmediate(r))

  assert.equal(mutated.length, 1)
  const [entry] = mutated
  assert.equal(entry.ops.length, 1)
  assert.equal(entry.ops[0].op, 'set')
  assert.equal(entry.ops[0].path[0], 'loadMode')
  assert.equal(entry.ops[0].value, 'preset')
})
