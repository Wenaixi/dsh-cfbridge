// cfbridge Skill 运行时注册插件（DSH Bundle 全局可见）
//
// 作为 host 组合的一行，随 bundle 安装后所有会话自动可见。
// 形态遵循 dsh-vision-toolkit 实践：inject: ['skills'] + ctx.skills.register()。
// 资源基座指向 bundle 内的 skills/cfbridge/ 目录，内容为 SKILL.md 全文。

const fs = require('fs')
const path = require('path')

// 本文件所在：<bundle-root>/src/cfbridge-skill.js
// 资源目录：<bundle-root>/skills/cfbridge/
const SKILL_DIR = path.resolve(__dirname, '..', 'skills', 'cfbridge')
const SKILL_MD = path.join(SKILL_DIR, 'SKILL.md')

let SKILL_CONTENT = ''
try {
  SKILL_CONTENT = fs.readFileSync(SKILL_MD, 'utf8')
} catch (e) {
  // 缺少 SKILL.md 时让 apply 抛异常，触发 loader 的响亮失败
  throw new Error(`cfbridge-skill: cannot read SKILL.md at ${SKILL_MD}: ${e.message}`)
}

// 从首段提取 description，避免与文件内容重复维护。
// SKILL.md 首行是标题，第三段是全局可见声明，取其精简版作 catalog 描述。
const SKILL_DEFINITION = {
  name: 'cfbridge',
  description:
    'Cloudflare Code Mode MCP 全局 Bridge：装后所有会话自动获得 mcp__cloudflare__docs/search/execute 三工具与本操作指南；含 search-then-execute 工作流、写操作审批规范、Token 权限边界与 Wrangler 透传指引。',
  whenToUse:
    '任何涉及 Cloudflare API 的请求（Workers/KV/D1/Pages/Zones/DNS/R2/Analytics 等）都应先加载本 Skill；执行前用 mcp__cloudflare__docs 或 mcp__cloudflare__search 确认端点，再用 mcp__cloudflare__execute 执行。',
  source: 'runtime',
  resourceBase: {
    kind: 'directory',
    path: SKILL_DIR,
  },
  content: SKILL_CONTENT,
}

const name = 'cfbridge-skill'
const inject = ['skills']

function apply(ctx) {
  ctx.skills.register(SKILL_DEFINITION)
}

module.exports = { name, inject, apply }
