// durable-objects Skill wrapper (vendored from cloudflare/skills)
// resourceBase -> skills/durable-objects/; thin wrapper following cfbridge-skill.js pattern
const fs = require('fs')
const path = require('path')
const DIR = path.resolve(__dirname, '..', 'skills', 'durable-objects')
const MD = path.join(DIR, 'SKILL.md')
const name = 'durable-objects-skill'
const inject = ['skills']
function apply(ctx) {
  let c
  try { c = fs.readFileSync(MD, 'utf8') } catch (e) { throw new Error('durable-objects-skill: cannot read SKILL.md at ' + MD + ': ' + e.message) }
  ctx.skills.register({
    name: 'durable-objects',
    description: 'Create and review Cloudflare Durable Objects. Use when building stateful coordination (chat rooms, multiplayer games, booking systems), implementing RPC methods, SQLite storage, alarms, or WebSockets.',
    source: 'runtime',
    resourceBase: { kind: 'directory', path: DIR },
    content: c
  })
}
module.exports = { name, inject, apply }
