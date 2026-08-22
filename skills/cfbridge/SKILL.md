# cfbridge — Cloudflare 全局 Bridge 操作指南

本 Skill 由 cfbridge v0.2.0 Bundle 提供；安装并启用后，**所有** DSH 会话都会自动看到本 Skill —— 不需要选任何 preset，也不需要切换模式。

> 触发：安装 `cfbridge` Bundle 后（即 `npm run install:bundle` 完成且 DSH 重启），模型在所有会话中均可感知本 Skill。任何涉及 Cloudflare API 的请求，都应先调用 `mcp__cloudflare__docs` 或 `mcp__cloudflare__search` 来确认端点与参数，再调用 `mcp__cloudflare__execute` 来执行。

## 三工具速查

| 工具 | 何时用 | 参数 |
| --- | --- | --- |
| `mcp__cloudflare__docs` | 不确定 Cloudflare 某个产品的概念、参数、限制 | `query` |
| `mcp__cloudflare__search` | 不确定具体 API 端点、路径或请求体 schema | `code`（一段 JavaScript，操作已展开 `$ref` 的 OpenAPI spec） |
| `mcp__cloudflare__execute` | 执行 API 调用（GET/POST/PUT/DELETE/PATCH） | `code`（一段 JavaScript，通过 `cloudflare.request()` 调用） |

## 默认工作流：search → execute

每次调用前，遵循「先检索再执行」：

```js
// 1. 检索：找出列出 Worker 脚本的端点
async () => Object.entries(spec.paths)
  .filter(([path, item]) => path.includes('workers/scripts') && item.get)
  .slice(0, 10)
  .map(([path, item]) => ({ path, params: Object.keys(item.get.parameters || {}) }))
```

```js
// 2. 执行：真正调用 API
async () => cloudflare.request({
  method: 'GET',
  path: `/accounts/${accountId}/workers/scripts`,
})
```

`accountId` 会被 Cloudflare MCP 服务按 token 上下文预置，不需要手动传。

## 常见模式

### 列出资源

```js
async () => cloudflare.request({
  method: 'GET',
  path: `/accounts/${accountId}/<resource>`,
  query: { per_page: 50 },
})
```

### 列出 Zone

```js
async () => cloudflare.request({
  method: 'GET',
  path: '/zones',
  query: { per_page: 50 },
})
```

### 列出 D1

```js
async () => cloudflare.request({
  method: 'GET',
  path: `/accounts/${accountId}/d1/database`,
})
```

### 列出 KV namespace

```js
async () => cloudflare.request({
  method: 'GET',
  path: `/accounts/${accountId}/storage/kv/namespaces`,
})
```

### 列出 Pages 项目

```js
async () => cloudflare.request({
  method: 'GET',
  path: `/accounts/${accountId}/pages/projects`,
})
```

### 检索 GraphQL analytics

```js
async () => cloudflare.request({
  method: 'POST',
  path: `/accounts/${accountId}/analytics/graphql`,
  body: {
    query: `query { viewer { accounts(filter: { accountTag: "${accountId}" }) { workersInvocationsAdaptive(limit: 5) { dimensions { date } sum { requests } } } } }`,
  },
})
```

## 写操作规范（必读）

任何会修改 Cloudflare 状态的请求（POST/PUT/PATCH/DELETE），在执行前必须：

1. **明确目标**：用 search/docs 确认端点、请求体、副作用。
2. **复述操作**：用一段文字告诉用户「我将执行 XX，对 YY 资源，结果是 ZZ」，等待用户同意。
3. **避免连写**：不要在一次 execute 中串联多个写操作；每个写操作独立确认。
4. **不可逆警告**：删除、覆盖、DNS 改动等不可逆操作需要二次确认。

| 操作类型 | 是否需要用户确认 |
| --- | --- |
| 任何 GET / LIST | 否 |
| 文档/Schema 查询 | 否 |
| Worker deploy | 是 |
| KV/D1/R2 写 | 是 |
| DNS 记录改 | 是（不可逆） |
| secret put | 是 |
| zone/账户删除 | 是（强烈建议二次确认） |

## 获取与配置 API Token

Cloudflare 已逐步禁用 Global API Key（`Email + Global API Key`），不要再使用它，所有认证一律使用 API Token。

唯一推荐的申请入口：

`https://dash.cloudflare.com/profile/api-tokens` → `Create Token`

按需申请、最小权限原则：

| 场景 | 推荐模板 / 权限 |
| --- | --- |
| 只读巡检（列 Zone、查 Workers / D1 / KV） | `Account Resources: Read` + 对应 Zone `Zone:Read` |
| 管理 DNS 解析 | `Zone → DNS → Edit`（或 `Read` 仅查看），Resource 限定到需要操作的 Zone，DNS 类操作必须是 Zone 范围的 User Token（`cfut_`）才会对 `/zones/{id}/dns_records` 生效，Account Token（`cfat_`）对该端点会返回 `10000 Authentication error` |
| 部署 Workers / 管理 D1、KV、R2 | `Account → Workers Scripts:Edit`、`D1:Edit`、`Workers KV Storage:Edit`、`R2:Edit` 等按需勾选 |
| 临时调试 | 用 `Edit Cloudflare Workers` 等预设模板，再删掉不需要的权限 |

创建后复制生成的 token（仅显示一次），写入 DSH 私有环境文件，不要写入仓库：

```powershell
# 文件：%USERPROFILE%\.dsh\.env  （被 .gitignore 忽略）
CLOUDFLARE_API_TOKEN=cfut_... 或 cfat_...
```

本 Bundle 的 MCP 与 Wrangler 均读取该变量：`cordis.patch.yml` 中以 `!!js '`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`'` 动态注入；`scripts/wrangler.js` 在进程未设置时自动从该文件加载。

## Token 类型与权限边界

实际可用能力完全由 token 的权限决定，遇到 403 先查权限而非重试：

| Token 类型 | 前缀 | 特点 |
| --- | --- | --- |
| Account Token | `cfat_` | 账户范围，对 `/accounts/*`、`/zones` 列表等有效，但 `GET /zones/{id}/dns_records` 等 Zone 子资源会返回 10000，需换 Zone Token |
| User Token | `cfut_` | 用户级，可限定到具体 Zone，是 DNS 读写的正确类型；本项目实测 DNS 必须用它 |
| OAuth Token | `cfoat_` | 通过 OAuth 授权产生 |

常见错误对照：

- `/accounts` 返回 403 → token 失效或未授予 Account Read
- DNS 端点返回 10000 Authentication error → 当前是 `cfat_` 或 Zone 未授权，按上一节重建 `cfut_` 并授予 `Zone:DNS:Read/Edit`
- `/user/tokens/verify` 返回 401（cfat_）→ account token 的正常行为，不是错误；改用 ` /accounts/{id}/tokens/verify` 验活
- R2 端点返回 10042 → 账户尚未开通 R2，需先在 Dashboard 开通

## Wrangler CLI 认证方式

Wrangler 支持两种认证，本 Bundle 默认走 Token 方式，无需额外 `login`：

1. **Token 方式（推荐，CI/自动化友好）**：设置环境变量 `CLOUDFLARE_API_TOKEN` 即可，`scripts/wrangler.js` 已封装该逻辑。
   ```powershell
   # 一次性写入后，所有 wrangler 命令自动生效
   npm run wrangler -- whoami
   npm run wrangler -- d1 list --json
   ```
   可直接用你刚申请的 `cfut_` / `cfat_` token，无需 `wrangler login`。

2. **OAuth 登录方式（交互式）**：
   ```powershell
   npx wrangler login   # 浏览器授权，token 存于本机 wrangler 配置
   npx wrangler logout
   npx wrangler whoami  # 查看当前身份
   ```
   适合本地一次性调试，CI 环境仍建议用方式 1。

## 与 Wrangler CLI 的关系

Cloudflare MCP 覆盖 ~2500 个 API 端点。某些工作流 MCP 不便处理，可以回退到项目根目录的 `npm run wrangler ...`：

```powershell
# 本地开发服务器
npm run wrangler -- dev

# 部署（需用户明确确认）
npm run wrangler -- deploy

# 列出资源
npm run wrangler -- d1 list --json
npm run wrangler -- kv namespace list --json
npm run wrangler -- r2 bucket list --json
npm run wrangler -- pages project list --json
```

Wrangler 启动器（`scripts/wrangler.js`）优先读取当前进程的 `CLOUDFLARE_API_TOKEN`，缺失时才从 `%USERPROFILE%\.dsh\.env` 加载，永不写入仓库或日志。

## 故障排查

| 现象 | 排查 |
| --- | --- |
| `mcp__cloudflare__*` 工具不可见 | cfbridge bundle 未启用；运行 `npm run install:bundle -- --profile <你的 profile>`，然后重启 DSH |
| 调用返回 `Bearer token required` | `%USERPROFILE%\.dsh\.env` 没有 `CLOUDFLARE_API_TOKEN` |
| 调用返回 401/403 | token 过期；去 Cloudflare Dashboard 重新生成 |
| `execute` 超时 | 网络受限；DSH 内 MCP 客户端会自动重连 |
| `search` 无结果 | 关键词过窄；改用更宽泛的 `path.includes('xxx')` |
| 模型猜测端点而不是 search | 不接受猜测结果；强制要求先 search |

## 何时不要调用 Cloudflare

- 用户问的是通用编程/文档问题，与 Cloudflare 无关
- 用户希望离线操作、纯本地 Wrangler dev
- 用户已明确拒绝使用云端资源

在这些场景下，直接回答问题或调用本地工具即可，不要触碰 Cloudflare MCP。

## 官方 Skills 路由（按需加载，不 Vendoring）

> cfbridge 是"薄桥"：负责把 Cloudflare 官方 Code Mode MCP 的 `docs/search/execute` 三工具全局挂到 DSH；领域知识由 https://github.com/cloudflare/skills 的 13 个官方 Skill 按需提供。**不要把官方 SKILL.md 全文拷进 cfbridge**——按需另装，用时再加载，永远检索最新 docs。

// ponytail: 全量 Vendoring 镜像（13-in-1 bundle）已评估，约 +400KB / ~38k tokens，维护漂移大；仅当用户反馈"内网离线必须可用"时再考虑把 13 个 SKILL.md 原样拷入 skills/cloudflare-xxx/ 并注册 13 个 skill。

### 安装（与 cfbridge 互补）

| Agent | 命令 |
|-------|------|
| Claude Code | `/plugin marketplace add cloudflare/skills` → `/plugin install cloudflare@cloudflare` |
| Cursor | Settings → Rules → Add Rule → Remote Rule (Github) → `cloudflare/skills` |
| 任意 Agent | `npx skills add https://github.com/cloudflare/skills` |
| 手动 | 克隆后按 https://github.com/cloudflare/skills#clone--copy 拷到对应目录 |

装好后 cfbridge 的三工具与官方 Skill 协同工作：Skill 教"怎么做"，cfbridge 教"怎么调 API"。

### 何时用谁 决策树

```
需要调 Cloudflare API？
├─ 只需查/调单个端点（列 Zone、查 D1、调 /workers/scripts）→ 直接 cfbridge：search → execute（何时只用 cfbridge）
├─ 需要领域最佳实践/脚手架（选 KV 还是 D1、写 Durable Object、配 Wrangler）→ 先加载官方 Skill，再用其"检索 sources"指引，最后用 cfbridge 的 search/execute 落地（何时先加载官方 Skill）
└─ 不确定 → 先加载 cloudflare 总入口 Skill 的决策树，再分流
```

> 检索优于记忆：引用阈值/签名/限额时务必先用 `mcp__cloudflare__docs` 或 `mcp__cloudflare__search` 检索最新。

### 13 Skills 路由表

| Skill（name） | 何时加载 | 一句话 | 官方 SKILL.md |
|-------|---------|--------|---------------|
| name: cloudflare | 不确定选什么产品、需要 30+ 产品决策树与 references 索引 | 总入口/平台选型 | https://raw.githubusercontent.com/cloudflare/skills/main/skills/cloudflare/SKILL.md |
| name: wrangler | 写/审 `wrangler.jsonc`、跑 `dev/deploy/types/tail`、配 KV/R2/D1 绑定 | 本地 CLI 手册 | https://raw.githubusercontent.com/cloudflare/skills/main/skills/wrangler/SKILL.md |
| name: agents-sdk | 构建有状态 AI Agent、Agent 类/state/callable/schedule/workflows | Agents SDK | https://raw.githubusercontent.com/cloudflare/skills/main/skills/agents-sdk/SKILL.md |
| name: durable-objects | 聊天室/游戏房间/预约等强一致协调、SQLite/alarm/WebSocket | Durable Objects | https://raw.githubusercontent.com/cloudflare/skills/main/skills/durable-objects/SKILL.md |
| name: cloudflare-one | Zero Trust/SASE 架构、Access/Gateway/WARP/Tunnel 排障 | Cloudflare One | https://raw.githubusercontent.com/cloudflare/skills/main/skills/cloudflare-one/SKILL.md |
| name: cloudflare-one-migrations | 从 Zscaler/Palo Alto/旧 VPN 迁移到 Cloudflare One | 迁移顾问 | https://raw.githubusercontent.com/cloudflare/skills/main/skills/cloudflare-one-migrations/SKILL.md |
| name: cloudflare-email-service | Workers `send_email` 绑定、REST 发信、Email Routing、SPF/DKIM | 收发邮件 | https://raw.githubusercontent.com/cloudflare/skills/main/skills/cloudflare-email-service/SKILL.md |
| name: sandbox-next | 新项目用 `@cloudflare/sandbox@next` 预览版 | 沙箱 @next | https://raw.githubusercontent.com/cloudflare/skills/main/skills/sandbox-next/SKILL.md |
| name: sandbox-stable | 现有项目用稳定版 `@cloudflare/sandbox` | 沙箱稳定版 | https://raw.githubusercontent.com/cloudflare/skills/main/skills/sandbox-stable/SKILL.md |
| name: sandbox-migrate-to-next | 把稳定版沙箱迁到 @next | 沙箱升级向导 | https://raw.githubusercontent.com/cloudflare/skills/main/skills/sandbox-migrate-to-next/SKILL.md |
| name: turnstile-spin | 加 Turnstile 人机验证、widget + siteverify 端到端 | Turnstile | https://raw.githubusercontent.com/cloudflare/skills/main/skills/turnstile-spin/SKILL.md |
| name: web-perf | 审 Core Web Vitals、LCP/CLS/TBT 链路与优化 | 网页性能 | https://raw.githubusercontent.com/cloudflare/skills/main/skills/web-perf/SKILL.md |
| name: workers-best-practices | 审 Workers 代码、兼容日期、streaming/waitUntil/secrets 红线 | 最佳实践审查 | https://raw.githubusercontent.com/cloudflare/skills/main/skills/workers-best-practices/SKILL.md |


## 相关链接

- [Cloudflare Code Mode MCP](https://github.com/cloudflare/mcp)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [cfbridge 项目仓库](https://github.com/Wenaixi/cfbridge)