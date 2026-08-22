# cfbridge 官方 Skills 路由设计（Design）

> 日期: 2026-08-23  
> 决策: 轻量路由指引（不 Vendoring）
> 上下文: https://github.com/cloudflare/skills/tree/main/skills 共 13 个 Skill，用户要求 cfbridge \"只要指引去 cloudflare 就行\"，一切依最佳决策。

## 1. 背景
cfbridge 当前是 DSH Bundle，暴露 \mcp__cloudflare__docs/search/execute\ 三工具 + \skills/cfbridge/SKILL.md\ 操作指南。cloudflare/skills 官方提供 13 个按需加载的 SKILL.md，分别覆盖平台选型、Wrangler、Agents SDK、Durable Objects、Cloudflare One、Email、Sandbox 三件套、Turnstile、Web Perf、Workers 最佳实践等。

用户诉求：把官方 Skills 的能力\"封装进\" cfbridge，但不重复造轮子——cfbridge 保持薄桥定位，只做路由与指引。

## 2. 方案对比

| 方案 | 做法 | Token 代价 | 维护代价 | 离线 |
|------|------|-----------|---------|------|
| A 轻量路由（采纳） | SKILL.md 增一节路由表，仅收录 name/description/何时用/如何装，链接回官方仓库与 docs | 描述文本 ~500 tokens，路由表 ~1500 tokens，总计 <2.5k | 零：官方更新自动生效 | 需联网 |
| B 全量 Vendoring | 把 13 个 SKILL.md 原样拷入 \skills/cloudflare-xxx/\ 并在 cordis.patch.yml 注册 13 个 skill | 全量 ~152k chars ≈ 38k tokens（按 4 chars/token） | 每次官方更新需同步，易漂移 | 离线可读 |

结论：选 A。38k → 2k 节省 ~95% 上下文，且符合 \"检索优于记忆\" 原则。B 仅在用户反馈内网离线强需求时再考虑，需在 SKILL.md 以 \ponytail:\ 标注升级路径。

## 3. 13 Skills 通俗功能表（写入路由表的素材）

| # | Skill | 俗话一句话 |
|---|-------|-----------|
| 1 | cloudflare | 总入口/平台选型：教你\"存数据选 KV 还是 D1 还是 R2、跑代码选 Workers 还是 Pages\"的决策树，整合 30+ 产品引用 |
| 2 | wrangler | 本地 CLI 手册：\wrangler dev/deploy/types\、\wrangler.jsonc\ 配置、KV/R2/D1/Queues 等子命令的正确写法 |
| 3 | agents-sdk | 有状态 AI Agent 框架：基于 Durable Objects 的 Agent 类、setState/callable/schedule/workflow、React hooks |
| 4 | durable-objects | 有状态协调原语：聊天室/游戏房间/预约系统、SQLite 存储、alarm、WebSocket、RPC |
| 5 | cloudflare-one | 零信任/SASE 中控：Access/Gateway/WARP/Tunnel/WAN/DLP/CASB 的架构与排障清单 |
| 6 | cloudflare-one-migrations | 迁移顾问：Zscaler/Palo Alto/旧 VPN 到 Cloudflare One 的盘点、映射、灰度方案 |
| 7 | cloudflare-email-service | 收发邮件：Workers \send_email\ 绑定、REST API、Email Routing、Agents SDK 邮件、SPF/DKIM |
| 8 | sandbox-next | 沙箱 SDK 预览版（@next）：argv 句柄模型、exec/output/waitForPort、terminal/mount/tunnel |
| 9 | sandbox-stable | 沙箱 SDK 稳定版：字符串 exec、session、terminal(request)、生产注意 |
| 10 | sandbox-migrate-to-next | 沙箱升级向导：stable → @next 的替换表、审计 rg、cutover 注意 |
| 11 | turnstile-spin | 人机验证向导：Turnstile widget 创建、前端埋点、后端 siteverify、端到端校验脚本 |
| 12 | web-perf | 网页性能审计：基于 Chrome DevTools MCP 的 LCP/CLS/TBT 链路分析与优化建议 |
| 13 | workers-best-practices | Workers 代码审查：兼容日期、nodejs_compat、streaming/waitUntil、bindings、secrets 等红线 |

注：官方 README 另有 \cloudflare\ 下的 references 子目录与两个 Commands（build-agent/build-mcp），路由表需指向而非复刻。

## 4. 设计要点
- 单文件职责：仅改 \skills/cfbridge/SKILL.md\（主）与 \README.md\（镜像），不改 \cordis.patch.yml\ 的 skill 注册数（仍为 1 个 cfbridge-skill），不新增 bundle 层。
- 检索优于记忆：SKILL.md 顶部保留 \"优先检索\" 声明，路由表每行给官方 SKILL.md 原始链接与 docs 检索方式。
- 安装指引：复用官方多种安装路径（Claude Code marketplace / Cursor / npx skills / Clone），说明与 cfbridge 互补关系：cfbridge 负责 MCP 执行，官方 Skills 负责领域知识。
- 决策树：何时只用 cfbridge 三工具 vs 何时先加载官方 Skill 再 search→execute。
- 版本：package.json 0.1.2 → 0.2.0（feat），CHANGELOG 追加。
- 校验：\scripts/validate-bundle.js\ 与 \scripts/check.js\ 扩展对路由表完整性的可选检查（不阻断）。

## 5. 非目标
- 不拷贝官方 SKILL.md 全文，不注册 13 个 DSH skill，不引入新的 MCP server。
- 不在 patch 中声明 persona/agent-instructions 等 host 已有层。

## 6. 风险与回滚
- 风险：用户误以为装 cfbridge 即装了 13 Skills。缓解：路由表首句明确\"按需另装\"。
- 回滚：单文件回退 SKILL.md 即可，无数据迁移。
