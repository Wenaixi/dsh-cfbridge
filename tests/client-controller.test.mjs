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
      loadMode: 'global',
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
  assert.equal(snap.loadMode, 'global')
  assert.deepEqual(toJson(snap.skills), [])
  assert.equal(snap.busy, false)
  assert.equal(snap.error, null)
})

test('PanelController projects dual-axis switches into single atomic 3-ops mutation', async () => {
  const PanelController = await loadController()
  const form = mockForm()
  const controller = new PanelController(form)

  const snap = controller.getSnapshot()
  assert.equal(snap.skills.length, 2)
  // 默认两轴均开启
  assert.deepEqual(toJson(snap.skills[1]), {
    name: 'wrangler',
    summary: 'Wrangler CLI command reference',
    modelInvocable: true,
    userInvocable: true,
  })

  // 1. 关闭模型调用
  const ok = await controller.toggle('wrangler', 'model', false)
  assert.equal(ok, true)
  assert.equal(form.history.length, 1, '必须是单次原子 mutate 提交')
  assert.equal(form.history[0].revision, 42, '严格带上 expectedRevision 栅栏')
  assert.deepEqual(toJson(form.history[0].ops), [
    { op: 'set', path: ['disabledSkills'], value: [] },
    { op: 'set', path: ['modelHiddenSkills'], value: ['wrangler'] },
    { op: 'set', path: ['userHiddenSkills'], value: [] },
  ])
})

test('re-enabling one axis does not silently re-enable the other axis (historical bug defense)', async () => {
  const PanelController = await loadController()
  // 历史落盘形态：仅在 disabledSkills 里，两个隐藏名单均为空
  const form = mockForm({
    user: {
      disabledSkills: ['wrangler'],
      modelHiddenSkills: [],
      userHiddenSkills: [],
    },
  })
  const controller = new PanelController(form)

  const snap = controller.getSnapshot()
  // 还原状态：两轴都应为关闭
  const wrangler = snap.skills.find((s) => s.name === 'wrangler')
  assert.equal(wrangler.modelInvocable, false)
  assert.equal(wrangler.userInvocable, false)

  // 仅重新打开模型侧
  await controller.toggle('wrangler', 'model', true)
  assert.equal(form.history.length, 1)

  // 断言：人类侧必须保持关闭（放入 userHiddenSkills），且从 disabledSkills 移出
  assert.deepEqual(toJson(form.history[0].ops), [
    { op: 'set', path: ['disabledSkills'], value: [] },
    { op: 'set', path: ['modelHiddenSkills'], value: [] },
    { op: 'set', path: ['userHiddenSkills'], value: ['wrangler'] },
  ])
})

test('disabling both axes collapses into disabledSkills and cleans hidden lists', async () => {
  const PanelController = await loadController()
  // 初始形态：模型已关，人类开着
  const form = mockForm({
    user: {
      disabledSkills: [],
      modelHiddenSkills: ['wrangler'],
      userHiddenSkills: [],
    },
  })
  const controller = new PanelController(form)

  // 将人类侧也关闭
  await controller.toggle('wrangler', 'user', false)
  assert.equal(form.history.length, 1)

  // 断言：两轴都关折叠为 disabledSkills，并从两个 hidden 列表清空
  assert.deepEqual(toJson(form.history[0].ops), [
    { op: 'set', path: ['disabledSkills'], value: ['wrangler'] },
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
  const p1 = controller.toggle('wrangler', 'model', false)
  assert.equal(controller.isBusy(), true, '控制器必须在同步栈立即处于 busy 锁定态')

  // 同步栈内紧接着触发第二次操作（模拟用户并发双击或连击）
  const p2 = await controller.toggle('wrangler', 'user', false)
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
  const op1 = await controller1.toggle('wrangler', 'model', false)
  assert.equal(op1, false)
  assert.equal(readonlyForm.history.length, 0, '只读模式不派发任何 mutate')

  // 2. 失败处理与错误文案暴露
  const failForm = mockForm({}, async () => false)
  const controller2 = new PanelController(failForm, (k) => 'T:' + k)
  const op2 = await controller2.toggle('wrangler', 'model', false)
  assert.equal(op2, false)
  assert.equal(controller2.getError(), 'T:failed', '失败时暴露错误文案')
  assert.equal(controller2.isBusy(), false, '失败后互斥锁正常释放')
})
