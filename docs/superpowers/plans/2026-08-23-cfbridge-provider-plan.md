# cfbridge 0.5.0 Provider 形态实施计划

> 面向 Agent 执行者：使用 superpower-subagent-driven-development 按任务逐项执行本计划。步骤使用复选框语法跟踪。

目标：把 cfbridge 改造成以 @wenaixi/cfbridge 包名加载、显示 0.5.0、通过一个 TypeScript SkillProvider 提供 14 个按需加载技能的 DSH Bundle。

架构：保留 Cloudflare MCP patch 行；把 14 个旧 wrapper 合并为一个 src/cfbridge.ts Provider，构建为 lib/cfbridge.js。Provider 在 list() 阶段扫描并解析 frontmatter，在 get() 阶段读取完整正文，所有注册由 Fiber 自动清理。

技术栈：Node.js 22+、TypeScript、Node ESM、@deepseek-ai/cordis、@deepseek-ai/dsh-skill、@deepseek-ai/schemastery、yaml、Node 内置 fs/path/url。

规格：docs/superpowers/specs/2026-08-23-cfbridge-provider-design.md

## 全局约束

- 包名保持 @wenaixi/cfbridge；版本从 0.3.2 提升到 0.5.0。
- package.json 使用 type: module；main 与 exports[.] 指向 lib/cfbridge.js。
- dsh.bundle.patch 继续指向 ./cordis.patch.yml。
- cordis.patch.yml 只保留 mcp-cloudflare 与 cfbridge 两行，Provider 行的 name 必须是 @wenaixi/cfbridge。
- Provider 导出 name、inject = ['skills']、Schemastery Config 与 apply；注册使用 ctx.skills.registerProvider()。
- Provider 默认名称为 cfbridge；runtime 是保留名；rank 为 550。
- list() 只解析 skills/*/SKILL.md frontmatter；get() 按候选定位读取正文。
- 发现顺序稳定；跳过隐藏目录、缺文件、无效 frontmatter、无效名称和重复名称，并记录 warning；取消信号必须及时抛出。
- 配置 schema 表达默认值；skillDir 可覆盖默认包内技能目录。
- Provider 注册与 skills/change 监听放在同一个 ctx.effect；卸载顺序为先监听、后 Provider。
- TypeScript 构建产物 lib/ 必须提交；prepare 与 prepack 执行构建；运行时不复制 DSH 核心依赖。
- Token 只能由 $DSH_HOME/.env 的 process.env.CLOUDFLARE_API_TOKEN 通过 !!js 动态引用；禁止写入被跟踪文件。
- 不新增 MCP server，不拆分包，不声明 host 已有 persona、agent-instructions、tool-fs、planning 行。
- 每个任务完成后提交；不 push、不 publish、不修改现有 web profile。

---

### 任务 1：TypeScript 基座与 Provider 合同测试

文件：
- 新建 tsconfig.json、tsconfig.build.json
- 修改 package.json，加入 TypeScript 构建脚本和 DSH 类型开发依赖
- 新建 tests/provider.test.mjs

接口：测试通过 node:test 直接导入 lib/cfbridge.js，使用临时技能目录和最小 mock Context 验证 Provider。覆盖 list() 只返回元数据、get() 返回正文、取消信号、名称漂移、apply() 同步注册一个 Provider 工厂。

- [x] 步骤 1：先写失败测试。测试导入尚不存在的 lib/cfbridge.js，运行 node --test tests/provider.test.mjs，已记录 ERR_MODULE_NOT_FOUND。
- [x] 步骤 2：加入 tsconfig.json：target ES2022、module 和 moduleResolution NodeNext、strict true、declaration true、noEmit true、types node，include src/**/*.ts。
- [x] 步骤 3：加入 tsconfig.build.json：继承 tsconfig.json，设置 noEmit false、outDir lib、rootDir src、declarationMap true、sourceMap true，仅编译 src/**/*.ts。
- [x] 步骤 4：package.json 增加 build、typecheck、prepare、prepack，并加入 @deepseek-ai/cordis、@deepseek-ai/dsh-skill、@deepseek-ai/schemastery、typescript、@types/node 的开发依赖，保留所有已有脚本。
- [x] 步骤 5：运行 npm install，再运行 node --test tests/provider.test.mjs，已记录 TDD RED 证据。
- [x] 步骤 6：已提交 Provider 基座与合同测试。

### 任务 2：Provider 实现、构建与单元测试绿灯

文件：
- 新建 src/cfbridge.ts
- 生成 lib/cfbridge.js、lib/cfbridge.d.ts、source map
- 必要时仅调整 tests/provider.test.mjs 的构建入口路径

接口：导出 name = 'cfbridge'、inject = ['skills']、Config 和 apply(ctx, config)。Config 为 providerName 默认 cfbridge、skillDir 可选的 Schemastery object。Provider 名禁止 runtime，rank 550。

- [x] 步骤 1：实现 parseFrontmatter(raw)，兼容 BOM 与 vendored 注释前导。
- [x] 步骤 2：实现 createProviderForTest(skillDir, providerName, logger)，并按 DSH SkillCandidate 合同生成元数据。
- [x] 步骤 3：list() 已处理坏 frontmatter、无效名称、重复名称、缺失目录与取消信号。
- [x] 步骤 4：get() 已按候选惰性读取正文，并处理取消、缺失、读取错误、名称漂移和无效 invocation。
- [x] 步骤 5：apply() 已在 ctx.effect 中同步注册 Provider 与 skills/change 监听，卸载顺序正确。
- [x] 步骤 6：npm run build、npm run typecheck、node --test tests/provider.test.mjs 已通过。
- [x] 步骤 7：已提交 TypeScript Provider 实现与构建产物。

### 任务 3：Bundle 身份、patch 和旧 wrapper 清理

文件：
- 修改 package.json、cordis.patch.yml、scripts/check.js、scripts/validate-bundle.js、scripts/test.js
- 删除 14 个旧 src/*-skill.js wrapper
- 新建 tests/bundle-metadata.test.mjs

接口：patch 只有 mcp-cloudflare 和 cfbridge 两个 insert 行；cfbridge 行 name 为 @wenaixi/cfbridge。校验脚本从 package.json 动态读取版本、入口和 Provider 行，strict-router 检查 14 个 skills/*/SKILL.md 存在且不再要求 wrapper。

- [x] 步骤 1：已写 bundle-metadata.test.mjs 并覆盖包身份、入口、files 与 patch 行。
- [x] 步骤 2：已更新 package.json 版本、模块类型、构建入口、exports 与发布文件清单。
- [x] 步骤 3：已保留 mcp-cloudflare 配置，并将技能入口替换为 id: cfbridge 与包名挂载。
- [x] 步骤 4：已删除 14 个旧 src/*-skill.js wrapper 文件。
- [x] 步骤 5：已更新 check.js 与 validate-bundle.js，并覆盖 Provider、14 个技能和包名 identity。
- [x] 步骤 6：构建、Bundle 元数据、check 与严格校验均已通过。
- [x] 步骤 7：已提交 Bundle 身份、patch 与旧 wrapper 清理。

### 任务 4：文档、变更记录和隔离 demo

文件：
- 修改 README.md、CHANGELOG.md
- 新建 demo/README.md、demo/cfbridge-demo.cordis.yml、tests/demo-config.test.mjs

接口：demo 只用于独立 DSH_HOME/profile 验证，不写入现有 web profile，不替换 127.0.0.1:3080。文档说明 TypeScript 提交 lib/、GitHub 直装可能需要 allowBuilds，并给出 link 安装和 dump-config 命令。

- [x] 步骤 1：已写 tests/demo-config.test.mjs 并覆盖 demo 文档与 patch 安全约束。
- [x] 步骤 2：README 已补充 Provider 按需加载、包名 patch、0.5.0、构建产物和 demo 说明。
- [x] 步骤 3：CHANGELOG 已加入 0.5.0 条目。
- [x] 步骤 4：已提供独立 patch 示例、临时 DSH_HOME 安装与 dump-config 验证命令。
- [x] 步骤 5：demo 文档测试已通过并纳入本地变更。

### 任务 5：完整验证、独立 profile 实测与记忆库收尾

文件：
- 修改 scripts/test.js、scripts/check.js、scripts/validate-bundle.js、CLAUDE.md

- [x] 步骤 1：类型检查、构建与 13 个 Provider/元数据/demo 测试已通过。
- [x] 步骤 2：check 73/73、严格 Bundle 73/73、综合测试 8/8、npm pack 23 文件已通过。
- [x] 步骤 3：独立临时 DSH_HOME 已完成安装与 dump-config 验证，出现 id: cfbridge 和包名入口，未出现旧 Skill 行。
- [x] 步骤 4：Provider 单测已验证 14 个技能可发现及 wrangler 正文惰性读取；隔离 demo 启动入口保留为手动操作。
- [x] 步骤 5：CLAUDE.md 已更新版本、Provider、构建、demo、依赖和未执行发布动作，未写入 token。
- [x] 步骤 6：已完成差异检查并创建本地提交；不执行 push、publish 或 profile 同步。

## 计划自检

- 每个规格要求都映射到任务 1-5。
- 无未完成占位符；每个非平凡逻辑均有可运行测试或独立 demo 验证。
- 所有任务的入口、Provider 名、rank、版本、patch id 与测试字段一致。
- 计划明确不 push、不 publish、不修改现有 web profile。
