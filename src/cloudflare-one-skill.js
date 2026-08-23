// cloudflare-one Skill wrapper (vendored from cloudflare/skills)
// resourceBase -> skills/cloudflare-one/; thin wrapper following cfbridge-skill.js pattern
const fs = require('fs')
const path = require('path')
const DIR = path.resolve(__dirname, '..', 'skills', 'cloudflare-one')
const MD = path.join(DIR, 'SKILL.md')
const name = 'cloudflare-one-skill'
const inject = ['skills']
function apply(ctx) {
  let c
  try { c = fs.readFileSync(MD, 'utf8') } catch (e) { throw new Error('cloudflare-one-skill: cannot read SKILL.md at ' + MD + ': ' + e.message) }
  ctx.skills.register({
    name: 'cloudflare-one',
    description: 'Guides Cloudflare One Zero Trust and SASE work across Access, Gateway, WARP, Tunnel, Cloudflare WAN, DLP, CASB, device posture, and identity. Use when designing, configuring, troubleshooting, or reviewing Cloudflare One deployments.',
    source: 'runtime',
    resourceBase: { kind: 'directory', path: DIR },
    content: c
  })
}
module.exports = { name, inject, apply }
