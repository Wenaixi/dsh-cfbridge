// 一键卸载 cfbridge v0.5.0 Bundle。
//
// 流程：
// 1. 调用 `dsh plugin --profile <name> remove @wenaixi/cfbridge`，DSH 会
//    自动从 dsh.profile.bundles 移除本层并清理 node_modules。
// 2. 清理旧版本残留的软链 $DSH_HOME/skills/cfbridge/（若存在）。
// 3. 调 `dsh --profile <name> --dump-config` 验证层不再出现 cfbridge。
// 4. 提示旧 preset 残留的可选清理。
//
// 使用：
//   npm run uninstall:bundle
//   npm run uninstall:bundle -- --profile tui

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const DSH_HOME = process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh')
const SKILL_LINK = path.join(DSH_HOME, 'skills', 'cfbridge')
const LEGACY_PRESET = path.join(DSH_HOME, '.agent-presets', 'cfbridge')

function log(level, msg) {
  const prefix = { info: 'INFO', ok: 'OK  ', warn: 'WARN', err: 'ERR ' }[level] || 'INFO'
  console.log(`[${prefix}] ${msg}`)
}

function parseArgs(argv) {
  const opts = { profile: 'web', yes: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--profile' || a === '-p') opts.profile = argv[++i]
    else if (a.startsWith('--profile=')) opts.profile = a.slice('--profile='.length)
    else if (a === '--yes' || a === '-y') opts.yes = true
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0) }
    else log('warn', `Unknown argument ignored: ${a}`)
  }
  return opts
}

function printHelp() {
  console.log(`Usage: uninstall-bundle.js [--profile <name>] [--yes]

Options:
  --profile <name>   Target DSH profile (default: web).
  --yes, -y          Skip interactive confirmation (default: prompt unless --yes).
  --help, -h         Show this message.`)
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts })
}

function runCapture(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: 'pipe', shell: process.platform === 'win32', ...opts })
}

function removeSkillLink() {
  try {
    const stat = fs.lstatSync(SKILL_LINK)
    if (!stat.isSymbolicLink() && !stat.isDirectory()) return
    fs.rmSync(SKILL_LINK, { recursive: true, force: true })
    log('ok', `Removed skill link (legacy): ${SKILL_LINK}`)
  } catch (e) {
    if (e.code === 'ENOENT') log('info', `No skill link at ${SKILL_LINK}; nothing to remove.`)
    else log('warn', `Failed to remove ${SKILL_LINK}: ${e.message}`)
  }
}

function dumpConfig(profile) {
  log('info', `Verifying composed config for profile "${profile}"…`)
  const r = runCapture('dsh', ['--profile', profile, '--dump-config'])
  const out = String(r.stdout || '')
  if (r.status !== 0) {
    log('warn', `dsh --dump-config exited with ${r.status}; skipping verification.`)
    return
  }
  if (/==\s*@wenaixi\/cfbridge\b/.test(out)) {
    log('err', 'cfbridge layer is still present after remove. Inspect the dump above.')
    process.exit(1)
  }
  log('ok', 'cfbridge layer absent from composed profile tree.')
}

function confirm(question) {
  if (process.env.CI === 'true' || process.env.NONINTERACTIVE === 'true') return true
  return new Promise((resolve) => {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout })
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close()
      resolve(/^y(es)?$/i.test(String(answer).trim()))
    })
  })
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  log('info', `Source bundle: ${ROOT} (${PKG.name}@${PKG.version})`)
  log('info', `Target profile: ${opts.profile}`)

  if (!opts.yes) {
    const ok = await confirm(`Uninstall ${PKG.name} from profile "${opts.profile}"?`)
    if (!ok) {
      log('info', 'Aborted by user.')
      process.exit(0)
    }
  }

  log('info', `Running: dsh plugin --profile ${opts.profile} remove ${PKG.name}`)
  const r = run('dsh', ['plugin', '--profile', opts.profile, 'remove', PKG.name])
  if (r.status !== 0) {
    log('err', `dsh plugin remove failed (exit ${r.status}).`)
    process.exit(r.status ?? 1)
  }

  removeSkillLink()
  dumpConfig(opts.profile)

  if (fs.existsSync(LEGACY_PRESET)) {
    log('warn', `Legacy preset still exists at ${LEGACY_PRESET}.`)
    log('info', 'Run `npm run migrate:from-preset` to remove it.')
  }

  log('ok', 'Uninstall complete. Restart DSH to drop tools and skill from running sessions.')
}

main().catch((e) => {
  log('err', e.stack || e.message)
  process.exit(1)
})
