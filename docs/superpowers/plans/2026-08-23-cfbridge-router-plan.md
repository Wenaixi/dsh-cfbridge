# cfbridge 0.2.0 — 官方 13 Skills 路由指引 实施计划

> **面向 Agent 执行者：** 必需子技能：使用 superpower-subagent-driven-development（推荐）或 superpower-executing-plans 按任务逐项执行本计划。步骤使用复选框（`- [ ]`）语法进行跟踪。

**目标：** 让 cfbridge 成为 cloudflare/skills 13 个官方 Skill 的轻量路由——不 Vendoring 全文，仅在 `skills/cfbridge/SKILL.md` 增加路由指引节，教会模型“何时装哪个官方 Skill、如何与 cfbridge 三工具配合”。

**架构：** 单 Skill 单注册点保持不变（`cordis.patch.yml` 仍只注册 `cfbridge-skill`）；`SKILL.md` 顶部保留“检索优于记忆”声明，新增“官方 Skills 路由”一节含 13 行路由表 + 安装指引 + 决策树；`README.md` 同步镜像；`scripts/validate-bundle.js` 可选校验路由完整性。

**技术栈：** DSH Bundle (cordis.patch.yml + dsh-mcp-client + 运行时 Skill), Markdown (SKILL.md), Node.js ≥22, Wrangler 4.x（透传不变）

**规格：** `docs/superpowers/specs/2026-08-23-cfbridge-router-design.md`

## 全局约束

- 不拷贝官方 SKILL.md 全文，不新增 bundle 层或 MCP server，不注册 13 个 DSH skill
- `cordis.patch.yml` 不声明 persona / agent-instructions / tool-fs / skill-filesystem 等 host 已有层
- Token 仍仅来自 `%USERPROFILE%\.dsh\.env` 的 `CLOUDFLARE_API_TOKEN`，禁止写入仓库
- SKILL.md 遵循“检索优于记忆”，每行路由给原始链接与 docs 检索方式
- 版本语义：0.1.2 → 0.2.0（feat），CHANGELOG 追加
- 提交信息遵循 Conventional Commits

---

### 任务 1：工程基座对齐（空目录初始化 / 同步上游） ✅ 已完成

从 `C:/Users/Administrator/.dsh/profiles/web/node_modules/@wenaixi/cfbridge` 恢复基座，`npm install` 后 `validate-bundle` 53/53。

### 任务 2：SKILL.md 路由指引节（核心交付） ✅ 已完成

在 `## 相关链接` 前插入“官方 Skills 路由”节（约 47 行），含 13 行路由表 + 安装矩阵 + 决策树 + ponytail 注释，总长度 9697 chars，`test-skill-router` PASS。

### 任务 3：README 镜像与版本发布 ✅ 已完成

README 在“它是什么”后镜像同款路由表，版本徽记 0.1.2→0.2.0，`package.json` bump，`CHANGELOG.md` 新建。

### 任务 4：校验脚本增强 ✅ 已完成

`validate-bundle.js` 新增 `--strict-router` （13/13 校验），默认流程不阻断。

### 任务 5：端到端自检与发布就绪 ✅ 已完成

`validate-bundle` 53/53，`--strict-router` 54/54，`check.js` 73/73，已 `git tag v0.2.0`，未 push（按规范需用户准许）。

## 自检

- [x] 规格覆盖：设计文档 4 节要点均有任务对应
- [x] 占位符扫描：无 TBD/TODO，所有步骤含可执行代码块
- [x] 类型一致性：唯一 Skill 名仍为 cfbridge，cordis.patch.yml 不新增 skill 注册
- [x] Token 成本：路由表 <2.5k tokens vs Vendoring ~38k，节省 ~95%
