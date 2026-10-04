# DSH MCP Token 热重载、工具注册与 CLI 化研究

核验时间：2026-10-04（Asia/Shanghai）  
核验版本：本机官方安装 DSH 0.2.0-rc.2，MCP SDK 2.0.0。结论依据本机包的实现/类型和官方上游资料；未做 live server 端到端实验。

## 结论先行

1. **配置级热重载 ≠ Token 自动刷新。**stock dsh-mcp-client 把 `headers`/`env` 在连接建立时闭包捕获，重连复用同一份 config；没有按请求动态取 Token 的钩子，也没有 OAuth refresh 管理器。HMR 改配置触发的是插件卸载、连接销毁、按新配置重建——不是原连接无缝换凭据。
2. **是，MCP 工具注册为 DSH ToolRuntime 工具。**DSH 模型工具名通常是 mcp__<serverName>__<rawToolName>，调用经 DSH 工具运行时，再桥接到 MCP tools/call。
3. **使用通道共六种，不止「模型调工具」一种。**DSH 内的模型工具、headless 单轮 Agent、现成第三方 CLI（官方 Inspector CLI 已实测连通本项目端点）、自研 CLI（MCP SDK 或 DSH 内 `ctx.tools.execute()`）、MCP resources 三个共享工具、以及完全绕开 MCP 的 Wrangler CLI 与 REST API。

## Token 热重载的准确边界

| 变化 | 实际行为 |
|---|---|
| MCP Server 发送 tools/list_changed | 重新发现并更新工具定义；不是认证 Token 更新 |
| HTTP 断线或 stdio 子进程崩溃 | 按该插件实例已捕获的原配置重连；原 Token 不变 |
| 修改 profile/home 的 MCP 配置条目，且 profile 启用了 HMR | HMR 重载该插件实例，dispose 旧连接并用新配置建连；工具名不变时名称稳定 |
| 只改 DSH 进程外的 shell 环境或 .env 文件 | 现有进程的 process.env 不会被外部修改；HMR 文档也未声明监听 .env，因此不会因此自动换 Token |
| OAuth access token 到期 | stock MCP client 配置没有动态 resolver 或 refresh-token 流程；需自定义认证层或由上游代理刷新 |

### 依据

本机安装的 dsh-mcp-client transport 实现用 config.headers 创建 Streamable HTTP transport：

    new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: config.headers } })

其配置 schema 中 headers 是 Record<string, string>。stdio transport 则在创建子进程时把 config.env 合并到清洗后的父环境。两者都在连接建立时消耗已解析配置，不会由 stock 插件在每次请求前重新读取凭据。

MCP client 的连接 supervisor 有自动重连和工具重新发现能力；但重连使用创建该实例时的 config。工具列表更新/断线恢复，不等于认证更新。

DSH HMR 监视 profile manifest 和用户 patch 文件；配置变化会经 Loader 重协调。MCP client 是 effect-scoped：卸载关闭连接并注销工具，新实例的 apply 再用新 config 建连。因此，**若新凭据已安全地进入当前 DSH 进程可读取的配置**，编辑 MCP patch 条目可通过 HMR 重建连接；若配置写着 !!js process.env.MCP_TOKEN，HMR 只是重新求值当前 Node 进程的 process.env，不能读到进程外后来改的环境变量。

这属于插件实例重载，期间连接会关闭并重建，可能有短暂不可用或正在执行请求被取消的影响。把真实 Token 直接写进 patch 文件不安全，不应为了热更新而这样做。

### 本仓库（cfbridge）当前的实际形态

`cordis.patch.yml` 里是 `Authorization: !!js '`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`'`，token 只存在于被 git 忽略的 `%USERPROFILE%\.dsh\.env`（由 DSH 启动时的 launch environment 快照读入进程环境）。因此对本仓库而言：

- **运行中改 `.dsh/.env` 无效**：进程环境是启动快照，外部改文件不会更新已运行 Web Host 的 `process.env`；HMR 也不监视 `.env`。
- **改 patch 触发 HMR 同样无效**：表达式重新求值只读到旧的进程环境（除非该进程内 `process.env` 真被更新过），token 值不变。
- **要让新 token 生效，最省事的就是重启 DSH**（Web Host 或一次性 headless 进程都会重新读快照）。这与 `ctx.credentials` 的按操作解析是两套机制——后者能热换，但 stock MCP client 没接它。

### OAuth 和 DSH credential store 的区别

MCP 授权规范规定 HTTP 授权请求中的 Bearer Token 用 Authorization header 发送；stdio 传输通常从环境取得凭据。规范对 refresh token 提供客户端指引，不代表每个 MCP 客户端都实现自动刷新。

DSH 的 ctx.credentials 支持按操作 resolve 已轮换的凭据，但 stock dsh-mcp-client 的 inject 是 tools，transport 直接接受静态 headers/env 配置，未接入 ctx.credentials。因此“DSH 有凭据热轮换能力”不能推出“MCP Authorization header 会自动热轮换”。

### 推荐做法

- **手动更新配置并接受短暂重连**：Web profile HMR + 安全的配置提供方/配置更新路径。不要把 Token 明文提交或放进命令行参数、URL query、日志。
- **自动 OAuth refresh**：使用支持动态 OAuth token provider 的 MCP 客户端实现/自定义 DSH bridge，或在 DSH 与 MCP Server 之间部署负责刷新 Token 的代理。Token/refresh token 要用安全存储。
- **轮换存于 DSH credential store 的静态密钥**：当前 stock MCP client 不会读取它；需要自定义动态认证 transport/bridge，或把认证放在会读取新凭据的代理侧。
- **headless/CLI 场景**：headless bundle 默认禁用 HMR，且通常一项任务后进程退出；新启动自然会重新读取进程环境和配置，不需为一次性任务追求进程内热更新。

## MCP 工具是否注册为 DSH 工具

是。一个 dsh-mcp-client 插件实例连接一台 MCP Server，等待首次工具发现，然后将 MCP 工具注册到 ctx.tools。公开名称为 mcp__<serverName>__<rawToolName>；若超长或有非法字符会做确定性规范化。各 MCP 服务可以同名 raw tool，通过 serverName namespace 避免冲突。

模型发起调用后，DSH ToolRuntime 负责工具可见性、执行策略和结果归一；MCP bridge 将调用转发成 MCP tools/call，线上使用服务器原始名称、参数、取消信号和超时。MCP server 工具列表变化时，bridge 重新同步注册表；同步失败会保留上一成功工具代。

这意味着 MCP 不是绕过 DSH 的“直通工具”：通过 DSH 模型工具调用时，仍处于 DSH 工具运行时链路中。但若自行用 MCP SDK 写另一个 CLI 直连 server，则不会自动继承 DSH 的 guard、审批和日志策略。

## 有哪些使用通道？共六种

### A. 已有：DSH headless Agent CLI

    dsh --profile headless "请用 mcp__github__search 搜索某仓库"

为 headless profile 装配 MCP client 配置后，Agent 可在任务中调用 MCP 工具。headless 支持 --json 事件流、--session-id 恢复会话，但它是一轮模型驱动任务：模型选择工具、生成参数并承担成本，不是纯 MCP 工具调用器；官方 headless 默认禁用 HMR。

### B. 独立 MCP CLI：最直接的确定性调用

通过 MCP SDK 连接 server，提供通用命令：

    mcp tools <server>
    mcp call <server> <tool> --input-json '{"query":"..."}'
    mcp call <server> <tool> --input-file -

优点是直接、可脚本化、无 LLM；代价是凭据、参数验证、超时、错误处理都由 CLI 自己管理，并且它绕过 DSH 的 ToolRuntime guard/approval/日志链路。命令参数应用结构化 JSON / argv，不要拼接 shell 命令；Token 不放 argv 或 URL query。

### C. DSH 集成 CLI：直接指定 MCP 工具，同时复用 DSH 策略

写一个 DSH app/profile 命令插件：解析 tool name 和 JSON args，调用当前 ctx.tools.execute()，而不是直接调用 definition.execute()，后者会绕过 ToolRuntime 的策略流水线。需要正确提供工具名、参数、callId、AbortSignal，以及可信的 Agent/session/作用域；还要验证该运行面上的审批交互是否可用。headless 现成入口承诺的是 Agent task，不承诺一个可逐工具交互审批的稳定 RPC CLI，因此这属于需实现和验收的自定义入口。

### D. 现成第三方客户端（不用自己写代码）

下列工具已存在、可直接对本项目的 `https://mcp.cloudflare.com/mcp` 使用，省掉自研成本：

| 工具 | 形态 | 对本项目的用法 |
|---|---|---|
| **MCP Inspector CLI**（MCP 官方维护） | 一次性连接、执行单个 method、打印结果并退出 | `npx -y @modelcontextprotocol/inspector --cli https://mcp.cloudflare.com/mcp --transport http --header "Authorization: Bearer $TOKEN" --method tools/list`；也支持 `--method tools/call --tool-name X --tool-args-json '{...}'`、`resources/list`、`resources/read --uri`、`prompts/get`；`--config <路径> --server <名>` 可复用配置文件里的 header 与 OAuth |
| **FastMCP CLI 客户端** | `fastmcp list` / `fastmcp call` | `fastmcp list https://mcp.cloudflare.com/mcp --auth <token> --json`；`--auth oauth` 时自带 OAuth 流程，是本清单里唯一现成支持 OAuth 的客户端 |
| 社区 CLI（`mcp-cli`、`call-mcp` 等） | 轻量 wrapper | 功能面各不相同，选用前需自行审代码与维护状态；不建议把生产 token 交给未审计的第三方包 |

**实测补充（2026-10-04）**：用本机 `%USERPROFILE%\.dsh\.env` 里的 token 跑 Inspector CLI 连 `mcp.cloudflare.com/mcp`，服务端返回 `Insufficient scope: required "user:read account:read"`。这说明两件事：Token 经 `--header` 送达的链路是通的；同时暴露一个独立事实——**当前 token 的权限不足以支撑 MCP 服务的最低读取要求**，与 DSH 本身无关，是需要去 Dashboard 补权限的问题。

### E. 走 MCP 的资源与提示词面（不只是工具）

MCP 协议还有 resources 和 prompts，DSH 也提供了对应入口，很多人只盯着工具而忽略了这两条：

- **`dsh-mcp-resources` 包**：随 base/sdk-minimal bundle 自动挂载，只要作用域内配了 MCP server，就会多出三个共享工具 `list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource`，可在运行时按需读取 server 暴露的文档。对本项目而言，配好 `mcp-cloudflare` 后这三个工具即自动可用。
- **MCP prompt templates 不支持**：`dsh-mcp-client` 明确不支持 prompt templates，这是已知边界，不要指望从 DSH 侧取 `prompts/get`。

### F. 绕开 MCP 本身：直接用 HTTP API 或 Wrangler

如果你的目标只是“操作 Cloudflare”，MCP 并非唯一通道，也不总是最短路径：

- **Wrangler CLI（本仓库已内置）**：`npm run wrangler -- ...` 通过 `scripts/wrangler.js` 透传，同样读 `CLOUDFLARE_API_TOKEN`，覆盖部署、D1/KV/R2/Pages 等常见运维场景，比 MCP 的代码沙箱更直接。
- **Cloudflare REST API**：MCP 的 `execute` 本质是在沙箱里用 `cloudflare.request()` 调 REST API。受限于 MCP 覆盖范围、沙箱限制或权限模型时，用 curl/脚本直连 `https://api.cloudflare.com/client/v4/...` 等价且更可控。

**选择顺序建议**：日常运维 → Wrangler；需要 2500+ 端点的广泛覆盖或语义检索 → MCP（Inspector CLI 或 DSH 内）；需要复用 DSH 的 guard/审批/会话日志 → DSH 集成入口；自然语言自动化 → headless。


## 决策建议

- 目标是“过期 Token 自动续期”：不要把 HMR 当 OAuth refresh；实现动态认证层或代理。
- 目标是“手动配置变更后不重启 Web Host”：HMR 可以卸载/重建 MCP plugin 连接；不要期待环境变量外部变更被自动观察。
- 目标是“终端里确定性执行指定 MCP tool”：做通用 mcp call CLI，并先决定是否必须纳入 DSH 安全策略。需要复用策略时走 DSH 集成 CLI 的 ctx.tools.execute()。
- 目标是“自然语言驱动脚本/CI”：使用 headless + MCP patch；用 --json 获取机器可读事件流。

## 一手来源

- [DSH MCP Client README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md)：配置、namespace、工具同步与重连。
- [DSH MCP Client 中文 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.zh.md)：HMR 编辑配置后原地重连的说明。
- [DSH MCP Client transport 源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/src/transport.ts)：stdio env 与 HTTP headers 的具体消费点。
- [DSH MCP Client 插件源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/src/index.ts)：apply、config、生命周期及注入服务。
- [DSH MCP Client 工具桥源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/src/tools.ts)：发现、ctx.tools 注册和执行转发。
- [DSH ToolRuntime 源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/src/index.ts)：register、schemas、execute（本机包 "directory": "packages/core/tools" 可核）。
- [DSH HMR README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/hmr/README.md)：监视范围、配置重载与串行队列。
- [DSH App Boot README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/app-boot/README.md)：patch HMR、!!js 启动时解析与 profile 行为。
- [DSH Credentials API 源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/credentials/credentials/src/index.ts)：凭据按操作解析与轮换语义。
- [DSH Headless README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/headless/README.md)：headless 的单任务 CLI 语义与边界。
- [MCP Authorization Specification 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)：HTTP authorization header、Bearer access token 与 refresh guidance。
- [MCP Transports Specification 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)：MCP transport 类型与使用方式。
- [MCP Inspector CLI client](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/cli.md)：官方 CLI 客户端的 method、参数与配置用法。
- [MCP Inspector 配置与 flag](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/configuration.md)：`--config` / `--catalog`、headers 与 OAuth 解析规则。
- [FastMCP CLI 客户端](https://fastmcp.wiki/en/cli/client)：`fastmcp list` / `fastmcp call`，含 `--auth oauth`。
- [DSH MCP resources README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-resources/README.md)：三个共享资源工具与作用域解析。
- [Cloudflare MCP 仓库](https://github.com/cloudflare/mcp)：Cloudflare Code Mode MCP 服务本体与端点。

**版本提示：**文档链接指向官方仓库 master 与 MCP 最新规范；实际实现核验以本机安装的 DSH 0.2.0-rc.2 包为准。升级后应重新对照对应版本的包实现。
