// 静态校验 cfbridge 0.5.0 Bundle 的结构与安全属性。
const fs = require('fs')
const path = require('path')
const { ROOT, readText, readJson, fileExists, collectFiles, hasTokenLeak } = require('./lib/fs')
const { verifyProviderContract } = require('./lib/provider-contract')
const results = []

function pass(name, detail) { results.push({ ok: true, name, detail: detail || '' }) }
function fail(name, msg) { results.push({ ok: false, name, msg: msg || '' }) }
function checkFile(file, name) { if (fs.existsSync(file)) pass(name); else fail(name, 'missing: ' + file) }

// main 为 async：Provider 契约校验需要 import 构建产物。
async function main() {
  const pkg = readJson(path.join(ROOT, 'package.json'))
  if (!pkg) fail('package.json readable', 'invalid JSON')
  else {
    pass('package.json readable')
    if (pkg.name === '@wenaixi/cfbridge') pass('package name is @wenaixi/cfbridge')
    else fail('package name is @wenaixi/cfbridge', pkg.name)
    if (pkg.version === '0.10.0') pass('package version is 0.10.0')
    else fail('package version is 0.10.0', pkg.version)
    if (pkg.type === 'module') pass('package is an ESM module')
    else fail('package is an ESM module', pkg.type)
    if (pkg.main === 'lib/cfbridge.js') pass('package main points to lib/cfbridge.js')
    else fail('package main points to lib/cfbridge.js', pkg.main)
    if (pkg.exports && pkg.exports['.'] && pkg.exports['.'].default === './lib/cfbridge.js') pass('package exports built entry')
    else fail('package exports built entry', JSON.stringify(pkg.exports))
    if (pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch === './cordis.patch.yml') pass('package declares dsh.bundle.patch')
    else fail('package declares dsh.bundle.patch', JSON.stringify(pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch))

    // 双面插件声明：浏览器半侧 + 卡片元数据。
    // exports 一旦声明就是严格白名单，漏掉 ./package.json 会让插件卡片只剩包名。
    if (pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === 'web') pass('package declares dsh.client.platform web')
    else fail('package declares dsh.client.platform web', JSON.stringify(pkg.dsh && pkg.dsh.client))
    if (pkg.exports && pkg.exports['./client'] === './lib/client.js') pass('package exports ./client')
    else fail('package exports ./client', JSON.stringify(pkg.exports && pkg.exports['./client']))
    if (pkg.exports && pkg.exports['./package.json'] === './package.json') pass('package exports ./package.json (card metadata)')
    else fail('package exports ./package.json (card metadata)', 'readPluginMeta resolves this subpath; missing means an empty card')
    if (pkg.exports && pkg.exports['./locale/*.json']) pass('package exports ./locale/*.json')
    else fail('package exports ./locale/*.json', 'plugin card description needs this subpath')
    if (typeof pkg.icon === 'string' && pkg.icon.startsWith('./')) pass('package declares in-package icon')
    else fail('package declares in-package icon', JSON.stringify(pkg.icon))
    if (pkg.dsh && pkg.dsh.client && Array.isArray(pkg.dsh.client.inject) && pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-primitives')) {
      pass('client injects official primitives')
    } else fail('client injects official primitives', JSON.stringify(pkg.dsh && pkg.dsh.client && pkg.dsh.client.inject))

    checkFile(path.join(ROOT, 'lib', 'cfbridge.js'), 'built entry exists')
    // 客户端半侧必须有它自己的类型检查入口：该文件被主 tsconfig 显式排除
    // （需要 JSX 与浏览器环境），若再没有专用 tsconfig，这 400 余行将完全不被检查。
    checkFile(path.join(ROOT, 'tsconfig.client.json'), 'client tsconfig exists')
    checkFile(path.join(ROOT, 'src', 'client.deps.d.ts'), 'client type shim exists')
    if (pkg.scripts && pkg.scripts['typecheck:client']) pass('script typecheck:client defined')
    else fail('script typecheck:client defined', 'missing')
    checkFile(path.join(ROOT, 'lib', 'client.js'), 'built client entry exists')
    checkFile(path.join(ROOT, 'locale', 'zh.json'), 'locale/zh.json exists')
    checkFile(path.join(ROOT, 'locale', 'en.json'), 'locale/en.json exists')

    // 图标必须 <= 256 KiB（宿主 MAX_ICON_BYTES 硬上限）且是包内相对路径。
    const iconRel = String(pkg.icon || '').replace(/^\.\//, '')
    const iconAbs = path.join(ROOT, iconRel)
    checkFile(iconAbs, 'icon file exists')
    if (fs.existsSync(iconAbs)) {
      const bytes = fs.statSync(iconAbs).size
      if (bytes <= 256 * 1024) pass('icon within 256 KiB (' + bytes + ' B)')
      else fail('icon within 256 KiB', bytes + ' B exceeds the host limit')
    }

    for (const entry of ['cordis.patch.yml', 'lib/', 'skills/', 'locale/', 'icon.png', 'README.md', 'LICENSE']) {
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

  // Provider 契约：import 构建产物、断言真实导出值与真实行为。
  // 不再用正则匹配 src/cfbridge.ts 的源码文本 —— 那种断言会误报（纯改名即红）
  // 也会漏报（注册被短路仍全绿），两个方向都有实测证据。断言集合与
  // scripts/check.js 共用 scripts/lib/provider-contract.js，杜绝两处各抄一份。
  checkFile(path.join(ROOT, 'src', 'cfbridge.ts'), 'src/cfbridge.ts exists')
  for (const r of await verifyProviderContract(ROOT)) {
    if (r.ok) pass(r.name, r.detail)
    else fail(r.name, r.detail)
  }

  const { ALL_SKILLS: skills } = require('./lib/skills')
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

  // README 不得写死本项目版本号。
  // 理由：README 曾写着「当前版本为 0.7.0」，而在 0.10.0 时才被发现——已过时三个版本。
  // 版本号在 npm 徽章与 package.json 中都是动态的，README 里写死必然漂移。
  // 例外：vX.Y.Z 之类的流程占位符、徽章 URL、以及依赖项版本（如 node >= 20.9.0）。
  const readmeText = readText(path.join(ROOT, 'README.md'))
  const versionHits = []
  for (const line of readmeText.split(/\r?\n/)) {
    if (/shields\.io|img\.shields/.test(line)) continue
    if (/vX\.Y\.Z|\bx\.y\.z\b/i.test(line)) continue
    if (/node\s*>?=?\s*\d|engines|依赖|dependencies/.test(line)) continue
    const m = line.match(/(?<![\d.@])(\d+\.\d+\.\d+)(?![\d.])/g)
    if (m) versionHits.push(m.join(',') + ' ← ' + line.trim().slice(0, 70))
  }
  if (versionHits.length === 0) pass('README has no hardcoded project version')
  else fail('README has no hardcoded project version', versionHits.slice(0, 3).join(' | '))

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
main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error))
  process.exit(1)
})
