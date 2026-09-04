// 静态校验 cfbridge 0.5.0 Bundle 的结构与安全属性。
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const results = []

function pass(name, detail) { results.push({ ok: true, name, detail: detail || '' }) }
function fail(name, msg) { results.push({ ok: false, name, msg: msg || '' }) }
function readText(file) { try { return fs.readFileSync(file, 'utf8') } catch { return '' } }
function readJson(file) { try { return JSON.parse(readText(file)) } catch { return null } }
function checkFile(file, name) { if (fs.existsSync(file)) pass(name); else fail(name, 'missing: ' + file) }
function hasTokenLeak(text) {
  return [
    /cfat_[A-Za-z0-9]{16,}/,
    /cfut_[A-Za-z0-9]{16,}/,
    /cfoat_[A-Za-z0-9]{16,}/,
    /sk-[A-Za-z0-9-]{16,}/,
    /Bearer\s+[A-Za-z0-9_-]{40,}/,
    /gh[pousr]_[A-Za-z0-9]{30,}/,
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /AIza[0-9A-Za-z_-]{35}/,
  ].some((pattern) => pattern.test(text))
}
function collectFiles(dir) {
  if (!fs.existsSync(dir)) return []
  const stats = fs.statSync(dir)
  if (!stats.isDirectory()) return [dir]
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => collectFiles(path.join(dir, entry.name)))
}

function main() {
  const pkg = readJson(path.join(ROOT, 'package.json'))
  if (!pkg) fail('package.json readable', 'invalid JSON')
  else {
    pass('package.json readable')
    if (pkg.name === '@wenaixi/cfbridge') pass('package name is @wenaixi/cfbridge')
    else fail('package name is @wenaixi/cfbridge', pkg.name)
    if (pkg.version === '0.5.0') pass('package version is 0.5.0')
    else fail('package version is 0.5.0', pkg.version)
    if (pkg.type === 'module') pass('package is an ESM module')
    else fail('package is an ESM module', pkg.type)
    if (pkg.main === 'lib/cfbridge.js') pass('package main points to lib/cfbridge.js')
    else fail('package main points to lib/cfbridge.js', pkg.main)
    if (pkg.exports && pkg.exports['.'] && pkg.exports['.'].default === './lib/cfbridge.js') pass('package exports built entry')
    else fail('package exports built entry', JSON.stringify(pkg.exports))
    if (pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch === './cordis.patch.yml') pass('package declares dsh.bundle.patch')
    else fail('package declares dsh.bundle.patch', JSON.stringify(pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch))
    checkFile(path.join(ROOT, 'lib', 'cfbridge.js'), 'built entry exists')
    for (const entry of ['cordis.patch.yml', 'lib/', 'skills/', 'README.md', 'LICENSE']) {
      if (Array.isArray(pkg.files) && pkg.files.includes(entry)) pass('files[] includes ' + entry)
      else fail('files[] includes ' + entry, 'missing in package.json files')
    }
    for (const script of ['build', 'typecheck', 'prepare', 'prepack', 'install:bundle', 'uninstall:bundle', 'validate:bundle', 'migrate:from-preset', 'check', 'test']) {
      if (pkg.scripts && pkg.scripts[script]) pass('script ' + script + ' defined')
      else fail('script ' + script + ' defined', 'missing')
    }
  }

  const patchPath = path.join(ROOT, 'cordis.patch.yml')
  const patchText = readText(patchPath)
  checkFile(patchPath, 'cordis.patch.yml exists')
  const authText = 'Authorization: !!js ' + String.fromCharCode(39) + String.fromCharCode(96) + 'Bearer ' + String.fromCharCode(36) + '{process.env.CLOUDFLARE_API_TOKEN}' + String.fromCharCode(96) + String.fromCharCode(39)
  for (const item of [
    ['mcp-cloudflare row', /^\s*-\s+id:\s*mcp-cloudflare\b/m],
    ['cfbridge row', /^\s*-\s+id:\s*cfbridge\b/m],
    ['package-name Provider mount', /name:\s*'@wenaixi\/cfbridge'/],
    ['Cloudflare MCP URL', /url:\s*https:\/\/mcp\.cloudflare\.com\/mcp\b/],
    ['Provider package identity', /name:\s*'@wenaixi\/cfbridge'/],
    ['failOnStartupError false', /failOnStartupError:\s*false\b/],
  ]) {
    if (item[1].test(patchText)) pass('patch has ' + item[0])
    else fail('patch has ' + item[0], 'missing')
  }
  if (patchText.includes(authText)) pass('patch has dynamic Authorization')
  else fail('patch has dynamic Authorization', 'missing !!js token expression')
  const pluginRows = patchText.split('\n').filter((line) => /^\s*-\s+id:\s*/.test(line))
  if (pluginRows.length === 2) pass('patch has exactly two plugin rows')
  else fail('patch has exactly two plugin rows', 'unexpected row count: ' + pluginRows.length)
  if (!patchText.includes('skills-bundle') && !patchText.includes('src/')) pass('patch has no legacy skill paths')
  else fail('patch has no legacy skill paths', 'legacy path found')
  if (!hasTokenLeak(patchText)) pass('patch has no hardcoded token')
  else fail('patch has no hardcoded token', 'token-like value found')

  const source = readText(path.join(ROOT, 'src', 'cfbridge.ts'))
  checkFile(path.join(ROOT, 'src', 'cfbridge.ts'), 'src/cfbridge.ts exists')
  if (/export const name = DEFAULT_PROVIDER_NAME/.test(source)) pass('Provider exports name')
  else fail('Provider exports name', 'missing')
  if (source.includes("export const inject = ['skills']")) pass('Provider injects skills')
  else fail('Provider injects skills', 'missing')
  if (source.includes('ctx.skills.registerProvider')) pass('Provider uses registerProvider')
  else fail('Provider uses registerProvider', 'missing')
  if (/PROVIDER_RANK = 550/.test(source) && /rank: PROVIDER_RANK/.test(source)) pass('Provider rank is 550')
  else fail('Provider rank is 550', 'missing')

  const skills = ['cfbridge', 'cloudflare', 'wrangler', 'agents-sdk', 'durable-objects', 'cloudflare-one', 'cloudflare-one-migrations', 'cloudflare-email-service', 'sandbox-next', 'sandbox-stable', 'sandbox-migrate-to-next', 'turnstile-spin', 'web-perf', 'workers-best-practices']
  for (const skill of skills) checkFile(path.join(ROOT, 'skills', skill, 'SKILL.md'), 'skills/' + skill + '/SKILL.md exists')
  const allSkillMetadata = skills.every((skill) => {
    const text = readText(path.join(ROOT, 'skills', skill, 'SKILL.md'))
    const marker = text.indexOf('---')
    if (marker < 0) return false
    const preamble = text.slice(0, marker).replace(/\ufeff/g, '')
    const opening = preamble.trim() === '' || preamble.split('\n').every((line) => line.trim() === '' || line.trim().startsWith('<!--') || line.trim().endsWith('-->'))
    const frontmatter = text.slice(marker)
    const nameMatch = /^name:\s*(.+?)\s*$/m.exec(frontmatter)
    const name = nameMatch?.[1].trim() === skill
    const description = /^description:\s*.+$/m.test(frontmatter)
    return opening && name && description
  })
  if (allSkillMetadata) pass('all 14 skill files satisfy index metadata')
  else fail('all 14 skill files satisfy index metadata', 'name mismatch or missing frontmatter')
  if (!fs.existsSync(path.join(ROOT, 'src')) || !fs.readdirSync(path.join(ROOT, 'src')).some((file) => file.endsWith('-skill.js'))) pass('legacy skill wrappers removed')
  else fail('legacy skill wrappers removed', 'wrapper file remains')

  for (const script of ['install-bundle.js', 'uninstall-bundle.js', 'validate-bundle.js', 'migrate-from-preset.js', 'dump-config.js', 'check.js', 'test.js', 'wrangler.js', 'test-wrangler.js', 'install-preset.js', 'uninstall-preset.js', 'validate-preset.js']) checkFile(path.join(ROOT, 'scripts', script), 'scripts/' + script + ' exists')
  for (const script of ['install-preset.js', 'uninstall-preset.js', 'validate-preset.js']) {
    if (/DEPRECATED|@deprecated|deprecated/i.test(readText(path.join(ROOT, 'scripts', script)))) pass('scripts/' + script + ' is marked deprecated')
    else fail('scripts/' + script + ' is marked deprecated', 'marker missing')
  }

  const tokenFiles = collectFiles(path.join(ROOT, 'cordis.patch.yml')).concat(collectFiles(path.join(ROOT, 'scripts'))).concat(collectFiles(path.join(ROOT, 'skills'))).concat(collectFiles(path.join(ROOT, 'README.md'))).concat(collectFiles(path.join(ROOT, 'CHANGELOG.md'))).concat(collectFiles(path.join(ROOT, 'deprecated'))).filter((file) => hasTokenLeak(readText(file)))
  if (tokenFiles.length === 0) pass('tracked bundle sources contain no token-like content')
  else fail('tracked bundle sources contain no token-like content', tokenFiles.join(', '))

  if (process.argv.includes('--strict-router')) {
    if (skills.every((skill) => fs.existsSync(path.join(ROOT, 'skills', skill, 'SKILL.md')))) pass('strict-router skill set is 14/14')
    else fail('strict-router skill set is 14/14', 'missing skill')
    if (patchText.includes('id: cfbridge') && !patchText.split('\n').some((line) => /^\s*-\s+id:\s*\w+-skill\b/.test(line))) pass('strict-router uses one Provider row')
    else fail('strict-router uses one Provider row', 'legacy skill rows found')
  }

  for (const result of results) console.log((result.ok ? 'PASS  ' : 'FAIL  ') + result.name + (result.detail || result.msg ? ' — ' + (result.detail || result.msg) : ''))
  const passed = results.filter((result) => result.ok).length
  console.log('\\n' + (passed === results.length ? 'PASS' : 'FAIL') + ': ' + passed + '/' + results.length + ' checks')
  process.exit(passed === results.length ? 0 : 1)
}
main()
