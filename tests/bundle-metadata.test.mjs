import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { parse } from 'yaml'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)))
const patchText = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const patch = parse(patchText)
const entries = patch.flatMap((item) => item.insert ?? [])

test('bundle exposes package identity and built entry', () => {
  assert.equal(pkg.name, '@wenaixi/cfbridge')
  assert.equal(pkg.version, '0.10.1')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.main, 'lib/cfbridge.js')
  assert.equal(pkg.exports['.'].default, './lib/cfbridge.js')
  assert.ok(pkg.files.includes('lib/'))
  assert.ok(pkg.files.includes('skills/'))
  assert.equal(pkg.files.includes('scripts/'), false)
  assert.ok(pkg.dependencies?.yaml)
})

test('patch mounts provider by package name', () => {
  assert.deepEqual(entries.map((entry) => entry.id), ['mcp-cloudflare', 'cfbridge'])
  assert.equal(entries[1].name, '@wenaixi/cfbridge')
  assert.equal(patchText.includes('skills-bundle'), false)
  assert.equal(patchText.includes('src/'), false)
  assert.equal(patchText.includes('cfbridge-skill'), false)
})

// 判定规则来自 scripts/lib/skill-metadata.js —— 与结构门禁共用同一条契约，
// 避免同一语义在两处各写一份、各自漂移。
const { hasIndexFrontmatter } = createRequire(import.meta.url)('../scripts/lib/skill-metadata.js')

test('all bundled skills have frontmatter', async () => {
  const { ALL_SKILLS: skills } = createRequire(import.meta.url)('../scripts/lib/skills.js')
  for (const skill of skills) {
    const text = await readFile(new URL('../skills/' + skill + '/SKILL.md', import.meta.url), 'utf8')
    assert.ok(hasIndexFrontmatter(text, skill), skill + '/SKILL.md 的元数据不满足索引契约')
  }
})

test('frontmatter check still rejects a body that leaks before the delimiter', () => {
  // 这个 fixture 必须是「注释块之后、分隔符之前夹了一行正文」，
  // 才能同时压住 opening 判定。若只用 '# heading\n---'，marker 会落在正文之后，
  // 断言退化成只测 opening 的一半，删掉 name/description 校验也依然为真。
  const leaked = '<!-- vendored -->\n# Real heading\n---\nname: leaked\ndescription: x\n---\n'
  assert.equal(hasIndexFrontmatter(leaked, 'leaked'), false, '正文抢先出现必须判失败')

  // 逐项压住三半契约：缺 name、name 不符、缺 description 都必须为假。
  assert.equal(hasIndexFrontmatter('---\ndescription: x\n---\n', 'ok'), false, '缺 name 必须失败')
  assert.equal(hasIndexFrontmatter('---\nname: other\ndescription: x\n---\n', 'ok'), false, 'name 不符必须失败')
  assert.equal(hasIndexFrontmatter('---\nname: ok\n---\n', 'ok'), false, '缺 description 必须失败')

  // 正例：真实 vendored 头部形态（注释块 + BOM + CRLF）必须通过。
  const vendored = '<!-- a -->\r\n\ufeff<!-- b -->\r\n---\r\nname: ok\r\ndescription: y\r\n---\r\n'
  assert.equal(hasIndexFrontmatter(vendored, 'ok'), true, '合法的 vendored 头部必须通过')
})

test('each bundled skill has a human-readable summary in both languages', async () => {
  const { ALL_SKILLS: skills } = createRequire(import.meta.url)('../scripts/lib/skills.js')

  // 真执行客户端产物：lib/client.js 是 window.__ModuleLoader__.load({id, factory}) 形态，
  // 造一个最小宿主把 factory 接住，即可拿到真实导出面。
  // 这样验证的是「构建产物里的简介表」，而不是源码文本 —— 与门禁的既有原则一致。
  const clientSource = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let captured
  const sandbox = {
    __ModuleLoader__: {
      load(entry) {
        captured = entry
      },
    },
  }
  const { createContext, runInNewContext } = await import('node:vm')
  runInNewContext(clientSource, { window: sandbox, console, Symbol, Object, Array, Set, JSON })

  assert.ok(captured, 'lib/client.js 未调用 __ModuleLoader__.load')
  assert.equal(captured.id, '@wenaixi/cfbridge')

  // factory 需要 require('react') 等外部模块；这里只关心模块内部的简介表，
  // 因此注入最小替身让 factory 能跑完即可。
  const reactStub = {
    createElement: (...args) => ({ args }),
    useState: (initial) => [initial, () => {}],
  }
  const primitivesStub = { Switch: () => null, StateDot: () => null }
  const exportsObj = captured.factory((name) => {
    if (name === 'react') return reactStub
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub
    throw new Error('unexpected require: ' + name)
  })

  assert.equal(typeof exportsObj.apply, 'function', 'client 半侧必须导出 apply')

  // 简介表是模块私有符号，无法从导出面直接取；因此断言「产物里每个技能都有一条简介条目」。
  // 键的形态取决于标识符合法性：含连字符的会带引号（'agents-sdk'），纯标识符不带（cfbridge），
  // 所以两种形态都要接受 —— 断言的是"这条简介存在"，不是"它怎么写引号"。
  const summaryBlock = clientSource.slice(
    clientSource.indexOf('const SKILL_SUMMARY = {'),
    clientSource.indexOf('/**', clientSource.indexOf('const SKILL_SUMMARY = {')),
  )
  assert.ok(summaryBlock.length > 0, 'lib/client.js 中找不到 SKILL_SUMMARY 表')
  for (const skill of skills) {
    const escaped = skill.replace(/[-]/g, '\\-')
    const pattern = new RegExp('(?:["\']' + escaped + '["\']|\\b' + escaped + ')\\s*:\\s*\\{\\s*zh:')
    assert.match(summaryBlock, pattern, 'lib/client.js 缺少技能简介: ' + skill)
  }
  // 每条简介都必须中英成对，且中文非空。
  for (const line of summaryBlock.split('\n')) {
    if (!line.includes('zh:') || !line.includes('en:')) continue
    assert.match(line, /zh:\s*'[^']+'/, '存在空的中文简介: ' + line.trim())
    assert.match(line, /en:\s*'[^']+'/, '存在空的英文简介: ' + line.trim())
  }
})