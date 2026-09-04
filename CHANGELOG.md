# Changelog

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