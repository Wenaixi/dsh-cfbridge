// cfbridge v0.5.0 以单一 Provider Bundle 取代历史 agent preset。
// 本脚本保留为 deprecated shim，仅打印警告并退出非零以引导用户走新路径。
//
// 旧形态：
//   复制 preset.yml / agent.cordis.yml / skills/ 到 ~/.dsh/.agent-presets/cfbridge/
//   之后在 DSH 新会话选择器中选「Cloudflare 模式」才能挂载。
//
// 新形态（v0.5.0，推荐）：
//   npm run install:bundle
//   装完所有会话全局可见；不需要选模式。
//
// 旧 preset 仅用于历史迁移，不应与当前 Bundle 并行启用。

const log = (msg) => console.log(`[WARN] ${msg}`)
log('install:preset is deprecated since v0.5.0 (cfbridge is now a single-provider DSH bundle).')
log('Use `npm run install:bundle` to install globally for the web profile.')
log('For other profiles: `npm run install:bundle -- --profile <name>`.')
log('This shim does not modify your DSH profile.')
process.exit(1)
