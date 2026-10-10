import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { parse } from 'yaml'

import {
  healConfig,
  sanitizeSkillNames,
  unwrapLazy,
  extractCorruptedYaml,
  generatePatchYaml,
  autoHealConfigFile,
} from '../lib/config-healer.js'

const require = createRequire(import.meta.url)
const { hasTokenLeak } = require('../scripts/lib/fs.js')

const tempDirs = []
function trackTemp(dir) {
  tempDirs.push(dir)
  return dir
}

test.after(async () => {
  for (const dir of tempDirs) {
    try {
      await rm(dir, { recursive: true, force: true })
    } catch {}
  }
})

test('healConfig cleanses malformed root and primitives', () => {
  // 1. 传入 null / 数字 / 非法根对象
  const res1 = healConfig(null)
  assert.equal(res1.changed, true)
  assert.equal(res1.config.providerName, 'cfbridge')
  assert.equal(res1.config.loadMode, 'global')
  assert.equal(res1.config.rank, 0)
  assert.equal(res1.config.cache, true)
  assert.equal(res1.config.watchSkills, false)
  assert.deepEqual(res1.config.disabledSkills, [])

  // 2. 纠正保留名 runtime 与首尾空白
  const res2 = healConfig({ providerName: 'runtime', loadMode: 'invalid_mode', rank: NaN })
  assert.equal(res2.changed, true)
  assert.equal(res2.config.providerName, 'cfbridge')
  assert.equal(res2.config.loadMode, 'global')
  assert.equal(res2.config.rank, 0)

  // 3. 正常自定义配置保持不变
  const res3 = healConfig({
    providerName: 'cfbridge',
    loadMode: 'preset',
    rank: 10,
    cache: false,
    watchSkills: true,
    disabledSkills: ['turnstile-spin'],
  })
  assert.equal(res3.changed, false)
  assert.equal(res3.config.loadMode, 'preset')
  assert.equal(res3.config.rank, 10)
  assert.equal(res3.config.cache, false)
  assert.equal(res3.config.watchSkills, true)
  assert.deepEqual(res3.config.disabledSkills, ['turnstile-spin'])
})

test('sanitizeSkillNames and unwrapLazy filter invalid names and unroll functions', () => {
  // 懒求值函数展开
  const lazyValue = () => () => ['wrangler', 'invalid skill with space', 123, 'cloudflare', 'wrangler']
  const { names, dropped } = sanitizeSkillNames(lazyValue)
  assert.deepEqual(names, ['wrangler', 'cloudflare'], '合法技能名成功保留并去重')
  assert.equal(dropped.length, 2, '非法名称被正确剔除')

  // 深度懒求值展开
  const unwrapped = unwrapLazy(() => () => () => 'nested', 'default')
  assert.equal(unwrapped, 'nested')
})

test('extractCorruptedYaml recovers settings from truncated YAML (power-cut simulation)', () => {
  const truncatedYaml = `- insert:
    - id: mcp-cloudflare
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        url: https://mcp.cloudflare.com/mcp
        toolCallTimeoutMs: 180000
    - id: cfbridge
      name: '@wenaixi/cfbridge'
      config:
        loadMode: preset
        disabledSkills:
          - turnstile-spin
          - cloudflare-one
          -`

  const extracted = extractCorruptedYaml(truncatedYaml)
  assert.equal(extracted.cfbridge.loadMode, 'preset', '成功抢救 loadMode')
  assert.deepEqual(extracted.cfbridge.disabledSkills, ['turnstile-spin', 'cloudflare-one'], '成功抢救断裂前的技能列表')
  assert.equal(extracted.mcp.toolCallTimeoutMs, 180000, '成功抢救 MCP 超时设定')
  assert.ok(extracted.rawRepairs.length > 0, '记录了提取自愈日志')
})

test('extractCorruptedYaml recovers settings from severely corrupted YAML with syntax errors and tabs', () => {
  const shatteredYaml = `
[corrupted_bracket
\tloadMode: preset
  disabledSkills: [wrangler, agents-sdk, bad skill with spaces]
random_junk_line_here: {unclosed
failOnStartupError: false
toolCallTimeoutMs: 90000
url: https://mcp.cloudflare.com/custom
`

  const extracted = extractCorruptedYaml(shatteredYaml)
  assert.equal(extracted.cfbridge.loadMode, 'preset')
  assert.deepEqual(extracted.cfbridge.disabledSkills, ['wrangler', 'agents-sdk'])
  assert.equal(extracted.mcp.toolCallTimeoutMs, 90000)
  assert.equal(extracted.mcp.failOnStartupError, false)
  assert.equal(extracted.mcp.url, 'https://mcp.cloudflare.com/custom')
})

test('generatePatchYaml produces compliant, secure, token-free patch YAML', () => {
  const yamlText = generatePatchYaml({
    cfbridgeConfig: {
      loadMode: 'preset',
      disabledSkills: ['turnstile-spin'],
      modelHiddenSkills: ['wrangler'],
    },
    mcpOverrides: {
      toolCallTimeoutMs: 150000,
    },
  })

  // 1. 安全检查：绝对无 Token 泄露
  assert.equal(hasTokenLeak(yamlText), false, '生成的 YAML 严禁包含真实 Token')
  assert.match(yamlText, /Authorization:\s*!!js\s+'`Bearer \${process\.env\.CLOUDFLARE_API_TOKEN}`'/, '必须使用动态环境变量引用')
  assert.match(yamlText, /failOnStartupError:\s*false/, 'failOnStartupError 必须为 false')

  // 2. 结构检查：必须包含两个核心行
  assert.match(yamlText, /id:\s*mcp-cloudflare/)
  assert.match(yamlText, /id:\s*cfbridge/)
  assert.match(yamlText, /loadMode:\s*preset/)
  assert.match(yamlText, /- turnstile-spin/)
  assert.match(yamlText, /- wrangler/)
  assert.match(yamlText, /toolCallTimeoutMs:\s*150000/)

  // 3. 语法检查：标准 YAML 解析器必须能够通过（不抛错）
  // 注意：Node 中的标准 parse 遇到 !!js 会发出解析警告但不会抛错
  const parsed = parse(yamlText)
  assert.ok(Array.isArray(parsed), '解析结果必须为顶层数组')
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].insert.length, 2)
})

test('autoHealConfigFile backs up corrupted file and regenerates clean config on disk', async () => {
  const dir = trackTemp(await mkdtemp(join(tmpdir(), 'cfbridge-heal-')))
  const targetPath = join(dir, 'cordis.patch.yml')

  // 制造一个损坏文件
  const brokenContent = `
- insert:
    - id: broken
      broken yaml: [unclosed
      loadMode: preset
      disabledSkills:
        - turnstile-spin
`
  await writeFile(targetPath, brokenContent, 'utf8')

  // 执行自愈
  const res = await autoHealConfigFile(targetPath, { backup: true })
  assert.equal(res.healed, true, '损坏文件必须触发自愈')
  assert.ok(res.backupPath, '必须生成 .bak 备份文件')

  // 验证备份内容为原始损坏内容
  const backupText = await readFile(res.backupPath, 'utf8')
  assert.equal(backupText, brokenContent)

  // 验证原路径被重新生成为健康文件，且成功抢救了配置
  const healedText = await readFile(targetPath, 'utf8')
  assert.match(healedText, /id:\s*cfbridge/)
  assert.match(healedText, /loadMode:\s*preset/)
  assert.match(healedText, /- turnstile-spin/)
  assert.equal(hasTokenLeak(healedText), false)

  // 验证再次运行自愈对健康文件是幂等的（不重复触发自愈）
  const res2 = await autoHealConfigFile(targetPath, { backup: true })
  assert.equal(res2.healed, false, '健康文件无需再次自愈')
})
