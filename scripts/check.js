// 仓库配置与安全检查（零副作用）。
// 1. 校验 package.json 的元数据（name/version/author/license）
// 2. 校验本地 Wrangler 已安装且为 4.x
// 3. 校验 agent.cordis.yml 含 Cloudflare MCP 且无 token 硬编码
// 4. 校验 gitignore 忽略 .env / PEM
// 5. 校验所有跟踪文件不含 token 前缀
// 6. 校验 install/validate/test/wrangler 脚本存在

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (e) {
    return null
  }
}

function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch (e) {
    return ''
  }
}

function fileExists(p) {
  return fs.existsSync(p)
}

// === 1. package.json 元数据 ===
const pkg = readJson(path.join(ROOT, 'package.json'))
if (pkg) {
  check('package name is @wenaixi/cfbridge', pkg.name === '@wenaixi/cfbridge', `got: ${pkg.name}`)
  check('package version is 0.2.0', pkg.version === '0.2.0', `got: ${pkg.version}`)
  check('package author is Wenaixi', /Wenaixi/.test(pkg.author || ''), `got: ${pkg.author}`)
  check('package license is MIT', pkg.license === 'MIT', `got: ${pkg.license}`)
  check('package has install:preset script', !!pkg.scripts?.['install:preset'])
  check('package has validate:preset script', !!pkg.scripts?.['validate:preset'])
  check('package has test script', !!pkg.scripts?.test)
} else {
  check('package.json readable', false)
}

// === 2. Wrangler 安装 ===
const wranglerPkg = readJson(path.join(ROOT, 'node_modules', 'wrangler', 'package.json'))
if (wranglerPkg) {
  const major = parseInt(String(wranglerPkg.version).split('.')[0], 10)
  check('Wrangler is pinned to major version 4', major === 4, `got: ${wranglerPkg.version}`)
} else {
  check('local Wrangler is installed', false, 'run npm ci first')
}

// === 3. agent.cordis.yml 检查 ===
function hasTokenLeak(text) {
  const patterns = [
    /cfat_[A-Za-z0-9]{16,}/,
    /cfut_[A-Za-z0-9]{16,}/,
    /cfoat_[A-Za-z0-9]{16,}/,
    /sk-[A-Za-z0-9-]{16,}/,
    /Bearer\s+[A-Za-z0-9_-]{40,}/,
    /gh[pousr]_[A-Za-z0-9]{30,}/,
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /AIza[0-9A-Za-z_-]{35}/,
  ]
  return patterns.some((re) => re.test(text))
}

const agentYml = readText(path.join(ROOT, 'agent.cordis.yml'))
check('agent.cordis.yml exists', fileExists(path.join(ROOT, 'agent.cordis.yml')))
check('agent.cordis.yml uses DSH MCP client', agentYml.includes('@deepseek-ai/dsh-mcp-client'))
check('agent.cordis.yml targets Cloudflare MCP', agentYml.includes('mcp.cloudflare.com/mcp'))
check('agent.cordis.yml reads token from environment', agentYml.includes('process.env.CLOUDFLARE_API_TOKEN'))
check('agent.cordis.yml has no literal Cloudflare token', !hasTokenLeak(agentYml))
check('agent.cordis.yml has persona row', /-\s*id:\s*persona\b/.test(agentYml))
check('agent.cordis.yml has skill-filesystem row', /-\s*id:\s*skill-filesystem\b/.test(agentYml))

// === 4. preset.yml ===
const presetYml = readText(path.join(ROOT, 'preset.yml'))
check('preset.yml exists', fileExists(path.join(ROOT, 'preset.yml')))
check('preset.yml has name', /^name:\s+\S+/m.test(presetYml))
check('preset.yml has description', /^description:\s+\S+/m.test(presetYml))

// === 5. skill 文件 ===
const skillMd = readText(path.join(ROOT, 'skills', 'cfbridge', 'SKILL.md'))
check('SKILL.md exists', fileExists(path.join(ROOT, 'skills', 'cfbridge', 'SKILL.md')))
check('SKILL.md has no token-like content', !hasTokenLeak(skillMd))

// === 6. 关键脚本 ===
const SCRIPTS = ['install-preset.js', 'uninstall-preset.js', 'validate-preset.js', 'test.js', 'test-wrangler.js', 'wrangler.js']
for (const s of SCRIPTS) {
  check(`scripts/${s} exists`, fileExists(path.join(ROOT, 'scripts', s)))
}

// === 7. gitignore ===
const gitignore = readText(path.join(ROOT, '.gitignore'))
check('.env is ignored', /^\.env$/m.test(gitignore) || /^\.env\b/m.test(gitignore))
check('.env.example IS tracked', /^\!\.env\.example$/m.test(gitignore))
check('PEM files are ignored', /\.pem$/m.test(gitignore))
check('private key header files are ignored', /-----BEGIN|m\.key|m\.pem/i.test(gitignore) || /\.key$|\.pem$/m.test(gitignore))
check('secrets/credentials directories are ignored', /secrets\/|credentials\//.test(gitignore))
check('node_modules is ignored', /^node_modules\/?$/m.test(gitignore) || /^node_modules\b/m.test(gitignore))
check('package-lock.json IS tracked', !/^package-lock\.json$/m.test(gitignore))
check('.wrangler directory is ignored', /\.wrangler/.test(gitignore))
check('.dev.vars is ignored', /\.dev\.vars/.test(gitignore))
check('.dsh/ is ignored', /\.dsh\//.test(gitignore))
check('IDE/temp files ignored', /\.vscode|\.idea|\.swp|\.DS_Store/.test(gitignore))

// === 8. 所有跟踪文件 token 扫描 ===
function listTracked() {
  try {
    return execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  } catch (e) {
    return []
  }
}

const tracked = listTracked()
let tokenLeak = null
for (const file of tracked) {
  const full = path.join(ROOT, file)
  if (!fs.existsSync(full)) continue
  const text = readText(full)
  if (hasTokenLeak(text)) {
    tokenLeak = file
    break
  }
}
check('no tracked file contains token-like content', !tokenLeak, tokenLeak ? `found in ${tokenLeak}` : '')

// === 9. web profile 未被污染 ===
const webPatch = path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh', 'profiles', 'web', 'cordis.patch.yml')
if (fs.existsSync(webPatch)) {
  const text = readText(webPatch)
  check('web profile cordis.patch.yml has no cloudflare residue', !/cloudflare|CLOUDFLARE_API_TOKEN|cfbridge/i.test(text))
} else {
  check('web profile cordis.patch.yml not polluted', true, 'no web profile patch to pollute')
}

// === 10. 系统预设目录未被污染 ===
const SYSTEM_DSH = 'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh'
const systemSkills = path.join(SYSTEM_DSH, 'config', 'agent-presets')
let systemPolluted = null
if (fs.existsSync(systemSkills)) {
  for (const sub of ['standard', 'code', 'cordis', 'minimal']) {
    const skillsDir = path.join(systemSkills, sub, 'skills')
    if (!fs.existsSync(skillsDir)) continue
    // 简单递归：检查任何文件名包含 cfbridge
    const stack = [skillsDir]
    while (stack.length) {
      const dir = stack.pop()
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          stack.push(path.join(dir, entry.name))
        } else if (entry.name.toLowerCase().includes('cfbridge')) {
          systemPolluted = `${sub}: ${path.join(dir, entry.name)}`
          break
        }
      }
      if (systemPolluted) break
    }
    if (systemPolluted) break
  }
}
check('DSH system presets have no cfbridge', !systemPolluted, systemPolluted || '')

// === 11. Git remote ===
let hasRemote = false
try {
  const remote = execSync('git remote -v', { cwd: ROOT, encoding: 'utf8' }).trim()
  hasRemote = remote.length > 0
} catch (e) {}
check('no Git remote configured (no auto-push risk)', !hasRemote)

// === 输出 ===
let pass = 0
for (const c of checks) {
  if (c.ok) {
    console.log(`PASS  ${c.name}`)
    pass++
  } else {
    console.log(`FAIL  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
  }
}
console.log(`\n${pass === checks.length ? 'PASS' : 'FAIL'}: ${pass}/${checks.length} checks`)
process.exit(pass === checks.length ? 0 : 1)