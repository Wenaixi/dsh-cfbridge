# cfbridge — Cloudflare 全局 Bridge 操作指南

本 Skill 由 cfbridge v0.3.0 Bundle 提供；安装并启用后，**所有** DSH 会话都会自动看到本 Skill —— 不需要选任何 preset，也不需要切换模式。

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

## Token 类型与权限边界

实际可用能力由 Cloudflare token 决定。常见 token 类型：

| Token 类型 | 前缀 | 典型权限 |
| --- | --- | --- |
| Account Token | `cfat_` | 账户范围内读写，但不能跨 zone |
| User Token | `cfut_` | 用户级，可限定到具体 Zone 资源 |
| OAuth Token | `cfoat_` | 通过 OAuth 授权产生 |

遇到以下情况，先提示用户而非猜测：

- `/accounts` 返回 403 → token 失效或权限不够
- DNS 端点返回 10000 → token 没有 Zone 资源权限
- `/user/tokens/verify` 返回 401（cfat_）→ 这是 account token 的正常行为，不是错误
- R2 端点返回 10042 → 账户尚未开通 R2，需要先在 Dashboard 开通

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

Wrangler 启动器（`scripts/wrangler.js`）会从 `%USERPROFILE%\.dsh\.env` 读取 token，永不写入仓库或日志。

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

## 相关链接

- [Cloudflare Code Mode MCP](https://github.com/cloudflare/mcp)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [cfbridge 项目仓库](https://github.com/Wenaixi/cfbridge)