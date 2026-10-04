import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const WRANGLER = fileURLToPath(new URL('../scripts/wrangler.js', import.meta.url))

/**
 * 无 Token 时 Wrangler 包装器的行为契约。
 *
 * wrangler --version 是本地能力探测，不访问 Cloudflare，也不需要凭据；
 * 它必须随时可用，否则综合套件在无 Token 的 CI 上无法通过。
 * 需要认证的命令则仍应明确失败，而不是静默成功。
 */
function runWrangler(args, env) {
  return spawnSync(process.execPath, [WRANGLER, ...args], {
    encoding: 'utf8',
    // 用不存在的 DSH_HOME，确保没有可加载的 .env，测试不依赖本机凭据。
    env: { ...env, DSH_HOME: fileURLToPath(new URL('./__no_such_dsh_home__', import.meta.url)) },
  })
}

test('wrangler wrapper serves --version without a Cloudflare token', () => {
  const env = { ...process.env }
  delete env.CLOUDFLARE_API_TOKEN

  const result = runWrangler(['--version'], env)

  assert.equal(result.status, 0, '无 Token 时 --version 必须成功: ' + result.stderr)
  assert.match(result.stdout, /\d+\.\d+\.\d+/, '必须打印真实版本号')
})

test('wrangler wrapper still refuses authenticated commands without a token', () => {
  const env = { ...process.env }
  delete env.CLOUDFLARE_API_TOKEN

  const result = runWrangler(['whoami'], env)

  assert.notEqual(result.status, 0, '需要认证的命令在没有 Token 时必须失败')
  assert.match(result.stderr, /CLOUDFLARE_API_TOKEN/, '错误信息必须点明缺失的变量')
})

test('wrangler wrapper does not let a later flag smuggle an authenticated command past the token check', () => {
  const env = { ...process.env }
  delete env.CLOUDFLARE_API_TOKEN

  // 这些命令都会真实访问 Cloudflare。仅在参数任意位置出现 --help/-v/-h
  // 就整条放行，会让 --help 变成绕过凭据检查的后门。
  // 这些命令的首参数是真实子命令，必须在无 Token 时被拦下；
  // 其中后三条正是「用后面的 flag 把认证命令夹带过去」的形态。
  const smuggled = [
    ['whoami', '--version'],
    ['deploy', '--help'],
    ['d1', 'list', '--json', '-h'],
    ['pages', 'project', 'list', '-v'],
  ]

  for (const args of smuggled) {
    const result = runWrangler(args, env)
    assert.notEqual(result.status, 0, args.join(' ') + ' 在没有 Token 时必须失败')
    assert.match(result.stderr, /CLOUDFLARE_API_TOKEN/, args.join(' ') + ' 必须点明缺失的变量')
  }
})
