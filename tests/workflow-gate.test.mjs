import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'

// 工作流是发布路径上的可执行契约：CI 与 Release 必须调用综合套件。
// 这条断言保护的是「唯一验证入口」这一架构决定本身 ——
// 少了它，把 npm test 换回零散步骤不会有任何东西变红（实测确认过）。
const workflows = {
  ci: parse(await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')),
  release: parse(await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')),
}

/** 取某个 job 的所有 run 步骤命令，用于断言真实执行内容而非 YAML 文本。 */
function runCommands(workflow, jobName) {
  const steps = workflow?.jobs?.[jobName]?.steps ?? []
  return steps.filter((step) => typeof step.run === 'string').map((step) => step.run.trim())
}

test('CI runs the canonical test suite instead of ad-hoc gate steps', () => {
  const commands = runCommands(workflows.ci, 'test')
  assert.ok(commands.includes('npm test'), 'CI 必须调用综合套件')
  // 零散步骤必须让位，否则同一批检查会跑两遍。
  assert.ok(!commands.includes('npm run check'), '综合套件已包含 check，不应重复')
  assert.ok(!commands.includes('npm run validate:bundle'), '综合套件含严格结构校验，不应重复')
  assert.ok(commands.includes('npm pack --dry-run'), '打包预检必须保留')
})

test('release runs the canonical suite and keeps version and pack guards', () => {
  const commands = runCommands(workflows.release, 'publish-npm')
  assert.ok(commands.includes('npm test'), 'Release 必须调用综合套件')
  assert.ok(!commands.includes('npm run check'), '综合套件已包含 check，不应重复')
  assert.ok(!commands.includes('npm run validate:bundle'), '综合套件含严格结构校验，不应重复')
  assert.ok(commands.includes('npm pack --dry-run'), '打包预检必须保留')
  const tagGuard = commands.some((command) => command.includes('GITHUB_REF_NAME') && command.includes('PKG_VERSION'))
  assert.ok(tagGuard, 'tag 与 package.json 版本一致性校验必须保留')
})
