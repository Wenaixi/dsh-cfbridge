import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)))
const patchText = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const patch = parse(patchText)
const entries = patch.flatMap((item) => item.insert ?? [])

test('bundle exposes package identity and built entry', () => {
  assert.equal(pkg.name, '@wenaixi/cfbridge')
  assert.equal(pkg.version, '0.5.0')
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

test('all bundled skills have frontmatter', async () => {
  const skills = ['cfbridge', 'cloudflare', 'wrangler', 'agents-sdk', 'durable-objects', 'cloudflare-one', 'cloudflare-one-migrations', 'cloudflare-email-service', 'sandbox-next', 'sandbox-stable', 'sandbox-migrate-to-next', 'turnstile-spin', 'web-perf', 'workers-best-practices']
  for (const skill of skills) {
    const text = await readFile(new URL('../skills/' + skill + '/SKILL.md', import.meta.url), 'utf8')
    assert.match(text, /^(?:<!--.*-->\n|\ufeff?\s*)*---\r?\n/)
    assert.match(text, new RegExp('^name: ' + skill + '$', 'm'))
    assert.match(text, /^description:\s*.+$/m)
  }
})
