import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const demoReadme = await readFile(new URL('../demo/README.md', import.meta.url), 'utf8')
const demoPatch = await readFile(new URL('../demo/cfbridge-demo.cordis.yml', import.meta.url), 'utf8')

test('isolated demo documents package installation and config verification', () => {
  assert.match(demoReadme, /DSH_HOME/)
  assert.match(demoReadme, /dsh plugin --profile demo add link:/)
  assert.match(demoReadme, /--dump-config/)
  assert.match(demoReadme, /@wenaixi\/cfbridge/)
  assert.doesNotMatch(demoReadme, /skills-bundle|src\/\*-skill\.js/)
  assert.match(demoReadme, /lib\/cfbridge\.js|TypeScript/)
  assert.match(demoPatch, /@wenaixi\/cfbridge/)
})

test('isolated demo patch is disabled and token-free', () => {
  assert.match(demoPatch, /disabled:\s*true/)
  assert.doesNotMatch(demoPatch, /CLOUDFLARE_API_TOKEN|Bearer\s+\S+/)
})
