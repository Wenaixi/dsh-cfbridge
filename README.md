# cfbridge

> Cloudflare 官方 Code Mode MCP 在 DeepSeek Harness（DSH）中的全局 Bundle 桥接。

[![npm](https://img.shields.io/npm/v/@wenaixi/cfbridge?color=cb3837)](https://www.npmjs.com/package/@wenaixi/cfbridge)
[![CI](https://github.com/Wenaixi/dsh-cfbridge/actions/workflows/ci.yml/badge.svg)](https://github.com/Wenaixi/dsh-cfbridge/actions/workflows/ci.yml)
[![许可](https://img.shields.io/badge/license-MIT-16a34a)](./LICENSE)

DSH Bundle 组合包：装到 web profile 后**所有会话全局可见** Cloudflare 官方 Code Mode MCP 三工具（docs / search / execute）与配套 Skill，配合项目本地 Wrangler CLI 透传。走 `dsh.bundle` 原生分发，无需构建。仓库 [Wenaixi/dsh-cfbridge](https://github.com/Wenaixi/dsh-cfbridge) · npm [@wenaixi/cfbridge](https://www.npmjs.com/package/@wenaixi/cfbridge)。

## 安装

**前提**：DSH 可启动（`dsh --profile web`）；已装 pnpm（`dsh plugin` 透传给它）；Cloudflare API token —— 推荐 account token（`cfat_`，带 `Account Resources: Read`），DNS 操作用 Zone 范围的用户 token（`cfut_`）。

**第 1 步 — 写入 token**（私有文件，git 忽略，勿写入任何被跟踪文件）：

```dotenv
# %USERPROFILE%\.dsh\.env
CLOUDFLARE_API_TOKEN=请替换为你的token
```

**第 2 步 — 安装 Bundle**（任选其一，其他 profile 把 `web` 换成对应名字）：

```powershell
# 方式 A — npm（推荐）
dsh plugin --profile web add @wenaixi/cfbridge

# 方式 B — GitHub 直装（免构建：纯 JS + YAML + Markdown，无 prepare 步骤）
dsh plugin --profile web add github:Wenaixi/dsh-cfbridge

# 方式 C — clone 后本地安装
git clone https://github.com/Wenaixi/dsh-cfbridge.git; cd dsh-cfbridge
npm install
npm run install:bundle            # 默认装到 web；其他 profile 加 -- --profile <name>
```

`install:bundle` 内部做两件事：调 `dsh plugin --profile <name> add .` 把包加入 `dsh.profile.bundles`；再 `--dump-config` 验证 `cfbridge` 层与 `mcp-cloudflare` / `cfbridge-skill` 两行出现。

**第 3 步 — 重启并验证**：重启 `dsh --profile web` 后任意新会话应看到 `mcp__cloudflare__docs/search/execute` 与 `cfbridge` Skill；也可用 `dsh --profile web --dump-config | Select-String "cfbridge"` 检查。

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

**Skill 加载真相**：索引阶段仅注入每个 Skill 的 `name/description/whenToUse`（约 120–180 tok/个，14 个合计约 1.7–2.5k tok），全文仅在需要时单篇加载（如 `wrangler` 约 4.5k tok），不会一次性灌入全部。

## 使用：你触发，LLM 接管

你只需显式说一句「用 / 加载 / 走 `cfbridge` …」触发；是否再加载子 Skill、何时 search → execute、写操作是否征求确认，全部由 LLM 自主决策：

| 你（触发） | LLM 自动接管 |
|------|------|
| “用 cfbridge 查一下我账号下有哪些 Zone / D1 / KV” | `search` 找端点 → `execute` 只读调用 |
| “加载 cfbridge，帮我写一个 Durable Object 聊天室” | 判定需领域知识 → 加载 `cloudflare` Skill → 决策树指向 `durable-objects` → 生成代码 → `wrangler` 校验 |
| “走 cfbridge 用 Workers 部署这个脚本” | 视情况加载 `cloudflare` → `wrangler deploy`（写操作前先复述并征求确认） |
| “用 cfbridge 选存储方案，KV 还是 D1 还是 R2？” | 加载 `cloudflare` → “Need storage?” 决策树 → 给出建议 |

**规则（已写入 Skill，LLM 会遵守）**：任何 API 调用前先 `search`/`docs` 再 `execute`（检索优于记忆）；写操作（deploy / KV-D1-R2 写 / DNS 改 / secret）先复述“对 YY 资源做 XX”并等确认，不可逆操作二次确认。

**一句话心智模型**：你负责一句话触发；`cfbridge` 是薄桥（挂三工具 + 审批规范），`cloudflare` 是总入口（决策树 → 指引到 `wrangler` 等 12 个子 Skill），路由全由模型决策。

## 官方 Skills 入口（与 cfbridge 互补）

领域知识由 [cloudflare/skills](https://github.com/cloudflare/skills) 的 `cloudflare` Skill 提供。**何时加载它**：不确定该选哪个 Cloudflare 产品（KV/D1/R2？Workers/Pages?）；需要 30+ 产品决策树或 `references/` 索引；需要判断该加载哪个子 Skill；任何 Cloudflare 开发任务的起点。其余子 Skill（`wrangler` / `agents-sdk` / `durable-objects` / `cloudflare-one` 等 12 个）由它按需指引，本包已 vendoring 13 个 SKILL.md 到 `skills/<name>/`（离线可用）。

不用 DSH 时也可独立安装（任选其一，与 cfbridge 共存）：

| Agent | 命令 |
|-------|------|
| Claude Code | `/plugin marketplace add cloudflare/skills` → `/plugin install cloudflare@cloudflare` |
| Cursor | Settings → Rules → Add Rule → Remote Rule (Github) → `cloudflare/skills` |
| 任意 Agent | `npx skills add https://github.com/cloudflare/skills` |
| 手动 | 按 https://github.com/cloudflare/skills#clone--copy 克隆拷贝 |

## 形态：Bundle / Preset / 动态插件

| 形态 | 生效粒度 | 何时选 |
|------|---------|-------|
| **Bundle（主推）** | 装到 profile 后所有会话全局可见 | 需要 `mcp__cloudflare__*` 常驻，推荐默认 |
| **Agent Preset** | 仅选中该 preset 的会话可见 | 只想在特定项目用，不想全局常驻（从 shipped `standard` copy 后移入 14 行） |
| **动态 Cordis Plugin** | 运行时注册，卸载即消失 | 临时演示 / A-B 对比 |

> 约束（遵循 dsh-plugin-dev）：Bundle 的 `cordis.patch.yml` 不声明 `persona` / `agent-instructions` / `tool-fs` 等 host 已有层；`failOnStartupError: false`；Authorization 用 `!!js` 动态引 `process.env.CLOUDFLARE_API_TOKEN`；勿与 Preset 同时注册 `mcp__cloudflare__*`。

**它不是什么**：不是按 preset 选择（装完全会话可见）；不是动态 Cordis 插件（走原生 `dsh.bundle` 分发）；不复制端点列表（直连官方 Code Mode MCP，永远最新）；不污染用户 patch 层（独立层追加于 `dsh.profile.bundles`）。

## 验证

```powershell
npm run check              # 仓库配置 + 安全检查（73 项）
npm run validate:bundle    # manifest + 结构校验（53 项）
npm run test:wrangler      # Wrangler CLI 只读验证
npm run test               # 跑全部
npm run dump:config        # 查看当前 profile 中 cfbridge 这一层（--raw 不过滤）
```

## 启停控制

```powershell
# 启用
dsh plugin --profile web add @wenaixi/cfbridge
# 停用（uninstall:bundle 会清理 dependency、bundles 层及旧版 skill 软链残留）
dsh plugin --profile web remove @wenaixi/cfbridge
# 或：npm run uninstall:bundle -- --profile web
```

**热切换（disabled 覆写，不卸载）**：在 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml` 末尾追加完整重写 `mcp-cloudflare` 的块（DSH 后层按行胜出，必须重述整行 config）：

```yaml
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

重启后 `mcp__cloudflare__*` 消失；删除该段并重启即恢复。（若 DSH 未来提供原生 `disable` 命令，本节将迁移。）

## 安全规则

1. Token 仅存 `$DSH_HOME/.env`（git 忽略），配置中一律 `!!js process.env...` 动态引用。
2. 不写入任何被跟踪文件、commit 或 issue；不打印到日志。
3. 最小权限 token；DNS 单独用 Zone 范围的用户 token。
4. 不再使用或疑似泄漏时立即在 Cloudflare Dashboard 撤销。
5. **勿将 Bundle 与旧 preset 同时启用** —— 同一 `serverName: cloudflare` 会导致工具注册两次。发现旧 `~/.dsh/.agent-presets/cfbridge/` 时运行 `npm run migrate:from-preset -- --yes` 清理。

## 维护

- **同步官方 Skills 快照**：`npm run sync:vendor`（仅补缺失）/ `sync:vendor:force`（强制刷新）。快照头部含 `vendored from cloudflare/skills@main on YYYY-MM-DD` 注释；SKILL.md 内的 raw.githubusercontent.com 链接作为“永远最新”兜底。
- **版本**：本地 `package.json` 为权威，跟随 npm `latest`。发布流程：改 version → 补 CHANGELOG.md 小节 → 打 `vX.Y.Z` tag 推送，CI 自动测试 + npm publish + GitHub Release。
- **已验证能力**：MCP 三工具（账号/Zone/Workers/KV/D1/Pages/GraphQL 只读调用）；`cfbridge` Skill 全会话可见（`source: runtime`）；本地 Wrangler（version/whoami/D1/Worker/Pages）；追踪文件与历史均无 token。
- 作者 **Wenaixi** · MIT · 决策记录见 [`CLAUDE.md`](./CLAUDE.md) 与 [`docs/superpowers/plans/`](./docs/superpowers/plans/) · 相关：[Cloudflare MCP](https://github.com/cloudflare/mcp) · [Wrangler 文档](https://developers.cloudflare.com/workers/wrangler/) · [DSH Bundle 文档](https://github.com/deepseek-ai/deepseek-harness)