## Unreleased
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