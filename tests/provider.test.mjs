import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, createProviderForTest } from '../lib/cfbridge.js'

const SKILLS = ['cfbridge', 'cloudflare', 'wrangler', 'agents-sdk', 'durable-objects', 'cloudflare-one', 'cloudflare-one-migrations', 'cloudflare-email-service', 'sandbox-next', 'sandbox-stable', 'sandbox-migrate-to-next', 'turnstile-spin', 'web-perf', 'workers-best-practices']

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'cfbridge-provider-'))
  await mkdir(join(root, 'alpha'))
  await writeFile(join(root, 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: Alpha skill\nwhenToUse: Use alpha\n---\nAlpha body\n')
  await mkdir(join(root, 'broken'))
  await writeFile(join(root, 'broken', 'SKILL.md'), '# missing frontmatter\n')
  return root
}

function context() {
  const registrations = []
  return {
    registrations,
    logger: { warn() {}, debug() {}, info() {} },
    skills: {
      registerProvider(factory) {
        registrations.push(factory)
        return () => {}
      },
    },
    effect(effect) {
      return effect()
    },
    on() {
      return () => {}
    },
  }
}

test('Provider discovers metadata and loads body on demand', async () => {
  const root = await fixture()
  const ctx = context()
  apply(ctx, { skillDir: root, providerName: 'cfbridge' })
  const provider = ctx.registrations[0]({ invalidate() {}, signal: new AbortController().signal })
  const candidates = await provider.list({})
  assert.equal(candidates.length, 1)
  assert.deepEqual(candidates[0], {
    name: 'alpha',
    description: 'Alpha skill',
    whenToUse: 'Use alpha',
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled',
    provider: 'cfbridge',
    rank: 550,
    locator: { path: join(root, 'alpha', 'SKILL.md'), directory: join(root, 'alpha') },
    resourceBase: { kind: 'directory', path: join(root, 'alpha') },
    path: join(root, 'alpha', 'SKILL.md'),
  })
  assert.equal(candidates[0].content, undefined)
  const loaded = await provider.get(candidates[0], {})
  assert.equal(loaded.content, 'Alpha body')
})

test('Provider accepts a comment and BOM preamble before frontmatter', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cfbridge-preamble-'))
  await mkdir(join(root, 'preamble'))
  await writeFile(join(root, 'preamble', 'SKILL.md'), '<!-- generated header -->\n\ufeff<!-- second header -->\n---\nname: preamble\ndescription: Preamble skill\n---\nPreamble body\n')
  const provider = createProviderForTest(root, 'cfbridge', { warn() {} })
  const candidates = await provider.list({})
  assert.deepEqual(candidates.map((candidate) => candidate.name), ['preamble'])
  assert.equal((await provider.get(candidates[0], {})).content, 'Preamble body')
})

test('Provider discovers all bundled skills with vendored preamble', async () => {
  const provider = createProviderForTest('skills', 'cfbridge', { warn() {} })
  const candidates = await provider.list({})
  assert.deepEqual(candidates.map((candidate) => candidate.name), [...SKILLS].sort())
  const loaded = await provider.get(candidates.find((candidate) => candidate.name === 'cloudflare'), {})
  assert.match(loaded.content, /Cloudflare platform skill|Cloudflare Platform Skill/i)
})

test('Provider returns undefined for invalid invocation metadata during get', async () => {
  const root = await fixture()
  const warnings = []
  const provider = createProviderForTest(root, 'cfbridge', { warn(message) { warnings.push(message) } })
  const candidate = (await provider.list({})).find((item) => item.name === 'alpha')
  await writeFile(join(root, 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: Alpha skill\ndisable-model-invocation: maybe\n---\nAlpha body\n')
  assert.equal(await provider.get(candidate, {}), undefined)
  assert.match(warnings.join('\n'), /invalid invocation/i)
})

test('Provider rejects reserved runtime name', () => {
  const ctx = context()
  assert.throws(() => apply(ctx, { skillDir: 'skills', providerName: 'runtime' }), /保留名/)
})

test('Provider rejects cancellation and name drift', async () => {
  const root = await fixture()
  const ctx = context()
  apply(ctx, { skillDir: root, providerName: 'cfbridge' })
  const provider = ctx.registrations[0]({ invalidate() {}, signal: new AbortController().signal })
  const candidates = await provider.list({})
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(provider.list({ signal: controller.signal }), { name: 'AbortError' })
  await writeFile(join(root, 'alpha', 'SKILL.md'), '---\nname: beta\ndescription: Beta skill\n---\nBeta body\n')
  assert.equal(await provider.get(candidates[0], {}), undefined)
})

test('apply registers one Provider factory synchronously', () => {
  const ctx = context()
  apply(ctx, { skillDir: 'skills', providerName: 'cfbridge' })
  assert.equal(ctx.registrations.length, 1)
})

test('Provider handles hidden, missing, duplicate and invalid skills', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cfbridge-edge-'))
  await mkdir(join(root, '.hidden'))
  await mkdir(join(root, 'missing'))
  await mkdir(join(root, 'first'))
  await mkdir(join(root, 'second'))
  await mkdir(join(root, 'invalid'))
  await writeFile(join(root, 'first', 'SKILL.md'), '---\nname: duplicate\ndescription: First\n---\nFirst\n')
  await writeFile(join(root, 'second', 'SKILL.md'), '---\nname: duplicate\ndescription: Second\n---\nSecond\n')
  await writeFile(join(root, 'invalid', 'SKILL.md'), '---\nname: invalid\ndescription: [\n---\nBroken\n')
  const warnings = []
  const provider = createProviderForTest(root, 'cfbridge', { warn(message) { warnings.push(message) } })
  const candidates = await provider.list({})
  assert.deepEqual(candidates.map((candidate) => candidate.name), ['duplicate'])
  assert.equal(warnings.length, 3)
  assert.match(warnings.join('\n'), /missing|duplicate|frontmatter/)
})
