# cfbridge

> Cloudflare 官方 Code Mode MCP 在 DeepSeek Harness（DSH）中的**全局 Bundle 桥接**。

[![版本](https://img.shields.io/badge/version-0.3.0-2563eb)](./package.json)
[![许可](https://img.shields.io/badge/license-MIT-16a34a)](./LICENSE)

cfbridge 是一个 **DSH Bundle（组合包）**，通过 `dsh plugin --profile <name> add` 安装到任意 DSH profile 后，**所有会话全局可见** Cloudflare 官方 Code Mode MCP 三工具（docs / search / execute）与配套 Skill，配合项目本地 Wrangler CLI 透传。

## 它是什么

```text
DSH Bundle（全局常驻，按需开关）
  └─ 安装到 web profile（默认）后所有会话自动挂载
       ├─ mcp__cloudflare__docs     ← Cloudflare 文档语义搜索
       ├─ mcp__cloudflare__search   ← OpenAPI 端点检索
       ├─ mcp__cloudflare__execute  ← 官方隔离 sandbox 内执行
       ├─ cfbridge Skill            ← MCP 最佳实践、写操作审批规范
       └─ npm run wrangler ...      ← 项目本地 Wrangler CLI 透传
```

## 它不是什么

- **不是按 preset 选择** —— 安装后**所有会话**都自动可见，不需要选「Cloudflare 模式」。
- **不是动态 Cordis 插件** —— 走 DSH 原生 `dsh.bundle` 分发路径，不依赖 `cordis_define` 运行时传输。
- **不复制 Cloudflare API 端点列表** —— 直接使用官方 Code Mode MCP，永远是最新的。
- **不污染用户 patch 层** —— bundle 作为独立层追加在 `dsh.profile.bundles`；用户 `cordis.patch.yml` 只在不想用时被覆盖（见停用 B）。

## 安装

### 前提

- DSH 已安装并可启动（`dsh --profile web`），版本 ≥ 0.1.1-rc.2。
- 已安装 pnpm（DSH 的 `dsh plugin` 子命令透传给 pnpm）。
- 已生成 Cloudflare API token。
  - 推荐 account token（`cfat_`），需带 `Account Resources: Read`。
  - DNS 操作使用 Zone 范围的用户 token（`cfut_`）。

### 1. 安装 token

把 token 写入 DSH 的私有环境文件（默认 `%USERPROFILE%\.dsh\.env`，可由 `DSH_HOME` 覆盖）：

```dotenv
# C:\Users\Administrator\.dsh\.env（私有，git 忽略）
CLOUDFLARE_API_TOKEN=请替换为你的token
```

> 仅把 token 放在被忽略的私有文件里；不要写进 `cordis.patch.yml`、commit 或 issue。

### 2. 安装 Bundle

```powershell
git clone https://github.com/Wenaixi/cfbridge
cd cfbridge
npm install
npm run install:bundle            # 默认装到 web profile
# 其他 profile：npm run install:bundle -- --profile tui
```

`install:bundle` 内部做了三件事：

1. 调 `dsh plugin --profile <name> add .`，让 DSH 自动把 `@wenaixi/cfbridge` 加进 `dsh.profile.bundles`。
2. 把仓库内的 `skills/cfbridge/` 软链到 `$DSH_HOME/skills/cfbridge/`，让 host 已有的 `dsh-skill-filesystem` 默认根（`user-dsh`）自动收录。
3. 调 `dsh --profile <name> --dump-config` 验证 `cfbridge` 层出现。

### 3. 重启 DSH

```powershell
dsh --profile web
```

打开任意新会话，模型工具列表应包含 `mcp__cloudflare__docs / search / execute`，可用 skill 列表应包含 `cfbridge`。

## 验证

```powershell
# 仓库配置 + 安全检查（v0.3.0：bundle 入口 + 反转 web patch 校验 + deprecated shim）
npm run check

# Bundle manifest + 结构校验（cordis.patch.yml / SKILL.md / token 痕迹）
npm run validate:bundle

# Wrangler CLI 只读验证
npm run test:wrangler

# 跑全部
npm run test

# 快速只查看当前 profile 中 cfbridge 这一层
npm run dump:config
# 等价：npm run dump:config -- --raw   # 不过滤，输出完整 dump
```

## 启停控制

### A. 官方 CLI 启用/停用（推荐）

```powershell
# 启用
npm run install:bundle -- --profile web

# 停用
npm run uninstall:bundle -- --profile web
# 等价：dsh plugin --profile web remove @wenaixi/cfbridge
```

`uninstall:bundle` 会清理：DSH profile 中的 dependency、`dsh.profile.bundles` 层、`$DSH_HOME/skills/cfbridge/` 软链。

### B. disabled 覆写（热切换，不卸载）

在 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml` 末尾追加一段**完整重写** `mcp-cloudflare` 的块（DSH 后层按行胜出，必须重述整行 config）：

```yaml
# 临时禁用 cfbridge 的 Cloudflare MCP 三工具（不卸载 Skill）
- insert:
    - id: mcp-cloudflare
      name: '@deepseek-ai/dsh-mcp-client'
      disabled: true
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

重启 DSH 后 `mcp__cloudflare__*` 消失；删除这段并重启即可恢复。

> 若 DSH 后续提供 `dsh plugin --profile <name> disable <bundle>` 原生命令，本节会迁移过去。

## 安全规则

1. **Token 仅在 `$DSH_HOME/.env`**（默认 `%USERPROFILE%\.dsh\.env`），由 `.gitignore` 忽略；`cordis.patch.yml` 用 `!!js process.env...` 动态引用。
2. 不写入 `cordis.patch.yml`、scripts、commit 或 issue；不打印到日志。
3. 使用最小权限 token；DNS 单独用 Zone 范围的用户 token。
4. 不再使用或泄漏时立即在 Cloudflare Dashboard 撤销。
5. **不要把 bundle 与旧 v0.2.0 preset 同时启用** —— 同一 `serverName: cloudflare` 会导致 `mcp__cloudflare__*` 被注册两次，行为未定义。若发现旧的 `~/.dsh/.agent-presets/cfbridge/`，运行 `npm run migrate:from-preset -- --yes` 清理。

## 已验证能力

| 层级 | 内容 |
| --- | --- |
| DSH MCP | docs / search / execute 三工具，账号 / Zone / Workers / KV / D1 / Pages / GraphQL 只读调用 |
| Skill | `cfbridge` Skill 在所有会话的可用 skill 列表里可见 |
| 本地 Wrangler | 版本、whoami、D1 列表、Worker 部署列表、Pages 项目列表 |
| 安全 | 追踪文件与历史均无 token；无 remote；`.env` 与证书被忽略 |

## 版本与维护

- 当前版本：**v0.3.0**（重构为全局 Bundle，原 Agent Preset 形态归档到 `deprecated/preset/`）。
- 作者：**Wenaixi**
- 许可证：MIT
- v0.3.0 决策与历史记录见 [`CLAUDE.md`](./CLAUDE.md) 与 [`docs/plan-v0.3.0-global-bundle.md`](./docs/plan-v0.3.0-global-bundle.md)
- 相关链接：[Cloudflare MCP](https://github.com/cloudflare/mcp) · [Wrangler 文档](https://developers.cloudflare.com/workers/wrangler/) · [DSH Bundle 文档](https://github.com/deepseek-ai/deepseek-harness)
