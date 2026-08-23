# cfbridge

> Cloudflare 官方 Code Mode MCP 在 DeepSeek Harness（DSH）中的**全局 Bundle 桥接**。

[![npm](https://img.shields.io/npm/v/@wenaixi/cfbridge?color=cb3837)](https://www.npmjs.com/package/@wenaixi/cfbridge)
[![CI](https://github.com/Wenaixi/dsh-cfbridge/actions/workflows/ci.yml/badge.svg)](https://github.com/Wenaixi/dsh-cfbridge/actions/workflows/ci.yml)
[![版本](https://img.shields.io/badge/version-0.3.1-2563eb)](#版本与维护)
[![许可](https://img.shields.io/badge/license-MIT-16a34a)](./LICENSE)

cfbridge 是一个 **DSH Bundle（组合包）**，通过 `dsh plugin --profile web add` 装到 **web** profile 后，**所有会话全局可见** Cloudflare 官方 Code Mode MCP 三工具（docs / search / execute）与配套 Skill，配合项目本地 Wrangler CLI 透传。走 `dsh.bundle` 原生分发，无需 `prepare` 构建。

> 仓库：**[Wenaixi/dsh-cfbridge](https://github.com/Wenaixi/dsh-cfbridge)** · npm 包：**[@wenaixi/cfbridge](https://www.npmjs.com/package/@wenaixi/cfbridge)**

## 一键安装（装到 web）

```powershell
# 方式 A — npm（推荐）
dsh plugin --profile web add @wenaixi/cfbridge

# 方式 B — GitHub 直装（免构建）
dsh plugin --profile web add github:Wenaixi/dsh-cfbridge#v0.3.1

# 验证
dsh --profile web --dump-config | Select-String "cfbridge"
```

装完重启 `dsh --profile web`，任意新会话即可看到 `mcp__cloudflare__*` 与 `cfbridge` Skill。其他 profile 把 `web` 换成对应名字即可。

## 它是什么

```text
DSH Bundle（全局常驻，按需开关）
  └─ 安装到 web profile（默认）后所有会话自动挂载
       ├─ mcp__cloudflare__docs     ← Cloudflare 文档语义搜索
       ├─ mcp__cloudflare__search   ← OpenAPI 端点检索
       ├─ mcp__cloudflare__execute  ← 官方隔离 sandbox 内执行
       ├─ cfbridge Skill            ← 薄桥：search-then-execute、写操作审批、Token 边界
       ├─ 13 vendored Skills        ← cloudflare/wrangler/agents-sdk/... 原样离线可用
       └─ npm run wrangler ...      ← 项目本地 Wrangler CLI 透传
```

## 官方 Skills 入口：cloudflare 总入口（与 cfbridge 互补）

> cfbridge 是"薄桥"：只把 Cloudflare 官方 Code Mode MCP 的 `docs/search/execute` 三工具挂到 DSH。领域知识由 https://github.com/cloudflare/skills 的 `cloudflare` 总入口 Skill 按需提供——**需要领域知识时先加载 `cloudflare`，它内含决策树与 Product Index，会指引你再按需加载 `wrangler` 等子 Skill**。

**何时加载 `cloudflare` 总入口：**
- 不确定该用哪个 Cloudflare 产品（存数据选 KV / D1 / R2？跑代码选 Workers / Pages？）
- 需要 30+ 产品的决策树或 `references/` 索引
- 需要判断该加载哪个子 Skill（`wrangler` / `agents-sdk` / `cloudflare-one` 等）
- 任何 Cloudflare 开发任务的起点

| Skill | 何时加载 | 说明 | 官方 SKILL.md |
|-------|---------|------|---------------|
| cloudflare | 见上“何时加载 cloudflare 总入口” | 总入口/平台选型，内含分流到其余子 Skill 的决策树 | https://raw.githubusercontent.com/cloudflare/skills/main/skills/cloudflare/SKILL.md |

> 其余子 Skill（`wrangler` / `agents-sdk` / `durable-objects` / `cloudflare-one` 等 12 个）由 `cloudflare` 按需指引，本表不再逐一展开；本包已 vendoring 13 个 SKILL.md 到 `skills/<name>/`（离线可用，索引仅 name/description，全文按需加载）。

安装（任选其一，与 cfbridge 共存）：`npx skills add https://github.com/cloudflare/skills` · Claude Code `plugin marketplace add cloudflare/skills` · 或按 https://github.com/cloudflare/skills#installing 手动拷贝。


## 形态说明：Bundle / Preset / 动态插件

cfbridge 在 DSH 中有三种形态，选型如下：

| 形态 | 安装位置 | 生效粒度 | 安装命令 | 何时选 |
|------|---------|---------|---------|-------|
| **Bundle（主推，Host 组合）** | `dsh.profile.bundles`（profile 级） | 装到 `web` 后所有会话全局可见 | `dsh plugin --profile web add @wenaixi/cfbridge` | 需要 `mcp__cloudflare__*` 常驻，推荐默认 |
| **Agent Preset（按需）** | `$DSH_HOME/.agent-presets/<id>/` | 仅选中该 preset 的会话可见 | 从 shipped `standard` `copy()` 出 `cfbridge` preset，把 `cordis.patch.yml` 的 14 行移入其 `agent.cordis.yml` | 只想在特定项目/会话用 Cloudflare，不想全局常驻 |
| **动态 Cordis Plugin（临时探针）** | `cordis_define` / `cordis_run` 运行时 | 随插件卸载消失 | JS `code.host`/`code.client` 动态注册 | 临时演示 / A-B 对比，不适合持久 skill |

> 约束（遵循 dsh-plugin-dev）：Bundle 的 `cordis.patch.yml` 不声明 `persona` / `agent-instructions` / `tool-fs` 等 host 已有层；`failOnStartupError: false`；`Authorization` 用 `!!js` 模板动态引 `process.env.CLOUDFLARE_API_TOKEN`；同一能力不要同时以 Bundle + Preset 重复注册 `mcp__cloudflare__*`。

**Skill 加载真相：** DSH 的 skill 索引仅注入每个 skill 的 `name/description/whenToUse`（约 120-180 tok/skill，14 个合计约 1.7-2.5k tok）；仅当模型判定需要该领域知识时，才通过 `tool-skill` 按需加载单个 `SKILL.md` 全文（如 `wrangler` 约 4.5k tok），不会一次性加载全部 38k tok。


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

**方式 A — npm 直装（推荐，免 clone）**

```powershell
dsh plugin --profile web add @wenaixi/cfbridge
```

**方式 B — GitHub 直装（免构建，零本地依赖）**

```powershell
dsh plugin --profile web add github:Wenaixi/dsh-cfbridge
# 锁定版本更稳妥：
dsh plugin --profile web add github:Wenaixi/dsh-cfbridge#v0.3.1
```

> 直装前提：仓库含 `dsh.bundle` 声明且无 TypeScript 编译步骤（本仓库满足 —— 纯 JS + YAML + Markdown，GitHub 拉到的就是可运行形态，无需 `prepare`/`allowBuilds`）。

**方式 C — clone 后本地安装**

```powershell
git clone https://github.com/Wenaixi/dsh-cfbridge.git
cd dsh-cfbridge
npm install
npm run install:bundle            # 默认装到 web profile
# 其他 profile：npm run install:bundle -- --profile tui
```

`install:bundle` 内部做了两件事：

1. 调 `dsh plugin --profile <name> add .`，让 DSH 自动把 `@wenaixi/cfbridge` 加进 `dsh.profile.bundles`。
2. 调 `dsh --profile <name> --dump-config` 验证 `cfbridge` 层及两行（`mcp-cloudflare` / `cfbridge-skill`）出现。

### 3. 重启 DSH

```powershell
dsh --profile web
```

打开任意新会话，模型工具列表应包含 `mcp__cloudflare__docs / search / execute`，可用 skill 列表应包含 `cfbridge`。

## 验证

```powershell
# 仓库配置 + 安全检查（bundle 入口 + 反转 web patch 校验 + deprecated shim）
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
# 启用（npm 包）
dsh plugin --profile web add @wenaixi/cfbridge

# 启用（GitHub 直装）
dsh plugin --profile web add github:Wenaixi/dsh-cfbridge#v0.3.1

# 停用
dsh plugin --profile web remove @wenaixi/cfbridge
# 或：npm run uninstall:bundle -- --profile web
```

`uninstall:bundle` 会清理：DSH profile 中的 dependency、`dsh.profile.bundles` 层及旧版残留的 skill 软链（如有）。

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
| Skill | `cfbridge` Skill 在所有会话的可用 skill 列表里可见（`source: runtime`） |
| 本地 Wrangler | 版本、whoami、D1 列表、Worker 部署列表、Pages 项目列表 |
| 安全 | 追踪文件与历史均无 token；无 remote 泄露风险；`.env` 与证书被忽略 |

## 同步官方 Skills（按需更新快照）

vendored 的 13 个 SKILL.md 为快照，官方更新后可一键同步：

```powershell
npm run sync:vendor         # 仅补缺失（幂等）
npm run sync:vendor:force  # 强制全量刷新
```

快照头部含 `vendored from cloudflare/skills@main on YYYY-MM-DD` 注释，便于追溯；`skills/cfbridge/SKILL.md` 内的 `https://raw.githubusercontent.com/cloudflare/skills/main/skills/<name>/SKILL.md` 链接作为“永远最新”兜底保留。

## 版本与维护

- 当前版本：**v0.3.1**（Vendoring 13 个 cloudflare/skills 官方 SKILL.md，原样入包离线可用；共 14 个 skill，索引仅 1.7k tok，全文按需加载）。
- 作者：**Wenaixi**
- 许可证：MIT
- 决策与历史记录见 [`CLAUDE.md`](./CLAUDE.md) 与 [`docs/plan-v0.3.0-global-bundle.md`](./docs/plan-v0.3.0-global-bundle.md)
- 相关链接：[Cloudflare MCP](https://github.com/cloudflare/mcp) · [Wrangler 文档](https://developers.cloudflare.com/workers/wrangler/) · [DSH Bundle 文档](https://github.com/deepseek-ai/deepseek-harness)