// 技能索引元数据的判定规则（CommonJS，scripts/ 域）。
//
// 为什么单独成模块：这条规则有两个消费方 —— 结构门禁 scripts/validate-bundle.js
// 与行为测试 tests/bundle-metadata.test.mjs。此前它被复制成两份，改动只会落在一处，
// 另一处会静默保持旧的宽或严。收敛到这里后，两边共用同一条契约。
//
// 契约（与 Provider 的发现规则对齐）：
//   - 分隔符 --- 之前只允许出现空白、BOM 与成对的 HTML 注释块（vendored 头部形态）；
//   - 分隔符之后必须能读到 name: <目录名> 与 description:。
// 注意：允许 CRLF —— vendored 快照在 Windows 工作区就是 CRLF，
// 判定必须与行尾无关，否则会出现「本地绿、CI 红」。

/** 判断一份 SKILL.md 文本是否满足索引元数据契约。 */
function hasIndexFrontmatter(text, skill) {
  if (typeof text !== 'string' || typeof skill !== 'string' || skill === '') return false
  const marker = text.indexOf('---')
  if (marker < 0) return false
  const preamble = text.slice(0, marker).replace(/\ufeff/g, '')
  const opening = preamble.trim() === '' || preamble.split('\n').every((line) => {
    const trimmed = line.trim()
    return trimmed === '' || trimmed.startsWith('<!--') || trimmed.endsWith('-->')
  })
  if (!opening) return false
  const frontmatter = text.slice(marker)
  const nameMatch = /^name:\s*(.+?)\s*$/m.exec(frontmatter)
  const name = nameMatch !== null && nameMatch[1].trim() === skill
  const description = /^description:\s*.+$/m.test(frontmatter)
  return name && description
}

module.exports = { hasIndexFrontmatter }
