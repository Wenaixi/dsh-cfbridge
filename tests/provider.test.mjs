import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, createProviderForTest } from '../lib/cfbridge.js'

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
