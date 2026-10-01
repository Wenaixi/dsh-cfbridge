// 技能清单单一事实来源（CommonJS，scripts/ 域）。
//
// 所有需要"技能有哪些"的脚本与测试从这里取数，禁止在消费方再抄一份字面量：
// 新增/删除/改名技能时只改这里。两个集合语义不同：
//   ALL_SKILLS      —— 完整 14 项（含 cfbridge 自身技能），validate/测试消费；
//   VENDORED_SKILLS —— 官方 vendored 13 项（不含 cfbridge），sync-vendor 消费。
// 注意：skills/cfbridge/SKILL.md 内另有给模型消费的叙述清单，属文档而非本模块管辖。

const ALL_SKILLS = [
  'cfbridge',
  'cloudflare',
  'wrangler',
  'agents-sdk',
  'durable-objects',
  'cloudflare-one',
  'cloudflare-one-migrations',
  'cloudflare-email-service',
  'sandbox-next',
  'sandbox-stable',
  'sandbox-migrate-to-next',
  'turnstile-spin',
  'web-perf',
  'workers-best-practices',
]

const VENDORED_SKILLS = ALL_SKILLS.filter((name) => name !== 'cfbridge')

module.exports = { ALL_SKILLS, VENDORED_SKILLS }
