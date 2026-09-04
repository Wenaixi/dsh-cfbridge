# cfbridge 官方 Skills 路由历史设计

> 状态：历史 0.2.0 方案记录。当前实现以 0.5.0 单一 TypeScript SkillProvider 为准。

## 历史背景

cfbridge 最初提供 Cloudflare Code Mode MCP 的 docs、search、execute 三工具与一个操作指南。用户希望官方 Cloudflare Skills 能被正确引导，但不希望重复维护领域知识，因此当时选择在 Skill 中加入轻量路由表。

## 历史方案对比

| 方案 | 做法 | 上下文成本 | 维护成本 | 离线 |
|------|------|------------|----------|------|
| 轻量路由 | 在 cfbridge Skill 中记录官方技能名称、用途、安装方式与链接 | 低 | 官方内容自动更新 | 需要联网 |
| 全量 Vendoring | 将官方 SKILL.md 快照复制到包中 | 高 | 需要同步快照 | 可离线阅读 |

## 当前架构对照

- 历史轻量路由只修改 skills/cfbridge/SKILL.md 与 README.md，不新增独立 patch 行。
- 当前 0.5.0 将 13 个官方快照随包提供，与 cfbridge 主技能共 14 个技能。
- 当前由 src/cfbridge.ts 统一扫描技能目录；Bundle patch 只保留 mcp-cloudflare 与 cfbridge 两行。

## 设计原则

- 检索优于记忆：涉及 Cloudflare API 时优先使用官方文档与 MCP 检索。
- cfbridge 负责 MCP 执行边界和审批规则；官方技能负责产品领域知识。
- 不在 patch 中重复声明 host 已有的 persona、agent-instructions 或 tool-fs 层。
- 需要回滚历史路由文档时可单文件恢复；回滚当前 Provider 则必须同步恢复源码、构建产物和 Bundle patch。
