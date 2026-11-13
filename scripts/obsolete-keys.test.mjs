import test from 'node:test'
import assert from 'node:assert/strict'
import { obsoleteConfigKeys } from '../lib/cfbridge.js'

/**
 * 旧配置键识别：这些字段在 CHANGELOG 里已被移除（双轴隐藏名单合并为单一
 * disabledSkills），但用户 profile 里可能仍留着它们，且 schemastery 在非
 * strict 模式下会静默保留未知键 —— 不主动清理就会永久存在。
 */
test('识别两个已移除的历史字段', () => {
  const keys = obsoleteConfigKeys({
    modelHiddenSkills: [],
    userHiddenSkills: [],
    disabledSkills: [],
  })
  assert.deepEqual(keys.sort(), ['modelHiddenSkills', 'userHiddenSkills'])
})

test('配置干净时返回空数组', () => {
  assert.deepEqual(obsoleteConfigKeys({ disabledSkills: ['a'], mcpEnabled: true }), [])
})

test('非对象输入安全返回空数组', () => {
  assert.deepEqual(obsoleteConfigKeys(null), [])
  assert.deepEqual(obsoleteConfigKeys(undefined), [])
  assert.deepEqual(obsoleteConfigKeys('not-an-object'), [])
})

test('只报告存在且值为空的遗留键，不误报新字段', () => {
  const keys = obsoleteConfigKeys({ modelHiddenSkills: ['x'], availableSkills: ['y'] })
  assert.deepEqual(keys, ['modelHiddenSkills'])
})
