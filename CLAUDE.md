# cfbridge 项目记忆库

- 当前版本：**v0.1.0**
- 作者：**Wenaixi**（wenxiloveyou@gmail.com）
- 许可证：MIT
- 项目目录：`D:\newC\stick2\cfbridge`

## 产品定位

cfbridge 是 DeepSeek Harness（DSH）到 Cloudflare 官方 Code Mode MCP 的最小桥接配置。
它不维护本地 API 包装层，而是在 DSH web profile 的 Cordis patch 中插入
`@deepseek-ai/dsh-mcp-client`，直连 `https://mcp.cloudflare.com/mcp`。

该方式向模型提供：

- `mcp__cloudflare__docs`：Cloudflare 文档语义搜索；
- `mcp__cloudflare__search`：OpenAPI spec 检索；
- `mcp__cloudflare__execute`：在官方隔离 sandbox 运行 JavaScript 并调用约 2,500 个 API。

## 关键配置与安全规则

- 实际生效的 profile 配置：`%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`，条目 id 为 `mcp-cloudflare`，serverName 为 `cloudflare`。
- 令牌只允许存在于被 Git 忽略的 `%USERPROFILE%\.dsh\.env`，变量名为 `CLOUDFLARE_API_TOKEN`。
- profile patch 必须通过 `!!js '`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`'` 读取环境变量；**不得写入 token 明文**。
- `.env.example` 只可含占位符；每次提交前都要搜索 `cfat_`、`cfut_`、`cfoat_`、`sk-` 等密钥前缀。
- 此目录的 `.gitignore` 主动忽略 token、DSH 状态、历史动态插件/探针/计划；正式仓库只保留维护必需文件。
- token 曾以明文出现在本地 DSH profile 中；在任何远程推送前必须改为环境变量引用并轮换该 token。

## 已验证结论

- DSH MCP client 支持 `streamable-http`、headers、重连和 HMR 热替换；参考 `github.com/Edge-Echo/dsh-mcp-bridge`。
- Cloudflare MCP 端点：`https://mcp.cloudflare.com/mcp`。
- 服务端支持 stateless 请求；响应可为 SSE 信封，DSH MCP SDK 会处理。
- `mcp__cloudflare__execute` 的 `accountId` 会由官方服务按 token 上下文预置。
- 使用 account token（`cfat_`）时，`/accounts` 是正确的身份验证路径；`/user/tokens/verify` 返回 401 是预期的 token 类型行为。
- 当前账户实测可用：账号、Zone 列表、Workers、KV namespace、D1、Pages、GraphQL analytics、MCP docs/search/execute。
- Zone DNS 记录需要带 Zone:DNS 权限的用户 token；account token 无法代替。
- R2 未开通时 API 返回 10042；这不是认证失败。

## 设计决策

1. **采用 profile MCP 组合行，而非动态 Cordis 插件**：动态 define 传输链会将 `plugin`/`input` 等无顶层 type 的对象参数 stringify，导致 `oneOf matched 0`；重启不可靠。组合行绕过该路径，并且是 DSH 原生、可持久化方案。
2. **不复制 Cloudflare API 工具清单**：官方 Code Mode MCP 保持 API 与工具 schema 的最新状态，并比本地 29 工具动态插件更广。
3. **最小仓库**：只保留版本、配置样例、文档、许可证和 Git 规则；历史动态插件诊断版本不属于 v0.1.0 发布物。
4. **不自动推送**：本地 Git commit 是常规检查点；仅在用户明确授权时才添加远程或 push。

## 当前维护文件

- `cordis.patch.yml`：可复制到 DSH web profile 的正式 MCP 条目模板。
- `README.md`：用户安装、使用、验证与安全说明。
- `package.json`：版本、作者、许可证、Node/Wrangler 版本与维护脚本。
- `package-lock.json`：Wrangler 和其传递依赖的可复现锁定版本。
- `scripts/check.js`：无副作用的仓库配置、版本和常见 token 前缀扫描。
- `scripts/wrangler.js`：项目本地 Wrangler 的安全启动器；只在未设置 token 时从 DSH 私有 `.env` 读取，不会打印或保存 token。
- `.env.example`：安全的环境变量模板。
- `.gitignore`：密钥、DSH 状态和历史诊断文件过滤规则。
- `LICENSE`：MIT License。
- `CLAUDE.md`：本文件，开发决策和长期上下文。

## 最新验证记录（2026-08-15）

- `npm ci` 安装了项目内锁定的 Wrangler `4.123.0`；`npm run check` 和 `npm run wrangler:version` 均成功。
- `npm run wrangler:whoami` 使用 DSH 私有环境文件的 token 成功认证到 account `wenxiloveyou`。
- 只读 Wrangler 验证成功：`d1 list --json`（发现 vmail 数据库）、`deployments list --name vmail --json`、`pages project list --json`（空列表也是成功响应）。
- DSH MCP 三工具已实际验证：`docs`、`search`、`execute`；execute 完成了账号/Zone/Workers/KV/D1/Pages/GraphQL 的只读冒烟。
- Git 再次审计：工作区无 remote，完整提交历史与跟踪文件均未匹配 Cloudflare token 或常见密钥前缀；`.env` 已被忽略。
- **禁止为“全功能测试”执行任何资源写入**。部署、删除、写 KV/D1/DNS、更新 secret 都须获得用户针对该操作的明确授权。

## 本地 Git 状态

- 已于 2026-08-15 初始化本地 Git 仓库，默认分支 `main`。
- v0.1.0 基线提交：`4184753`（`chore: initialize cfbridge v0.1.0`）。
- 提交前已验证：仅 8 个正式文件被跟踪、`package.json` 版本/作者正确、无 Cloudflare token 或常见密钥前缀、`git diff --cached --check` 通过。
- 尚未配置远程仓库，且不得在未获用户明确许可时 push。
