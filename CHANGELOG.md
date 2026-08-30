# Changelog

## 0.4.0 — 2026-08-27
- feat(bundle): 14 个独立 Skill 包装器（src/*-skill.js）合并为单一入口 src/skills-bundle.js；cordis.patch.yml 由 15 行缩为 2 行（mcp-cloudflare + skills-bundle）
- feat(ux): DSH 插件面板不再显示 14 个 @wenaixi/cfbridge/src/*-skill.js 条目，收束为 1 行 @wenaixi/cfbridge/src/skills-bundle.js；行为不变（14 个 Skill 全部照常注册）
- refactor: 删除 src/ 下 14 个旧包装器；validate-bundle.js / check.js / install-bundle.js 断言同步改为 skills-bundle 入口与「恰 2 行 patch」校验
- docs: README 安装验证段与形态说明同步 v0.4.0 两行描述

## 0.3.2 — 2026-08-26
- fix(ci): release.yml 的 Release Notes 提取正则改为兼容 "## [x.y.z]" 与 "## x.y.z" 两种标题风格（旧正则永远 fallback 到 tag message）
- fix(docs): README 移除指向本地 CLAUDE.md 的 404 链接；deprecated/preset/README.md 的 v0.3.0 Skill 发现方式修正为运行时注册
- chore: 删除 package.json 中指向不存在脚本的 gen:wrappers / verify:wrappers；cfbridge SKILL.md 仓库链接修正
- feat(vendor): 13 个 vendored SKILL.md 快照头部与 sync 脚本模板追加 references 仅在线可用声明

## 0.3.1 — 2026-08-23
- docs(skill): 精简 cfbridge 路由节为单一 cloudflare 总入口（其余由 cloudflare 指引），保留薄桥主体与 13 vendored skills 离线文件；README 同款精简，形态说明保留
- chore: package.json 0.3.0 -> 0.3.1，validate 校验适配 slim 入口

## 0.3.0 — 2026-08-23
- feat(vendor): Vendoring 13 个 cloudflare/skills 官方 SKILL.md 原样入包，离线可用；`scripts/sync-vendor-skills.js` 幂等同步（来源注释 + front-matter 校验）
- feat(skill): 新增 13 个运行时薄包装 `src/<name>-skill.js`（复用 cfbridge-skill.js 的 ctx.skills.register 模式），与主 cfbridge 共 14 个 skill；索引仅 1.7k tok，全文按需单篇加载
- feat(bundle): `cordis.patch.yml` 由 1 行 cfbridge-skill 扩至 14 行（+13），包体积 +~400KB（152k chars）
- docs: README 新增"形态说明：Bundle / Preset / 动态插件"一节，含 skill 两段式加载真相
- chore: package.json 0.2.0 -> 0.3.0，新增 npm scripts `sync:vendor` / `verify:wrappers`

## 0.2.0 — 2026-08-23
- feat(skill): 新增官方 13 Skills 轻量路由指引（不 Vendoring），含安装、决策树与路由表；检索优于记忆（cloudflare/skills）
- docs: README 同步镜像路由表，版本徽记与文字更新至 0.2.0
- chore: 保留 ponytail 全量 Vendoring 评估注释，仅在"内网离线必须可用"时再启用

## 0.1.2 — 2026-08-18
- 首个公开发布；DSH Bundle 形态，运行时 Skill，全局可见（mcp__cloudflare__docs/search/execute 三工具）