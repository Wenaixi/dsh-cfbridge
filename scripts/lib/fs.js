// 脚本共享文件系统与日志助手（CommonJS，scripts/ 域）。
//
// 收敛分散在各脚本中的同一批小函数，避免逐字拷贝：
//   ROOT        —— 仓库根目录（原 8 处 path.resolve(__dirname, '..') 变体）；
//   dshHome     —— DSH 用户目录（原 5 处相同表达式）；
//   readJson/readText/fileExists/collectFiles —— 文件读取家族（check/validate 各一份）；
//   hasTokenLeak —— 9 条 token 形态正则，安全门禁，任何一条改动都视为安全回归；
//   log         —— 4 行版日志前缀映射（install/uninstall/migrate 三份逐字相同）；

const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..', '..')

function fileExists(p) {
  return fs.existsSync(p)
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf8') } catch { return '' }
}

function readJson(p) {
  try { return JSON.parse(readText(p)) } catch { return null }
}

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return []
  const stats = fs.statSync(dir)
  if (!stats.isDirectory()) return [dir]
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => collectFiles(path.join(dir, entry.name)))
}

function hasTokenLeak(text) {
  const patterns = [
    /cfat_[A-Za-z0-9]{16,}/,
    /cfut_[A-Za-z0-9]{16,}/,
    /cfoat_[A-Za-z0-9]{16,}/,
    /sk-[A-Za-z0-9-]{16,}/,
    /Bearer\s+[A-Za-z0-9_-]{40,}/,
    /gh[pousr]_[A-Za-z0-9]{30,}/,
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /AIza[0-9A-Za-z_-]{35}/,
  ]
  return patterns.some((re) => re.test(text))
}

function dshHome() {
  return process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh')
}

function log(level, msg) {
  const prefix = { info: 'INFO', ok: 'OK  ', warn: 'WARN', err: 'ERR ' }[level] || 'INFO'
  console.log('[' + prefix + '] ' + msg)
}

module.exports = { ROOT, fileExists, readText, readJson, collectFiles, hasTokenLeak, dshHome, log }

// 删除 DSH 用户目录下的 legacy cfbridge skill 链接。
// requireBundleTarget=true（默认，install 语义）：仅删除指向 bundle 的链接/目录，
// 保护用户自建的指向别处的同名链接；false（uninstall 语义）：路径是链接或目录即删。
// 返回是否真的删除；日志经调用方传入的 log 回调输出（文案统一收敛为一条，不再保留旧脚本各自的原文案）。
