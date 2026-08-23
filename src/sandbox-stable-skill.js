// sandbox-stable Skill wrapper (vendored from cloudflare/skills)
// resourceBase -> skills/sandbox-stable/; thin wrapper following cfbridge-skill.js pattern
const fs = require('fs')
const path = require('path')
const DIR = path.resolve(__dirname, '..', 'skills', 'sandbox-stable')
const MD = path.join(DIR, 'SKILL.md')
const name = 'sandbox-stable-skill'
const inject = ['skills']
function apply(ctx) {
  let c
  try { c = fs.readFileSync(MD, 'utf8') } catch (e) { throw new Error('sandbox-stable-skill: cannot read SKILL.md at ' + MD + ': ' + e.message) }
  ctx.skills.register({
    name: 'sandbox-stable',
    description: 'Use when building or changing Cloudflare Sandbox apps on the current stable @cloudflare/sandbox package.',
    source: 'runtime',
    resourceBase: { kind: 'directory', path: DIR },
    content: c
  })
}
module.exports = { name, inject, apply }
