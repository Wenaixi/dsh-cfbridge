# Changelog

本项目所有值得记录的变更都记录在这个文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.13.2] - 2026-10-31

### Changed

- 专属智能体预设名称从 `Cloudflare` 规范为 `Cloudflare 模式`，描述同步更新为「仅在本模式加载 Cloudflare MCP 工具与 14 个按需技能，预置操作规范」，修复宿主界面模式选择与展示语义不直观的问题。
- 同步更新主 README、中文使用说明书与项目核心契约库 CLAUDE.md。

### Fixed

- 修复远程异步 MCP 客户端握手延迟导致的工具隔离时序穿透。
- 在根上下文注册 `ctx.tools.guard` 全局守卫，任何会话在非 Cloudflare 模式或 MCP 关闭时调用特权工具，都在执行管线最前端被拦截并返回拒绝原因。
- 动态监听 `tools/change` 事件，修复 MCP 延迟上线时普通会话因创建瞬间无工具而漏配 `tools.restrict` 的竞态问题，MCP 上线后自动对活跃会话补全屏蔽。
- `resolvePresetId` 兼容原始 ScopeKey、Cordis Context 与 `Agent.ctx` 包装上下文，修复 `exec.agent` 无法解包导致预设识别失败的问题。

## [0.13.1] - 2026-10-18

### Fixed

- 调整宿主微内核的 `peerDependencies` 生命周期区间：`@deepseek-ai/dsh-skill` 改为 `>=0.2.0-rc.2 <0.3.0-0`，`@deepseek-ai/cordis` 改为 `>=4.0.4 <5.0.0`，`@deepseek-ai/schemastery` 改为 `>=3.18.4 <4.0.0`。
- 修复相近小版本宿主启动时被加载器版本门禁误判为不兼容、静默禁用插件行 `disabling profile plugin row "cfbridge"` 的问题。

## [0.13.0] - 2026-10-18

### Added

- 适配 DSH v0.2.1-rc.2 的最新 `PresetDefinition` 规范，支持生命周期内的动态注册、审计与安全注销。
- 强化普通会话的双道特权防线：静态阶段调用 `tools.restrict({ deny: CLOUDFLARE_TOOLS })` 剔除工具调用意图，执行期挂载 `tools.guard()` 动态拦截并返回可读理由。
- 完善 MCP 总控 `mcpEnabled` 的短路逻辑，关闭时全系统全会话阻断对 Cloudflare MCP 三工具的调用。
- 全链路取消信号透传：遍历、I/O 与候选发现严格检查并透传 `AbortSignal`，通过 `isAbortError` 识别重抛，中断不再被误判为文件损坏。

### Removed

- 移除 `modelHiddenSkills` 与 `userHiddenSkills` 历史双轴隐藏字段，配置单一真源收敛为 `disabledSkills`。
- 删除已废弃的 4 个历史脚本 `install-preset.js`、`uninstall-preset.js`、`validate-preset.js` 与 `migrate-from-preset.js`。
- 清除工具库中的历史软链清理函数 `removeLegacySkillLink`。

### Changed

- 客户端控制器的开关操作从 3-ops 平铺升级为单操作原子批处理。
- `peerDependencies` 收敛锁定为 `^0.2.1-rc.2`、`@deepseek-ai/cordis ^4.0.5`、`@deepseek-ai/schemastery ^3.18.5`。

## [0.12.0] - 2026-10-11

### Added

- 按 `frontend-design` 美学重塑设置面板 UI：头部状态展板 `HeroBanner` 集成呼吸指示灯与三状态动态徽标，双列卡片式模式选择器 `ModeCard` 替代原生 radio 控件，MCP 总控面板 `McpMasterCard` 集成总控开关与三特权工具芯片标牌，技能库即时搜索栏与「全部启用 / 全部停用」批量工具条，技能列表卡片化并带分类彩色徽标。
- 技能开关一元化：模型与人类双轴合并为单一开关，开启时原子移出 `disabledSkills` 并清空隐藏名单，关闭时原子写入，单次 3-ops 批处理提交。
- 新增 Cloudflare MCP 工具总控开关 `mcpEnabled`：关闭时无论 `preset` 还是 `global` 模式，全系统所有会话统一触发 `tools.restrict` 并挂载运行期 `tools.guard` 拦截；配置自愈引擎支持 `mcpEnabled` 容错解析、坏损 YAML 恢复与持久化回写。

### Changed

- 运行模式默认值从 `global` 调整为 `preset`，默认对非专属会话实施特权工具与技能隔离。

### Fixed

- 客户端导出补齐 `inject: ['slots', 'locale']`，修复全新实例在服务未完全就绪时触发未定义异常的问题。

## [0.11.1] - 2026-10-10

### Changed

- 主 README 重构为全英文档，排版与五联徽章体系对齐 `dsh-superpower`。
- 中文说明书保留为 `README.zh.md`，并注册进 `package.json` 的 `files` 白名单，避免发布后多语言跳转链接 404。
- `.gitignore` 收录 `.superpower/` 目录，消除任务草稿文件被 Git 跟踪的风险。

### Fixed

- 修复重推同名 tag 触发 npm E403 的问题，版本晋升为 0.11.1。

## [0.11.0] - 2026-10-10

### Added

- 支持通过设置面板与配置切换运行模式 `loadMode`：`global` 模式下 Cloudflare MCP 三工具与 14 个技能全局可用；`preset` 模式向宿主注册 `cfbridge` 智能体预设，继承标准模式 19 个基础插件，预置操作规范与安全审批提示词，通过作用域隔离与 `tools.restrict` 屏蔽非 cfbridge 模式会话的工具与技能；切换模式自动注册或注销预设，完全可逆。
- Provider 优先级权重默认值提升为全系统最高 `rank: 0`，在项目级、内置级等所有层级中优先胜出。
- 新增配置自动自愈与坏损 YAML 提取重生成引擎 `src/config-healer.ts`、`scripts/repair-config.js`：支持断电截断、语法畸变与 Tab 混用场景的两阶段启发式提取，重生成前自动创建带时间戳的备份，提供 `npm run repair:config` CLI 排障工具，支持 `--file`、`--profile` 与 `--dry-run` 参数，运行时 `apply()` 自动执行配置清洗并回写持久层。

### Changed

- 浏览器半侧提取 `PanelController` 深模块：引入同步栈 `_busy` 防重锁，修复快速连击携带相同 `revision` 引发的乐观锁版本撕裂；两个隐藏字段与 `disabledSkills` 平铺为单次 `form.mutate` 的 3 项 ops 原子提交；面板组件代码量减少 40% 以上。
- 核心运行时删除 28 行未被引用的孤儿死代码，解构出 `installSkillRuntime`、`installSkillsWatcher`、`installPresetMode`、`installToolGuard` 四个同构安装器，收敛 `apply()` 编排复杂度；`SkillRuntime.listNames` 补齐取消信号透传。

## [0.10.2] - 2026-10-04

### Fixed

- 移除 `skills/cfbridge/SKILL.md` 中残留的 `/cfbridge` 斜杠命令指引，该命令已在 0.10.0 移除，文档会教模型调用不存在的命令。
- 清理 `src/cfbridge.ts` 移除命令后残留的四条过时注释，仅注释改动，无行为变化。

### Changed

- README 验证节删除会随门禁断言数漂移的过期计数，维护节修正为七个行为测试文件的实况。

## [0.10.1] - 2026-10-04

### Fixed

- 修复技能开关的投影缺陷：`disabledSkills` 的语义是「模型与人类都关」，原实现把它当成独立字段参与合成，在历史落盘形态下只打开一个开关会连带打开另一轴。改为先由 `disabledSkills` 还原两轴真实开合状态，只翻转被点击的轴，再按「两轴都关则升级为 `disabledSkills`、否则用对应 hidden 名单」重新合成。
- 修复 `wrangler.js` 在无 `CLOUDFLARE_API_TOKEN` 时拦截所有命令的问题，改为只对需要访问 Cloudflare 的命令要求 Token，并按首个位置参数判定。

### Changed

- CI 与 Release 统一调用 `npm test` 作为唯一验证入口，保留 `npm ci`、`npm pack --dry-run` 与 Release 的 tag 版本校验，移除被 `|| echo` 吞掉失败的无凭据 Wrangler 步骤。
- 抽出 `scripts/lib/skill-metadata.js`，供 `validate-bundle.js` 与测试共用同一份 SKILL.md 索引元数据判定，并修正该判定对注释块与 BOM 位置的校验过严的问题，修复本地与 Linux 检出两种行尾下行为分裂。
- `MutableSkillProvider` 的四个名单方法与 `SkillRuntime.current()` 无仓内调用者，但属已发布类型，删除是破坏性变更，保留行为，只更新过时注释。

## [0.10.0] - 2026-10-04

### Added

- 插件配置面板的每个技能行显示一句人类可读的简介，中英文界面分别取对应语言，未登记简介的技能回退显示目录名；简介表在客户端维护，不参与技能发现。
- 插件图标替换为以 Cloudflare 官方 Logo 为参考图生成的 512×512 PNG，延续官方视觉血统并用桥的负形做出自身身份。

### Removed

- 移除 `/cfbridge` 斜杠命令及客户端面板中的 `slashHint` 提示文案，技能开关只剩面板一条路径，语义单一。

### Changed

- CLAUDE.md 由 243 行压至 125 行：发布记录由四节流水改为版本表，过程叙述收敛为契约与判据，新增「已知边界与明确不做的事」一节。

## [0.9.0] - 2026-10-04

### Fixed

- 修复 `SkillRow` 的 `busy` 参数与字符串比较恒为假的问题，保存中的开关此前不会被禁用、可被重复点击，改为直接使用 `busy` 布尔值。
- 修复 `src/client.entry.ts` 完全不被类型检查的问题：新增 `tsconfig.client.json` 与 `src/client.deps.d.ts`，按实际用到的面声明 react 与 ui-primitives 的最小类型。

### Changed

- 技能开关投影规则收敛为泛型纯函数 `projectInvocation`，`list()` 与 `get()` 共用同一规则。
- `createProviderForTest` 的 8 个位置参数改为具名选项对象 `createSkillProvider`。
- `apply()` 拆解为 `SkillRuntime` 接缝封装与 `installSkillRuntime`、`installSkillsWatcher`、`installCommand`、`publishSkillCatalog` 四个独立安装函数，各自返回清理函数，`apply` 缩为约 40 行装配层，行为不变。
- `migrate-from-preset.js` 自带的 `listFiles` 改用共享的 `collectFiles`。

## [0.8.0] - 2026-10-03

### Added

- 插件页新增 Cloudflare 桥接配置面板，每个技能有「模型可调用」与「人类可调用」两个独立开关，两个都关等于完全关闭。
- 新增三个可写字段 `modelHiddenSkills`、`userHiddenSkills` 与 `disabledSkills`，彼此独立、可组合。
- `/cfbridge` 斜杠命令扩展 `hide-model`、`show-model`、`hide-user`、`show-user`，便于命令行临时调试。

### Fixed

- 确认插件需要被加入 profile 的 `dsh.profile.bundles` 才会装载，否则补丁层从不加载、表现为无工具无技能；官方 `dsh plugin add` 会自动写入该项。

### Removed

- 删除自建的跨端 Remote 控制层约 300 行，宿主原生通道已完整覆盖其能力。

### Changed

- README 新增「在插件页开关」「用斜杠命令开关」两节；CLAUDE.md 新增记录双面插件硬约束与静默失效陷阱的一节。

## [0.7.0] - 2026-10-02

### Added

- 开发模式技能热刷新 `watchSkills`：新增或删除技能目录、编辑 SKILL.md 均去抖广播 `skills/change`，技能列表感知新描述。

### Fixed

- 保留名 `providerName="runtime"` 在 apply 层直接拒绝，不再进入注册阶段。

### Changed

- `install-bundle` 安装时清理旧 legacy skill 软链，`uninstall-bundle` 幂等移除安装层与链接。

## [0.6.0] - 2026-10-02

### Added

- 基于 mtime 的高性能候选技能元数据内存缓存，避免重复文件 IO 与 YAML 解析开销。
- 配置模型扩展：自定义 Provider 优先级 `rank` 默认 550、缓存开关 `cache` 默认 true、开发态文件热监听 `watchSkills` 默认 false。
- 可逆的技能目录文件变动监听，开发模式下修改技能自动去抖广播 `skills/change`，插件卸载时安全释放句柄。

### Changed

- 更新测试套件与 Bundle 静态校验，支持离线无 token 场景优雅跳过。

## [0.5.0] - 2026-08-23

### Added

- 改用 TypeScript SkillProvider，14 个技能按需读取并支持 vendored 注释前导。

### Fixed

- Bundle patch 通过 `@wenaixi/cfbridge` 包名挂载，插件面板可解析版本号。

### Changed

- 声明 `yaml` 运行时依赖，提交 `lib/` 构建产物，并增加独立 demo profile。

## [0.3.2] - 2026-08-26

### Fixed

- `release.yml` 的 Release Notes 提取正则现在兼容 `## [x.y.z]` 与 `## x.y.z` 两种标题风格，旧正则会错误 fallback 到 tag message。
- README 移除指向本地 CLAUDE.md 的 404 链接；`deprecated/preset/README.md` 的历史 Skill 发现方式修正为运行时注册。

### Changed

- 删除 `package.json` 中指向不存在脚本的 `gen:wrappers` 与 `verify:wrappers`；cfbridge SKILL.md 仓库链接修正。
- 13 个 vendored SKILL.md 快照头部与 sync 脚本模板追加 references 仅在线可用声明。

## [0.3.1] - 2026-08-23

### Changed

- cfbridge 路由节精简为单一 cloudflare 总入口，其余由 cloudflare 指引，保留薄桥主体与 13 个 vendored skills 离线文件；README 同款精简，形态说明保留。
- `package.json` 版本升至 0.3.1，validate 校验适配 slim 入口。

## [0.3.0] - 2026-08-23

### Added

- Vendoring 13 个 cloudflare/skills 官方 SKILL.md 原样入包，离线可用；`scripts/sync-vendor-skills.js` 幂等同步，含来源注释与 front-matter 校验。

### Changed

- 历史版本曾新增 13 个运行时薄包装，现已由 0.5.0 的单一 TypeScript SkillProvider 取代。
- `cordis.patch.yml` 曾扩至 14 行，现收敛为单一 `cfbridge` Provider 行。
- README 新增「形态说明」一节，含 skill 两段式加载真相。
- `package.json` 版本 0.2.0 升至 0.3.0，新增 npm scripts `sync:vendor` 与 `verify:wrappers`。

## [0.2.0] - 2026-08-23

### Added

- 新增官方 13 Skills 轻量路由指引，含安装、决策树与路由表。

### Changed

- README 同步镜像路由表，版本徽记与文字更新至 0.2.0。
- 保留 ponytail 全量 Vendoring 评估注释，仅在「内网离线必须可用」时再启用。

## [0.1.2] - 2026-08-18

### Added

- 首个公开发布：DSH Bundle 形态，运行时 Skill，全局可见 `mcp__cloudflare__docs`、`search`、`execute` 三工具。