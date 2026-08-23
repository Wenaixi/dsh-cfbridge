# cfbridge — Cloudflare 全局 Bridge 操作指南

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

## 官方 Skills 入口：cloudflare Skill（按需加载）

> cfbridge 是"薄桥"：负责把 Cloudflare 官方 Code Mode MCP 的 `docs/search/execute` 三工具全局挂到 DSH；领域知识由 https://github.com/cloudflare/skills 的 `cloudflare` Skill 按需提供。**不要把官方 SKILL.md 全文都展开在 cfbridge 的路由节里**——需要领域知识时先加载 `cloudflare`，它内含 Quick Decision Trees 与 Product Index，会指引你按需再加载 `wrangler` / `agents-sdk` / `durable-objects` 等子 Skill，最后用 cfbridge 的 `search`/`execute` 落地。

// ponytail: 全量 Vendoring 镜像（13-in-1 bundle）已在 0.3.0 落地到 skills/<name>/ 与 14 行 patch；路由节保持精简，仅保留 cloudflare 入口，避免在索引阶段注入 13 行描述。

### 何时加载 cloudflare Skill

- 不确定该用哪个 Cloudflare 产品（存数据选 KV / D1 / R2 / Hyperdrive？跑代码选 Workers / Pages / Containers / Workflows？）
- 需要 30+ 产品的决策树或 `references/` 索引（workers / pages / d1 / durable-objects / workers-ai / vectorize 等）
- 需要判断该加载哪个子 Skill（`wrangler` / `agents-sdk` / `cloudflare-one` / `sandbox-*` / `web-perf` 等）
- 任何 Cloudflare 开发任务的起点（`cloudflare` 的 description：Comprehensive platform skill ... Use for any Cloudflare development task. Biases towards retrieval from Cloudflare docs over pre-trained knowledge.）

加载后：跟随 `cloudflare` 的决策树与 Product Index，按指引再加载对应的子 Skill；阈值/签名/限额等以 `mcp__cloudflare__docs` 或 `mcp__cloudflare__search` 检索最新为准（检索优于记忆）。

### 入口

| Skill（name） | 何时加载 | 说明 | 官方 SKILL.md |
|-------|---------|------|---------------|
| name: cloudflare | 见上“何时加载 cloudflare Skill” | Skill 入口/平台选型，内含分流到其余子 Skill 的决策树与 Product Index | https://raw.githubusercontent.com/cloudflare/skills/main/skills/cloudflare/SKILL.md |

> 子 Skill 清单（`wrangler` / `agents-sdk` / `durable-objects` / `cloudflare-one` / `cloudflare-one-migrations` / `cloudflare-email-service` / `sandbox-next` / `sandbox-stable` / `sandbox-migrate-to-next` / `turnstile-spin` / `web-perf` / `workers-best-practices`）由 `cloudflare` Skill 按需指引，本节不再逐一展开；离线时亦可直接通过本包已 vendored 的 `skills/<name>/SKILL.md` 按需加载（索引仅 name/description/whenToUse，全文按需）。


## 相关链接

- [Cloudflare Code Mode MCP](https://github.com/cloudflare/mcp)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [cfbridge 项目仓库](https://github.com/Wenaixi/cfbridge)