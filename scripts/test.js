// cfbridge 综合测试入口。
// 默认运行所有测试；如果提供参数则只跑匹配的子集。
//   node scripts/test.js           # 全部
//   node scripts/test.js check     # 只跑仓库静态检查
//   node scripts/test.js bundle    # 只跑 bundle 静态校验
//   node scripts/test.js wrangler  # 只跑 Wrangler 只读验证
//
// v0.3.0 调整：
//   - 旧 subset 名 preset 改为 bundle（语义对齐）。
//   - 不再依赖 test-mcp.js（v0.3.0 起 MCP 三工具通过 dsh 加载；不写 standalone
//     smoke，避免在 CI 中误触发真实 Cloudflare API 调用）。

const { spawnSync } = require('child_process')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const subset = process.argv[2]

const STEPS = [
  { name: 'check', label: '仓库配置与安全检查（v0.3.0 bundle 入口 + 反转 web patch 校验）', script: 'check.js' },
  { name: 'bundle', label: 'Bundle manifest 与结构校验（cordis.patch.yml / SKILL.md / 脚本归档）', script: 'validate-bundle.js' },
  { name: 'wrangler', label: 'Wrangler CLI 只读验证', script: 'test-wrangler.js' },
]

function runStep(step) {
  console.log(`\n=== ${step.label} ===`)
  const result = spawnSync(process.execPath, [path.join(__dirname, step.script)], {
    cwd: ROOT, stdio: 'inherit',
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
  for (const step of steps) if (runStep(step)) passed++

  console.log(`\n=== Summary ===`)
  console.log(`${passed}/${total} step(s) passed`)
  process.exit(passed === total ? 0 : 1)
}

main()
