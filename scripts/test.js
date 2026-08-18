// cfbridge 综合测试入口。
// 默认运行所有测试；如果提供参数则只跑匹配的子集。
//   node scripts/test.js           # 全部
//   node scripts/test.js check     # 只跑安全/配置检查
//   node scripts/test.js preset    # 只跑 preset 验证
//   node scripts/test.js wrangler  # 只跑 Wrangler 只读验证
//   node scripts/test.js security  # 只跑 token 痕迹扫描

const { spawnSync } = require('child_process')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const subset = process.argv[2]

const STEPS = [
  { name: 'check', label: '仓库配置与安全检查', script: 'check.js' },
  { name: 'preset', label: 'Agent Preset 结构验证', script: 'validate-preset.js' },
  { name: 'wrangler', label: 'Wrangler CLI 只读验证', script: 'test-wrangler.js' },
]

function runStep(step) {
  console.log(`\n=== ${step.label} ===`)
  const result = spawnSync(process.execPath, [path.join(__dirname, step.script)], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  return result.status === 0
}

function main() {
  const steps = subset ? STEPS.filter((s) => s.name === subset) : STEPS
  if (subset && steps.length === 0) {
    console.error(`Unknown subset: ${subset}`)
    console.error(`Available: ${STEPS.map((s) => s.name).join(', ')}`)
    process.exit(1)
  }

  const total = steps.length
  let passed = 0
  for (const step of steps) {
    if (runStep(step)) passed++
  }

  console.log(`\n=== Summary ===`)
  console.log(`${passed}/${total} step(s) passed`)
  process.exit(passed === total ? 0 : 1)
}

main()