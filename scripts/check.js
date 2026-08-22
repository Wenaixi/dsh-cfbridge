// 仓库配置与安全检查（零副作用）。
//
// v0.3.0 调整：
// 1. 主入口从 agent.cordis.yml 切到 cordis.patch.yml。
// 2. 新增 bundle manifest 断言（dsh.bundle.patch、files[]）。
// 3. 反转 web profile 污染断言：现在允许 disabled 覆写与全局 `mcp-cloudflare`
//    行（来自 cfbridge bundle），但禁止用户手写重复启用；旧时代的 mcp-cloudflare
//    残留仍应被清掉。
// 4. 增加 deprecated/ 旧 preset 文件归档检查。
//
// 使用：npm run check

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')

const checks = []
function check(name, ok, detail = '') { checks.push({ name, ok, detail }) }

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
function readText(p) { try { return fs.readFileSync(p, 'utf8') } catch { return '' } }
function fileExists(p) { return fs.existsSync(p) }

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

// === 1. package.json 元数据 + dsh.bundle ===
const pkg = readJson(path.join(ROOT, 'package.json'))
if (pkg) {
  check('package name is @wenaixi/cfbridge', pkg.name === '@wenaixi/cfbridge', `got: ${pkg.name}`)
  check('package version is 0.1.1', pkg.version === '0.1.1', `got: ${pkg.version}`)
  check('package is not private', pkg.private !== true, pkg.private ? 'package.json must not be private for npm publish' : '')
  check('package publishConfig.access is public', pkg.publishConfig?.access === 'public', `got: ${pkg.publishConfig?.access}`)
  check('package repository points to Wenaixi/dsh-cfbridge', /github\.com\/Wenaixi\/dsh-cfbridge(\.git)?$/i.test(pkg.repository?.url || ''), `got: ${pkg.repository?.url}`)
  check('package author is Wenaixi', /Wenaixi/.test(pkg.author || ''), `got: ${pkg.author}`)
  check('package license is MIT', pkg.license === 'MIT', `got: ${pkg.license}`)
  check('package declares dsh.bundle.patch', !!pkg.dsh?.bundle?.patch)
  if (pkg.dsh?.bundle?.patch) {
    const abs = path.resolve(ROOT, pkg.dsh.bundle.patch)
    check('dsh.bundle.patch target file exists', fileExists(abs), abs)
  }
  const files = Array.isArray(pkg.files) ? pkg.files : []
  for (const entry of ['cordis.patch.yml', 'skills/', 'scripts/', 'README.md', 'LICENSE']) {
    check(`package.files[] includes ${entry}`, files.includes(entry))
  }
  for (const s of ['install:bundle', 'uninstall:bundle', 'validate:bundle', 'migrate:from-preset', 'check', 'test']) {
    check(`package has ${s} script`, !!pkg.scripts?.[s])
  }
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

// === 3. cordis.patch.yml（v0.3.0 主入口） ===
const patchText = readText(path.join(ROOT, 'cordis.patch.yml'))
check('cordis.patch.yml exists', fileExists(path.join(ROOT, 'cordis.patch.yml')))
if (patchText) {
  check('cordis.patch.yml uses DSH MCP client', patchText.includes('@deepseek-ai/dsh-mcp-client'))
  check('cordis.patch.yml targets Cloudflare MCP', patchText.includes('mcp.cloudflare.com/mcp'))
  check('cordis.patch.yml reads token from environment', patchText.includes('process.env.CLOUDFLARE_API_TOKEN'))
  check('cordis.patch.yml has no literal Cloudflare token', !hasTokenLeak(patchText))
  check('cordis.patch.yml has mcp-cloudflare id', /^\s*-\s+id:\s*mcp-cloudflare\b/m.test(patchText))
  check('cordis.patch.yml uses !!js Authorization template',
    /Authorization:\s*!!js\s+'`Bearer \$\{process\.env\.CLOUDFLARE_API_TOKEN\}`'/.test(patchText))
  check('cordis.patch.yml keeps failOnStartupError: false',
    /failOnStartupError:\s*false\b/.test(patchText))
  check('cordis.patch.yml has cfbridge-skill id', /^\s*-\s+id:\s*cfbridge-skill\b/m.test(patchText))
  check('cordis.patch.yml cfbridge-skill references src/cfbridge-skill.js',
    /cfbridge-skill\.js/.test(patchText))

  // 不应再注入 agent 栈行（plan §4.1）；重复注入会与 host 冲突。
  const banned = ['persona', 'agent-instructions', 'tool-bash', 'tool-pwsh', 'tool-fs', 'skill-filesystem', 'tool-skill', 'planning', 'tool-goal', 'tool-web']
  for (const k of banned) {
    const re = new RegExp(`^\\s*-\\s+id:\\s*${k}\\b`, 'm')
    if (re.test(patchText)) check(`cordis.patch.yml does NOT redeclare ${k}`, false, 'host composition already provides this row')
  }
  check('cordis.patch.yml does not redeclare agent-stack rows', true, 'banned keys absent or already failed individually')
}
// 运行时 Skill 插件
const runtimeSkillJs = readText(path.join(ROOT, 'src', 'cfbridge-skill.js'))
check('src/cfbridge-skill.js exists', fileExists(path.join(ROOT, 'src', 'cfbridge-skill.js')))
if (runtimeSkillJs) {
  check('src/cfbridge-skill.js injects skills', /inject\s*=\s*\['skills'\]/.test(runtimeSkillJs))
  check('src/cfbridge-skill.js registers via ctx.skills.register', /ctx\.skills\.register/.test(runtimeSkillJs))
}

// === 4. Skill 文件 ===
const skillMd = readText(path.join(ROOT, 'skills', 'cfbridge', 'SKILL.md'))
check('SKILL.md exists', fileExists(path.join(ROOT, 'skills', 'cfbridge', 'SKILL.md')))
if (skillMd) {
  check('SKILL.md has title', /^#\s+cfbridge\b/m.test(skillMd))
  check('SKILL.md has no token-like content', !hasTokenLeak(skillMd))
  check('SKILL.md mentions global bundle trigger', /全局|安装 cfbridge bundle|install:bundle/.test(skillMd))
}

// === 5. 关键脚本 ===
const SCRIPTS = [
  'install-bundle.js',
  'uninstall-bundle.js',
  'validate-bundle.js',
  'migrate-from-preset.js',
  'dump-config.js',
  'check.js',
  'test.js',
  'wrangler.js',
  'test-wrangler.js',
  // 旧 preset 脚本保留为 shim
  'install-preset.js',
  'uninstall-preset.js',
  'validate-preset.js',
]
for (const s of SCRIPTS) {
  check(`scripts/${s} exists`, fileExists(path.join(ROOT, 'scripts', s)))
}

// 旧 preset shim 必须打印 deprecation
for (const s of ['install-preset.js', 'uninstall-preset.js', 'validate-preset.js']) {
  const t = readText(path.join(ROOT, 'scripts', s))
  check(`scripts/${s} is marked deprecated`, /DEPRECATED|deprecated/i.test(t))
}

// === 6. gitignore ===
const gitignore = readText(path.join(ROOT, '.gitignore'))
check('.env is ignored', /^\.env$/m.test(gitignore) || /^\.env\b/m.test(gitignore))
check('.env.example IS tracked', /^\!\.env\.example$/m.test(gitignore))
check('PEM files are ignored', /\.pem$/m.test(gitignore))
check('secrets/credentials directories are ignored', /secrets\/|credentials\//.test(gitignore))
check('node_modules is ignored', /^node_modules\/?$/m.test(gitignore) || /^node_modules\b/m.test(gitignore))
check('package-lock.json IS tracked', !/^package-lock\.json$/m.test(gitignore))
check('.wrangler directory is ignored', /\.wrangler/.test(gitignore))
check('.dsh/ is ignored', /\.dsh\//.test(gitignore))
check('deprecated dynamic plugin residue ignored',
  /cfbridge-host-/.test(gitignore))
check('IDE/temp files ignored', /\.vscode|\.idea|\.swp|\.DS_Store/.test(gitignore))

// === 7. 所有跟踪文件 token 扫描 ===
function listTracked() {
  try {
    return execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  } catch { return [] }
}
const tracked = listTracked()
let tokenLeak = null
for (const f of tracked) {
  const p = path.join(ROOT, f)
  if (!fs.existsSync(p)) continue
  if (hasTokenLeak(readText(p))) { tokenLeak = f; break }
}
check('no tracked file contains token-like content', !tokenLeak, tokenLeak ? `found in ${tokenLeak}` : '')

// === 8. web profile 状态（v0.3.0 翻转断言） ===
const dshHome = process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh')
const webProfile = path.join(dshHome, 'profiles', 'web')
const webPatch = path.join(webProfile, 'cordis.patch.yml')
const webManifest = readJson(path.join(webProfile, 'package.json'))
const bundleInstalledInProfile = !!(
  webManifest?.dependencies?.['@wenaixi/cfbridge']
  && (webManifest?.dsh?.profile?.bundles || []).includes('@wenaixi/cfbridge')
)

if (fs.existsSync(webPatch)) {
  const text = readText(webPatch)
  if (bundleInstalledInProfile) {
    // bundle 已装 → web patch 中不应再出现 mcp-cloudflare（防止工具重复注册）
    const dupes = text.split('\n').filter((l) => /^\s*-\s+id:\s*mcp-cloudflare\b/.test(l))
    check('web patch does not redeclare mcp-cloudflare when bundle is installed', dupes.length === 0,
      dupes.length ? `${dupes.length} duplicate mcp-cloudflare row(s) in web patch` : '')
    // 允许 disabled 覆写行
    const disabledOverride = /^\s*-\s+id:\s*mcp-cloudflare\b[\s\S]*?disabled:\s*true\b/m.test(text)
    check('web patch may optionally carry disabled: true mcp-cloudflare override (informational)', true,
      disabledOverride ? 'disabled override present' : 'no override (tools active)')
  } else {
    // bundle 未装 → web patch 中不应有 cloudflare 残留（v0.2.0 时代的污染）
    const cloudflareResidue = /cloudflare|mcp-cloudflare|CLOUDFLARE_API_TOKEN|cfbridge/i.test(text)
    check('web patch has no cloudflare residue (bundle not installed)', !cloudflareResidue,
      cloudflareResidue ? 'found cloudflare/cfbridge related lines' : '')
  }
} else {
  check('web profile cordis.patch.yml does not exist (or web profile not initialized)', bundleInstalledInProfile ? false : true,
    bundleInstalledInProfile ? 'expected patch file when bundle is installed' : 'no web patch to inspect')
}

// === 9. 系统预设目录未被污染 ===
const SYSTEM_DSH = 'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh'
const systemSkills = path.join(SYSTEM_DSH, 'config', 'agent-presets')
let systemPolluted = null
if (fs.existsSync(systemSkills)) {
  for (const sub of ['standard', 'code', 'cordis', 'minimal']) {
    const skillsDir = path.join(systemSkills, sub, 'skills')
    if (!fs.existsSync(skillsDir)) continue
    const stack = [skillsDir]
    while (stack.length) {
      const dir = stack.pop()
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) stack.push(path.join(dir, entry.name))
        else if (entry.name.toLowerCase().includes('cfbridge')) { systemPolluted = `${sub}: ${path.join(dir, entry.name)}`; break }
      }
      if (systemPolluted) break
    }
    if (systemPolluted) break
  }
}
check('DSH system presets have no cfbridge', !systemPolluted, systemPolluted || '')

// === 10. legacy v0.2.0 preset 状态 ===
const legacyPreset = path.join(dshHome, '.agent-presets', 'cfbridge')
if (fs.existsSync(legacyPreset)) {
  check('legacy v0.2.0 preset directory noted', true, `still present at ${legacyPreset}; run \`npm run migrate:from-preset -- --yes\` to clean`)
} else {
  check('legacy v0.2.0 preset absent', true, 'no agent-presets/cfbridge/ residue')
}

// === 11. Git remote ===
let hasRemote = false
let remoteText = ''
try { remoteText = String(execSync('git remote -v', { cwd: ROOT, encoding: 'utf8' })).trim(); hasRemote = remoteText.length > 0 } catch {}
const remoteOk = !hasRemote || /github\.com[:/]Wenaixi\/dsh-cfbridge(\.git)?/i.test(remoteText)
check('git remote points to Wenaixi/dsh-cfbridge (or not yet configured)', remoteOk,
  hasRemote ? remoteText.split('\n')[0] : 'no remote yet (ok before publish)')

// === 12. deprecated/ 归档 ===
check('deprecated/preset/preset.yml archived', fileExists(path.join(ROOT, 'deprecated', 'preset', 'preset.yml')))
check('deprecated/preset/agent.cordis.yml archived', fileExists(path.join(ROOT, 'deprecated', 'preset', 'agent.cordis.yml')))
check('deprecated/preset/README.md exists', fileExists(path.join(ROOT, 'deprecated', 'preset', 'README.md')))

// === 输出 ===
let pass = 0
for (const c of checks) {
  if (c.ok) { console.log(`PASS  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`); pass++ }
  else console.log(`FAIL  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
}
console.log(`\n${pass === checks.length ? 'PASS' : 'FAIL'}: ${pass}/${checks.length} checks`)
process.exit(pass === checks.length ? 0 : 1)