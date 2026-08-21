// 静态校验 cfbridge v0.3.0 Bundle 的结构与安全属性。
//
// 检查项：
// - package.json 含 dsh.bundle.patch 且指向真实文件
// - cordis.patch.yml 存在、可解析，并含 mcp-cloudflare 行
// - Authorization 用 !!js 动态引用 process.env.CLOUDFLARE_API_TOKEN
// - skills/cfbridge/SKILL.md 存在且不含 token 痕迹
// - scripts/install-bundle.js / uninstall-bundle.js / migrate-from-preset.js 存在
// - deprecated/preset/ 下包含 DEPRECATED 标记的旧 preset 文件
// - 共享 hasTokenLeak 正则扫所有受跟踪文件
//
// 使用：npm run validate:bundle

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

const results = []
function pass(name, detail = '') { results.push({ ok: true, name, detail }) }
function fail(name, msg) { results.push({ ok: false, name, msg }) }

function readText(p) {
  try { return fs.readFileSync(p, 'utf8') } catch { return '' }
}

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

function main() {
  // 1. package.json 含 dsh.bundle.patch
  const pkgPath = path.join(ROOT, 'package.json')
  let pkg = null
  try { pkg = JSON.parse(readText(pkgPath)) } catch (e) { fail('package.json readable', e.message) }
  if (pkg) {
    const patchRel = pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch
    if (typeof patchRel === 'string' && patchRel.length > 0) {
      pass('package.json declares dsh.bundle.patch', patchRel)
      const absPatch = path.resolve(ROOT, patchRel)
      if (fs.existsSync(absPatch)) pass('dsh.bundle.patch file exists', absPatch)
      else fail('dsh.bundle.patch file exists', `missing: ${absPatch}`)
    } else {
      fail('package.json declares dsh.bundle.patch', 'missing dsh.bundle.patch')
    }

    if (pkg.name === '@wenaixi/cfbridge') pass('package name is @wenaixi/cfbridge')
    else fail('package name is @wenaixi/cfbridge', pkg.name)
    if (pkg.version === '0.3.0') pass('package version is 0.3.0')
    else fail('package version is 0.3.0', pkg.version)

    const files = Array.isArray(pkg.files) ? pkg.files : []
    const need = ['cordis.patch.yml', 'skills/', 'scripts/', 'README.md', 'LICENSE']
    for (const entry of need) {
      if (files.includes(entry)) pass(`files[] includes ${entry}`)
      else fail(`files[] includes ${entry}`, `missing in package.json files`)
    }

    const scripts = pkg.scripts || {}
    for (const s of ['install:bundle', 'uninstall:bundle', 'validate:bundle', 'migrate:from-preset', 'check', 'test']) {
      if (scripts[s]) pass(`script "${s}" defined`)
      else fail(`script "${s}" defined`, 'missing in scripts')
    }
  }

  // 2. cordis.patch.yml 内容
  const patchPath = path.join(ROOT, 'cordis.patch.yml')
  const patchText = readText(patchPath)
  if (patchText) {
    pass('cordis.patch.yml exists')
    if (/^\s*-\s+id:\s*mcp-cloudflare\b/m.test(patchText)) pass('cordis.patch.yml has mcp-cloudflare row')
    else fail('cordis.patch.yml has mcp-cloudflare row', 'missing id: mcp-cloudflare')
    if (/serverName:\s*cloudflare\b/.test(patchText)) pass('cordis.patch.yml pins serverName: cloudflare')
    else fail('cordis.patch.yml pins serverName: cloudflare', 'missing')
    if (/url:\s*https:\/\/mcp\.cloudflare\.com\/mcp\b/.test(patchText)) pass('cordis.patch.yml pins Cloudflare MCP URL')
    else fail('cordis.patch.yml pins Cloudflare MCP URL', 'missing')
    if (/Authorization:\s*!!js\s+'`Bearer \$\{process\.env\.CLOUDFLARE_API_TOKEN\}`'/.test(patchText)) pass('cordis.patch.yml uses !!js Authorization template')
    else fail('cordis.patch.yml uses !!js Authorization template', 'token reference must use !!js')
    if (/failOnStartupError:\s*false\b/.test(patchText)) pass('cordis.patch.yml has failOnStartupError: false')
    else fail('cordis.patch.yml has failOnStartupError: false', 'must keep false to avoid blocking DSH when token missing')
    if (!hasTokenLeak(patchText)) pass('cordis.patch.yml has no hardcoded token')
    else fail('cordis.patch.yml has no hardcoded token', 'token pattern found in patch')

    // 不应再注入 agent 栈行（plan §4.1）。
    const banned = ['persona', 'agent-instructions', 'tool-bash', 'tool-pwsh', 'tool-fs', 'skill-filesystem', 'tool-skill', 'planning']
    for (const k of banned) {
      const re = new RegExp(`^\\s*-\\s+id:\\s*${k}\\b`, 'm')
      if (re.test(patchText)) fail(`cordis.patch.yml does not redeclare agent-stack row "${k}"`, 'host composition already provides this row; redeclaring causes layer conflict')
    }
    pass('cordis.patch.yml does not redeclare agent-stack rows (persona/tools/skills/planning)')
  } else {
    fail('cordis.patch.yml exists', 'file missing')
  }

  // 3. Skill 文件
  const skillMd = path.join(ROOT, 'skills', 'cfbridge', 'SKILL.md')
  if (fs.existsSync(skillMd)) {
    pass('skills/cfbridge/SKILL.md exists')
    const t = readText(skillMd)
    if (/^#\s+cfbridge\b/m.test(t)) pass('SKILL.md has title')
    else fail('SKILL.md has title', 'first heading should be "# cfbridge"')
    if (!hasTokenLeak(t)) pass('SKILL.md has no hardcoded token')
    else fail('SKILL.md has no hardcoded token', 'token pattern in skill body')
  } else {
    fail('skills/cfbridge/SKILL.md exists', 'file missing')
  }

  // 4. 关键脚本
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
  ]
  for (const s of SCRIPTS) {
    if (fs.existsSync(path.join(ROOT, 'scripts', s))) pass(`scripts/${s} exists`)
    else fail(`scripts/${s} exists`, 'missing')
  }

  // 5. 旧 preset 标记 deprecated
  const depPreset = path.join(ROOT, 'deprecated', 'preset')
  if (fs.existsSync(path.join(depPreset, 'preset.yml'))) pass('deprecated/preset/preset.yml archived')
  else fail('deprecated/preset/preset.yml archived', 'missing')
  if (fs.existsSync(path.join(depPreset, 'agent.cordis.yml'))) pass('deprecated/preset/agent.cordis.yml archived')
  else fail('deprecated/preset/agent.cordis.yml archived', 'missing')

  // 6. 旧 install-preset 等保留为 shim
  const SHIMS = ['install-preset.js', 'uninstall-preset.js', 'validate-preset.js']
  for (const s of SHIMS) {
    const p = path.join(ROOT, 'scripts', s)
    if (fs.existsSync(p)) {
      const t = readText(p)
      if (/DEPRECATED|@deprecated|deprecated/i.test(t)) pass(`scripts/${s} is marked deprecated`)
      else fail(`scripts/${s} is marked deprecated`, 'shim must print deprecation warning')
    } else {
      fail(`scripts/${s} exists`, 'missing')
    }
  }

  // 7. 全部 token 痕迹扫描
  const scan = (dir) => {
    const out = []
    if (!fs.existsSync(dir)) return out
    const stat = fs.statSync(dir)
    if (!stat.isDirectory()) return hasTokenLeak(readText(dir)) ? [dir] : []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) out.push(...scan(p))
      else if (entry.isFile()) {
        const t = readText(p)
        if (hasTokenLeak(t)) out.push(p)
      }
    }
    return out
  }
  const hits = [
    ...scan(path.join(ROOT, 'cordis.patch.yml')),
    ...scan(path.join(ROOT, 'scripts')),
    ...scan(path.join(ROOT, 'skills')),
    ...scan(path.join(ROOT, 'README.md')),
    ...scan(path.join(ROOT, 'deprecated')),
  ]
  if (hits.length === 0) pass('no token-like content in tracked bundle sources')
  else fail('no token-like content in tracked bundle sources', `found in: ${hits.join(', ')}`)

  // 输出
  let allPass = true
  for (const r of results) {
    if (r.ok) console.log(`PASS  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    else { console.log(`FAIL  ${r.name}: ${r.msg}`); allPass = false }
  }
  console.log(`\n${allPass ? 'PASS' : 'FAIL'}: ${results.filter((r) => r.ok).length}/${results.length} checks`)
  process.exit(allPass ? 0 : 1)
}

try {
  main()
} catch (e) {
  console.error(`[ERR ] ${e.stack || e.message}`)
  process.exit(1)
}
