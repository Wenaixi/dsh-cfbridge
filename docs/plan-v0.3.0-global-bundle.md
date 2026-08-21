# cfbridge v0.3.0 全局 Bundle 重构计划 — 从 Agent Preset 到按需全局插件

> 版本：v0.3.0（草案）· 作者：Wenaixi · 日期：2026-08-21 · 状态：待实现（Plan 阶段，不改业务代码）

## 1. 目标与背景

### 1.1 现状（v0.2.0）
- **形态**：DSH Agent Preset，文件 `preset.yml + agent.cordis.yml + skills/cfbridge/SKILL.md`，通过 `scripts/install-preset.js` 复制到用户目录 `.dsh/.agent-presets/cfbridge/`。
- **可见性**：仅当用户在新会话选择器选「Cloudflare 模式」时，该会话的 agent scope 才会挂载 MCP 与 Skill；其他会话不可见。优点是隔离彻底，缺点是每次都要选模式、心智负担重、无法与其他 preset 叠加。
- **MCP 行**：在 `agent.cordis.yml` 内声明 `mcp-cloudflare`（`@deepseek-ai/dsh-mcp-client`，`transport: streamable-http`, `url: https://mcp.cloudflare.com/mcp`，`Authorization` 用 `!!js` 动态引用 `CLOUDFLARE_API_TOKEN`）。
- **Skill**：随 preset 一起复制，由 `skill-filesystem + tool-skill` 在该 preset 层发现。
- **Wrangler CLI**：项目内 `wrangler@4.x` 透传脚本 `scripts/wrangler.js`，从 `.dsh/.env` 的 `CLOUDFLARE_API_TOKEN` 拉 token。
- **痛点**：用户要全局可用、装完即得、不用选模式；需要时启用、不需要时停用即可。

### 1.2 新目标（v0.3.0）
- **一句话目标**：把 cfbridge 从 Agent Preset 重构为 **DSH 组合包（dsh.bundle）**，安装到 `web` profile 后，**所有会话全局可见** Cloudflare 三工具与 Skill，通过 DSH 原生的 bundle 启用/停用机制一键开关，无需再选模式。
- **关键词**：全局常驻 / 按需开关 / 不污染手写 patch / Token 零落盘 / 完全对齐 `references/packaging.md` 与 `references/plugin-anatomy.md`。

### 1.3 成功标准（可验证）
- **S1 安装即全局**：`dsh plugin --profile web add ./cfbridge`（或本地 `npm run install:bundle` 封装）成功后，`dsh --profile web --dump-config` 输出含 `# == @wenaixi/cfbridge` 层，且该层包含 `mcp-cloudflare` 行。
- **S2 三工具可见**：任意新会话（不选任何特殊 preset）下，模型工具列表含 `mcp__cloudflare__docs / search / execute`；`search` 与 `execute` 可完成只读调用。
- **S3 Skill 可见**：`tool-skill` 的 skill 目录列出 `cfbridge`，模型可 `read skill` 并按 Skill 规范执行“先 search 后 execute、写操作需确认”。
- **S4 一键开关**：用户可通过官方 CLI（`dsh plugin --profile web remove @wenaixi/cfbridge` 或 `disabled` 覆写）停用后，重启 DSH 时三工具与 Skill 消失；重新启用后恢复。无残留、无需手动改代码。
- **S5 安全不变**：`npm run check` 与 `npm run validate:bundle` 全绿；全仓 `git ls-files` 无 `cfat_/cfut_/cfoat_/sk-/gh*/AKIA/Bearer ...` 明文；`cordis.patch.yml` 仍用 `!!js` 动态引用。
- **S6 旧形态清理**：`npm run install:bundle` 前若检测到旧 `~/.dsh/.agent-presets/cfbridge/`，给出迁移提示并提供一键清理；`npm run check` 不再断言“web profile 必须无 cloudflare”，改为断言“bundle 层存在时 patch 层可见”。
- **S7 文档与脚本闭环**：`README.md / CLAUDE.md / package.json scripts` 全部指向新 Bundle 流程；旧 `install:preset / uninstall:preset / validate:preset` 标记为 deprecated 并转发或提示。

### 1.4 非目标
- 不引入新的 Cloudflare API 封装（仍直接用官方 MCP 的 2500+ 端点，不复制 OpenAPI 列表）。
- 不引入自定义 LLM 适配器、自定义 Tool 包装、或新的 Service 定义（本次仅做分发形态迁移）。
- 不改变 Wrangler CLI 的透传本质（仍为本地 `wrangler@4.x`）。
- 不自动 push 远程仓库、不自动在用户机器上执行不可逆的 profile 清理（需显式确认）。

---

## 2. 架构决策与权衡

### 2.1 为什么是 Bundle 而不是继续用 Preset

| 维度 | Preset（v0.2.0） | Bundle（v0.3.0 目标） | 结论 |
|---|---|---|---|
| 可见性 | 仅选该 preset 的会话可见 | profile 维度全局，所有会话可见 | 用户要的就是全局，Bundle 胜 |
| 开关 | 切换 preset | `dsh plugin add/remove` 或 `disabled` 覆写 | Bundle 的开关是 profile 级，不用每次新建会话再选 |
| 叠加 | 与其他 preset 互斥（一次只能选一个） | 与其他 bundle 共存（按 `dsh.profile.bundles` 顺序叠加） | Bundle 可与 `dsh-market / better-sidebar / vision-toolkit` 共存 |
| 分发 | 复制到 `~/.dsh/.agent-presets/` | 发布为 npm 包，通过 `dsh plugin add` 安装（本地路径或 npm） | Bundle 是 DSH 官方分发路径，可上市场 |
| Skill 分发 | 随 preset 复制到 preset 目录 | 随 bundle 安装到 `profiles/web/node_modules/@wenaixi/cfbridge/skills/`，由 `skill-filesystem` 的分层发现 | 需验证发现路径，但符合官方束 |
| 学习成本 | 需理解 preset 选择器 | 装完即用 | Bundle 心智更低 |

**决策**：采用 **Bundle**。保留 Preset 文件在 git 历史中，但 v0.3.0 起 **不再作为主分发形态**；提供一次性迁移脚本。

### 2.2 Hosting 形态选择 — Host 组合 vs Agent 组合
- **Host 组合（本次）**：`mcp-cloudflare` 注册到 host 的 `tools` registry（与现有的 `mcp-context7 / mcp-exa` 一致，见 `~/.dsh/profiles/web/cordis.patch.yml`），无需 `isolate` realm，无需注入 `shell` 等服务。工具对所有 agent 可见。
- **Agent 组合**：适合需要 per-agent 状态、隔离 realm、或完全替换 persona 的场景。本次不需要为每个 agent 隔离 Cloudflare 连接，MCP 自身已是多路可用。
- **权衡**：Host 组合失去“仅 Cloudflare 会话可见”的强隔离，但这正是用户要的“全局”。若日后需要再叠加隔离，可在 bundle 的 patch 里用 `tools/pre-execute` 加一道可选的 allowlist gate（不内置策略，见 `plugin-forms.md` 钩子插件一节）。

### 2.3 对齐 dsh-plugin-dev 硬规则
- **接口以生成参考为准**：`@deepseek-ai/dsh-mcp-client` 的 `serverName / transport / url / headers / toolCallTimeoutMs / failOnStartupError / reconnect` 均以 DSH 生成的 Tool/MCP 文档为准；不猜 API。
- **所有贡献是副作用**：MCP 工具注册与 Skill 贡献随 bundle 行卸载自动撤销；不在模块作用域创建进程级副作用。
- **失败要响亮**：`cordis.patch.yml` 缺失或 `package.json#dsh.bundle.patch` 指向错误，DSH 启动时明确报错；`scripts/validate-bundle.js` 在本地先响。
- **配置一律 Schemastery**：本次无自定义 Config（MCP 行直接用官方客户端的 schema），若后续要加可调参数（timeout、reconnect、header 覆写），再按 `references/config.md` 补 `interface Config + Schema`。
- **工具返回规范 JSON**：沿用官方 MCP 的工具定义，不自定义 `defineTool`，因此天然满足 `execute 返回 JSON，render 负责人类可读`。
- **模型可见即已记录**：MCP 工具调用走 `tool/call → tool/result` 持久事件，无需额外 `agent.inject()`。

---

## 3. 目标形态总览

```text
cfbridge v0.3.0 — DSH Bundle（全局）
├─ package.json  —— 声明 dsh.bundle.patch = "./cordis.patch.yml"，name = "@wenaixi/cfbridge"
├─ cordis.patch.yml —— 单层 insert：mcp-cloudflare（+ 可选的 skill 贡献行，若需显式注册）
├─ skills/cfbridge/SKILL.md —— 随 bundle 发布，安装后位于 profiles/web/node_modules/@wenaixi/cfbridge/skills/
├─ scripts/
│   ├─ install-bundle.js   ← 封装 dsh plugin --profile web add .
│   ├─ uninstall-bundle.js ← 封装 dsh plugin --profile web remove @wenaixi/cfbridge
│   ├─ validate-bundle.js  ← 校验 dsh.bundle 声明、patch 行、token 引用、skill 存在
│   ├─ migrate-from-preset.js ← 检测并清理旧 ~/.dsh/.agent-presets/cfbridge
│   └─ check.js            ← 更新断言：bundle 层的存在性、web patch 的非污染/污染反转、token 扫描
├─ preset.yml / agent.cordis.yml —— 保留但标记 deprecated（或移入 deprecated/），不再作为主入口
└─ Wrangler 透传不变（scripts/wrangler.js + wrangler@4.x）
```

**层序（见 packaging.md）**：

1. `dsh.profile.bundles` 按序叠加的各 bundle patch（`@deepseek-ai/dsh-base → @deepseek-ai/dsh-web-app → ... → @wenaixi/cfbridge`）
2. `profiles/web/cordis.patch.yml`（用户手写层，最后胜出）
3. `$DSH_HOME/cordis.patch.yml`（机器级）
4. `--patch <overlay>`（临时）

**推论**：用户若想停用 cfbridge，最小侵入是在自己的 `profiles/web/cordis.patch.yml` 加一行同 id 的 `disabled: true` 覆写（整行替换语义，需重述所需键），或直接 `dsh plugin remove`。Bundle 作者应给出“用户大概率保留的默认值”，不要让用户必须覆写。

---

## 4. 详细设计

### 4.1 包结构与 Manifest

**package.json 关键增量**：

```json
{
  "name": "@wenaixi/cfbridge",
  "version": "0.3.0",
  "type": "commonjs",
  "main": "cordis.patch.yml",
  "files": ["cordis.patch.yml", "skills/", "scripts/", "README.md", "LICENSE"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "peerDependencies": {
    "@deepseek-ai/dsh-mcp-client": "*",
    "@deepseek-ai/dsh-skill-filesystem": "*",
    "@deepseek-ai/dsh-tool-skill": "*"
  }
}
```

- `files` 必须包含 `cordis.patch.yml` 与 `skills/`，否则发布后 bundle 层为空。
- 保持 `private: false`（或至少可发布），与 v0.2.0 的 `private: true` 区分，这是要上 npm/market 的前提。若暂时仅本地分发，保留 `private: true` 但需在文档写明 `dsh plugin add ./cfbridge` 的本地路径用法。
- 参考 `dshmarket / dsh-better-sidebar / @anionex/dsh-vision-toolkit` 的 `dsh.bundle.patch` 声明方式。

**cordis.patch.yml（新主入口，Host 组合）**：

```yaml
# @wenaixi/cfbridge — DSH bundle patch (host composition)
# 安装后作为 profile bundle 层全局生效，所有会话可见。
- insert:
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

- **不含** `persona / agent-instructions / tool-bash / tool-fs / tool-jobs / planning / compaction` 等 agent 栈行。那些行在 Host 组合中由 `dsh-base / dsh-web-app` 已提供，重复声明会造成层冲突或不必要的 isolate。
- **不含** `isolate` — Host 工具不需要 realm。
- 若验证发现 Skill 需要显式贡献行，再补一行 `skill-filesystem` 或 `skill-badge` 的配置（见 4.3）。

**旧文件的处理**：
- `preset.yml` 与 `agent.cordis.yml` 移入 `deprecated/preset/` 或在文件头加 `# DEPRECATED — v0.3.0 起由 cordis.patch.yml (dsh.bundle) 取代`，保留 1 个大版本以便回滚。
- `scripts/install-preset.js / uninstall-preset.js / validate-preset.js` 保留为 deprecated shim：执行时打印 `[WARN] preset 形态已废弃，请改用 npm run install:bundle` 并内部转发或退出非零。

### 4.2 MCP 行细节（与 v0.2.0 保持一致，仅换层）
- 复用已验证的 `Authorization: !!js` 模板，token 仍仅从 `%USERPROFILE%\.dsh\.env` 的 `CLOUDFLARE_API_TOKEN` 读取。
- 超时与重连参数与现 `agent.cordis.yml` 一致，已在线上验证稳定。
- **失败语义**：`failOnStartupError: false` 保持，避免无 token 时整个 DSH 启动失败；工具调用时再报错，引导用户配置 token。
- **命名**：`id: mcp-cloudflare` 全局唯一已验证（现 web profile 中无冲突；`grep -r cloudflare ~/.dsh/profiles/web` 为空）。

### 4.3 Skill 分发（关键验证点）
- **现状**：Preset 形态下 skill 位于 `agent-preset 的 skills/cfbridge/SKILL.md`，由该 preset 层的 `skill-filesystem` 发现。
- **Bundle 形态候选方案**：
  - **方案 A（首选，零额外行）**：Bundle 包内保留 `skills/cfbridge/SKILL.md`，依赖 Host 已有的 `skill-filesystem` 分层发现机制自动收录 `profiles/web/node_modules/@wenaixi/cfbridge/skills/`。多数官方 bundle 未带 skill，但 `skill-filesystem` 的发现是分层的，见 standard preset 注释“merged catalog also carries whatever the deployment registered globally”。
  - **方案 B（显式贡献）**：若 A 验证失败，bundle 的 `cordis.patch.yml` 增加一行显式注册：
    ```yaml
    - id: cfbridge-skill-source
      name: '@deepseek-ai/dsh-skill-filesystem'
      config:
        extraRoots: !!js "[require('path').join(__dirname, 'skills')]"
    ```
    需以生成参考的真实配置键为准。
  - **验证动作（实施前必做）**：阅读 `@deepseek-ai/dsh-skill-filesystem` 与 `@deepseek-ai/dsh-skill` 的生成参考页，确认 `extraRoots / skillDirs / roots` 等真实配置键；优先选 A，A 不通再用 B。
- **Skill 内容**：沿用现 `skills/cfbridge/SKILL.md` 全文，仅把头部“触发：选择 Cloudflare 模式后可见”改为“触发：安装 cfbridge bundle 后全局可见”。保留“先 search 后 execute、写操作需二次确认”的核心规范。

### 4.4 Token 与安全（与 v0.2.0 完全一致）
- `cordis.patch.yml` 必须用 `!!js` 动态引用，**不得**写入明文。
- `.env.example` 保持仅占位符；`.gitignore` 保持忽略 `.env / *.pem / .wrangler / .dsh / node_modules`。
- `scripts/check.js` 的 token 泄漏扫描正则保持：`cfat_ / cfut_ / cfoat_ / sk- / Bearer\\s+[A-Za-z0-9_-]{40,} / gh[pousr]_ / AKIA / PRIVATE KEY / AIza`。

### 4.5 启用 / 停用 交互设计

**用户故事**：
- “我今天要管 Cloudflare” → 插件启用，工具与 Skill 出现。
- “我今天不想让模型碰 Cloudflare” → 插件停用，工具与 Skill 消失，模型不会误调。

**机制 A — 官方 CLI（首选）**：
- 启用：`dsh plugin --profile web add @wenaixi/cfbridge`（本地开发：`dsh plugin --profile web add ./cfbridge` 或 `dsh plugin --profile web add ./cfbridge-0.3.0.tgz`）。
- 停用：`dsh plugin --profile web remove @wenaixi/cfbridge`。
- 列出：`dsh plugin --profile web list`（验证 bundle 是否在 `dsh.profile.bundles`）。
- 验证层：`dsh --profile web --dump-config | grep cfbridge`。
- **优点**：官方、可审计、与 `dsh-market` 等一致。
- **缺点**：停用是卸载，下次启用需重新 add（但本地包路径不变，成本低）。

**机制 B — disabled 覆写（热切换，不卸载）**：
- 用户在 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml` 追加：
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
  ```
- **层序语义**：后应用层按行胜出，整行替换；因此 disabled 覆写必须重述整行 config。
- **优点**：不卸载，切换快。
- **缺点**：需用户手写 YAML，易错；需在 README 给出可复制模板。

**本计划推荐**：**A 为主，B 为辅**。
- 主流程文档写 A。
- 在 README 的“停用”小节同时给出 B 的模板，并提供脚本 `scripts/disable-bundle.js / enable-bundle.js`（本质是改写用户 patch 的辅助脚本，需用户确认）。
- 若 DSH 后续提供 `dsh plugin --profile web disable <bundle>` 原生命令，再迁移到该命令（届时仅改文档与脚本一行）。

### 4.6 Wrangler CLI（不变）
- 保持 `package.json: wrangler@^4.123.0`、`scripts/wrangler.js` 的 token 加载逻辑（优先 `process.env.CLOUDFLARE_API_TOKEN`，否则 `process.loadEnvFile(%USERPROFILE%\.dsh\.env)`）。
- 保持 `npm run wrangler / wrangler:version / wrangler:whoami / wrangler:d1:list / wrangler:pages:list`。
- Wrangler 与 MCP 互为补充的定位在 README 保留。

### 4.7 脚本与命令（package.json）

```json
{
  "scripts": {
    "check": "node scripts/check.js",
    "validate:bundle": "node scripts/validate-bundle.js",
    "install:bundle": "node scripts/install-bundle.js",
    "uninstall:bundle": "node scripts/uninstall-bundle.js",
    "migrate:from-preset": "node scripts/migrate-from-preset.js",
    "dump:config": "dsh --profile web --dump-config",
    "test": "node scripts/test.js",
    "test:wrangler": "node scripts/test-wrangler.js",
    "wrangler": "node scripts/wrangler.js"
  }
}
```

- 旧 `install:preset / uninstall:preset / validate:preset` 保留为 shim，打印 deprecation 警告后退出非零或转发到新命令（避免 CI 静默通过）。
- `check.js` 拆分为两类断言：**仓库静态断言**（token、manifest、gitignore）与**本机环境断言**（`--dump-config` 含 cfbridge 层）；后者在无 DSH 环境下可跳过。

---

## 5. 迁移与兼容

### 5.1 迁移路径（用户视角）
1. 用户已安装 v0.2.0 preset（`~/.dsh/.agent-presets/cfbridge/` 存在）。
2. 拉取 v0.3.0 后执行：
   ```powershell
   npm install
   npm run migrate:from-preset   # 检测旧 preset，提示是否删除，默认需 --yes 才删
   npm run install:bundle        # dsh plugin --profile web add .
   dsh --profile web --dump-config  # 验证层出现
   npm run check
   ```
3. 重启 DSH，所有会话即得 Cloudflare 工具与 Skill。
4. 若用户想回滚：`npm run uninstall:bundle && npm run install:preset`（preset 文件仍在 deprecated 目录）。

### 5.2 并存期策略
- v0.3.0 发布后的 1 个小版本内，**允许 preset 与 bundle 并存**（互不干扰：一个在 agent 层，一个在 host 层；工具会重复注册两次，但 `serverName: cloudflare` 相同可能导致工具名冲突）。
- 因此 **migrate 脚本应默认建议清理旧 preset**，避免工具重复。若用户坚持并存，需在文档写明“同一工具名被两个 MCP 客户端注册时的覆盖语义以先加载者为准，建议不要并存”。

### 5.3 数据与副作用
- 本次迁移 **零数据迁移**：无数据库、无 KV、无持久状态。
- 唯一副作用是 `profiles/web/package.json#dsh.profile.bundles` 与 `profiles/web/node_modules/@wenaixi/cfbridge/` 的增删，均可通过 `dsh plugin remove` 回滚。

---

## 6. 文件变更清单（实施时按此清单逐项）

### 6.1 新增
- `cordis.patch.yml` — Host 组合主入口（单 insert，mcp-cloudflare 行）。**P0**。
- `scripts/install-bundle.js` — 封装 `dsh plugin --profile <name> add <path>`，支持 `--profile web` 参数，打印 `--dump-config` 验证提示。**P0**。
- `scripts/uninstall-bundle.js` — 封装 `dsh plugin --profile <name> remove @wenaixi/cfbridge`。**P0**。
- `scripts/validate-bundle.js` — 校验：`package.json#dsh.bundle.patch` 存在且指向真实文件；`cordis.patch.yml` 含 `mcp-cloudflare` 且 `Authorization` 为 `!!js` 模板；`skills/cfbridge/SKILL.md` 存在且无 token；`files` 包含必要条目。**P0**。
- `scripts/migrate-from-preset.js` — 检测 `~/.dsh/.agent-presets/cfbridge`，提示并可选删除。**P1**。
- （可选）`scripts/disable-bundle.js / enable-bundle.js` — 改写用户 patch 的 disabled 覆写。**P2**。

### 6.2 修改
- `package.json` — bump `0.2.0 → 0.3.0`；增 `dsh.bundle`；改 `files`；增新 scripts；`peerDependencies` 保留；`private` 策略见 4.1。**P0**。
- `scripts/check.js` — 重构：
  - 新增：校验 `package.json#dsh.bundle.patch`、`cordis.patch.yml` 的 mcp 行、`files` 完整性。
  - 反转：原“web profile 必须无 cloudflare 残留”的断言改为“若已安装 bundle，则 dump-config 必须含 cfbridge 层；未安装时 web patch 无残留”。
  - 保留：token 扫描、gitignore、Wrangler 版本、系统预设污染检查。
  **P0**。
- `scripts/test.js` — 入口增 `validate:bundle` 步骤，保留 `check / wrangler`。**P0**。
- `README.md` — 重写“它是什么/安装/验证/停用”四节，移除“选 Cloudflare 模式”的描述，改为“装完全局可用”。给出 A/B 两种停用方式。**P0**。
- `CLAUDE.md` — 更新产品定位、关键配置、设计决策、隔离边界、验证记录、维护文件列表；版本改为 0.3.0；新增 bundle 层序与开关说明。**P0**。
- `skills/cfbridge/SKILL.md` — 仅改头部触发描述，不改正文规范。**P1**。
- `.gitignore` — 保持不变（已足够）。

### 6.3 废弃/移动
- `preset.yml` → `deprecated/preset/preset.yml`（或保留原位但头部加 DEPRECATED 注释，package.json#files 不再包含）。**P1**。
- `agent.cordis.yml` → `deprecated/preset/agent.cordis.yml`（同上）。**P1**。
- `scripts/install-preset.js / uninstall-preset.js / validate-preset.js` → 保留为 deprecated shim，打印警告。**P1**。

### 6.4 删除（不做）
- 不删除旧脚本的历史提交记录；不删除 `LICENSE / .env.example / .gitattributes`。

---

## 7. 配置与安全加固

- **Token**：唯一来源 `CLOUDFLARE_API_TOKEN`，仅在 `%USERPROFILE%\.dsh\.env`；`cordis.patch.yml` 用 `!!js` 动态引用；`scripts/wrangler.js` 同源加载。
- **扫描**：`check.js + validate-bundle.js` 共享同一组 `hasTokenLeak()` 正则，覆盖 `cfat_ / cfut_ / cfoat_ / sk- / Bearer / gh*_ / AKIA / PRIVATE KEY / AIza`。
- **层覆盖的完整性**：文档强调“后层整行替换”——用户若用 disabled 覆写，必须重述整行 config，脚本给出的模板必须完整。
- **最小权限**：README 重申 account token 仅 `Account Resources: Read` 起步，DNS 需额外 Zone token。
- **Hygiene**：本次不引入新的运行时副作用，bundle 行卸载即清理；无需额外的 `ctx.effect` 清理。

---

## 8. 测试与验证矩阵

| 验证项 | 命令 | 期望 | 阻塞级别 |
|---|---|---|---|
| 仓库静态 | `npm run check` | 全部 PASS（含新 bundle 断言） | P0 |
| Bundle 结构 | `npm run validate:bundle` | 校验 manifest、patch、skill、token 引用 | P0 |
| 安装 | `npm run install:bundle -- --profile web` | `dsh --dump-config` 含 cfbridge 层 | P0 |
| 工具可见 | DSH 新会话 | 工具列表含 mcp__cloudflare__* | P0 |
| Skill 可见 | DSH 新会话 | skill 列表含 cfbridge | P0 |
| 只读调用 | MCP `search → execute` 或 Wrangler `whoami / d1 list` | 成功只读 | P1 |
| 停用 | `npm run uninstall:bundle` 或 disabled 覆写后重启 | 工具与 Skill 消失 | P0 |
| 重启恢复 | 重新 add 后重启 | 恢复可见 | P0 |
| 迁移 | 有旧 preset 时 `migrate:from-preset` | 提示清理且可 --yes 自动清理 | P1 |
| 综合 | `npm run test` | 三步骤全 PASS | P0 |

**CI 建议**：`check + validate:bundle` 在无 DSH 环境也可跑；`install:bundle / dump:config` 仅在有 DSH 的本机跑，CI 中标记为 optional。

---

## 9. 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| Skill 在 bundle 形态下未被发现（方案 A 失效） | Skill 不可见，模型无规范 | 实施前必读 `dsh-skill-filesystem` 生成参考；准备方案 B 的显式行；验证时以 DSH 实际 skill 列表为准 |
| 工具名冲突（preset 与 bundle 并存时） | 同名 MCP 工具被注册两次，行为未定义 | migrate 脚本默认清理 preset；文档明确“不要并存” |
| 用户已有手写 `mcp-cloudflare` 行 | 重复 id 冲突 | 安装前 `check.js` 扫描用户 patch，若已存在同 id 则提示用户先移除手写行 |
| `private: true` 导致无法 `dsh plugin add @wenaixi/cfbridge` | 仅能本地路径安装 | 若要上市场，发布前改为 `private: false` 并 `npm publish`；本地路径安装不受影响 |
| 禁用后用户忘记如何启用 | 工具消失被误判为 bug | README 与 `uninstall-bundle.js` 提示恢复命令；`check.js` 在本机检测到 bundle 缺失时给出提示 |
| Token 缺失时启动失败 | 误用 `failOnStartupError: true` 会阻断 DSH | 保持 `false`，并在 `check.js` 给出友好提示 |

**回滚**：任一阶段可执行 `dsh plugin --profile web remove @wenaixi/cfbridge` 立即回滚；若需恢复 Preset 形态，从 `deprecated/preset/` 恢复并 `npm run install:preset`。

---

## 10. 实施步骤（分阶段，每阶段有验证）

### 阶段 0 — 预研与探针（不改业务代码）
1. 阅读 `@deepseek-ai/dsh-skill-filesystem` 与 `@deepseek-ai/dsh-skill` 的生成参考，确认 bundle 内 `skills/` 的发现路径与是否需要额外配置。
2. 在本机执行 `dsh --profile web --dump-config > /tmp/before.yml` 留存基线。
3. 手写最小 `cordis.patch.yml` 用 `--patch ./cordis.patch.yml dsh --dump-config` 验证 mcp 行可被独立加载。
*验证：探针通过后再进入重构。*

### 阶段 1 — 包形态切换（P0）
1. 新增 `cordis.patch.yml`（host 组合单 insert）。
2. 修改 `package.json`（0.3.0、dsh.bundle、files、scripts）。
3. 新增 `scripts/install-bundle.js / uninstall-bundle.js / validate-bundle.js`。
4. 修改 `scripts/check.js / scripts/test.js`。
5. 本地 `npm run validate:bundle && npm run check`。
6. `dsh plugin --profile web add ./cfbridge && dsh --profile web --dump-config | grep -A5 cfbridge`。
*验证：S1+S5。*

### 阶段 2 — Skill 与文档（P0/P1）
1. 确认 Skill 发现（方案 A/B 二选一）。
2. 更新 `skills/cfbridge/SKILL.md` 头部。
3. 重写 `README.md`（安装/验证/停用）。
4. 更新 `CLAUDE.md` 全文。
5. 新开 DSH 会话验证工具与 Skill 可见性及只读调用。
*验证：S2+S3。*

### 阶段 3 — 迁移与废弃（P1）
1. 新增 `scripts/migrate-from-preset.js`。
2. 将 `preset.yml / agent.cordis.yml` 标记 deprecated 并移动。
3. 将旧三脚本改为 shim（打印警告）。
4. 在有旧 preset 的机器上跑通迁移流程。
*验证：S6。*

### 阶段 4 — 停用路径与收尾（P0/P1）
1. 验证 `remove` 与 `disabled 覆写` 两条停用路径。
2. （可选）提供 `disable/enable-bundle.js` 辅助脚本。
3. 全量 `npm run test` 与手写 `--dump-config` 对比。
4. 清理临时探针文件，提交。
*验证：S4+S7。*

**提交策略**：每阶段结束即 commit（commit 是本能），每个 commit 仅含该阶段文件；不自动 push。

---

## 11. 假设与待澄清

- **假设 1**：Host 组合的 skill 发现无需额外行（方案 A 成立）。若失败，回退到方案 B 的显式行，不影响其他设计。
- **假设 2**：DSH 当前无 `dsh plugin disable` 原生命令，停用以 `remove` 为主、`disabled 覆写` 为辅。若后续 DSH 新增 disable 命令，仅需更新脚本与文档一行。
- **假设 3**：目标 profile 为 `web`（用户现主力 profile）。脚本支持 `--profile <name>` 参数以兼容其他 profile。
- **假设 4**：`CLOUDFLARE_API_TOKEN` 环境变量名与获取方式不变。
- **待澄清 0 项**：用户已明确“装了就全局、需要时启用不需要时停用”，本计划据此不再追问；若用户希望默认安装后即为启用，本计划即按此实现。

---

## 12. 完成检查清单（对齐 dsh-plugin-dev）

- [ ] 接口查过生成参考（`dsh-mcp-client / skill-filesystem / skill` 的真实配置键以生成为准，未凭名字猜 API）。
- [ ] 所有注册走 cordis 行（副作用），卸载可清理；无模块作用域进程级副作用。
- [ ] 必需依赖无需 inject（MCP 客户端为独立插件行）；无可选依赖的未判空访问。
- [ ] 有配置的插件：本次无自定义 Config，若后续加则用 Schemastery。
- [ ] 有工具：沿用官方 MCP 工具，满足 execute 规范（不自定义）。
- [ ] 无 waterfall 监听，无需 next()。
- [ ] 组合行与层序正确；新增行在 `--dump-config` 中可见；HMR/重启后无残留。
- [ ] 若模型可见内容变化：已落在持久工具调用事件中。
- [ ] `constraints / typecheck / lint / build / hygiene`（本仓库为 `check / validate:bundle / test`）全绿。
- [ ] `CLAUDE.md` 已更新并与实现一致。

---

## 附录：与 dsh-plugin-dev 规范的映射

- 新建插件：场景 A（确定贡献→创建 src→patch overlay 回路→验证加载/卸载）
- 给模型加工具：场景 B（但本次不新增 defineTool，沿用 MCP 客户端的工具注册）
- 打包与安装：场景 E（建组合包→dsh.bundle→dsh plugin add→dump-config 验证→层序）
- 关闭前检查清单：见第 12 节。
- 参考文件：`references/packaging.md`（层序与整行替换）、`references/plugin-anatomy.md`（Fiber 清理）、`references/seams.md`（服务归属）、`references/plugin-forms.md`（钩子 vs 工具 vs UI）。
