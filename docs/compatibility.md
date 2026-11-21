# 宿主版本兼容性（Compatibility）

## 一、本插件依赖的宿主契约

| 契约 | 由谁提供 | 用途 |
| --- | --- | --- |
| `skills` 服务（单数） | `@deepseek-ai/dsh-skill` | 注册 14 个 Cloudflare 技能的提供者 |
| `settings` 服务（单数） | `@deepseek-ai/dsh-settings` | 面板读写与命名空间发布 |
| `@deepseek-ai/dsh-mcp-client` | 官方 MCP 桥 | 把 Cloudflare MCP 的三个工具注册到宿主的 tools registry |
| `dsh.client.inject` | `@deepseek-ai/dsh-client-ui-primitives` | 浏览器端 React 原子组件 |

> **单复数铁律**：服务名必须精确匹配。`skills` 是单数（`Context.skills`），`settings` 也是单数（`Context.settings`）。写成 `skill` / `setting` 会让 fiber 完全不激活，且没有明显报错。

## 二、inject 语义（容易误判）

`export const inject = ['skills', 'settings']` 的 cordis 语义是：**缺任一服务则整个 fiber 不激活**。这是有意的取舍——在无 `settings` 的精简宿主（如 headless）上，插件整体不加载，而不是带病运行。

## 三、`cordis.patch.yml` 中的 MCP 配置字段

`@deepseek-ai/dsh-mcp-client` 的 `StreamableHttpConfig` 字段与本插件的 patch 逐字对应：

| 字段 | 值 | 说明 |
| --- | --- | --- |
| `transport` | `streamable-http` | 字面量，选中 SSE 传输 |
| `serverName` | `cloudflare` | 必须匹配 `[A-Za-z0-9_-]{1,32}`，且在同作用域内唯一 |
| `url` | `https://mcp.cloudflare.com/mcp` | MCP 端点 |
| `headers` | `Authorization: !!js ...` | 用 `!!js` 标签从环境变量求值，token 不落盘 |
| `toolCallTimeoutMs` | `120000` | 单次工具调用超时 |
| `failOnStartupError` | `false` | 无 token 时不阻断宿主启动 |
| `reconnect.{enabled,initialDelayMs,maxDelayMs,maxAttempts}` | `true/500/30000/10` | 与官方默认值相同，删掉整块行为也不变 |

**`!!js` 标签**由 `dsh-app-boot` 的 YAML 扩展解析为惰性表达式，只在运行时求值并校验。token 只放在被 gitignore 的 `%USERPROFILE%\.dsh\.env` 中。

## 四、升级宿主后的核验清单

1. `npm run check` —— 92 项静态检查（含 token 泄漏扫描）
2. `npm test` —— 单测 + bundle 校验 + Wrangler 只读验证
3. 真启动 web profile，确认无 `skipping profile bundle` / `disabling plugin`
4. 打开插件设置面板，确认三段式控件与技能开关正常
5. 实际调用一次 MCP 工具（需要有效 `CLOUDFLARE_API_TOKEN`）

## 五、兼容声明的判定规则

宿主只读两处：`engines.dsh`（有则**独占判定**、peer 全旁路），否则遍历 `peerDependencies` 且**只挑** `@deepseek-ai/dsh` 或 `@deepseek-ai/dsh-*` 前缀的项。

本插件的 peer 里：

- `@deepseek-ai/dsh-skill: ">=0.2.0-rc.2 <0.3.0-0"` —— 唯一**真正有约束力**的一条
- `@deepseek-ai/dsh-mcp-client: "*"`、`dsh-tool-skill: "*"`、`dsh-skill-filesystem: "*"` —— 恒真，不构成约束
- `@deepseek-ai/cordis`、`@deepseek-ai/schemastery` —— 前缀不符，**完全不参与判定**

因此本插件补了 `engines.dsh: ">=0.2.2-rc.1 <0.3.0-0"`，让判定语义显式，不再依赖 peer 的巧合通过。

## 六、版本号只有一处真源

`package.json.version` 是唯一真源。`scripts/check.js`、`scripts/validate-bundle.js` 与测试里**只校验它是合法 SemVer**，不钉具体数字——钉死会让每次发版都必须手改校验脚本。
