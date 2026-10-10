// 命令行配置自愈与自动重新生成工具
//
// 当配置文件因语法破坏、截断、乱码等意外损坏时，
// 自动提取其中残存的有效配置（运行模式、技能开关、MCP 参数等），
// 并自动备份原文件后重新生成标准健康的配置文件。
//
// 使用：
//   node scripts/repair-config.js                       # 检查并自愈根目录 cordis.patch.yml
//   node scripts/repair-config.js --file <path>         # 自愈指定文件
//   node scripts/repair-config.js --profile <name>      # 自愈指定 DSH profile 下的配置
//   node scripts/repair-config.js --dry-run             # 仅演练检测，不写回文件

const path = require('path')
const fs = require('fs')

const { ROOT, log, dshHome: resolveDshHome, fileExists } = require('./lib/fs')

function parseArgs(argv) {
  const opts = {
    filePath: path.join(ROOT, 'cordis.patch.yml'),
    profile: null,
    backup: true,
    dryRun: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--file' || a === '-f') {
      opts.filePath = path.resolve(process.cwd(), argv[++i])
    } else if (a.startsWith('--file=')) {
      opts.filePath = path.resolve(process.cwd(), a.slice('--file='.length))
    } else if (a === '--profile' || a === '-p') {
      opts.profile = argv[++i]
    } else if (a.startsWith('--profile=')) {
      opts.profile = a.slice('--profile='.length)
    } else if (a === '--dry-run') {
      opts.dryRun = true
    } else if (a === '--no-backup') {
      opts.backup = false
    } else if (a === '--help' || a === '-h') {
      printHelp()
      process.exit(0)
    } else {
      log('warn', '未知参数被忽略: ' + a)
    }
  }

  if (opts.profile) {
    const dshHome = resolveDshHome()
    const profilePatch = path.join(dshHome, 'profiles', opts.profile, 'cordis.patch.yml')
    const profileYml = path.join(dshHome, 'profiles', opts.profile, 'cordis.yml')
    opts.filePath = fileExists(profilePatch) ? profilePatch : profileYml
  }

  return opts
}

function printHelp() {
  console.log(`Usage: node scripts/repair-config.js [options]

Options:
  --file, -f <path>     Target configuration file to repair (default: cordis.patch.yml).
  --profile, -p <name>  Repair configuration in specified DSH profile directory.
  --dry-run             Simulate repair without modifying any files on disk.
  --no-backup           Do not create a .bak backup file before overwriting.
  --help, -h            Show this message.`)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  log('info', '正在检查配置文件: ' + opts.filePath)

  let autoHealConfigFile
  try {
    const mod = await import('../lib/config-healer.js')
    autoHealConfigFile = mod.autoHealConfigFile
  } catch (err) {
    try {
      // 降级尝试从 cfbridge 主入口加载
      const mod = await import('../lib/cfbridge.js')
      autoHealConfigFile = mod.autoHealConfigFile
    } catch {
      log('err', '未找到已构建的自愈模块 lib/config-healer.js，请先运行 npm run build')
      process.exit(1)
    }
  }

  try {
    const result = await autoHealConfigFile(opts.filePath, {
      backup: opts.backup,
      dryRun: opts.dryRun,
    })

    if (!result.healed) {
      log('ok', '配置文件结构完整且语法合法，状态健康，无需修复。')
      return
    }

    log('warn', '检测到配置文件存在损坏或结构异常，自愈引擎已介入！')
    for (const repair of result.repairs) {
      log('info', ' -> ' + repair)
    }

    if (result.backupPath) {
      log('ok', '原始文件已安全备份至: ' + result.backupPath)
    }

    if (opts.dryRun) {
      log('info', '[DRY-RUN] 演练模式结束，未修改任何磁盘文件。重新生成的内容预览:')
      console.log('--- BEGIN REGENERATED CONFIG ---')
      console.log(result.content)
      console.log('--- END REGENERATED CONFIG ---')
    } else {
      log('ok', '配置文件已成功自愈并自动重新生成: ' + opts.filePath)
    }
  } catch (err) {
    log('err', '自愈执行失败: ' + (err.message || String(err)))
    process.exit(1)
  }
}

main().catch((err) => {
  log('err', err.stack || err.message)
  process.exit(1)
})
