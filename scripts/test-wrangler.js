// Wrangler CLI 只读验证套件。
// 仅调用只读命令，不修改任何 Cloudflare 资源。
// 每个测试独立执行，失败不阻断其它测试。

const { spawnSync } = require('child_process')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const WRANGLER = path.join(__dirname, 'wrangler.js')

const TESTS = [
  { name: 'wrangler --version', args: ['--version'], expectInStdout: /\d+\.\d+\.\d+/ },
  { name: 'wrangler whoami', args: ['whoami'], expectInStdout: /Account/ },
  { name: 'wrangler d1 list --json', args: ['d1', 'list', '--json'], expectValidJson: true },
  { name: 'wrangler pages project list --json', args: ['pages', 'project', 'list', '--json'], expectValidJson: true },
]

function runTest(test) {
  const result = spawnSync(process.execPath, [WRANGLER, ...test.args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  })
  const stdout = result.stdout || ''
  const stderr = result.stderr || ''
  const ok = result.status === 0

  let detail = ok ? 'PASS' : `FAIL (exit ${result.status})`
  if (test.expectInStdout && !test.expectInStdout.test(stdout)) {
    return { ok: false, name: test.name, detail: 'stdout did not match expected pattern' }
  }
  if (test.expectValidJson) {
    try {
      JSON.parse(stdout)
    } catch (e) {
      return { ok: false, name: test.name, detail: `invalid JSON: ${e.message}` }
    }
  }

  return { ok, name: test.name, detail }
}

function main() {
  console.log('Wrangler CLI 只读验证')
  console.log('─'.repeat(50))

  let passed = 0
  for (const test of TESTS) {
    const r = runTest(test)
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.ok ? '' : `— ${r.detail}`}`)
    if (r.ok) passed++
  }
  console.log('─'.repeat(50))
  console.log(`${passed}/${TESTS.length} passed`)
  process.exit(passed === TESTS.length ? 0 : 1)
}

main()