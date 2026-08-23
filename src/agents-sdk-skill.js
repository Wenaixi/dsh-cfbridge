// agents-sdk Skill wrapper (vendored from cloudflare/skills)
// resourceBase -> skills/agents-sdk/; thin wrapper following cfbridge-skill.js pattern
const fs = require('fs')
const path = require('path')
const DIR = path.resolve(__dirname, '..', 'skills', 'agents-sdk')
const MD = path.join(DIR, 'SKILL.md')
const name = 'agents-sdk-skill'
const inject = ['skills']
function apply(ctx) {
  let c
  try { c = fs.readFileSync(MD, 'utf8') } catch (e) { throw new Error('agents-sdk-skill: cannot read SKILL.md at ' + MD + ': ' + e.message) }
  ctx.skills.register({
    name: 'agents-sdk',
    description: 'Build AI agents on Cloudflare Workers using the Agents SDK. Load when creating stateful agents, durable workflows, real-time WebSocket apps, scheduled tasks, MCP servers, or chat applications.',
    source: 'runtime',
    resourceBase: { kind: 'directory', path: DIR },
    content: c
  })
}
module.exports = { name, inject, apply }
