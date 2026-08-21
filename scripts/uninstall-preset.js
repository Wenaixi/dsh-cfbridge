// cfbridge v0.3.0 起 bundle 形态取代 agent preset。
// 旧的 ~/.dsh/.agent-presets/cfbridge/ 目录不再被 DSH 加载，
// 如需彻底清理请改用 `npm run migrate:from-preset`（带 --yes 才真删）。
//
// 本 shim 仅打印警告并退出非零，避免误以为已卸载干净。

const log = (msg) => console.log(`[WARN] ${msg}`)
log('uninstall:preset is deprecated since v0.3.0 (cfbridge is now a DSH bundle).')
log('The legacy preset directory is no longer loaded by DSH, but it may still exist on disk.')
log('Use `npm run migrate:from-preset -- --yes` to remove it.')
process.exit(1)
