// cfbridge 综合测试入口。
// 默认运行构建、Provider 合同、Bundle 校验、独立 demo 和 Wrangler 只读检查。

const { spawnSync } = require('child_process')
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const subset = process.argv[2]
const npmCommand = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm'
const npmArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm'] : []
const STEPS = [
  { name: 'build', label: 'TypeScript 构建', command: ['npm', 'run', 'build'] },
  { name: 'typecheck', label: 'TypeScript 类型检查', command: ['npm', 'run', 'typecheck'] },
  { name: 'provider', label: 'Provider 行为测试', command: [process.execPath, '--test', 'tests/provider.test.mjs'] },
  { name: 'metadata', label: 'Bundle 元数据测试', command: [process.execPath, '--test', 'tests/bundle-metadata.test.mjs'] },
  { name: 'demo', label: '独立 demo 文档测试', command: [process.execPath, '--test', 'tests/demo-config.test.mjs'] },
  { name: 'check', label: '仓库配置与安全检查', command: [process.execPath, 'scripts/check.js'] },
  { name: 'bundle', label: 'Bundle manifest 与结构校验', command: [process.execPath, 'scripts/validate-bundle.js', '--strict-router'] },
  { name: 'wrangler', label: 'Wrangler CLI 只读验证', command: [process.execPath, 'scripts/test-wrangler.js'] },
]

function runStep(step) {
  console.log('\n=== ' + step.label + ' ===')
  const command = [...step.command]
  if (process.platform === 'win32' && command[0] === 'npm') {
    command[0] = npmCommand
    command.splice(1, 0, ...npmArgs)
  }
  const result = spawnSync(command[0], command.slice(1), { cwd: ROOT, stdio: 'inherit', shell: false })
  if (result.error) console.error(result.error.message)
  return result.status === 0
}

function main() {
  const steps = subset ? STEPS.filter((step) => step.name === subset) : STEPS
  if (subset && steps.length === 0) {
    console.error('Unknown subset: ' + subset)
    console.error('Available: ' + STEPS.map((step) => step.name).join(', '))
    process.exit(1)
  }
  let passed = 0
  for (const step of steps) if (runStep(step)) passed++
  console.log('\n=== Summary ===')
  console.log(passed + '/' + steps.length + ' step(s) passed')
  process.exit(passed === steps.length ? 0 : 1)
}

main()
