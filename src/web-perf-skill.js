// web-perf Skill wrapper (vendored from cloudflare/skills)
// resourceBase -> skills/web-perf/; thin wrapper following cfbridge-skill.js pattern
const fs = require('fs')
const path = require('path')
const DIR = path.resolve(__dirname, '..', 'skills', 'web-perf')
const MD = path.join(DIR, 'SKILL.md')
const name = 'web-perf-skill'
const inject = ['skills']
function apply(ctx) {
  let c
  try { c = fs.readFileSync(MD, 'utf8') } catch (e) { throw new Error('web-perf-skill: cannot read SKILL.md at ' + MD + ': ' + e.message) }
  ctx.skills.register({
    name: 'web-perf',
    description: 'Analyzes web performance using Chrome DevTools MCP. Measures Core Web Vitals (LCP, INP, CLS), identifies render-blocking resources, network dependency chains, layout shifts, and caching issues.',
    source: 'runtime',
    resourceBase: { kind: 'directory', path: DIR },
    content: c
  })
}
module.exports = { name, inject, apply }
