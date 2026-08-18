# cfbridge

> Cloudflare 官方 Code Mode MCP 在 DeepSeek Harness（DSH）中的轻量桥接插件。

[![版本](https://img.shields.io/badge/version-0.2.0-2563eb)](./package.json)
[![许可](https://img.shields.io/badge/license-MIT-16a34a)](./LICENSE)

`cfbridge` 是一个 **DSH Agent Preset**，按需加载到 DSH 中，提供 Cloudflare 官方托管 MCP（`https://mcp.cloudflare.com/mcp`）的三工具（docs / search / execute）以及配套 Skill 和 Wrangler CLI 封装。

## 它是什么

```text
DSH Agent Preset（按需加载）
  └─ 选「Cloudflare 模式」后会话挂载
       ├─ mcp__cloudflare__docs     ← Cloudflare 文档语义搜索
       ├─ mcp__cloudflare__search   ← OpenAPI 端点检索
       ├─ mcp__cloudflare__execute  ← 官方隔离 sandbox 内执行
       ├─ cfbridge Skill            ← MCP 最佳实践、写操作审批规范
       └─ npm run wrangler ...      ← 项目本地 Wrangler CLI 透传
```

## 它不是什么

- **不是全局修改 web profile** —— 仅当你选择「Cloudflare 模式」时挂载，其它会话不受影响
- **不是动态 Cordis 插件** —— 走 DSH 原生的 Agent Preset 路径，不依赖 `cordis_define` 的运行时传输
- **不复制 Cloudflare API 端点列表** —— 直接使用官方 Code Mode MCP，永远是最新的

## 安装

### 前提

- DSH 已安装并可启动（`dsh --profile web`）
- 已生成 Cloudflare API token
  - 推荐 account token（`cfat_`），需带 `Account Resources: Read`
  - 需要 DNS 时单独创建带 `Zone:DNS` 权限的用户 token（`cfut_`）

### 1. 安装 token

把 token 写入 DSH 的私有环境文件：

```dotenv
# C:\Users\Administrator\.dsh\.env（私有，git 忽略）
CLOUDFLARE_API_TOKEN=请替换为你的token
```

### 2. 安装 preset

```powershell
git clone https://github.com/Wenaixi/cfbridge
cd cfbridge
npm install
npm run install:preset
```

`install:preset` 会把 preset.yml / agent.cordis.yml / skills/ 复制到
`%USERPROFILE%\.dsh\.agent-presets\cfbridge\`，**不会**修改你的 `cordis.patch.yml`。

### 3. 重启 DSH 后选「Cloudflare 模式」

```powershell
dsh --profile web
```

在新会话屏幕的 preset 选择器中选「Cloudflare 模式」。当前会话即可调用 Cloudflare 三工具；其它会话不受影响。

## 验证

```powershell
# 仓库配置 + 安全检查（30 项）
npm run check

# Agent Preset 结构验证（11 项）
npm run validate:preset

# Wrangler CLI 只读验证（4 项）
npm run test:wrangler

# 跑全部
npm run test
```

## 已验证能力

| 层级 | 内容 |
| --- | --- |
| DSH MCP | docs / search / execute 三工具，账号/Zone/Workers/KV/D1/Pages/GraphQL 只读调用 |
| 本地 Wrangler | 版本、whoami、D1 列表、Worker 部署列表、Pages 项目列表 |
| 安全 | 追踪文件与历史均无 token；无 remote；`.env` 与证书被忽略 |

## 卸载

```powershell
npm run uninstall:preset
```

仅删除 `%USERPROFILE%\.dsh\.agent-presets\cfbridge\`，其它 DSH 配置不受影响。

## 安全规则

1. token 仅放在被忽略的 `%USERPROFILE%\.dsh\.env`，通过 `!!js process.env...` 引用
2. 不写入 `agent.cordis.yml`、脚本、commit 或 issue
3. 使用最小权限 token；DNS 单独用 Zone 范围的用户 token
4. 不再使用或泄漏时立即在 Cloudflare Dashboard 撤销

## 版本与维护

- 当前版本：**v0.2.0**（重构为 Agent Preset + Skill）
- 作者：**Wenaixi**
- 许可证：MIT
- 决策与历史记录见 [`CLAUDE.md`](./CLAUDE.md)
- 相关链接：[Cloudflare MCP](https://github.com/cloudflare/mcp) · [Wrangler 文档](https://developers.cloudflare.com/workers/wrangler/) · [DSH Agent Preset 文档](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/preset)