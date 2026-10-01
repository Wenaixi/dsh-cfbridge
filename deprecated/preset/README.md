# deprecated/preset/

> 归档原因：cfbridge 自 v0.3.0 起改用 DSH Bundle 形态分发，所有会话全局可见 Cloudflare 三工具与 Skill，无需再选择「Cloudflare 模式」。
> 旧文件保留是为了让仍在使用 v0.2.x 的用户能够 `git checkout v0.2.0` 直接回滚到旧形态。

## 包含的文件

- `preset.yml` — DSH Agent Preset 元数据（旧模式选择器显示用）。
- `agent.cordis.yml` — Agent Preset 的完整 cordis 组合（persona、工具、Skill、MCP）。

## 与 v0.3.0 的差异

| 维度 | v0.2.0（本目录） | v0.3.0 |
| --- | --- | --- |
| 分发形态 | Agent Preset | DSH Bundle |
| 可见性 | 仅「Cloudflare 模式」会话 | 所有会话全局 |
| 安装位置 | `~/.dsh/.agent-presets/cfbridge/` | `~/.dsh/profiles/<name>/node_modules/@wenaixi/cfbridge/` |
| 加载入口 | `dsh-agent-presets` picker | `dsh.profile.bundles` 层 |
| Skill 发现 | preset 层 `skill-filesystem` | 运行时注册（`ctx.skills.register`） |
| 启停方式 | 切换 preset | `dsh plugin add/remove` 或 disabled 覆写 |

## 回滚路径

需要临时回到旧形态：

1. 回到 git v0.2.0 标签：`git checkout v0.2.0`。
2. 手动恢复 preset 目录（该版本未注册 `install:preset` 命令，仓库中仅有的三个
   preset 脚本是打印指引后以非零码退出的 deprecated shim，不会写入任何文件）：
   把本目录的 `preset.yml`、`agent.cordis.yml` 与 `skills/` 复制到
   `~/.dsh/.agent-presets/cfbridge/`。
3. 重启 DSH，在新会话选择器中选「Cloudflare 模式」。

> 注意：`npm run install:preset` 在任何已发布版本（含 v0.2.0）中都未注册，
> 按旧文档执行会直接报 "missing script"。当前 v0.6.0 仓库里的
> `scripts/install-preset.js` 是引导到 `npm run install:bundle` 的软 404 指引。

> 不建议在 v0.3.0 之后继续维护本目录；如需保留更长时间，请开一个 issue 说明用例。
