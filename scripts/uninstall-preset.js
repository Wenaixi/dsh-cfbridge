// 卸载 cfbridge Agent Preset。
// 仅删除 %USERPROFILE%\.dsh\.agent-presets\cfbridge\ 目录，
// 不影响用户的 cordis.patch.yml、.env 或其他 DSH 配置。
//
// 使用：npm run uninstall:preset

const fs = require('fs')
const path = require('path')

const DSH_HOME = process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh')
const TARGET = path.join(DSH_HOME, '.agent-presets', 'cfbridge')

function log(level, msg) {
  const prefix = { info: 'INFO', ok: 'OK  ', warn: 'WARN', err: 'ERR ' }[level] || 'INFO'
  console.log(`[${prefix}] ${msg}`)
}

function main() {
  if (!fs.existsSync(TARGET)) {
    log('warn', `Not installed at ${TARGET}`)
    process.exit(0)
  }

  log('info', `Removing: ${TARGET}`)
  fs.rmSync(TARGET, { recursive: true, force: true })
  log('ok', 'Uninstalled. Restart DSH to drop the preset from the picker.')
}

try {
  main()
} catch (error) {
  log('err', error.message)
  process.exit(1)
}