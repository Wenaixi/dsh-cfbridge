import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

/**
 * 在纯 Node 环境下从构建产物 lib/client.js 加载 PanelController。
 * 零 React 依赖、零 DOM 树、零外部测试库，毫秒级脱机加载。
 */
async function loadController() {
  const clientSource = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let captured
  const sandbox = {
    __ModuleLoader__: { load(entry) { captured = entry } },
  }
  const { runInNewContext } = await import('node:vm')
  runInNewContext(clientSource, {
    window: sandbox,
    console,
    Symbol,
    Object,
    Array,
    Set,
    JSON,
  })
  assert.ok(captured, 'lib/client.js 必须调用 __ModuleLoader__.load')

  const exportsObj = captured.factory((name) => {
    if (name === 'react') return { createElement: () => null, useState: (v) => [v, () => {}] }
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { Switch: () => null, StateDot: () => null }
    throw new Error('unexpected require: ' + name)
  })

  const controllerClass = exportsObj.PanelController ?? exportsObj.default?.PanelController
  assert.ok(controllerClass, '客户端产物必须导出 PanelController')
  return controllerClass
}

/** 消除跨 vm Realm 的对象原型比较差异 */
const toJson = (v) => JSON.parse(JSON.stringify(v))

function mockForm(stateOverrides = {}, onMutate) {
  const history = []
  const defaultState = {
    status: 'ready',
    writable: true,
    revision: 42,
    user: {
      disabledSkills: [],
      modelHiddenSkills: [],
      userHiddenSkills: [],
      loadMode: 'preset',
      mcpEnabled: true,
    },
    value: {
      availableSkills: ['wrangler', 'cloudflare'],
    },
  }
  return {
    state: { ...defaultState, ...stateOverrides },
    history,
    mutate: async (ops, revision) => {
      history.push({ ops, revision })
      if (onMutate) return onMutate(ops, revision)
      return true
    },
  }
}

test('PanelController initializes cleanly even with malformed or empty state', async () => {
  const PanelController = await loadController()
  const form = mockForm({ user: null, value: null })
  const controller = new PanelController(form)

  const snap = controller.getSnapshot()
  assert.equal(snap.status, 'ready')
  assert.equal(snap.writable, true)
  assert.equal(snap.loadMode, 'preset')
  assert.equal(snap.mcpEnabled, true)
  assert.deepEqual(toJson(snap.skills), [])
  assert.equal(snap.busy, false)
  assert.equal(snap.error, null)
})

test('PanelController projects single skill switch into atomic 3-ops mutation', async () => {
  const PanelController = await loadController()
  const form = mockForm()
  const controller = new PanelController(form)

  const snap = controller.getSnapshot()
  assert.equal(snap.skills.length, 2)
  // 默认开启
  assert.equal(snap.skills[1].name, 'wrangler')
  assert.equal(snap.skills[1].category, 'CLI')
  assert.equal(snap.skills[1].enabled, true)

  // 1. 关闭技能
  const ok = await controller.toggle('wrangler', false)
  assert.equal(ok, true)
  assert.equal(form.history.length, 1, '必须是单次原子 mutate 提交')
  assert.equal(form.history[0].revision, 42, '严格带上 expectedRevision 栅栏')
  assert.deepEqual(toJson(form.history[0].ops), [
    { op: 'set', path: ['disabledSkills'], value: ['wrangler'] },
    { op: 'set', path: ['modelHiddenSkills'], value: [] },
    { op: 'set', path: ['userHiddenSkills'], value: [] },
  ])
})

test('re-enabling skill cleans disabledSkills and hidden lists atomically', async () => {
  const PanelController = await loadController()
  const form = mockForm({
    user: {
      disabledSkills: ['wrangler'],
      modelHiddenSkills: [],
      userHiddenSkills: [],
    },
  })
  const controller = new PanelController(form)

  const snap = controller.getSnapshot()
  const wrangler = snap.skills.find((s) => s.name === 'wrangler')
  assert.equal(wrangler.enabled, false)

  // 重新打开技能
  await controller.toggle('wrangler', true)
  assert.equal(form.history.length, 1)

  assert.deepEqual(toJson(form.history[0].ops), [
    { op: 'set', path: ['disabledSkills'], value: [] },
    { op: 'set', path: ['modelHiddenSkills'], value: [] },
    { op: 'set', path: ['userHiddenSkills'], value: [] },
  ])
})

test('PanelController supports mcpEnabled toggle and batch skill toggles', async () => {
  const PanelController = await loadController()
  const form = mockForm()
  const controller = new PanelController(form)

  // 1. 切换 MCP 开关
  const okMcp = await controller.setMcpEnabled(false)
  assert.equal(okMcp, true)
  assert.equal(form.history.length, 1)
  assert.deepEqual(toJson(form.history[0].ops), [
    { op: 'set', path: ['mcpEnabled'], value: false },
  ])

  // 2. 全部停用技能
  form.history.length = 0
  const okDisableAll = await controller.setAllSkills(false)
  assert.equal(okDisableAll, true)
  assert.equal(form.history.length, 1)
  assert.deepEqual(toJson(form.history[0].ops), [
    { op: 'set', path: ['disabledSkills'], value: ['cloudflare', 'wrangler'] },
    { op: 'set', path: ['modelHiddenSkills'], value: [] },
    { op: 'set', path: ['userHiddenSkills'], value: [] },
  ])

  // 3. 全部启用技能
  form.history.length = 0
  const okEnableAll = await controller.setAllSkills(true)
  assert.equal(okEnableAll, true)
  assert.equal(form.history.length, 1)
  assert.deepEqual(toJson(form.history[0].ops), [
    { op: 'set', path: ['disabledSkills'], value: [] },
    { op: 'set', path: ['modelHiddenSkills'], value: [] },
    { op: 'set', path: ['userHiddenSkills'], value: [] },
  ])
})

test('PanelController mutex lock synchronously blocks concurrent calls and prevents tearing', async () => {
  const PanelController = await loadController()
  let gateResolve
  const mutatePromise = new Promise((resolve) => { gateResolve = resolve })
  let mutateCount = 0

  const form = mockForm({}, async () => {
    mutateCount++
    await mutatePromise
    return true
  })
  const controller = new PanelController(form)

  // 第一次触发操作（返回 Promise，处于异步执行中）
  const p1 = controller.toggle('wrangler', false)
  assert.equal(controller.isBusy(), true, '控制器必须在同步栈立即处于 busy 锁定态')

  // 同步栈内紧接着触发第二次操作（模拟用户并发双击或连击）
  const p2 = await controller.toggle('wrangler', true)
  assert.equal(p2, false, '并发操作必须被同步互斥锁秒级拦截拒绝')
  assert.equal(mutateCount, 1, '底层 mutate 绝不并发触发第二次')

  // 释放底层锁
  gateResolve(true)
  const ok1 = await p1
  assert.equal(ok1, true)
  assert.equal(controller.isBusy(), false, '操作完成后控制器自动解锁')
})

test('PanelController respects readonly mode and handles mutate failures gracefully', async () => {
  const PanelController = await loadController()
  // 1. 只读模式拒绝任何操作
  const readonlyForm = mockForm({ writable: false })
  const controller1 = new PanelController(readonlyForm)
  const op1 = await controller1.toggle('wrangler', false)
  assert.equal(op1, false)
  assert.equal(readonlyForm.history.length, 0, '只读模式不派发任何 mutate')

  // 2. 失败处理与错误文案暴露
  const failForm = mockForm({}, async () => false)
  const controller2 = new PanelController(failForm, (k) => 'T:' + k)
  const op2 = await controller2.toggle('wrangler', false)
  assert.equal(op2, false)
  assert.equal(controller2.getError(), 'T:failed', '失败时暴露错误文案')
  assert.equal(controller2.isBusy(), false, '失败后互斥锁正常释放')
})
