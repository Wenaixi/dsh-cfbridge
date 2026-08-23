// sandbox-migrate-to-next Skill wrapper (vendored from cloudflare/skills)
// resourceBase -> skills/sandbox-migrate-to-next/; thin wrapper following cfbridge-skill.js pattern
const fs = require('fs')
const path = require('path')
const DIR = path.resolve(__dirname, '..', 'skills', 'sandbox-migrate-to-next')
const MD = path.join(DIR, 'SKILL.md')
const name = 'sandbox-migrate-to-next-skill'
const inject = ['skills']
function apply(ctx) {
  let c
  try { c = fs.readFileSync(MD, 'utf8') } catch (e) { throw new Error('sandbox-migrate-to-next-skill: cannot read SKILL.md at ' + MD + ': ' + e.message) }
  ctx.skills.register({
    name: 'sandbox-migrate-to-next',
    description: 'Use when porting a Cloudflare Sandbox app from stable @cloudflare/sandbox to @cloudflare/sandbox@next (Sandbox SDK 1.0 preview).',
    source: 'runtime',
    resourceBase: { kind: 'directory', path: DIR },
    content: c
  })
}
module.exports = { name, inject, apply }
