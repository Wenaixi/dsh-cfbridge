## 0.10.2 — 2026-10-04
- **docs**: 移除 skills/cfbridge/SKILL.md 中残留的 `/cfbridge` 斜杠命令指引（第 36/42/249 行）。该命令于 0.10.0 移除（commit 64df76b）时同步了 README 与客户端文案，唯独漏改技能本体文档——它是随 npm 包发布的模型可读操作指南，会教模型调用不存在的命令。
- **refactor(provider)**: 清理 `src/cfbridge.ts` 移除 `/cfbridge` 命令后残留的四处过时注释（328/378/382/534 行附近），改为中性表述（宿主控制面 / 技能清单发布）。仅注释改动，无行为变化。
- **docs**: README 验证节删除会随门禁断言数漂移的过期计数（76/86 → 无计数）；维护节「四组行为测试」修正为七个行为测试文件（`scripts/test.js` 实况）。
- **docs(changelog)**: 注明 check 门禁计数随环境（本机 web profile 装 bundle 时 85/85，CI/干净环境 84/84，两边均 0 失败）。
## 0.10.1 — 2026-10-04
- **fix(client)**: 修复技能开关的投影缺陷。`disabledSkills` 的语义是「模型与人类都关」，不是一个独立的第三字段；原实现把它当成独立字段参与合成，于是在历史落盘形态（技能只在 `disabledSkills` 里、两个 hidden 名单为空）下，只打开其中一个开关会连带把另一轴静默打开——用户没碰过的开关自己变了。改为先由 `disabledSkills` 还原两轴的真实开合状态，只翻转被点击的那一轴，再按「两轴都关则升级为 `disabledSkills`、否则用对应 hidden 名单」重新合成，并把同一事实的双重来源归一（两轴都关时从两个 hidden 列表移除该技能）。
- **test(client)**: 新增 `tests/client-panel.test.mjs`，用 Node `vm` 执行真实构建产物 `lib/client.js`，穿过真实 `plugins.row.config` 注册与真实 `Switch.onChange` 驱动面板，断言 `form.mutate` 收到的三个字段投影与 revision 栅栏。模型轴与人类轴各有独立用例（评审实测发现只测一轴时，另一轴的镜像变异可以全绿存活）。每条断言均做破坏实测确认会红。
- **fix(scripts)**: `wrangler.js` 此前在无 `CLOUDFLARE_API_TOKEN` 时拦截**所有**命令，包括 `--version` 这类纯本地探测，使综合套件在无凭据的 CI 上必然失败。改为只对需要访问 Cloudflare 的命令要求 Token，并按**首个位置参数**判定——用 `some()` 扫描全部参数会让 `whoami --version`、`deploy --help` 这类命令顺带绕过凭据检查（评审实测确认）。
- **test(scripts)**: 新增 `tests/wrangler-entry.test.mjs`，锁定「无 Token 时 `--version` 必须可用」与「首参数是真实子命令时无论附带什么 flag 都必须被拦下」两条契约。
- **ci**: CI 与 Release 此前各自跑 `check` + `validate:bundle` + best-effort `test:wrangler`，**从不调用既有综合套件**——类型检查与四个测试文件只在本地跑。两者改为统一调用 `npm test`（唯一验证入口），保留 `npm ci`、`npm pack --dry-run` 与 Release 的 tag 版本校验；原先被 `|| echo` 吞掉所有失败的 Wrangler 步骤随之退场。
- **test(ci)**: 新增 `tests/workflow-gate.test.mjs`，解析两个 workflow 的真实结构，断言 `npm test` 已接入、零散 check/validate 步骤不再重复、pack 与 tag 校验仍然保留。该断言本身做过破坏实测：把 CI 改回只跑 `npm run check`，它会红。
- **refactor(scripts)**: 抽出 `scripts/lib/skill-metadata.js`，让 `validate-bundle.js` 与 `tests/bundle-metadata.test.mjs` 共用同一份 SKILL.md 索引元数据判定，消除同一语义两处各写一份。同时修正该判定比契约更严之处：它此前要求注释块后紧跟 `\n` 且 BOM 只能在文件最开头，而 vendored 快照的真实头部是「注释块 + CRLF + BOM + 注释块」交替，导致本地（CRLF）与 Linux checkout（LF）行为分裂。已实测两种行尾下 14 个技能全部通过。
- **chore(gate)**: 门禁基线更新为 `npm test` 13/13、`check.js` 85/85、`validate-bundle.js --strict-router` 98/98。
- **核实结论（明确不做）**: `MutableSkillProvider` 的四个名单方法与 `SkillRuntime.current()` 在当前代码里没有仓内调用者，但它们是**已发布类型**（v0.8.0 / v0.9.0 / v0.10.0 的 `lib/cfbridge.d.ts` 都公开了该返回类型与方法），删除属 breaking change；且 `current()` 由 CLAUDE.md 明文裁定为对外暴露面。故保留行为，只更新因 `/cfbridge` 命令移除而过时的注释。


## 0.10.0 — 2026-10-04
- **feat(ui)**: 插件配置面板的每个技能行改为显示一句人类可读的简介（中文界面中文、英文界面英文），取代此前只显示 `skills/<目录名>` 的无信息量路径。不直接复用 `SKILL.md` 的 frontmatter description——那是面向模型的触发说明（实测英文 160–551 字符），塞进面板既长又难读；改为在客户端维护一份短简介表，只负责把名字翻译成人话，不参与技能发现。未登记简介的技能回退显示目录名。语言探测不新增宿主依赖（用一个已注册 key 作哨兵比较 `t()` 返回值）。
- **feat(icon)**: 插件图标替换。旧图标是手写的「深色圆角底 + 白描边云 + 橙色闪电」SVG；新图标以 Cloudflare 官方 Logo 作参考图、经 gpt-image-2 的 edits 端点生成，产出「官方云形态 + 底部负形桥」的标志——延续 Cloudflare 的视觉血统，同时用桥的负形做出自身身份。规格 512×512 PNG、真透明底、86 KB（宿主上限 256 KiB）。`icon.svg` 已删除，`package.json` 的 `icon` / `files[]` 与 `validate-bundle.js` 断言同步。
- **test(gate)**: 新增门禁断言——每个技能都必须有中英成对的简介且中文非空；断言从 `lib/client.js` 产物读取，兼容带引号与不带引号两种键形态。破坏实测确认会红（删掉某个技能的简介后精确报出缺失项）。
- **docs**: 重构 CLAUDE.md，243 行压至 125 行：发布记录由四节流水改为一张版本表，把「本轮做了什么」的过程叙述收敛为「未来必须遵守的契约与判据」，并新增「已知边界与明确不做的事」一节。
- **refactor(provider)!**: 移除 `/cfbridge` 斜杠命令（约 65 行）。该命令于 0.8.0 引入，定位是「不重启就能改技能开关的即时调试入口」，但能力与插件页面板**高度重叠**（四项开关操作完全等价），且面板是持久化的正路。核实中还发现它与面板的合成规则**不一致**：同样把技能对模型和人类都关掉，面板会升级写入 `disabledSkills`，命令则留下 `modelHiddenSkills + userHiddenSkills` 两个字段——功能等效但落盘形态不同，会让后续读配置的人困惑。移除后技能开关只有面板一条路径，语义单一。
  - 同步删除客户端面板里的 `slashHint` 提示文案（中英文各一条）——命令不存在后该提示是假承诺。
  - 实测确认（真实调用，非读代码）：`apply()` 后命令注册数为 0、Provider 注册数为 1、`list()` 仍返回 14 个技能、`get()` 正文 8506 字节，核心能力无回归。
- **chore(gate)**: 门禁基线维持 `npm test` 10/10、`check.js` 85/85、`validate-bundle.js --strict-router` 97/97。

## 0.9.0 — 2026-10-04
- **test(gates)**: 门禁不再用正则匹配 `src/cfbridge.ts` 源码文本来断言 Provider 行为。新增 `scripts/lib/provider-contract.js`，改为 `import` 构建产物 `lib/cfbridge.js` 并断言真实导出值（`name` / `inject` / `Config().rank`）与真实行为（`apply` 是否注册恰好一个 Provider、该 Provider 能否列出磁盘全部技能、list/get 两段式加载是否成立、保留名 `runtime` 是否被拒）。两个门禁共用该断言集合，消除逐字抄写两遍的重复。门禁计数 `check.js` 76→85、`validate-bundle.js` 86→97。
  - 对照实验（临时副本，仓库不受影响）：把 `PROVIDER_RANK` 改名（行为不变）旧实现**误报** 2 项，新实现全绿；把 `registerProvider` 调用短路（Provider 永远注册不上）旧实现**全绿漏报**，新实现 FAIL 并非零退出。
- **fix(client)**: `src/client.entry.ts` 此前完全不被类型检查（`tsconfig.json` 与 `tsconfig.build.json` 都显式 exclude 它，唯一编译路径 `build-client.js` 走 `transpileModule` 且明确不做类型检查）。新增 `tsconfig.client.json` 与 `src/client.deps.d.ts`（按实际用到的面声明 react 与 ui-primitives 的最小类型，两者本由 DSH 客户端运行时注入、本地不安装，因此不引入新依赖），并接入 `npm test` 成为独立一步。
  - 补上检查后立刻发现真实缺陷：`SkillRow` 的 props 里 `busy` 已声明为 boolean（调用方按 `busy === name` 求值后传入），组件内部却仍写 `busy === name`，与 string 比较恒为假，导致保存中的开关不会被禁用、可被重复点击。已改为直接使用 `busy`。
  - 验证：注入类型错误 → `error TS2322` 并非零退出；恢复 → EXIT=0。
- **refactor(provider)**: 收敛技能开关投影规则。`list()` 内的 `project()` 与 `get()` 内联的手写投影本属同一规则，抽出泛型纯函数 `projectInvocation<T extends { name; invocation }>`（刻意不绑定 `SkillCandidate`，因为 `get()` 需返回多一个 `content` 字段的 `SkillDefinition`，这正是当初手抄一份的原因）。配套规则测试覆盖两个维度独立生效、名单为空、命中他名、已关闭方向不被打开、纯函数不可变；破坏实测确认该测试会红。
- **refactor(provider)**: `createProviderForTest`（8 个位置参数、其中 5 个可选）改为 `createSkillProvider({ ... })` 具名选项对象。旧签名下 `createProviderForTest(root, 'cfbridge', console, 700, true)` 必须回查签名才知道第 4、5 位是什么；名字里的 `ForTest` 也与事实不符（它在生产路径 `apply()` 内被调用）。
- **refactor(provider)**: 拆解 `apply()`。它此前在单个函数体内混了七条生命周期，并靠三个裸闭包变量互相咬合（`invalidateCatalog` 被 watcher 与斜杠命令同时读写、`liveProvider` 被注册/发布/命令三处读写、`settings` 取值表达式写了两遍）。引入 `SkillRuntime` 作接缝封装前两根线，对外只暴露 `current()` / `invalidate()` / `listNames()`；三条效果各自成为独立安装函数并各自返回清理函数（`installSkillRuntime` / `installSkillsWatcher` / `installCommand` / `publishSkillCatalog`），`apply` 缩为约 40 行装配层。行为严格不变：六个命令动作的三维度增删逐条实测复现，清单发布经 `describe` 比对后写入 `availableSkills`。
- **refactor(scripts)**: `migrate-from-preset.js` 自带的 `listFiles` 改用共享的 `collectFiles`（上一轮收敛共享助手时漏掉的消费方；实测两者对 `skills/` 的收集结果逐项一致）。
- **chore(gate)**: 门禁基线更新为 `npm test` 10/10、`check.js` 85/85、`validate-bundle.js --strict-router` 97/97。
- **核实结论（明确不做）**: `ALL_SKILLS` 手抄清单维持现状（实测磁盘 14 与声明 14 完全一致、零漂移；且删除漏改会被 `checkFile` 发现，只有新增漏改才是静默通过，严重度不足以换取自动化后破坏 `VENDORED_SKILLS` 意图语义的代价）；`locale/*.json` 与 `client.entry.ts` 内联语文案维持两条通道（前者供宿主渲染插件卡片、后者供面板内部使用，服务不同消费者，非重复）。

## 0.8.0 — 2026-10-03
- **feat(ui)**: 插件页新增 Cloudflare 桥接配置面板。每个技能有**两个独立开关**——「模型可调用」与「人类可调用」；两个都关等于完全关闭。
- **feat(config)**: 新增三个可写字段 `modelHiddenSkills` / `userHiddenSkills`（单方向隐藏）与 `disabledSkills`（完全关闭），彼此独立、可组合。
- **feat(command)**: `/cfbridge` 斜杠命令扩展 `hide-model` / `show-model` / `hide-user` / `show-user`，便于命令行临时调试。
- **fix(root cause)**: 插件此前未被加入 profile 的 `dsh.profile.bundles`，补丁层从不装载（表现为无工具、无技能）。现已确认官方 `dsh plugin add` 会自动写入该项。
- **refactor**: 删除自建的跨端 Remote 控制层（约 300 行）。宿主原生通道（`pluginManager.setPluginEnabled` 与设置页 `form.mutate`）已完全覆盖这些能力，无需自己读写 `cordis.patch.yml`。
- **docs**: README 新增「在插件页开关」「用斜杠命令开关」两节；CLAUDE.md 新增第九节记录双面插件六条硬约束与两个静默失效陷阱。
- **chore(gate)**: `Provider injects skills` 断言由精确串放宽为「数组含 `skills`」（`settings` 也是真实依赖），并做了一次破坏实测确认会红。门禁基线 `check.js` 76/76、`validate-bundle.js` 86/86、`npm test` 9/9。

## 0.7.0 — 2026-10-02
- feat(watcher): 开发模式技能热刷新（watchSkills）经真实 SkillRegistry 端到端验证：新增/删除技能目录、编辑 SKILL.md 均去抖广播 skills/change，list 感知新描述。
- fix(provider): 保留名 providerName="runtime" 在 apply 层直接拒绝（抛错），不再进入注册阶段。
- chore(scripts): install-bundle/uninstall-bundle 在隔离 DSH_HOME 实测通过；install 清理旧 legacy skill 软链、uninstall 幂等移除层与链接。
- chore(verify): 隔离 DSH 新实例深度验证记录——tarball 安装、dump-config patch 展开、14 技能发现、get 正文按需读取、mtime 缓存失效、SkillRegistry 注册/重名拒绝/注销/广播链路全部实测通过。
- docs: README 与 demo 说明同步 0.7.0 验证结论（详见下方各节）。

# Changelog

## 0.6.0 — 2026-10-02
- feat(provider): 基于 mtime 的高性能候选技能元数据内存缓存，避免重复文件 IO 与 YAML 解析开销。
- feat(config): 扩展 Schemastery 配置模型，支持自定义 Provider 优先级（rank，默认 550）、缓存开关（cache，默认 true）与开发态文件热监听（watchSkills，默认 false）。
- feat(watcher): 可逆的技能目录文件变动监听 Effect，在开发模式下修改技能自动去抖广播 skills/change 事件，插件卸载时安全释放句柄。
- chore: 全面更新测试套件与 Bundle 静态校验，支持离线/无 token 场景优雅跳过。

## 0.5.0 — 2026-08-23
- feat: 改用 TypeScript SkillProvider，14 个技能按需读取并支持 vendored 注释前导。
- fix: Bundle patch 通过 `@wenaixi/cfbridge` 包名挂载，插件面板可解析版本号。
- chore: 声明 `yaml` 运行时依赖，提交 `lib/` 构建产物，并增加独立 demo profile 验证。

## 0.3.2 — 2026-08-26
- fix(ci): release.yml 的 Release Notes 提取正则改为兼容 "## [x.y.z]" 与 "## x.y.z" 两种标题风格（旧正则永远 fallback 到 tag message）
- fix(docs): README 移除指向本地 CLAUDE.md 的 404 链接；deprecated/preset/README.md 的历史 Skill 发现方式修正为运行时注册
- chore: 删除 package.json 中指向不存在脚本的 gen:wrappers / verify:wrappers；cfbridge SKILL.md 仓库链接修正
- feat(vendor): 13 个 vendored SKILL.md 快照头部与 sync 脚本模板追加 references 仅在线可用声明

## 0.3.1 — 2026-08-23
- docs(skill): 精简 cfbridge 路由节为单一 cloudflare 总入口（其余由 cloudflare 指引），保留薄桥主体与 13 vendored skills 离线文件；README 同款精简，形态说明保留
- chore: package.json 0.3.0 -> 0.3.1，validate 校验适配 slim 入口

## 0.3.0 — 2026-08-23
- feat(vendor): Vendoring 13 个 cloudflare/skills 官方 SKILL.md 原样入包，离线可用；`scripts/sync-vendor-skills.js` 幂等同步（来源注释 + front-matter 校验）
- feat(skill): 历史版本曾新增 13 个运行时薄包装（现已由 0.5.0 单一 TypeScript SkillProvider 取代）；当时与主 cfbridge 共 14 个 skill，索引与正文按需加载
- feat(bundle): 历史版本曾将 `cordis.patch.yml` 扩至 14 行；现已收敛为单一 `cfbridge` Provider 行
- docs: README 新增"形态说明：Bundle / Preset / 动态插件"一节，含 skill 两段式加载真相
- chore: package.json 0.2.0 -> 0.3.0，新增 npm scripts `sync:vendor` / `verify:wrappers`

## 0.2.0 — 2026-08-23
- feat(skill): 新增官方 13 Skills 轻量路由指引（不 Vendoring），含安装、决策树与路由表；检索优于记忆（cloudflare/skills）
- docs: README 同步镜像路由表，版本徽记与文字更新至 0.2.0
- chore: 保留 ponytail 全量 Vendoring 评估注释，仅在"内网离线必须可用"时再启用

## 0.1.2 — 2026-08-18
- 首个公开发布；DSH Bundle 形态，运行时 Skill，全局可见（mcp__cloudflare__docs/search/execute 三工具）