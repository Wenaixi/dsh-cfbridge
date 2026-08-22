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

if (!process.env.CLOUDFLARE_API_TOKEN) {
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
