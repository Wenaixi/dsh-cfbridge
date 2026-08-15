// v0.1.0 自检：不会发起任何 Cloudflare 写操作，不会输出 token。
// 用途：验证 package 元数据、Cordis patch 结构、密钥扫描规则与本地 Wrangler CLI。
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const failures = []

function check(condition, message) {
  if (condition) console.log(`PASS ${message}`)
  else {
    console.error(`FAIL ${message}`)
    failures.push(message)
  }
}

function read(name) {
  return fs.readFileSync(path.join(root, name), 'utf8')
}

const pkg = JSON.parse(read('package.json'))
check(pkg.name === 'cfbridge', 'package name is cfbridge')
check(pkg.version === '0.1.0', 'package version is 0.1.0')
check(String(pkg.author || '').startsWith('Wenaixi'), 'package author is Wenaixi')
check(pkg.devDependencies && /^(\^)?4\./.test(pkg.devDependencies.wrangler || ''), 'Wrangler is pinned to major version 4')

const patch = read('cordis.patch.yml')
check(patch.includes("name: '@deepseek-ai/dsh-mcp-client'"), 'Cordis patch uses DSH MCP client')
check(patch.includes('url: https://mcp.cloudflare.com/mcp'), 'Cordis patch targets the official Cloudflare MCP endpoint')
check(patch.includes('process.env.CLOUDFLARE_API_TOKEN'), 'Cordis patch reads token from environment')
check(!/Bearer\s+(?:cfat|cfut|cfoat)_/i.test(patch), 'Cordis patch has no literal Cloudflare token')

const ignored = read('.gitignore')
check(/^\.env$/m.test(ignored), '.env is ignored')
check(/^\*\.pem$/m.test(ignored), 'PEM files are ignored')

const tokenPattern = /(?:cfat|cfut|cfoat)_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9-]{20,}|Bearer\s+(?:cfat|cfut|cfoat)_/i
const trackedFiles = [
  '.env.example', '.gitattributes', '.gitignore', 'CLAUDE.md', 'LICENSE',
  'README.md', 'cordis.patch.yml', 'package.json', 'scripts/check.js',
]
for (const name of trackedFiles) {
  check(!tokenPattern.test(read(name)), `${name} contains no token-like value`)
}

const installedWrangler = JSON.parse(read('node_modules/wrangler/package.json'))
check(/^4\./.test(installedWrangler.version), `local Wrangler is installed (${installedWrangler.version})`)

if (failures.length) process.exitCode = 1
