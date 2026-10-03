// 通过项目内固定版本的 Wrangler 执行命令。
// 仅在当前进程尚未设置 CLOUDFLARE_API_TOKEN 时，从 DSH 私有环境文件加载；绝不打印 token。
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const dshHome = process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh')
const dshEnv = path.join(dshHome, '.env')

if (!process.env.CLOUDFLARE_API_TOKEN) {
  try {
    process.loadEnvFile(dshEnv)
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.error(`无法读取 DSH 环境文件：${error.message}`)
      process.exit(1)
    }
  }
}

// 纯本地查询（版本、帮助）不访问 Cloudflare，也不读凭据，必须放行。
// 把它们和无 Token 一起拦下，会让综合门禁在无凭据的 CI 上整体失败。
// 只看首个位置参数：整条命令就是本地探测时才放行。
// 不能用 some() 扫描全部参数 —— 那会让 `wrangler deploy --help` 这类
// 真实访问 Cloudflare 的命令顺带绕过凭据检查。
const argv = process.argv.slice(2)
const localOnly = argv.length > 0 && ['--version', '-v', '--help', '-h'].includes(argv[0])

if (!localOnly && !process.env.CLOUDFLARE_API_TOKEN) {
  console.error('未找到 CLOUDFLARE_API_TOKEN。请在 DSH 私有环境文件或当前终端环境中配置该变量。')
  process.exit(1)
}

const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const result = spawnSync(process.execPath, [wrangler, ...process.argv.slice(2)], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
})

if (result.error) {
  console.error(`Wrangler 无法启动：${result.error.message}`)
  process.exit(1)
}
process.exit(result.status === null ? 1 : result.status)
