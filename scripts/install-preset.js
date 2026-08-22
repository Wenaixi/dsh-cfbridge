// cfbridge v0.3.0 起 bundle 形态取代 agent preset。
// 本脚本保留为 deprecated shim，仅打印警告并退出非零以引导用户走新路径。
//
// 旧形态：
//   复制 preset.yml / agent.cordis.yml / skills/ 到 ~/.dsh/.agent-presets/cfbridge/
//   之后在 DSH 新会话选择器中选「Cloudflare 模式」才能挂载。
//
// 新形态（v0.3.0，推荐）：
//   npm run install:bundle
//   装完所有会话全局可见；不需要选模式。
//
// 仍想暂时使用旧 preset 形态？请直接从 git history 拉取 v0.2.0 标签并按其 README 操作。

const log = (msg) => console.log(`[WARN] ${msg}`)
log('install:preset is deprecated since v0.3.0 (cfbridge is now a DSH bundle).')
log('Use `npm run install:bundle` to install globally for the web profile.')
log('For other profiles: `npm run install:bundle -- --profile <name>`.')
log('This shim does not modify your DSH profile.')
process.exit(1)
