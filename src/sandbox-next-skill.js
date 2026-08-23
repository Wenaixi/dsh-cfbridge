// sandbox-next Skill wrapper (vendored from cloudflare/skills)
// resourceBase -> skills/sandbox-next/; thin wrapper following cfbridge-skill.js pattern
const fs = require('fs')
const path = require('path')
const DIR = path.resolve(__dirname, '..', 'skills', 'sandbox-next')
const MD = path.join(DIR, 'SKILL.md')
const name = 'sandbox-next-skill'
const inject = ['skills']
function apply(ctx) {
  let c
  try { c = fs.readFileSync(MD, 'utf8') } catch (e) { throw new Error('sandbox-next-skill: cannot read SKILL.md at ' + MD + ': ' + e.message) }
  ctx.skills.register({
    name: 'sandbox-next',
    description: 'Use when building or changing Cloudflare Sandbox apps on @cloudflare/sandbox@next (Sandbox SDK 1.0 preview).',
    source: 'runtime',
    resourceBase: { kind: 'directory', path: DIR },
    content: c
  })
}
module.exports = { name, inject, apply }
