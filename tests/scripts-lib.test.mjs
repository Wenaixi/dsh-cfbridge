// scripts/lib 共享模块行为测试。
// 消费方：scripts/ 域（CommonJS 脚本）与 tests/ 域（ESM 测试）——ESM 侧经 createRequire 引入。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

test('skills single source exposes ALL_SKILLS (14) and VENDORED_SKILLS (13)', () => {
  const lib = require('../scripts/lib/skills.js')
  assert.equal(lib.ALL_SKILLS.length, 14)
  assert.ok(lib.ALL_SKILLS.includes('cfbridge'))
  assert.equal(lib.VENDORED_SKILLS.length, 13)
  assert.ok(!lib.VENDORED_SKILLS.includes('cfbridge'))
  assert.deepEqual(lib.VENDORED_SKILLS, lib.ALL_SKILLS.filter((name) => name !== 'cfbridge'))
  assert.equal(new Set(lib.ALL_SKILLS).size, 14)
  assert.equal(new Set(lib.VENDORED_SKILLS).size, 13)
})

test('hasTokenLeak matches the same 9 token families as the security gate', () => {
  const { hasTokenLeak } = require('../scripts/lib/fs.js')
  assert.equal(hasTokenLeak('cfat_' + 'A'.repeat(20)), true)
  assert.equal(hasTokenLeak('cfut_' + 'A'.repeat(20)), true)
  assert.equal(hasTokenLeak('cfoat_' + 'A'.repeat(20)), true)
  assert.equal(hasTokenLeak('sk-' + 'a'.repeat(22)), true)
  assert.equal(hasTokenLeak('Bearer ' + 'a'.repeat(44)), true)
  assert.equal(hasTokenLeak('ghp_' + 'A'.repeat(34)), true)
  assert.equal(hasTokenLeak('AKIA' + 'A'.repeat(16)), true)
  assert.equal(hasTokenLeak('-----BEGIN ' + 'RSA PRIVATE KEY-----'), true)
  assert.equal(hasTokenLeak('AIza' + 'A'.repeat(35)), true)
  assert.equal(hasTokenLeak('plain text without tokens'), false)
})

test('removeLegacySkillLink honors requireBundleTarget semantics', async () => {
  const { mkdtemp, mkdir, symlink, writeFile } = await import('node:fs/promises')
  const os = await import('node:os')
  const pathMod = await import('node:path')
  const { removeLegacySkillLink } = require('../scripts/lib/fs.js')
  const home = await mkdtemp(pathMod.join(os.tmpdir(), 'cfbridge-scripts-'))
  try {
    const skillsDir = pathMod.join(home, 'skills')
    await mkdir(skillsDir)
    await mkdir(pathMod.join(home, 'bundle', 'cfbridge', 'skills'), { recursive: true })
    await mkdir(pathMod.join(home, 'other', 'place'), { recursive: true })
    await writeFile(pathMod.join(home, 'plain-file'), 'x')

    // bundle 指向的链接：两种语义都删
    await symlink(pathMod.join(home, 'bundle', 'cfbridge', 'skills'), pathMod.join(skillsDir, 'cfbridge'), 'junction')
    assert.equal(removeLegacySkillLink(home, {}), true)
    assert.equal(require('node:fs').existsSync(pathMod.join(skillsDir, 'cfbridge')), false)

    // 指向别处的链接：install 语义不删，uninstall 语义删
    await symlink(pathMod.join(home, 'other', 'place'), pathMod.join(skillsDir, 'cfbridge'), 'junction')
    assert.equal(removeLegacySkillLink(home, {}), false)
    assert.equal(require('node:fs').existsSync(pathMod.join(skillsDir, 'cfbridge')), true)
    assert.equal(removeLegacySkillLink(home, { requireBundleTarget: false }), true)
    assert.equal(require('node:fs').existsSync(pathMod.join(skillsDir, 'cfbridge')), false)

    // 真实目录：install 语义删除（v0.3.0 copyDir fallback 产物）
    await mkdir(pathMod.join(skillsDir, 'cfbridge'))
    assert.equal(removeLegacySkillLink(home, {}), true)

    // 普通文件：两种语义都不删
    await writeFile(pathMod.join(skillsDir, 'cfbridge'), 'plain')
    assert.equal(removeLegacySkillLink(home, {}), false)
    assert.equal(removeLegacySkillLink(home, { requireBundleTarget: false }), false)
  } finally {
    await (await import('node:fs/promises')).rm(home, { recursive: true, force: true })
  }
})
