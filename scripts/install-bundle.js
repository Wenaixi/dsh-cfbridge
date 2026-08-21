// 一键安装 cfbridge v0.3.0 Bundle 到指定 DSH profile。
//
// 流程（参考 plan-v0.3.0-global-bundle.md §4.5 机制 A）：
// 1. 解析参数（默认 profile=web，可通过 --profile <name> 覆盖）。
// 2. 校验本机有 dsh 与 pnpm。
// 3. 在 profile 目录里调用 `pnpm add link:<绝对路径>`，再调一次
//    `dsh plugin --profile <name> add <bundle-name>`：DSH 的 plugin 转发器会
//    自动 reconcile dsh.profile.bundles，把本 bundle append 到末尾。
// 4. 安装成功后软链 skills/cfbridge/ 到 $DSH_HOME/skills/cfbridge/，让 host 已
//    有的 dsh-skill-filesystem 默认根（user-dsh）自动发现 Skill；卸载时同步清理。
// 5. 跑 `dsh --profile <name> --dump-config` 验证层出现 `# == @wenaixi/cfbridge`。
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
const SKILL_LINK = path.join(DSH_HOME, 'skills', 'cfbridge')

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

function linkSkillBundle() {
  const target = SKILL_LINK
  const src = path.join(ROOT, 'skills', 'cfbridge')
  if (!fs.existsSync(src)) {
    log('err', `Skill source missing: ${src}`)
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (fs.existsSync(target) || (fs.lstatSync && fs.existsSync(target))) {
    try {
      const cur = fs.lstatSync(target)
      if (cur.isSymbolicLink() || cur.isDirectory()) {
        fs.rmSync(target, { recursive: true, force: true })
        log('info', `Removed previous skill entry: ${target}`)
      }
    } catch (e) {
      log('warn', `Could not inspect existing target ${target}: ${e.message}`)
    }
  }
  try {
    fs.symlinkSync(src, target, 'junction')
    log('ok', `Linked skill directory: ${target} -> ${src}`)
  } catch (e) {
    log('warn', `symlink failed (${e.code}); falling back to copy.`)
    copyDir(src, target)
    log('ok', `Copied skill directory: ${target}`)
  }
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dst, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
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
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  log('info', `Source bundle: ${ROOT} (${PKG.name}@${PKG.version})`)
  log('info', `DSH home: ${DSH_HOME}`)
  log('info', `Target profile: ${opts.profile}`)

  checkPrereqs()

  const profDir = profileDir(opts.profile)
  fs.mkdirSync(profDir, { recursive: true })

  // 让 dsh plugin 转发器负责 reconcile。
  // dsh plugin --profile <name> add <spec> 会把 spec 透传给 pnpm add（cwd=profileDir），
  // 把当前进程的 cwd 锚定到绝对路径以避免被 profile 自身解析。
  log('info', `Running: dsh plugin --profile ${opts.profile} add ${ROOT}`)
  const r = run('dsh', ['plugin', '--profile', opts.profile, 'add', ROOT])
  if (r.status !== 0) {
    log('err', `dsh plugin add failed (exit ${r.status}).`)
    process.exit(r.status ?? 1)
  }

  linkSkillBundle()
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
