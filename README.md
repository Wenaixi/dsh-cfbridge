# cfbridge

> Cloudflare 官方 Code Mode MCP 在 DeepSeek Harness（DSH）中的轻量桥接配置。

[![版本](https://img.shields.io/badge/version-0.1.0-2563eb)](./package.json)
[![许可](https://img.shields.io/badge/license-MIT-16a34a)](./LICENSE)

`cfbridge` 不重复实现 Cloudflare API。它使用 DSH 内置的
`@deepseek-ai/dsh-mcp-client` 连接 Cloudflare 官方托管 MCP：
`https://mcp.cloudflare.com/mcp`。完成一次配置后，当前 web profile 内的
每个 DSH 会话都能调用 Cloudflare 的文档、OpenAPI 检索和 API 执行能力。

## 提供的工具

| 工具 | 用途 |
| --- | --- |
| `mcp__cloudflare__docs` | 语义搜索 Cloudflare 官方文档。 |
| `mcp__cloudflare__search` | 用 JavaScript 检索已展开 `$ref` 的 Cloudflare OpenAPI spec。 |
| `mcp__cloudflare__execute` | 在 Cloudflare 隔离 sandbox 内执行 JavaScript，并以 `cloudflare.request()` 调用 API。 |

这 3 个工具覆盖 Cloudflare API 的约 2,500 个端点。工具定义与 API 访问均由
Cloudflare 官方 MCP 服务维护，因此不会因本地复制接口列表而过期。

## 架构

```text
DSH web profile
  └─ @deepseek-ai/dsh-mcp-client
       └─ streamable-http
            └─ https://mcp.cloudflare.com/mcp
                 ├─ docs
                 ├─ search
                 └─ execute → Cloudflare API
```

配置通过 profile 的 Cordis patch 插入，DSH HMR 会热替换 MCP 客户端。编辑 patch
后不需要为普通配置变更启动新的 web 服务。

## 安装与配置

### 前提条件

- 已安装并运行 DSH web profile。
- 有 Cloudflare API token。
- 如使用 account token（`cfat_`），需带 `Account Resources: Read`，让 MCP 服务识别账号。

### 1. 配置 token

把 token 写入 DSH 的环境文件。**不要提交此文件。**

```dotenv
# C:\Users\Administrator\.dsh\.env
CLOUDFLARE_API_TOKEN=请替换为你的token
```

### 2. 插入 Cordis patch 条目

在 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml` 的 `insert` 列表中加入本仓库的
[`cordis.patch.yml`](./cordis.patch.yml) 里 `mcp-cloudflare` 条目的内容：

```yaml
- id: mcp-cloudflare
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: cloudflare
    transport: streamable-http
    url: https://mcp.cloudflare.com/mcp
    headers:
      Authorization: !!js '`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`'
    toolCallTimeoutMs: 120000
    failOnStartupError: false
    reconnect:
      enabled: true
      initialDelayMs: 500
      maxDelayMs: 30000
      maxAttempts: 10
```

`serverName` 必须在同一 DSH 进程中唯一；它决定模型可见的工具前缀
`mcp__cloudflare__`。

### 3. 启动或重启一次 DSH

`.env` 在 DSH 进程启动时装载，因此首次添加或轮换 token 后需要重启 DSH。之后编辑
`cordis.patch.yml` 会由 HMR 应用。

### 4. 验证

在 DSH 中先调用：

```js
// mcp__cloudflare__execute 的 code 参数
async () => cloudflare.request({
  method: 'GET',
  path: `/accounts/${accountId}/workers/scripts`,
})
```

正常返回 `success: true` 和 HTTP `200` 即表示连接、鉴权和 Code Mode 都已就绪。

## 常用示例

### 检索 API 端点

```js
async () => Object.entries(spec.paths)
  .filter(([path]) => path.includes('dns_records'))
  .slice(0, 20)
  .map(([path, item]) => ({ path, methods: Object.keys(item) }))
```

### 列出 Workers

```js
async () => cloudflare.request({
  method: 'GET',
  path: `/accounts/${accountId}/workers/scripts`,
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

### 查询 D1 数据库

```js
async () => cloudflare.request({
  method: 'GET',
  path: `/accounts/${accountId}/d1/database`,
})
```

先用 `mcp__cloudflare__search` 查询不熟悉的端点与请求体，再把确认后的路径交给
`mcp__cloudflare__execute`。不要猜测 API 参数。

## 已验证能力与限制

本项目使用的 account token 已验证可以访问：账号、Zone 列表、Workers、KV namespace、
D1、Pages、GraphQL analytics，以及 MCP docs/search/execute。

| 场景 | 说明 |
| --- | --- |
| DNS 记录读写 | account token 不能授予 Zone 资源权限；改用具备 `Zone:DNS` 权限的用户 token（通常为 `cfut_`） |
| R2 | 若返回 `10042`，先在 Cloudflare Dashboard 开通 R2；这不是 token 权限错误 |
| `/user/tokens/verify` | 对 `cfat_` account token 返回 401 是预期行为；用 `/accounts` 验证 token |
| 认证/权限错误 | 通过 Cloudflare Dashboard 复核 token 类型、资源范围及所需权限 |

## Wrangler CLI 集成

除了远程 MCP，本项目还内置了 [Wrangler](https://developers.cloudflare.com/workers/wrangler/)
4.x 的本地开发依赖，用于项目级、可复现的 Workers/D1/Pages 命令。Cloudflare 官方推荐
**按项目本地安装** Wrangler，而不是依赖全局版本；本项目已把它锁定在
`package-lock.json` 中。

```powershell
npm ci
npm run wrangler:version
```

### 认证模型

项目的 `scripts/wrangler.js` 会优先使用当前终端的 `CLOUDFLARE_API_TOKEN`；若没有设置，
才读取私有的 `%USERPROFILE%\.dsh\.env`。它从不输出、持久化或把 token 拼接到命令行。

```dotenv
# %USERPROFILE%\.dsh\.env（私有文件，不属于仓库）
CLOUDFLARE_API_TOKEN=请替换为你的token
```

官方文档确认：`CLOUDFLARE_API_TOKEN` 可用于自动化认证，并且优先于 Wrangler 的已保存
OAuth profile。若希望完全不使用 DSH 环境文件，也可以仅在当前 PowerShell 会话中设置该
变量后运行 npm 脚本。

### 安全的只读命令

```powershell
# 校验依赖版本、配置结构、忽略规则和仓库中的 token 痕迹
npm run check

# 验证 token 对应的账号；不修改 Cloudflare 资源
npm run wrangler:whoami

# 列出 D1 数据库；不修改 Cloudflare 资源
npm run wrangler:d1:list

# 列出指定 Worker 的部署历史；不修改 Cloudflare 资源
npm run wrangler:workers:list

# 列出 Pages 项目；不修改 Cloudflare 资源
npm run wrangler:pages:list

# 传入任意其他 Wrangler 参数
npm run wrangler -- pages project list --json
```

有意执行 `deploy`、`secret put`、`kv namespace create`、`d1 execute` 等写操作前，应先
明确复核目标账号、环境和命令参数。cfbridge 不提供自动部署脚本，也不会自动执行写操作。

### 更新 Wrangler

```powershell
npm install --save-dev wrangler@latest
npm run check
```

更新后请审阅 `package-lock.json` 的差异并运行验证；不要使用未固定版本的全局安装作为
项目部署依据。

## 测试范围

v0.1.0 发布前已实际验证以下只读路径：

| 层级 | 验证项 |
| --- | --- |
| DSH MCP | `docs` 文档检索、`search` OpenAPI 检索、`execute` 账号/Zone/Workers/KV/D1/Pages/GraphQL 只读调用 |
| 本地 Wrangler | 版本检查、token `whoami`、D1 列表、Worker 部署列表、Pages 项目列表 |
| 安全 | 追踪文件与完整 Git 历史均无 token 类内容；无 Git remote；`.env`、证书和 DSH 本地状态均被忽略 |

“所有功能”指配置本身的三条 MCP 通路和本仓库提供的 Wrangler 封装均经过验证；Cloudflare
上千个 API 端点的具体业务权限则取决于 token 类型、资源范围和产品是否已开通，不能用一次
无差别写入测试替代。

## 版本与维护

- 当前版本：**v0.1.0**
- 作者：**Wenaixi**
- 许可证：MIT
- 官方文档：[Cloudflare MCP](https://github.com/cloudflare/mcp) · [Wrangler 安装](https://developers.cloudflare.com/workers/wrangler/install-and-update/) · [Wrangler 环境变量](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/)
- 设计参考：[Edge-Echo/dsh-mcp-bridge](https://github.com/Edge-Echo/dsh-mcp-bridge)
- 项目决策、验证记录与历史诊断见 [`CLAUDE.md`](./CLAUDE.md)。

## 安全规则

1. 不要把 token 写进 `cordis.patch.yml`、脚本、README、commit 或 issue。
2. 仅把 token 放在被忽略的 `$DSH_HOME/.env` 中，以 `!!js process.env...` 引用。
3. 使用最小权限 token；需要 DNS 时单独创建 Zone 范围的用户 token。
4. 测试或不再使用时，立即在 Cloudflare Dashboard 撤销 token。
