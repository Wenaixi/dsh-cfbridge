// 一键安装 cfbridge Agent Preset 到用户 DSH preset 目录。
// 目标路径：%USERPROFILE%\.dsh\.agent-presets\cfbridge\
//
// 设计原则：
// - 复制 preset.yml、agent.cordis.yml、skills/ 到 DSH 用户 preset 目录
// - 不修改用户现有的 cordis.patch.yml（保持按需加载）
// - 如果目标目录已存在，给出提示并要求确认
// - 安装完成后打印验证步骤
//
// 使用：npm run install:preset

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DSH_HOME = process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh')
const PRESETS_DIR = path.join(DSH_HOME, '.agent-presets')
const TARGET = path.join(PRESETS_DIR, 'cfbridge')

const SOURCE_FILES = [
  'preset.yml',
  'agent.cordis.yml',
  'LICENSE',
]

function log(level, msg) {
  const prefix = { info: 'INFO', ok: 'OK  ', warn: 'WARN', err: 'ERR ' }[level] || 'INFO'
  console.log(`[${prefix}] ${msg}`)
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

function copyRecursive(src, dst) {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    ensureDir(dst)
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry))
    }
    return
  }
  fs.copyFileSync(src, dst)
}

function main() {
  log('info', `Source: ${ROOT}`)
  log('info', `DSH home: ${DSH_HOME}`)
  log('info', `Target preset dir: ${TARGET}`)

  // 1. 检查源文件齐全
  for (const f of SOURCE_FILES) {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) {
      log('err', `Missing source file: ${f}`)
      process.exit(1)
    }
  }

  // 2. 检查 skills 目录
  const skillsSrc = path.join(ROOT, 'skills')
  if (!fs.existsSync(skillsSrc)) {
    log('err', 'Missing skills/ directory')
    process.exit(1)
  }

  // 3. 如果目标已存在，先警告
  if (fs.existsSync(TARGET)) {
    log('warn', 'cfbridge preset already installed. Will overwrite.')
    log('warn', 'To uninstall first, run: npm run uninstall:preset')
  }

  // 4. 创建目录
  ensureDir(PRESETS_DIR)
  ensureDir(TARGET)

  // 5. 复制文件
  for (const f of SOURCE_FILES) {
    copyRecursive(path.join(ROOT, f), path.join(TARGET, f))
    log('ok', `Copied: ${f}`)
  }

  // 6. 复制 skills 目录
  const skillsDst = path.join(TARGET, 'skills')
  ensureDir(skillsDst)
  for (const entry of fs.readdirSync(skillsSrc)) {
    copyRecursive(path.join(skillsSrc, entry), path.join(skillsDst, entry))
    log('ok', `Copied skill: ${entry}`)
  }

  log('ok', 'Install complete.')
  log('info', 'Next:')
  log('info', '  1. Restart DSH (if running): dsh --profile web')
  log('info', '  2. In the new-session screen, choose "Cloudflare 模式" from the preset picker')
  log('info', '  3. Verify with: npm run validate:preset')
}

try {
  main()
} catch (error) {
  log('err', error.message)
  process.exit(1)
}