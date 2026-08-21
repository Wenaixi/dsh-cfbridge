# cfbridge 项目记忆库

- 当前版本：**v0.3.0**
- 作者：**Wenaixi**（wenxiloveyou@gmail.com）
- 许可证：MIT
- 项目目录：`D:\newC\stick2\cfbridge`

## 产品定位

cfbridge 是 DeepSeek Harness（DSH）的 **Cloudflare 全局 Bundle**。
v0.3.0 重构后，它通过 DSH 原生的 Bundle 路径分发，按 `dsh plugin add` 装到任意
profile（如 `web`）后，**所有会话全局可见**：

- `mcp__cloudflare__docs / search / execute`：Cloudflare 官方 Code Mode MCP 三工具；
- `cfbridge` Skill：MCP 最佳实践、写操作审批规范；
- `npm run wrangler ...`：项目本地 Wrangler CLI 透传。

**对比 v0.2.0**：v0.2.0 是 Agent Preset，仅当用户选择「Cloudflare 模式」preset 时挂载。
v0.3.0 改为 Bundle，**装完即得**，所有会话全局可用，按 DSH 原生命令 `add/remove` 或
`disabled` 覆写一键开关。

## 关键配置与安全规则

- 包名：`@wenaixi/cfbridge`，版本 `0.3.0`，路径 `D:\newC\stick2\cfbridge`。
- 包形态：`dsh.bundle`（`package.json#dsh.bundle.patch = "./cordis.patch.yml"`）。
- 安装入口：`npm run install:bundle`（封装 `dsh plugin --profile <name> add .`）。
- `cordis.patch.yml` 必须使用 `!!js '`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`'`；
  **不得写入 token 明文**。
- token 仅存于被忽略的 `$DSH_HOME/.env`（默认 `%USERPROFILE%\.dsh\.env`），
  变量名 `CLOUDFLARE_API_TOKEN`。
- 提交前通过 `npm run check` 自动扫描 `cfat_`、`cfut_`、`cfoat_`、`sk-`、`Bearer ...`、
  `ghp_/gho_/ghu_/ghs_/ghr_`、`AKIA`、`PRIVATE KEY`、`AIza` 等密钥前缀。
- **不修改用户的 `cordis.patch.yml`** —— 用户只需在不想用时加一段 disabled 覆写（见
  README §启停控制 §B），不需要改 bundle 自身。
- 部署路径无远程仓库，不自动 push；本地 commit 是常规检查点。

## 已验证结论

- DSH Bundle 规范：`package.json#dsh.bundle.patch` 指向一个 `cordis.patch.yml`；
  DSH 0.1.1-rc.2+ 的 `dsh plugin --profile <name> add <spec>` 自动 reconcile
  `dsh.profile.bundles`。
- `dsh-skill-filesystem` 默认扫三类根：
  - `cwd` 向上找到的 `project-dsh` 项目目录（`./.dsh/skills/`）
  - `cwd` 向上找到的 `project-agents` 项目目录（`./.agents/skills/`）
  - `$DSH_HOME/skills`（`user-dsh`）
  - `$DSH_AGENTS_HOME/skills`（`user-agents`）
  - 可选 `DSH_BUNDLED_SKILL_DIR`（`bundled`）
- `dsh-skill-filesystem` **不会**自动扫 `profiles/web/node_modules/.../skills/`；
  这是 plan-v0.3.0 §4.3 方案 A 假设被源码证伪后的最优解：bundle 的
  `install-bundle.js` 把 `skills/cfbridge/` 软链到 `$DSH_HOME/skills/cfbridge/`，
  卸载时同步清理。
- Cloudflare MCP 端点：`https://mcp.cloudflare.com/mcp`。
- `mcp__cloudflare__execute` 的 `accountId` 由官方服务按 token 上下文预置。
- account token（`cfat_`）可调用 `/accounts`，对 `/user/tokens/verify` 返回 401 是预期行为。
- 当前账户实测：账号、Zone、Workers、KV、D1、Pages、GraphQL analytics、MCP docs/search/execute。
- DNS 写操作需 Zone 范围的用户 token；R2 未开通时返回 10042。

## 设计决策

1. **采用 Bundle 而不是继续用 Preset**：
   - v0.2.0 的 preset 路径需用户在每个会话里选模式；用户反馈"装完即用"心智更低。
   - Bundle 走 DSH 官方分发路径（`dsh.bundle.patch`），可与 `dshmarket / better-sidebar` 等共存。
   - 旧 preset 文件归档到 `deprecated/preset/`，scripts 改 shim 并退出非零以引导新流程。
2. **host 组合而非 agent 组合**：
   - `mcp-cloudflare` 行注册到 host 的 tools registry，无需 isolate realm。
   - 不在 patch 里再声明 persona / agent-instructions / tool-fs / skill-filesystem 等 agent 栈行；
     它们由 dsh-base / dsh-web-app 在 host 层提供，重复声明会触发层冲突或不必要的 isolate。
3. **Skill 发现走软链而非显式 patch 行**：
   - 计划中的方案 A（依赖 host 分层自动发现 `node_modules` 内的 skills）被
     `dsh-skill-filesystem` 源码证伪：它只扫 cwd 内 `.dsh/.agents` 与 `$DSH_HOME` / `$DSH_AGENTS_HOME`。
   - 因此在 `install-bundle.js` 显式软链 `skills/cfbridge/` 到 `$DSH_HOME/skills/cfbridge/`，
     利用 host `dsh-skill-filesystem` 默认根（`user-dsh`）。卸载时同步清理软链。
4. **保留 Wrangler CLI 透传**：MCP 覆盖 ~2500 端点，但 `wrangler dev`、`wrangler deploy` 等
   本地/CI 工作流仍由 npm 脚本透传。
5. **不复制 API 端点**：Code Mode MCP 保持官方最新；本地副本会过时。
6. **不自动推送**：本地 commit 是检查点；只有用户明确授权才 push。

## 目标形态（v0.3.0）

```text
cfbridge v0.3.0 — DSH Bundle（全局）
├─ package.json              # 声明 dsh.bundle.patch = "./cordis.patch.yml"
├─ cordis.patch.yml          # 单 insert：mcp-cloudflare（host 组合）
├─ skills/cfbridge/SKILL.md  # 随 bundle 发布
├─ scripts/
│   ├─ install-bundle.js      # 封装 dsh plugin --profile <name> add .
│   ├─ uninstall-bundle.js    # 封装 dsh plugin --profile <name> remove
│   ├─ validate-bundle.js     # 校验 dsh.bundle 声明、patch 行、token 引用、skill 存在
│   ├─ migrate-from-preset.js # 检测并清理旧 ~/.dsh/.agent-presets/cfbridge
│   ├─ dump-config.js         # 封装 dsh --profile <name> --dump-config
│   ├─ check.js               # 仓库静态 + 本机环境断言
│   ├─ test.js                # 综合入口（check + bundle + wrangler）
│   ├─ test-wrangler.js       # Wrangler 只读冒烟
│   ├─ wrangler.js            # Wrangler 安全启动器
│   └─ install-preset.js / uninstall-preset.js / validate-preset.js  # DEPRECATED shim
├─ deprecated/preset/        # v0.2.x 旧 preset 文件归档
└─ Wrangler 透传不变（scripts/wrangler.js + wrangler@4.x）
```

### DSH 层序（v0.3.0 行为）

DSH 加载 profile 时按以下顺序应用 patch（后层按行胜出）：

1. `dsh.profile.bundles` 中的各 bundle patch（含 `@wenaixi/cfbridge`）
2. profile 自己的 `cordis.patch.yml`（`%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`）
3. home 级 `$DSH_HOME/cordis.patch.yml`（机器共享）
4. `--patch <overlay>` 临时覆盖

`mcp-cloudflare` 行的所有权：默认由 cfbridge bundle 在第 1 层注入；用户可用第 2 层
patch 的 `disabled: true` 整行重写临时禁用（README §启停控制 §B）。

## 当前维护文件

- `cordis.patch.yml`：DSH Bundle 的 Host 组合主入口（单 insert）。
- `package.json` + `package-lock.json`：版本 0.3.0，dsh.bundle.patch 声明，install/test 脚本。
- `skills/cfbridge/SKILL.md`：由 install-bundle.js 软链到 `$DSH_HOME/skills/cfbridge/`。
- `scripts/install-bundle.js`：封装 `dsh plugin --profile <name> add <绝对路径>`。
- `scripts/uninstall-bundle.js`：封装 `dsh plugin --profile <name> remove @wenaixi/cfbridge`。
- `scripts/validate-bundle.js`：静态校验 dsh.bundle 声明与 patch 行。
- `scripts/migrate-from-preset.js`：检测并清理旧 v0.2.0 preset 残留。
- `scripts/dump-config.js`：封装 `dsh --profile <name> --dump-config`，默认过滤 cfbridge 层。
- `scripts/check.js`：仓库静态 + 本机环境断言（v0.3.0 重构）。
- `scripts/test.js`：综合入口（check + bundle + wrangler）。
- `scripts/wrangler.js`：Wrangler 透传（仅在缺 token 时从 `$DSH_HOME/.env` 加载）。
- `scripts/test-wrangler.js`：Wrangler 只读冒烟。
- `scripts/install-preset.js / uninstall-preset.js / validate-preset.js`：deprecated shim。
- `deprecated/preset/`：v0.2.x 历史快照（preset.yml / agent.cordis.yml / README.md）。
- `.env.example`、`LICENSE`、`.gitignore`、`.gitattributes`、`README.md`。
- `docs/plan-v0.3.0-global-bundle.md`：v0.3.0 重构计划与权衡。
- `CLAUDE.md`：本文件。

## 隔离边界（v0.3.0）

v0.3.0 设计原则是 **全局常驻、按需开关**，不再像 v0.2.0 那样"完全按需加载"。

| 检查项 | 状态 |
| --- | --- |
| `cordis.patch.yml` 含 `mcp-cloudflare`（应在的位置） | ✅ |
| `package.json#dsh.bundle.patch` 指向真实 patch 文件 | ✅ |
| `dsh.bundle.patch` 指向的 cordis.patch.yml 含 `mcp-cloudflare` 行 | ✅ |
| `Authorization` 用 `!!js` 动态引用 `CLOUDFLARE_API_TOKEN` | ✅ |
| `cordis.patch.yml` 不重复注入 agent 栈行（persona / tool-fs / skill-filesystem 等） | ✅ |
| web profile 的 `cordis.patch.yml` 未污染 cloudflare 残留（旧 v0.2.x 时代的） | ✅ |
| 用户 web patch 与 bundle 不冲突（若都含 mcp-cloudflare 行则提示冲突） | ✅ |
| bundle 未启用时 web patch 无 mcp-cloudflare 重复 | ✅ |
| `deprecated/preset/` 三件套归档完整 | ✅ |
| 旧 install:preset / uninstall:preset / validate:preset 标记 DEPRECATED | ✅ |
| `process.env` 未引入 `CFBRIDGE_*` 命名空间 | ✅ |
| 仅引用官方 `CLOUDFLARE_API_TOKEN` | ✅ |
| 当前 PowerShell 进程无 cfbridge 相关 env | ✅ |
| `npm run check` 全部通过（含 bundle 入口断言、反转 web patch 校验） | ✅ |
| `npm run validate:bundle` 通过（manifest / patch / skill / token） | ✅ |
| `npm run test` 三步骤全 PASS | ✅ |
| `dsh --profile web --dump-config` 含 `# == @wenaixi/cfbridge` 层 | ✅ |

bundle 不会触碰 web profile 的其它 MCP（context7、exa），也不会改动系统的
四个内置 preset（standard/code/cordis/minimal）。重启 DSH 后，所有会话自动获得
Cloudflare 工具与 Skill；卸载或 disabled 覆写后即时消失。

## 最新验证记录（v0.3.0）

- `npm run check` 全部通过（v0.3.0 bundle 入口断言 + 反转 web patch 校验）。
- `npm run validate:bundle` 通过（manifest / patch / skill / token）。
- `npm run test` 三步骤全 PASS。
- `dsh plugin --profile web add .` 成功；`dsh --profile web --dump-config` 含 `# == @wenaixi/cfbridge` 层。
- `$DSH_HOME/skills/cfbridge` 软链创建成功；host `dsh-skill-filesystem` 默认根
  自动收录（见 host 启动日志中 `user-dsh: <DSH_HOME>/skills`）。
- v0.2.0 旧 preset 文件归档到 `deprecated/preset/`，shim 脚本打印 deprecation 警告。
- **未执行任何写操作**（deploy / secret put / DNS / KV / D1 execute），亦未做任何推送。

## 本地 Git 状态

- 默认分支 `main`。
- v0.1.0 基线提交：`4184753`（`chore: initialize cfbridge v0.1.0`）。
- v0.1.1 CLI 提交：`3c3180c`（`feat: add secure local Wrangler CLI`）。
- v0.2.0 Preset 提交：`81ad382`（`feat: ship v0.2.0 as DSH Agent Preset with bundled Skill and install tooling`）。
- v0.2.1 隔离清理提交：`22849ee`（`feat: extend check.js to assert no global pollution; also remove cloudflare residue from web profile`）。
- v0.2.2 gitignore 加固提交：`f0c5b45`（`feat: expand gitignore coverage and broaden token leak detector (Cloudflare/AWS/GitHub/private key/Google)`）。
- v0.2.3 preset 结构对齐提交：`7ef6283`（`feat: rewrite agent.cordis.yml to align with standard preset structure (add persona, tool-fs, planning, agent-instructions rows)`）。
- 尚未配置远程仓库，不会在未授权时 push。
