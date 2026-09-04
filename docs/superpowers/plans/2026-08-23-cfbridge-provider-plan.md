# cfbridge 0.5.0 Provider 形态实施计划

> 面向 Agent 执行者：使用 superpower-subagent-driven-development 按任务逐项执行本计划。步骤使用复选框语法跟踪。

目标：把 cfbridge 改造成以 @wenaixi/cfbridge 包名加载、显示 0.5.0、通过一个 TypeScript SkillProvider 提供 14 个按需加载技能的 DSH Bundle。

架构：保留 Cloudflare MCP patch 行；把 14 个 src/*-skill.js wrapper 合并为一个 src/cfbridge.ts Provider，构建为 lib/cfbridge.js。Provider 在 list() 阶段扫描并解析 front-matter，在 get() 阶段读取完整正文，所有注册由 Fiber 自动清理。

技术栈：Node.js 22+、TypeScript、Node ESM、@deepseek-ai/cordis、@deepseek-ai/dsh-skill、@deepseek-ai/schemastery、yaml、Node 内置 fs/path/url。

规格：docs/superpowers/specs/2026-08-23-cfbridge-provider-design.md

## 全局约束

- 包名保持 @wenaixi/cfbridge；版本从 0.3.2 提升到 0.5.0。
- package.json 使用 type: module；main 与 exports[.] 指向 lib/cfbridge.js。
- dsh.bundle.patch 继续指向 ./cordis.patch.yml。
- cordis.patch.yml 只保留 mcp-cloudflare 与 cfbridge 两行，Provider 行的 name 必须是 @wenaixi/cfbridge。
- Provider 导出 name、inject = ['skills']、Schemastery Config 与 apply；注册使用 ctx.skills.registerProvider()。
- Provider 默认名称为 cfbridge；runtime 是保留名；rank 为 550。
- list() 只解析 skills/*/SKILL.md front-matter；get() 按候选定位读取正文。
- 发现顺序稳定；跳过隐藏目录、缺文件、无效 front-matter、无效名称和重复名称，并记录 warning；取消信号必须及时抛出。
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

- [ ] 步骤 1：先写失败测试。测试导入尚不存在的 lib/cfbridge.js，运行 node --test tests/provider.test.mjs，预期以 ERR_MODULE_NOT_FOUND 失败。
- [ ] 步骤 2：加入 tsconfig.json：target ES2022、module 和 moduleResolution NodeNext、strict true、declaration true、noEmit true、types node，include src/**/*.ts。
- [ ] 步骤 3：加入 tsconfig.build.json：继承 tsconfig.json，设置 noEmit false、outDir lib、rootDir src、declarationMap true、sourceMap true，仅编译 src/**/*.ts。
- [ ] 步骤 4：package.json 增加 build、typecheck、prepare、prepack，并加入 @deepseek-ai/cordis、@deepseek-ai/dsh-skill、@deepseek-ai/schemastery、typescript、@types/node 的开发依赖，保留所有已有脚本。
- [ ] 步骤 5：运行 npm install，再运行 node --test tests/provider.test.mjs 确认仍因入口不存在而失败，记录 TDD RED 证据。
- [ ] 步骤 6：提交：git add package.json package-lock.json tsconfig.json tsconfig.build.json tests/provider.test.mjs && git commit -m "test: define cfbridge provider contract"。

### 任务 2：Provider 实现、构建与单元测试绿灯

文件：
- 新建 src/cfbridge.ts
- 生成 lib/cfbridge.js、lib/cfbridge.d.ts、source map
- 必要时仅调整 tests/provider.test.mjs 的构建入口路径

接口：导出 name = 'cfbridge'、inject = ['skills']、Config 和 apply(ctx, config)。Config 为 providerName 默认 cfbridge、skillDir 可选的 Schemastery object。Provider 名禁止 runtime，rank 550。

- [ ] 步骤 1：实现 parseFrontmatter(raw)；去除 BOM，仅在首行和闭合行都是 --- 时调用 yaml.parse，返回 data 与 body，解析异常交给调用方。
- [ ] 步骤 2：实现 createProviderForTest(skillDir, providerName, logger)；list() 用 node:fs/promises 的 readdir/stat/readFile，按目录名排序，跳过隐藏目录和缺少 SKILL.md 的目录，读取 name、description、whenToUse、disable-model-invocation、user-invocable、metadata，输出 DSH SkillCandidate 所需的 invocation/source/provider/rank/locator/resourceBase/path 字段，不输出 content。
- [ ] 步骤 3：list() 对坏 front-matter、无效 skill 名称、重复名称记录 warning 并继续；skillDir 不存在时记录 warning 并返回空数组；每个可取消的异步边界检查 options.signal。
- [ ] 步骤 4：get() 只读取 candidate.locator.path，处理 AbortError、缺文件和普通读取错误；重新解析 front-matter，名称漂移或字段不完整返回 undefined，成功时返回 content: parsed.body.trim()。
- [ ] 步骤 5：apply() 在 ctx.effect 中同步调用 ctx.skills.registerProvider()，并注册 skills/change 监听；返回 disposer 时先撤销监听再撤销 Provider。Provider 工厂不在 apply 中读取技能正文。
- [ ] 步骤 6：运行 npm run build、npm run typecheck、node --test tests/provider.test.mjs，预期全部通过；记录 TDD GREEN 证据。
- [ ] 步骤 7：提交：git add src lib tests/provider.test.mjs && git commit -m "feat: add cfbridge skill provider"。

### 任务 3：Bundle 身份、patch 和旧 wrapper 清理

文件：
- 修改 package.json、cordis.patch.yml、scripts/check.js、scripts/validate-bundle.js、scripts/test.js
- 删除 14 个 src/*-skill.js wrapper
- 新建 tests/bundle-metadata.test.mjs

接口：patch 只有 mcp-cloudflare 和 cfbridge 两个 insert 行；cfbridge 行 name 为 @wenaixi/cfbridge。校验脚本从 package.json 动态读取版本、入口和 Provider 行，strict-router 检查 14 个 skills/*/SKILL.md 存在且不再要求 wrapper。

- [ ] 步骤 1：先写 bundle-metadata.test.mjs，解析 package.json 和 cordis.patch.yml，断言目标版本、type、main、exports、files、patch id 顺序和 package-name identity；运行 node --test tests/bundle-metadata.test.mjs，预期当前版本或 patch 行失败。
- [ ] 步骤 2：更新 package.json：version 0.5.0、type module、main lib/cfbridge.js、types lib/cfbridge.d.ts、exports 根入口、files 至少包含 lib/、skills/、cordis.patch.yml、README.md、LICENSE。
- [ ] 步骤 3：更新 cordis.patch.yml：保留原 mcp-cloudflare 完整配置，把旧的 14 个 skill 行替换为 id cfbridge、name @wenaixi/cfbridge。
- [ ] 步骤 4：删除 cfbridge-skill.js、cloudflare-skill.js、wrangler-skill.js、agents-sdk-skill.js、durable-objects-skill.js、cloudflare-one-skill.js、cloudflare-one-migrations-skill.js、cloudflare-email-service-skill.js、sandbox-next-skill.js、sandbox-stable-skill.js、sandbox-migrate-to-next-skill.js、turnstile-spin-skill.js、web-perf-skill.js、workers-best-practices-skill.js。
- [ ] 步骤 5：修改 check.js 和 validate-bundle.js，删除 0.3.2 硬编码，动态读取 pkg.version；检查 lib/cfbridge.js、Provider 行、14 个 SKILL.md 和 package-name identity；不再把 wrapper 文件作为 strict-router 前提。
- [ ] 步骤 6：运行 npm run build、node --test tests/bundle-metadata.test.mjs、npm run check、npm run validate:bundle -- --strict-router，预期全部通过。
- [ ] 步骤 7：提交：git add package.json cordis.patch.yml scripts src tests/bundle-metadata.test.mjs && git commit -m "refactor: mount cfbridge provider by package identity"。

### 任务 4：文档、变更记录和隔离 demo

文件：
- 修改 README.md、CHANGELOG.md
- 新建 demo/README.md、demo/cfbridge-demo.cordis.yml、tests/demo-config.test.mjs

接口：demo 只用于独立 DSH_HOME/profile 验证，不写入现有 web profile，不替换 127.0.0.1:3080。文档说明 TypeScript 提交 lib/、GitHub 直装可能需要 allowBuilds，并给出 link 安装和 dump-config 命令。

- [ ] 步骤 1：先写 tests/demo-config.test.mjs，断言 demo 文档和 patch 包含 @wenaixi/cfbridge、lib/cfbridge.js、DSH_HOME、--dump-config；运行 node --test tests/demo-config.test.mjs，预期文件不存在而失败。
- [ ] 步骤 2：README 仅更新本次重构相关内容：Provider 按需加载说明、包名 patch 行、0.5.0、构建产物和独立 demo 验证方式，保持现有文档密度。
- [ ] 步骤 3：CHANGELOG 顶部加入 0.5.0 条目，说明 Provider 重构和面板版本号修复。
- [ ] 步骤 4：demo/cfbridge-demo.cordis.yml 提供独立 patch 示例，demo/README.md 给出 PowerShell 命令：设置临时 DSH_HOME、初始化 demo profile、dsh plugin --profile demo add link:<仓库路径>、dump-config 检查 cfbridge 与 mcp-cloudflare，再启动独立 demo。
- [ ] 步骤 5：运行 node --test tests/demo-config.test.mjs 并提交：git add README.md CHANGELOG.md demo tests/demo-config.test.mjs && git commit -m "docs: document isolated cfbridge provider demo"。

### 任务 5：完整验证、独立 profile 实测与记忆库收尾

文件：
- 修改 scripts/test.js、scripts/check.js、scripts/validate-bundle.js、CLAUDE.md

- [ ] 步骤 1：运行 npm run typecheck、npm run build、node --test tests/provider.test.mjs tests/bundle-metadata.test.mjs tests/demo-config.test.mjs。
- [ ] 步骤 2：运行 npm run check、npm run validate:bundle -- --strict-router、npm run test、npm pack --dry-run，记录完整退出码和通过数量。
- [ ] 步骤 3：使用独立临时 DSH_HOME 执行 dsh --profile demo --dump-default-config、dsh plugin --profile demo add link:<仓库路径>、dsh --profile demo --dump-config；必须看到 id: cfbridge 与 name: @wenaixi/cfbridge，不得出现 skills-bundle 或 src/*-skill.js。
- [ ] 步骤 4：在独立 demo profile 中启动一次 DSH，检查 Provider 注册、14 个技能可发现、wrangler 正文可按需读取，退出后不触碰 web profile。
- [ ] 步骤 5：更新 CLAUDE.md：版本、Provider 形态、lib 构建要求、demo 验证结果和未执行的发布动作；不得写入 token。
- [ ] 步骤 6：运行 git diff --check、git status --short --branch，并提交：git add scripts CLAUDE.md && git commit -m "test: verify cfbridge provider delivery"。

## 计划自检

- 每个规格要求都映射到任务 1-5。
- 无未完成占位符；每个非平凡逻辑均有可运行测试或独立 demo 验证。
- 所有任务的入口、Provider 名、rank、版本、patch id 与测试字段一致。
- 计划明确不 push、不 publish、不修改现有 web profile。
