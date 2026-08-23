// turnstile-spin Skill wrapper (vendored from cloudflare/skills)
// resourceBase -> skills/turnstile-spin/; thin wrapper following cfbridge-skill.js pattern
const fs = require('fs')
const path = require('path')
const DIR = path.resolve(__dirname, '..', 'skills', 'turnstile-spin')
const MD = path.join(DIR, 'SKILL.md')
const name = 'turnstile-spin-skill'
const inject = ['skills']
function apply(ctx) {
  let c
  try { c = fs.readFileSync(MD, 'utf8') } catch (e) { throw new Error('turnstile-spin-skill: cannot read SKILL.md at ' + MD + ': ' + e.message) }
  ctx.skills.register({
    name: 'turnstile-spin',
    description: 'Set up Cloudflare Turnstile end-to-end. Scan the codebase, create the widget via the Cloudflare API, embed it where user requests need bot verification, wire server-side siteverify, and validate.',
    source: 'runtime',
    resourceBase: { kind: 'directory', path: DIR },
    content: c
  })
}
module.exports = { name, inject, apply }
