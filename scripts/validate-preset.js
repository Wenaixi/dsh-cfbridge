// 验证 cfbridge Agent Preset 的结构与一致性。
// 不挂载到 DSH（那需要运行中的 DSH），而是先做静态校验：
//   - preset.yml/agent.cordis.yml 存在且可解析
//   - preset.yml 含 name/description
//   - agent.cordis.yml 至少含 mcp-cloudflare、cf-persona、skill-filesystem 行
//   - skills/cfbridge/SKILL.md 存在
//   - 未硬编码 token
//
// 完整挂载验证需要 `dsh --profile cfbridge`（待 DSH 支持 cfbridge profile 后可用）。
//
// 使用：npm run validate:preset

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

const results = []
function pass(name) { results.push({ ok: true, name }) }
function fail(name, msg) { results.push({ ok: false, name, msg }) }

function readYamlText(p) {
  return fs.readFileSync(p, 'utf8')
}

function hasMcpCloudflareRow(text) {
  return /^\s*-\s+id:\s+mcp-cloudflare\b/m.test(text)
    && /serverName:\s*cloudflare\b/.test(text)
    && /url:\s*https:\/\/mcp\.cloudflare\.com\/mcp\b/.test(text)
    && /Authorization:\s*!!js\s+'`Bearer \$\{process\.env\.CLOUDFLARE_API_TOKEN\}`'/.test(text)
}

function hasTokenLeak(text) {
  // 拒绝 Cloudflare token 前缀、典型 OAuth token、sk-、AWS、GitHub、Google API key
  const patterns = [
    /cfat_[A-Za-z0-9]{16,}/,
    /cfut_[A-Za-z0-9]{16,}/,
    /cfoat_[A-Za-z0-9]{16,}/,
    /sk-[A-Za-z0-9-]{16,}/,
    /Bearer\s+[A-Za-z0-9_-]{40,}/,
    /gh[pousr]_[A-Za-z0-9]{30,}/,
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /AIza[0-9A-Za-z_-]{35}/,
  ]
  return patterns.some((re) => re.test(text))
}

function main() {
  const presetYml = path.join(ROOT, 'preset.yml')
  const agentYml = path.join(ROOT, 'agent.cordis.yml')
  const skillMd = path.join(ROOT, 'skills', 'cfbridge', 'SKILL.md')

  // 1. 文件存在
  for (const [name, p] of [
    ['preset.yml exists', presetYml],
    ['agent.cordis.yml exists', agentYml],
    ['skills/cfbridge/SKILL.md exists', skillMd],
  ]) {
    if (fs.existsSync(p)) pass(name)
    else fail(name, `Missing: ${p}`)
  }

  // 2. preset.yml 含 name 和 description
  if (fs.existsSync(presetYml)) {
    const text = readYamlText(presetYml)
    if (/^name:\s+\S+/m.test(text)) pass('preset.yml has name')
    else fail('preset.yml has name', 'name field missing')
    if (/^description:\s+\S+/m.test(text)) pass('preset.yml has description')
    else fail('preset.yml has description', 'description field missing')
  }

  // 3. agent.cordis.yml 关键行
  if (fs.existsSync(agentYml)) {
    const text = readYamlText(agentYml)
    if (hasMcpCloudflareRow(text)) pass('agent.cordis.yml has mcp-cloudflare row')
    else fail('agent.cordis.yml has mcp-cloudflare row', 'missing one of: id/serverName/url/Authorization template')

    if (/-\s*id:\s*persona\b/.test(text)) pass('agent.cordis.yml has persona row')
    else fail('agent.cordis.yml has persona row', 'missing')

    if (/-\s*id:\s*mcp-cloudflare\b/.test(text)) pass('agent.cordis.yml has mcp-cloudflare row')
    else fail('agent.cordis.yml has mcp-cloudflare row', 'missing')

    if (/-\s*id:\s*skill-filesystem\b/.test(text)) pass('agent.cordis.yml registers skills')
    else fail('agent.cordis.yml registers skills', 'missing skill-filesystem')

    if (/-\s*id:\s*tool-fs\b/.test(text)) pass('agent.cordis.yml has filesystem tools')
    else fail('agent.cordis.yml has filesystem tools', 'missing tool-fs')

    if (/-\s*id:\s*tool-pwsh\b/.test(text)) pass('agent.cordis.yml has pwsh tool')
    else fail('agent.cordis.yml has pwsh tool', 'missing tool-pwsh')

    // 4. 不含 token 硬编码
    if (!hasTokenLeak(text)) pass('agent.cordis.yml has no hardcoded token')
    else fail('agent.cordis.yml has no hardcoded token', 'token pattern found in composition')
  }

  // 5. SKILL.md 含 trigger
  if (fs.existsSync(skillMd)) {
    const text = readYamlText(skillMd)
    if (/^#\s+cfbridge\b/m.test(text)) pass('SKILL.md has title')
    else fail('SKILL.md has title', 'first heading should be "# cfbridge"')
    if (!hasTokenLeak(text)) pass('SKILL.md has no hardcoded token')
    else fail('SKILL.md has no hardcoded token', 'token pattern found in skill body')
  }

  // 输出
  let allPass = true
  for (const r of results) {
    if (r.ok) {
      console.log(`PASS  ${r.name}`)
    } else {
      console.log(`FAIL  ${r.name}: ${r.msg}`)
      allPass = false
    }
  }
  console.log(`\n${allPass ? 'PASS' : 'FAIL'}: ${results.filter((r) => r.ok).length}/${results.length} checks`)
  process.exit(allPass ? 0 : 1)
}

try {
  main()
} catch (error) {
  console.error(`[ERR ] ${error.message}`)
  process.exit(1)
}