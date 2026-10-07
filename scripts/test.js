// cfbridge 综合测试入口。
// 默认运行构建、两类类型检查、行为测试（Provider / 元数据 / 客户端面板 / Wrangler 入口）、
// 仓库安全检查、Bundle 结构校验与 Wrangler 只读检查。
// 它是 CI、Release 与本地共用的唯一验证入口：改门禁只改这里。

const { spawnSync } = require('child_process')
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const subset = process.argv[2]
const npmCommand = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm'
const npmArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm'] : []
const STEPS = [
  { name: 'build', label: 'TypeScript 构建', command: ['npm', 'run', 'build'] },
  { name: 'typecheck', label: 'TypeScript 类型检查', command: ['npm', 'run', 'typecheck'] },
  { name: 'typecheck-client', label: '客户端半侧类型检查', command: ['npm', 'run', 'typecheck:client'] },
  { name: 'provider', label: 'Provider 行为测试', command: [process.execPath, '--test', 'tests/provider.test.mjs'] },
  { name: 'metadata', label: 'Bundle 元数据测试', command: [process.execPath, '--test', 'tests/bundle-metadata.test.mjs'] },
  { name: 'client-panel', label: '客户端面板行为测试', command: [process.execPath, '--test', 'tests/client-panel.test.mjs'] },
  { name: 'wrangler-entry', label: 'Wrangler 入口契约测试', command: [process.execPath, '--test', 'tests/wrangler-entry.test.mjs'] },
  { name: 'workflow-gate', label: 'CI/Release 门禁契约测试', command: [process.execPath, '--test', 'tests/workflow-gate.test.mjs'] },
  { name: 'demo', label: '独立 demo 文档测试', command: [process.execPath, '--test', 'tests/demo-config.test.mjs'] },
  { name: 'check', label: '仓库配置与安全检查', command: [process.execPath, 'scripts/check.js'] },
  { name: 'bundle', label: 'Bundle manifest 与结构校验', command: [process.execPath, 'scripts/validate-bundle.js', '--strict-router'] },
  { name: 'scripts', label: '脚本共享模块行为测试', command: [process.execPath, '--test', 'tests/scripts-lib.test.mjs'] },
  { name: 'wrangler', label: 'Wrangler CLI 只读验证', command: [process.execPath, 'scripts/test-wrangler.js'] },
]

function runStep(step) {
  console.log('\n=== ' + step.label + ' ===')
  const command = [...step.command]
  if (process.platform === 'win32' && command[0] === 'npm') {
    command[0] = npmCommand
    command.splice(1, 0, ...npmArgs)
  }
  const result = spawnSync(command[0], command.slice(1), { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], shell: false })
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
