# cfbridge 项目记忆库

- 当前版本：**v0.2.0**
- 作者：**Wenaixi**（wenxiloveyou@gmail.com）
- 许可证：MIT
- 项目目录：`D:\newC\stick2\cfbridge`

## 产品定位

cfbridge 是 DeepSeek Harness（DSH）的 **Cloudflare Agent Preset**。
v0.2.0 重构后，它通过 DSH 原生的 Agent Preset 路径分发，
**按需挂载**到选择「Cloudflare 模式」的会话：

- `mcp__cloudflare__docs`：Cloudflare 文档语义搜索；
- `mcp__cloudflare__search`：OpenAPI spec 检索；
- `mcp__cloudflare__execute`：官方隔离 sandbox，约 2,500 个 API；
- `cfbridge` Skill：最佳实践与写操作审批规范；
- `npm run wrangler ...`：项目本地 Wrangler CLI 透传。

## 关键配置与安全规则

- 安装位置：`%USERPROFILE%\.dsh\.agent-presets\cfbridge\`，通过 `npm run install:preset` 部署。
- `agent.cordis.yml` 必须使用 `!!js '`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`'`；**不得写入 token 明文**。
- token 仅存于被忽略的 `%USERPROFILE%\.dsh\.env`，变量名 `CLOUDFLARE_API_TOKEN`。
- 提交前通过 `npm run check` 自动扫描 `cfat_`、`cfut_`、`cfoat_`、`sk-`、`Bearer ...` 等密钥前缀。
- **不修改用户的 `cordis.patch.yml`** —— 这是按需加载的基础，其它会话不受影响。
- 部署路径无远程仓库，不自动 push；本地 commit 是常规检查点。

## 已验证结论

- DSH Agent Preset 规范：`apps/cli/config/agent-presets/<id>/{preset.yml,agent.cordis.yml,skills/}`。
- 本地 preset 路径：`${DSH_HOME}/.agent-presets/<id>/`，由 DSH `agentPresets.list()` 自动发现。
- `cfbridge` Skill 路径：`skills/cfbridge/SKILL.md`，跟随 preset 一起复制。
- Cloudflare MCP 端点：`https://mcp.cloudflare.com/mcp`。
- `mcp__cloudflare__execute` 的 `accountId` 由官方服务按 token 上下文预置。
- account token（`cfat_`）可调用 `/accounts`，对 `/user/tokens/verify` 返回 401 是预期行为。
- 当前账户实测：账号、Zone、Workers、KV、D1、Pages、GraphQL analytics、MCP docs/search/execute。
- DNS 写操作需 Zone 范围的用户 token；R2 未开通时返回 10042。

## 设计决策

1. **采用 Agent Preset 而非动态 Cordis 插件**：
   - v0.1.0 的动态 define 路径会因对象参数 stringify 导致 `oneOf matched 0`；
   - Agent Preset 是 DSH 原生、可持久化、可挂载/卸载、可被列入 picker 的方案；
   - 用户选「Cloudflare 模式」才挂载，不污染 web profile 的所有会话。
2. **封装 Skill 而非裸配 MCP**：模型需要在触发时知道「search 先于 execute、写操作需确认」等实践。
3. **保留 Wrangler CLI**：MCP 覆盖 ~2500 端点，但 `wrangler dev`、`wrangler deploy` 等本地/CI 工作流仍由 npm 脚本透传。
4. **不复制 API 端点**：Code Mode MCP 保持官方最新；本地副本会过时。
5. **不自动推送**：本地 commit 是检查点；只有用户明确授权才 push。

## 当前维护文件

- `preset.yml`：DSH Preset 元数据（name / description / order）。
- `agent.cordis.yml`：Agent Preset 的 Cordis 组合（含 mcp-cloudflare、cf-persona、skill-filesystem、shell/pwsh）。
- `skills/cfbridge/SKILL.md`：触发模型行为的 Skill 内容。
- `package.json` + `package-lock.json`：本地 Wrangler 与维护脚本。
- `scripts/install-preset.js`：把 preset 复制到 `%USERPROFILE%\.dsh\.agent-presets\cfbridge\`。
- `scripts/uninstall-preset.js`：从用户 preset 目录删除。
- `scripts/validate-preset.js`：静态结构验证（YAML 行存在性、token 扫描）。
- `scripts/test.js`：综合测试入口。
- `scripts/test-wrangler.js`：Wrangler 只读冒烟。
- `scripts/check.js`：仓库配置 + 安全检查（30 项）。
- `scripts/wrangler.js`：项目本地 Wrangler 安全启动器。
- `.env.example`、`LICENSE`、`.gitignore`、`.gitattributes`、`README.md`。
- `CLAUDE.md`：本文件。

## 最新验证记录（2026-08-18）

- `npm run install:preset` 已成功把 preset 复制到 `%USERPROFILE%\.dsh\.agent-presets\cfbridge\`。
- `npm run check` 30/30 通过：package 元数据、agent.cordis.yml 结构、Wrangler 版本、gitignore、token 扫描、脚本存在性。
- `npm run validate:preset` 11/11 通过：preset.yml/agent.cordis.yml/SKILL.md 必备项。
- `npm run test:wrangler` 4/4 通过：版本、whoami、D1 列表、Pages 列表。
- `npm run test` 综合入口 3/3 通过。
- 验证 subagent 复审：preset 结构与 standard preset 规范一致，可在 DSH 中按需挂载。
- **未执行任何写操作**（deploy / secret put / DNS / KV / D1 execute），亦未做任何推送。

## 本地 Git 状态

- 默认分支 `main`。
- v0.1.0 基线提交：`4184753`（`chore: initialize cfbridge v0.1.0`）。
- v0.1.1 CLI 提交：`3c3180c`（`feat: add secure local Wrangler CLI`）。
- v0.2.0 待提交（重构为 Agent Preset + Skill + install 脚本）。
- 尚未配置远程仓库，不会在未授权时 push。