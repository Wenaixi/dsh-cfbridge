// 封装 `dsh --profile <name> --dump-config` 并过滤出 cfbridge 相关层。
//
// 用于本机快速验证 cfbridge bundle 是否被 DSH 加载，以及是否包含 mcp-cloudflare 行。
//
// 使用：
//   npm run dump:config
//   npm run dump:config -- --profile tui
//   npm run dump:config -- --raw          # 不过滤，原样输出

const { spawnSync } = require('child_process')

function parseArgs(argv) {
  const opts = { profile: 'web', raw: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--profile' || a === '-p') opts.profile = argv[++i]
    else if (a.startsWith('--profile=')) opts.profile = a.slice('--profile='.length)
    else if (a === '--raw') opts.raw = true
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0) }
  }
  return opts
}

function printHelp() {
  console.log(`Usage: dump-config.js [--profile <name>] [--raw]

Options:
  --profile <name>   Profile to dump (default: web).
  --raw              Print the full --dump-config output without filtering.
  --help, -h         Show this message.`)
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const r = spawnSync('dsh', ['--profile', opts.profile, '--dump-config'], {
    stdio: 'pipe',
    shell: process.platform === 'win32',
  })
  const out = String(r.stdout || '')
  const err = String(r.stderr || '')
  if (r.status !== 0) {
    if (err) process.stderr.write(err + '\n')
    process.exit(r.status ?? 1)
  }

  if (opts.raw) {
    process.stdout.write(out)
    return
  }

  const lines = out.split('\n')
  const cfbridgeStart = lines.findIndex((l) => /==\s*@wenaixi\/cfbridge\b/.test(l))
  if (cfbridgeStart < 0) {
    console.error('cfbridge layer not found. Run `npm run install:bundle` first.')
    process.exit(1)
  }
  // 找到下一个 "# ==" 标记或 EOF
  let end = lines.length
  for (let i = cfbridgeStart + 1; i < lines.length; i++) {
    if (/^# ==\s/.test(lines[i])) { end = i; break }
  }
  const slice = lines.slice(cfbridgeStart, end).join('\n')
  process.stdout.write(slice + '\n')
}

try {
  main()
} catch (e) {
  console.error(e.stack || e.message)
  process.exit(1)
}
