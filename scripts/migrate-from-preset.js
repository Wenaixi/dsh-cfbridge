// 检测并清理 v0.2.0 时代的 Agent Preset 残留（~/.dsh/.agent-presets/cfbridge/）。
//
// 使用：
//   npm run migrate:from-preset            # 仅检测，打印提示
//   npm run migrate:from-preset -- --yes   # 直接删除
//
// 删除是单向不可逆；脚本默认要求显式 --yes 才执行。

const fs = require('fs')
const path = require('path')

const DSH_HOME = process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh')
const LEGACY = path.join(DSH_HOME, '.agent-presets', 'cfbridge')

function log(level, msg) {
  const prefix = { info: 'INFO', ok: 'OK  ', warn: 'WARN', err: 'ERR ' }[level] || 'INFO'
  console.log(`[${prefix}] ${msg}`)
}

function parseArgs(argv) {
  const opts = { yes: false, profile: 'web' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--yes' || a === '-y') opts.yes = true
    else if (a === '--profile' || a === '-p') opts.profile = argv[++i]
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0) }
    else log('warn', `Unknown argument ignored: ${a}`)
  }
  return opts
}

function printHelp() {
  console.log(`Usage: migrate-from-preset.js [--yes] [--profile <name>]

Options:
  --yes, -y          Delete the legacy preset directory without prompting.
  --profile <name>   Profile to verify post-cleanup (default: web).
  --help, -h         Show this message.`)
}

function listFiles(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, entry.name)
      if (entry.isDirectory()) stack.push(p)
      else if (entry.isFile()) out.push(p)
    }
  }
  return out
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  log('info', `DSH home: ${DSH_HOME}`)
  log('info', `Legacy v0.2.0 preset directory: ${LEGACY}`)

  if (!fs.existsSync(LEGACY)) {
    log('ok', 'No legacy preset directory found. Nothing to migrate.')
    return
  }

  const files = listFiles(LEGACY)
  log('warn', `Found ${files.length} file(s) inside legacy preset directory.`)
  for (const f of files.slice(0, 20)) console.log(`       ${f}`)
  if (files.length > 20) console.log(`       …and ${files.length - 20} more`)

  // 与 web patch 层共存可能造成 mcp 工具重复注册；建议清理。
  log('info', 'Why clean it? In v0.3.0 the Cloudflare tools are registered globally via the bundle layer;')
  log('info', 'leaving the v0.2.0 preset can cause duplicate `mcp__cloudflare__*` tool names. The new')
  log('info', 'behavioral model (plan §5.2) recommends NOT coexisting. Cleaning also avoids the old')
  log('info', 'agent-plane rows from showing up in the preset picker.')

  if (!opts.yes) {
    if (process.env.CI === 'true' || process.env.NONINTERACTIVE === 'true') {
      log('info', 'Non-interactive environment detected; will not delete without --yes.')
      return
    }
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout })
    rl.question(`Delete ${LEGACY}? [y/N] `, (answer) => {
      rl.close()
      if (/^y(es)?$/i.test(String(answer).trim())) doDelete()
      else log('info', 'Aborted by user. Re-run with --yes to delete without prompt.')
    })
    return
  }

  doDelete()
}

function doDelete() {
  try {
    fs.rmSync(LEGACY, { recursive: true, force: true })
    log('ok', `Removed legacy preset: ${LEGACY}`)
    log('info', 'Next: restart DSH and pick a non-Cloudflare preset (or stay in default mode).')
  } catch (e) {
    log('err', `Failed to remove ${LEGACY}: ${e.message}`)
    process.exit(1)
  }
}

try {
  main()
} catch (e) {
  log('err', e.stack || e.message)
  process.exit(1)
}
