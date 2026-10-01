import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, utimes, rename, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, createProviderForTest, isSkillCatalogEvent } from '../lib/cfbridge.js'

const { ALL_SKILLS: SKILLS } = createRequire(import.meta.url)('../scripts/lib/skills.js')

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
test('Config schema accepts and defaults rank, cache, and watchSkills', async () => {
  const { Config } = await import('../lib/cfbridge.js')
  const resolved = Config({})
  assert.equal(resolved.providerName, 'cfbridge')
  assert.equal(resolved.rank, 550)
  assert.equal(resolved.cache, true)
  assert.equal(resolved.watchSkills, false)

  const custom = Config({ rank: 800, cache: false, watchSkills: true })
  assert.equal(custom.rank, 800)
  assert.equal(custom.cache, false)
  assert.equal(custom.watchSkills, true)
})
test('Provider supports custom rank and reuses cached candidates when mtime is unchanged', async () => {
  const root = await fixture()
  const provider = createProviderForTest(root, 'cfbridge', console, 700, true)
  const first = await provider.list({})
  assert.equal(first.length, 1)
  assert.equal(first[0].name, 'alpha')
  assert.equal(first[0].rank, 700)

  // 再次调用，此时文件未修改，复用缓存且 rank 保持 700
  const second = await provider.list({})
  assert.equal(second.length, 1)
  assert.equal(second[0].name, 'alpha')
  assert.equal(second[0].rank, 700)
})
test('apply mounts file watcher and emits skills/change on markdown edit when watchSkills is true', async () => {
  const root = await fixture()
  const events = []
  const disposers = []
  const mockCtx = {
    logger: { warn() {}, debug() {}, info() {} },
    skills: {
      registerProvider(factory) {
        // 模拟 dsh-skill registry：真实调用工厂并注入 control；
        // invalidate 回调即宿主收到失效通知（registry 会广播 skills/change）。
        factory({
          invalidate: () => events.push('skills/change'),
          signal: new AbortController().signal,
        })
        return () => {}
      },
    },
    on: () => () => {},
    emit: () => {},
    effect: (fn) => {
      const d = fn()
      disposers.push(d)
      return d
    }
  }

  apply(mockCtx, { skillDir: root, providerName: 'cfbridge', watchSkills: true })
  assert.equal(disposers.length, 1)

  // 修改文件触发 watcher
  await writeFile(join(root, 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: Updated\n---\nBody\n')
  await new Promise(r => setTimeout(r, 300))
  assert.ok(events.includes('skills/change'), 'expected skills/change event emitted on file write')

  // 调用清理函数释放句柄
  for (const d of disposers) d()
})

test('invalidate clears the mtime cache and the next list rereads', async () => {
  const root = await fixture()
  const provider = createProviderForTest(root, 'cfbridge', { warn() {} }, 550, true, () => {})
  const file = join(root, 'alpha', 'SKILL.md')
  const t = Date.now()
  await utimes(file, t / 1000, t / 1000)
  const first = await provider.list({})
  assert.equal(first[0].description, 'Alpha skill')
  // 内容变了但 mtime 保持不变：命中缓存窗口
  await writeFile(file, '---\nname: alpha\ndescription: Changed\n---\nNew body\n')
  await utimes(file, t / 1000, t / 1000)
  const stale = await provider.list({})
  assert.equal(stale[0].description, 'Alpha skill')
  // invalidate 强制清缓存，下一次 list 必须重读
  provider.invalidate()
  const fresh = await provider.list({})
  assert.equal(fresh[0].description, 'Changed')
})

test('isSkillCatalogEvent aligns watcher filtering with provider discovery', () => {
  assert.equal(isSkillCatalogEvent('SKILL.md'), true)
  assert.equal(isSkillCatalogEvent('foo/SKILL.md'), true)
  assert.equal(isSkillCatalogEvent('foo\\SKILL.md'), true)
  assert.equal(isSkillCatalogEvent('foo/README.md'), false)
  // 顶层无斜杠事件（README.md、foo）无法与目录创建/删除/重命名区分，保守放行；
  // 误放行的代价只是带 mtime 缓存的廉价 list 刷新，漏放行则会错过目录级变更。
  assert.equal(isSkillCatalogEvent('README.md'), true)
  assert.equal(isSkillCatalogEvent('foo/docs/notes.md'), false)
  assert.equal(isSkillCatalogEvent('foo'), true)
  assert.equal(isSkillCatalogEvent('.hidden'), false)
  assert.equal(isSkillCatalogEvent('.hidden/SKILL.md'), false)
  assert.equal(isSkillCatalogEvent(''), false)
  assert.equal(isSkillCatalogEvent(null), true)
  assert.equal(isSkillCatalogEvent(undefined), true)
})

test('watcher refreshes on skill directory rename and removal', { skip: process.platform === 'linux' }, async () => {
  const root = await fixture()
  const events = []
  const disposers = []
  const mockCtx = {
    logger: { warn() {}, debug() {}, info() {} },
    skills: {
      registerProvider(factory) {
        factory({ invalidate: () => events.push('skills/change'), signal: new AbortController().signal })
        return () => {}
      },
    },
    on: () => () => {},
    emit: () => {},
    effect: (fn) => { const d = fn(); disposers.push(d); return d },
  }
  apply(mockCtx, { skillDir: root, providerName: 'cfbridge', watchSkills: true })
  // 重命名技能目录：目录级事件（无 .md 文件事件伴随），旧实现会漏报
  await rename(join(root, 'alpha'), join(root, 'beta'))
  await new Promise((r) => setTimeout(r, 300))
  assert.ok(events.includes('skills/change'), 'expected skills/change on directory rename')
  events.length = 0
  // 删除整个技能目录：纯 rename 事件，旧实现零刷新
  await rm(join(root, 'beta'), { recursive: true })
  await new Promise((r) => setTimeout(r, 300))
  assert.ok(events.includes('skills/change'), 'expected skills/change on directory removal')
  for (const d of disposers) d()
})
