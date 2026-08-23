// cloudflare-email-service Skill wrapper (vendored from cloudflare/skills)
// resourceBase -> skills/cloudflare-email-service/; thin wrapper following cfbridge-skill.js pattern
const fs = require('fs')
const path = require('path')
const DIR = path.resolve(__dirname, '..', 'skills', 'cloudflare-email-service')
const MD = path.join(DIR, 'SKILL.md')
const name = 'cloudflare-email-service-skill'
const inject = ['skills']
function apply(ctx) {
  let c
  try { c = fs.readFileSync(MD, 'utf8') } catch (e) { throw new Error('cloudflare-email-service-skill: cannot read SKILL.md at ' + MD + ': ' + e.message) }
  ctx.skills.register({
    name: 'cloudflare-email-service',
    description: 'Send and receive transactional emails with Cloudflare Email Service. Use when building email sending, email routing, Agents SDK email handling, or integrating email into any app.',
    source: 'runtime',
    resourceBase: { kind: 'directory', path: DIR },
    content: c
  })
}
module.exports = { name, inject, apply }
