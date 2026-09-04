# cfbridge 0.5.0 Provider 形态设计

> 日期：2026-08-23
> 状态：已获用户批准，进入实现

## 目标

将 `@wenaixi/cfbridge` 从多个运行时 Skill wrapper 收敛为一个符合 DSH 原生约定的 TypeScript Bundle 插件。安装后，面板以包名识别插件并从 `package.json` 显示版本号；Cloudflare MCP 行与 14 个 Skill 仍由同一个 Bundle 提供。

## 现状问题

当前 Bundle 的 patch 行把 `@wenaixi/cfbridge/src/skills-bundle.js` 作为插件名。DSH 插件面板因此把它当作本地子路径入口，无法以 `@wenaixi/cfbridge` 找到包的 `package.json`，最终显示 `? · 本地`。当前实现还在一个 apply 中直接执行多次 `ctx.skills.register()`，无法利用当前 `SkillProvider` 的按需发现与加载协议。

## 设计

### 包身份与加载

- `package.json` 使用 `type: module`。
- `main` 和 `exports["."]` 指向构建产物 `lib/cfbridge.js`。
- `dsh.bundle.patch` 继续指向 `cordis.patch.yml`。
- patch 只保留 `mcp-cloudflare` 与 `cfbridge` 两行；Skill Provider 行的 `name` 使用包名 `@wenaixi/cfbridge`。
- 版本从 0.3.2 提升到 0.5.0，覆盖未进入本仓库历史的 0.4.0 发布形态。

### Provider

新增 `src/cfbridge.ts`，导出 `name`、`inject = ['skills']`、Schemastery `Config`、`apply`，并在 apply 中同步调用 `ctx.skills.registerProvider()`。Provider 名称固定默认为 `cfbridge`，禁止使用保留名 `runtime`；发现优先级为 550。

Provider 扫描包内 `skills/*/SKILL.md`：

- `list()` 只读取 front-matter，返回 `name`、`description`、可选 `whenToUse`、解析后的 `invocation`、`source: 'bundled'`、Provider 名、rank、`locator`、`resourceBase`、绝对 `path` 与可选 `metadata`。
- 目录扫描按名称稳定排序，跳过隐藏目录和没有 `SKILL.md` 的目录。坏文件、重复名称、无效名称、无效 front-matter 记录 warning 后跳过。
- `get()` 只读取获胜候选对应的文件，重新解析并校验名称漂移；缺文件返回 `undefined`，取消信号继续抛出，正常读取错误记录 warning 后返回 `undefined`。
- 只有正文在 `get()` 时加载，返回 `content: parsed.body.trim()`。
- 支持 DSH 当前 front-matter 的 `disable-model-invocation`、`user-invocable`、`metadata` 字段，并拒绝旧字段别名。

### 生命周期与失败

- Provider 注册、`skills/change` 监听放在同一个 `ctx.effect` 中，卸载时先撤销监听再撤销 Provider。
- 注册发生在 apply 内并交给 Fiber 管理；远程或异步工作不放在模块作用域。
- 包内技能目录缺失时 Provider 返回空列表并记录 warning；单个技能坏文件不阻断其他技能发现。
- 配置 schema 表达默认值；`skillDir` 可选地覆盖包内目录，便于隔离 demo 验证。

### TypeScript 构建

- 使用 TypeScript 编译为 Node ESM，提交 `lib/` 构建产物，保证 npm、GitHub 和本地链接安装都无需额外构建上下文。
- `prepare` 和 `prepack` 执行构建；GitHub 直装若被 pnpm 阻止构建，README 明确说明 `allowBuilds`。
- peer 依赖至少包含 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-skill`、`@deepseek-ai/schemastery`；运行时包不把 DSH 核心复制进包内。

## 非目标

- 不拆分 MCP 与 Skill 为两个包。
- 不新增 MCP server，不复制 Cloudflare API 端点。
- 不声明 host 已有的 persona、agent-instructions、tool-fs、planning 等组合行。
- 不改 vendored `SKILL.md` 正文，只把它们改为 Provider 按需加载。

## 验收标准

1. `npm run check`、`npm run validate:bundle -- --strict-router`、`npm run test` 全部退出码为 0。
2. `npm pack --dry-run` 包含 `lib/cfbridge.js`、`skills/`、`cordis.patch.yml`，不依赖 `src/` 才能运行。
3. 独立 demo profile 以 `link:D:\newC\stick2\cfbridge` 安装后，`dsh --profile demo --dump-config` 中出现 `id: cfbridge` 与 `name: @wenaixi/cfbridge`，不出现 `skills-bundle` 或 14 个 wrapper 行。
4. demo 启动后 `ctx.skills.list()` 能发现 14 个技能，`ctx.skills.get('wrangler')` 能按需返回正文，Provider 卸载后这些技能消失。
5. 面板或包元数据读取的是 `@wenaixi/cfbridge/package.json` 的 `0.5.0`，不再显示 `? · 本地`。
