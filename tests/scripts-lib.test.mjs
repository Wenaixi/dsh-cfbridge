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
