import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 所有 scripts/*.js 必须能被 node 解析。
 *
 * npm test 的 15 个 step 里没有任何一步跑 node --check，check.js 也只查
 * 文件是否存在。于是一次「删功能」重构把 uninstall-bundle.js 的赋值语句
 * 砍断后，全量测试依然 15/15 全绿，而 npm run uninstall:bundle 实际
 * 从那一刻起就完全跑不起来。
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function collectScripts(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...collectScripts(full))
    else if (name.endsWith('.js')) out.push(full)
  }
  return out
}

test('scripts 下所有 .js 都能被 node 解析', () => {
  const files = collectScripts(join(ROOT, 'scripts'))
  assert.ok(files.length > 0, '应至少发现一个脚本')
  const broken = []
  for (const file of files) {
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    if (r.status !== 0) broken.push(`${file}: ${(r.stderr || '').split('\n')[0]}`)
  }
  assert.deepEqual(broken, [], `存在语法破损脚本:\n${broken.join('\n')}`)
})
