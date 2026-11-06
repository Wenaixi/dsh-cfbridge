import test from 'node:test'
import assert from 'node:assert/strict'
import { installToolGuard } from '../lib/cfbridge.js'

const CLOUDFLARE_TOOLS = ['mcp__cloudflare__docs', 'mcp__cloudflare__search', 'mcp__cloudflare__execute']

/**
 * 忠实模拟 dsh-tools 的关键语义：
 * - restrict(filter) 追加一层 restriction，并“同步” emit('tools/change')，返回精确 disposer；
 * - guard(fn) 追加一个守卫，并“同步” emit('tools/change')，返回精确 disposer；
 * - disposer 移除时同样“同步” emit('tools/change')。
 * 旧实现（监听 tools/change 后又无条件 restrict）在此宿主上会同步无限递归直至爆栈/卡死。
 */
function makeHost({ knownNames = CLOUDFLARE_TOOLS } = {}) {
  const known = new Set(knownNames)
  const listeners = new Set()
  const emitChange = () => { for (const cb of listeners) cb() }
  const agents = []
  const stats = { restrictCalls: 0, guardCalls: 0 }

  const makeAgentTools = () => {
    const restrictions = []
    const guards = []
    return {
      restrictions,
      guards,
      restrict(filter) {
        stats.restrictCalls++
        const token = { filter }
        restrictions.push(token)
        emitChange() // 同步发出变化通知（正是 dsh-scope layers.effect 的行为）
        return () => {
          const i = restrictions.indexOf(token)
          if (i >= 0) { restrictions.splice(i, 1); emitChange() }
        }
      },
      guard(fn) {
        stats.guardCalls++
        guards.push(fn)
        emitChange()
        return () => {
          const i = guards.indexOf(fn)
          if (i >= 0) { guards.splice(i, 1); emitChange() }
        }
      },
      view() {
        return { restrictableNames: new Set(known) }
      },
    }
  }

  const ctx = {
    logger: { debug() {}, warn() {}, info() {} },
    on(event, cb) {
      if (event === 'tools/change') {
        const entry = () => cb()
        listeners.add(entry)
        return () => listeners.delete(entry)
      }
      return () => {}
    },
  }

  const makeAgent = () => {
    const agent = { ctx: { tools: makeAgentTools() } }
    agents.push(agent)
    return agent
  }

  return { ctx, emitChange, agents, makeAgent, stats, listeners, known }
}

function fire(host, event, payload) {
  // installToolGuard 用 ctx.on 注册，但我们的 fake on 只记录 tools/change；
  // 这里额外暴露一个直发入口：重新实现一个带事件分发的 ctx。
  return payload
}

function makeDispatchCtx() {
  const handlers = new Map()
  const host = makeHost()
  const ctx = {
    logger: host.ctx.logger,
    on(event, cb) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event).add(cb)
      return () => handlers.get(event).delete(cb)
    },
  }
  host.ctx = ctx
  host.dispatch = (event, payload) => {
    for (const cb of handlers.get(event) ?? []) cb(payload)
  }
  // tools/change 通知也要走 dispatch
  const origEmit = host.emitChange
  host.emitChange = () => { for (const cb of handlers.get('tools/change') ?? []) cb() }
  return host
}

function setup(opts = {}) {
  const host = makeDispatchCtx()
  const state = { loadMode: opts.loadMode ?? 'preset', mcpEnabled: opts.mcpEnabled ?? true, preset: opts.preset ?? undefined }
  const options = {
    getLoadMode: () => state.loadMode,
    getMcpEnabled: () => state.mcpEnabled,
    getAgentPresets: () => ({ composedPreset: () => state.preset }),
    getTools: () => undefined, // 只测第 2 层（per-agent），第 1 层全局守卫不参与
  }
  const dispose = installToolGuard(host.ctx, options)
  return { host, state, dispose }
}

test('不因 tools/change 同步重入而无限递归（旧实现会爆栈）', () => {
  const { host } = setup({ loadMode: 'preset', preset: 'standard' })
  const agent = host.makeAgent()
  // 触发 agent/created；restrict 内部同步 emit tools/change
  host.dispatch('agent/created', { agent })
  // 若重入未修好，此处执行已爆栈；能到达说明通过
  assert.equal(agent.ctx.tools.restrictions.length, 1, '只应施加一层 restriction')
})

test('幂等：重复 tools/change 不累积 restriction / guard', () => {
  const { host } = setup({ loadMode: 'preset', preset: 'standard' })
  const agent = host.makeAgent()
  host.dispatch('agent/created', { agent })
  for (let i = 0; i < 50; i++) host.dispatch('tools/change')
  assert.equal(agent.ctx.tools.restrictions.length, 1, '50 次变化后仍只有 1 层 restriction')
  assert.equal(agent.ctx.tools.guards.length, 1, '50 次变化后仍只有 1 个 guard')
})

test('deny 目标仅为已存在的 Cloudflare 工具', () => {
  const { host } = setup({ loadMode: 'preset', preset: 'standard' })
  const agent = host.makeAgent()
  host.dispatch('agent/created', { agent })
  const deny = agent.ctx.tools.restrictions[0].filter.deny
  assert.deepEqual([...deny].sort(), [...CLOUDFLARE_TOOLS].sort())
})

test('非 Cloudflare preset 的 agent 被限制；切到允许后释放全部注册项', () => {
  const { host, state } = setup({ loadMode: 'preset', preset: 'standard' })
  const agent = host.makeAgent()
  host.dispatch('agent/created', { agent })
  assert.equal(agent.ctx.tools.restrictions.length, 1)

  // 允许态：mcp 开启且非 preset 模式
  state.loadMode = 'global'
  state.mcpEnabled = true
  host.dispatch('tools/change')
  assert.equal(agent.ctx.tools.restrictions.length, 0, '允许后 restriction 应被释放')
  assert.equal(agent.ctx.tools.guards.length, 0, '允许后 guard 应被释放')
})

test('Cloudflare 模式的 agent 不被限制', () => {
  const { host } = setup({ loadMode: 'preset', preset: 'cfbridge' })
  const agent = host.makeAgent()
  host.dispatch('agent/created', { agent })
  assert.equal(agent.ctx.tools.restrictions.length, 0)
  assert.equal(agent.ctx.tools.guards.length, 0)
})

test('MCP 关闭时即便在 Cloudflare 模式也被限制', () => {
  const { host } = setup({ loadMode: 'preset', preset: 'cfbridge', mcpEnabled: false })
  const agent = host.makeAgent()
  host.dispatch('agent/created', { agent })
  assert.equal(agent.ctx.tools.restrictions.length, 1)
})

test('agent/disposed 释放该 agent 的全部注册项', () => {
  const { host } = setup({ loadMode: 'preset', preset: 'standard' })
  const agent = host.makeAgent()
  host.dispatch('agent/created', { agent })
  assert.equal(agent.ctx.tools.restrictions.length, 1)
  host.dispatch('agent/disposed', { agent })
  assert.equal(agent.ctx.tools.restrictions.length, 0, '销毁后 restriction 应释放')
  assert.equal(agent.ctx.tools.guards.length, 0, '销毁后 guard 应释放')
})

test('插件卸载释放所有 agent 的注册项且不再响应变化', () => {
  const { host, dispose } = setup({ loadMode: 'preset', preset: 'standard' })
  const a1 = host.makeAgent()
  const a2 = host.makeAgent()
  host.dispatch('agent/created', { agent: a1 })
  host.dispatch('agent/created', { agent: a2 })
  assert.equal(a1.ctx.tools.restrictions.length, 1)
  assert.equal(a2.ctx.tools.restrictions.length, 1)

  dispose()
  assert.equal(a1.ctx.tools.restrictions.length, 0, '卸载后 a1 释放')
  assert.equal(a2.ctx.tools.restrictions.length, 0, '卸载后 a2 释放')

  // 卸载后继续变化不应再施加
  host.dispatch('tools/change')
  assert.equal(a1.ctx.tools.restrictions.length, 0)
  assert.equal(a2.ctx.tools.restrictions.length, 0)
})

test('restrict 次数与变化次数无关（无重复注册导致的事件风暴）', () => {
  const { host } = setup({ loadMode: 'preset', preset: 'standard' })
  const stats = host.stats
  const agent = host.makeAgent()
  host.dispatch('agent/created', { agent })
  const afterCreate = stats.restrictCalls
  for (let i = 0; i < 100; i++) host.dispatch('tools/change')
  // 旧实现此处会指数级增长；新实现应保持恒定（仅为创建时那 1 次）
  assert.equal(stats.restrictCalls, afterCreate, '后续 tools/change 不应再触发 restrict')
})

test('工具异步上线后（restrictableNames 增长）同步补上限制，且仅一次', () => {
  const { host } = setup({ loadMode: 'preset', preset: 'standard' })
  const agent = host.makeAgent()
  host.known.clear() // 初始无 Cloudflare 工具可见
  host.dispatch('agent/created', { agent })
  assert.equal(agent.ctx.tools.restrictions.length, 0, '工具未上线时不限制')

  // MCP 异步连接上线
  for (const t of CLOUDFLARE_TOOLS) host.known.add(t)
  host.dispatch('tools/change')
  assert.equal(agent.ctx.tools.restrictions.length, 1, '上线后施加一次限制')
  const deny = agent.ctx.tools.restrictions[0].filter.deny
  assert.deepEqual([...deny].sort(), [...CLOUDFLARE_TOOLS].sort())
})

test('策略变化（deny 集合变化）时先释放旧限制再装新限制，不累加', () => {
  const { host } = setup({ loadMode: 'preset', preset: 'standard' })
  const agent = host.makeAgent()
  host.known.clear()
  host.known.add('mcp__cloudflare__docs')
  host.dispatch('agent/created', { agent })
  assert.equal(agent.ctx.tools.restrictions.length, 1)
  assert.deepEqual([...agent.ctx.tools.restrictions[0].filter.deny], ['mcp__cloudflare__docs'])

  // 又上线两个工具：策略变化，应替换为完整集合而不是叠加成两层
  host.known.add('mcp__cloudflare__search')
  host.known.add('mcp__cloudflare__execute')
  host.dispatch('tools/change')
  assert.equal(agent.ctx.tools.restrictions.length, 1, '策略变化后仍只有一层 restriction')
  assert.deepEqual([...agent.ctx.tools.restrictions[0].filter.deny].sort(), [...CLOUDFLARE_TOOLS].sort())
})

