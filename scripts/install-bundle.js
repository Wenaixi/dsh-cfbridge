// 一键安装 cfbridge v0.3.0 Bundle 到指定 DSH profile。
//
// 流程：
// 1. 解析参数（默认 profile=web，可通过 --profile <name> 覆盖）。
// 2. 校验本机有 dsh 与 pnpm。
// 3. 调用 `dsh plugin --profile <name> add <绝对路径>`：DSH plugin 转发器
//    自动 reconcile dsh.profile.bundles，把本 bundle append 到末尾。
// 4. 跑 `dsh --profile <name> --dump-config` 验证层出现
//    `# == @wenaixi/cfbridge` 且含 mcp-cloudflare / skills-bundle 两行。
// 5. 若发现旧软链 $DSH_HOME/skills/cfbridge 指向本 bundle 的 skills 目录，
//    清理之（v0.3.0 之前版本残留；当前版本已改用运行时 Skill 注册）。
//
// 使用：
//   npm run install:bundle                # 默认 web profile
//   npm run install:bundle -- --profile tui

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const DSH_HOME = process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh')

function log(level, msg) {
  const prefix = { info: 'INFO', ok: 'OK  ', warn: 'WARN', err: 'ERR ' }[level] || 'INFO'
  console.log(`[${prefix}] ${msg}`)
}

function parseArgs(argv) {
  const opts = { profile: 'web' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--profile' || a === '-p') {
      opts.profile = argv[++i]
    } else if (a.startsWith('--profile=')) {
      opts.profile = a.slice('--profile='.length)
    } else if (a === '--help' || a === '-h') {
      printHelp()
      process.exit(0)
    } else {
      log('warn', `Unknown argument ignored: ${a}`)
    }
  }
  return opts
}

function printHelp() {
  console.log(`Usage: install-bundle.js [--profile <name>]

Options:
  --profile <name>   Target DSH profile (default: web).
  --help, -h         Show this message.`)
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts })
}

function runCapture(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: 'pipe', shell: process.platform === 'win32', ...opts })
}

function checkPrereqs() {
  const dsh = runCapture('dsh', ['--version'])
  if (dsh.status !== 0) {
    log('err', 'dsh CLI not found on PATH. Install DeepSeek Harness first.')
    process.exit(1)
  }
  const version = String(dsh.stdout || '').trim().split('\n').pop()
  log('ok', `dsh detected: ${version || 'unknown version'}`)

  const pnpm = runCapture('pnpm', ['--version'])
  if (pnpm.status !== 0) {
    log('err', 'pnpm not found on PATH. dsh plugin forwards to pnpm; install pnpm first.')
    process.exit(1)
  }
  log('ok', `pnpm detected: ${String(pnpm.stdout || '').trim()}`)
}

function profileDir(name) {
  return path.join(DSH_HOME, 'profiles', name)
}

function cleanupLegacySymlink() {
  const link = path.join(DSH_HOME, 'skills', 'cfbridge')
  try {
    const stat = fs.lstatSync(link)
    if (!stat.isSymbolicLink() && !stat.isDirectory()) return
    const raw = stat.isSymbolicLink() ? fs.readlinkSync(link) : ''
    const pointsToBundle =
      stat.isDirectory() ||
      (raw && String(raw).includes('cfbridge') && String(raw).includes('skills'))
    if (!pointsToBundle) return
    fs.rmSync(link, { recursive: true, force: true })
    log('ok', `Cleaned legacy skill link: ${link}`)
  } catch (e) {
    if (e.code !== 'ENOENT') log('warn', `Could not inspect legacy skill link at ${link}: ${e.message}`)
  }
}

function dumpConfig(profile) {
  log('info', `Verifying composed config for profile "${profile}"…`)
  const r = runCapture('dsh', ['--profile', profile, '--dump-config'])
  const out = String(r.stdout || '')
  const err = String(r.stderr || '')
  if (r.status !== 0) {
    log('err', `dsh --dump-config failed (exit ${r.status}).`)
    if (err) process.stderr.write(err + '\n')
    process.exit(r.status ?? 1)
  }
  if (!/==\s*@wenaixi\/cfbridge\b/.test(out)) {
    log('err', 'cfbridge layer not found in --dump-config output.')
    log('info', '--- dump-config ---')
    process.stdout.write(out)
    log('info', '--- end ---')
    process.exit(1)
  }
  log('ok', 'cfbridge layer present in composed profile tree.')
  const mcpLine = out.split('\n').find((l) => /id:\s*mcp-cloudflare\b/.test(l))
  if (mcpLine) log('ok', `Found bundle row: ${mcpLine.trim()}`)
  const skillLine = out.split('\n').find((l) => /id:\s*skills-bundle\b/.test(l))
  if (skillLine) log('ok', `Found bundle row: ${skillLine.trim()}`)
  else log('warn', 'skills-bundle row not found in dump-config; bundle may be outdated. Run `npm install` or verify cordis.patch.yml.')
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  log('info', `Source bundle: ${ROOT} (${PKG.name}@${PKG.version})`)
  log('info', `DSH home: ${DSH_HOME}`)
  log('info', `Target profile: ${opts.profile}`)

  checkPrereqs()

  const profDir = profileDir(opts.profile)
  fs.mkdirSync(profDir, { recursive: true })

  log('info', `Running: dsh plugin --profile ${opts.profile} add ${ROOT}`)
  const r = run('dsh', ['plugin', '--profile', opts.profile, 'add', ROOT])
  if (r.status !== 0) {
    log('err', `dsh plugin add failed (exit ${r.status}).`)
    process.exit(r.status ?? 1)
  }

  cleanupLegacySymlink()
  dumpConfig(opts.profile)

  log('ok', 'Install complete.')
  log('info', 'Next:')
  log('info', `  1. Restart DSH if it was running: dsh --profile ${opts.profile}`)
  log('info', '  2. Open any new session; the model should see mcp__cloudflare__* and the cfbridge skill.')
  log('info', `  3. To uninstall later: npm run uninstall:bundle -- --profile ${opts.profile}`)
}

try {
  main()
} catch (e) {
  log('err', e.stack || e.message)
  process.exit(1)
}