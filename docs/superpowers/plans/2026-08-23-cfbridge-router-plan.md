# cfbridge 0.2.0 官方 Skills 路由历史实施计划

> 状态：历史方案记录。当前实现以 0.5.0 单一 TypeScript SkillProvider 为准。

## 历史目标

- 为 cfbridge 增加 cloudflare/skills 官方 13 个技能的轻量路由指引。
- 当时只更新 cfbridge Skill 与 README，不随包复制官方技能正文。

## 当前架构对照

- 历史方案只维护一个 cfbridge 路由入口，并未新增独立技能注册。
- 0.5.0 已将 13 个官方快照随包提供，由 src/cfbridge.ts 统一发现 14 个技能。
- 当前 Bundle patch 只保留 mcp-cloudflare 与 cfbridge 两行，不再依赖路由专用的多行 patch。

## 历史交付记录

- 工程基座、路由指引、README 镜像、版本更新与校验脚本均已完成。
- 历史版本的校验与 tag 操作未执行 push。
- 旧版文档中的 token 成本和联网假设只适用于当时的轻量路由方案，不作为当前 Bundle 行为承诺。

## 迁移结论

- 不恢复旧路由专用 patch 或独立 wrapper。
- 修改当前 Provider 或技能文件后，运行 npm run build、npm run typecheck、npm run test 与 npm pack --dry-run。
- 仅使用临时 DSH_HOME 做安装验证，不写入现有 web profile。
