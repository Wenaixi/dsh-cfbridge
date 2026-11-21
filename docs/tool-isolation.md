# 工具隔离与生命周期（Tool Restriction Lifecycle）

## 一、cfbridge 的三层闸门

`cfbridge` 把 Cloudflare MCP 的三个工具（`docs` / `search` / `execute`）与 14 个技能
按「运行模式」做隔离，共三层：

| 层 | 机制 | 作用范围 |
| --- | --- | --- |
| 全局 guard | `ctx.tools.guard(predicate)` | 所有会话 |
| 智能体 restrict | `agentCtx.tools.restrict({ deny })` | 单个 agent 的工具表 |
| 智能体 guard | `agentCtx.tools.guard(predicate)` | 单个 agent 的执行前判定 |

## 二、disposer 必须持有（本次修复的核心）

`restrict` 与 `guard` **都返回 disposer**。原实现全部丢弃，导致：

- 用户从 preset 模式切回 global 模式时，`syncAgentRestriction` 直接 `return`，
  **已建会话的 deny 永不解锁**——面板开关变成单向门；
- `tools/change` 会对每个 tracked agent 反复调 `syncAgentRestriction`，
  **guard 线性累积**永不清理。

### 正确写法

```ts
const agentDisposers = new WeakMap<object, Array<void | (() => void)>>()

const releaseAgentRestriction = (agent: unknown) => {
  if (typeof agent !== 'object' || agent === null) return
  const list = agentDisposers.get(agent)
  if (list === undefined) return
  for (const dispose of list) if (typeof dispose === 'function') dispose()
  agentDisposers.delete(agent)
}
```

### 三条生命周期出口都必须撤

| 出口 | 动作 |
| --- | --- |
| 每次 `sync` | **先撤再判**——从干净状态重建，避免累积 |
| 早退分支（`isMcpActive && !isPresetMode`） | 撤后 `return` |
| `agent/disposed` | 先撤再移出 `trackedAgents` |
| 插件卸载（effect 清理函数） | 遍历 `trackedAgents` 逐个撤，再清表 |

**只做第一条是不够的**：agent 销毁和插件卸载是两个独立的泄漏出口。

## 三、MCP token 不进日志

`@deepseek-ai/dsh-mcp-client` 的状态处理器里有这么一行：

```js
ctx.logger.warn(`mcp-client(${config.serverName}): ${message}`)
if (!config.expandTemplates) ctx.logger.warn(error)   // ← 关闭时把原始 error 全打印
```

上游 SDK 的 `StreamableHTTPError` 可能回显请求头，`Bearer <token>` 因此会落盘。

**修法**：在 `cordis.patch.yml` 里给 `mcp-cloudflare` 加 `expandTemplates: true`，
关闭就不再打印原始 error，只走 `diagnostic()` 包装过的那一版。

**不会触发模板校验的原因**：`assertTemplateSyntax` 拒绝任何不是 `${credential:REF}`
的 `${…}`，但我们的 header 是 `!!js` 表达式，在 YAML 解析阶段就求值成
`Bearer <token>` 完整字符串，传入时**不含 `${…}`**。

## 四、自愈不丢配置

`autoHealConfigFile` 判定需要修复时，原实现用 `generatePatchYaml()` **从头生成
整份文件**，于是用户同一 patch 里其它插件的行在一次自愈后全部消失（备份救得回
内容，但运行配置已被清空）。

**修法**：优先 `mergeIntoExistingPatch()`——用 `yaml` 的 Document API 只替换
`mcp-cloudflare` / `cfbridge` 两行，其余顶层项与注释原样保留；结构不可识别
（不是预期的 YAMLSeq 形态）才退回整份重写。

**另一个坑**：判定「有没有 token」原本用正则钉死变量名
`CLOUDFLARE_API_TOKEN`。用户改成 `CF_TOKEN`（更安全的名字）会被判「缺授权模板」
并触发重写。现在只要求「存在 `Authorization` 且值是 `!!js` 表达式」。

## 五、面板必须订阅 ConfigForm

`ConfigForm` 自带 `subscribe(listener)`（内部是 `createSnapshotStore`），官方面板
一律用 `useSyncExternalStore` 消费它。

原实现只靠自己的 `setTick`，于是其它页面改了 `loadMode` / `disabledSkills` 时，
这里会一直显示陈旧值，直到用户点一次按钮。

**修法**：

```ts
React.useEffect(() => {
  const form = props.form as { subscribe?: (l: () => void) => () => void }
  if (typeof form.subscribe !== 'function') return
  return form.subscribe(() => setTick(v => v + 1))
}, [props.form])
```

**两个连带改动**：

- `src/client.deps.d.ts` 是本仓自己要求的最小类型桩（文件头注释写着「用到未声明
  成员就补它，而不是关检查」），要给 `react` 补 `useEffect` 声明。
- 测试的 react 桩同样必须补 `useEffect` **实现**——空实现会让订阅路径在测试里
  完全不跑，这类假绿以前踩过。

## 六、验收

1. `npm run typecheck` + `npm run typecheck:client`
2. `npm test` —— 16 个步骤（含 92 项检查、78 项检查、4 项 wrangler 只读验证）
3. 手动：preset ↔ global 来回切两次，确认已建会话的工具表跟着变（这是本次
   修复的主症状）
4. 手动：把 `CLOUDFLARE_API_TOKEN` 改成别的变量名，确认不再触发整文件重写
