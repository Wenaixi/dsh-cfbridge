// skills-bundle — 合并的运行时 Skill 注册入口（v0.4.0）
//
// 原 14 个独立包装器（src/*-skill.js 各注册一个 Skill）合并为本文件：
// 一个 apply 内循环读取 skills/<dir>/SKILL.md 并逐个 ctx.skills.register()。
// 插件面板按 loader entry 展示，合并后 15 行 patch 缩为 2 行，
// 不再出现 14 个 @wenaixi/cfbridge/src/*-skill.js 条目。
//
// 设计要点：
// 1. 注册表集中声明 dir/name/description/whenToUse，与官方 SKILL.md 保持同步；
//    vendored 13 个来自 https://github.com/cloudflare/skills，可离线可用。
// 2. 任一 SKILL.md 缺失即 apply 抛异常（Fiber 响亮失败），不留半注册状态。
// 3. 所有 register 走同一 fiber，卸载时随 ctx 自动清理。
const fs = require('fs')
const path = require('path')

const SKILLS_ROOT = path.resolve(__dirname, '..', 'skills')

// dir: skills/ 下的子目录名；name: Skill 公开名；description/whenToUse 原样取自旧包装器
const SKILLS = [
  {
    dir: 'cfbridge',
    name: 'cfbridge',
    description:
      'Cloudflare Code Mode MCP 全局 Bridge：装后所有会话自动获得 mcp__cloudflare__docs/search/execute 三工具与本操作指南；含 search-then-execute 工作流、写操作审批规范、Token 权限边界与 Wrangler 透传指引。',
    whenToUse:
      '任何涉及 Cloudflare API 的请求（Workers/KV/D1/Pages/Zones/DNS/R2/Analytics 等）都应先加载本 Skill；执行前用 mcp__cloudflare__docs 或 mcp__cloudflare__search 确认端点，再用 mcp__cloudflare__execute 执行。',
  },
  {
    dir: 'cloudflare',
    name: 'cloudflare',
    description:
      'Comprehensive Cloudflare platform skill covering Workers, Pages, storage (KV, D1, R2), AI (Workers AI, Vectorize, Agents SDK), feature flags (Flagship), networking (Tunnel, Spectrum), security (WAF, DDoS), and infrastructure-as-code (Terraform, Pulumi). Use for any Cloudflare development task.',
  },
  {
    dir: 'wrangler',
    name: 'wrangler',
    description:
      'Cloudflare Workers CLI for deploying, developing, and managing Workers, KV, R2, D1, Vectorize, Hyperdrive, Workers AI, Containers, Queues, Workflows, Pipelines, and Secrets Store. Load before running wrangler commands.',
  },
  {
    dir: 'agents-sdk',
    name: 'agents-sdk',
    description:
      'Build AI agents on Cloudflare Workers using the Agents SDK. Load when creating stateful agents, durable workflows, real-time WebSocket apps, scheduled tasks, MCP servers, or chat applications.',
  },
  {
    dir: 'durable-objects',
    name: 'durable-objects',
    description:
      'Create and review Cloudflare Durable Objects. Use when building stateful coordination (chat rooms, multiplayer games, booking systems), implementing RPC methods, SQLite storage, alarms, or WebSockets.',
  },
  {
    dir: 'cloudflare-one',
    name: 'cloudflare-one',
    description:
      'Guides Cloudflare One Zero Trust and SASE work across Access, Gateway, WARP, Tunnel, Cloudflare WAN, DLP, CASB, device posture, and identity. Use when designing, configuring, troubleshooting, or reviewing Cloudflare One deployments.',
  },
  {
    dir: 'cloudflare-one-migrations',
    name: 'cloudflare-one-migrations',
    description:
      'Plans migrations from Zscaler ZIA/ZPA, Palo Alto, legacy VPN, SWG, or SASE stacks to Cloudflare One. Use for migration assessments, policy mapping, rollout plans, and parity/gap analysis.',
  },
  {
    dir: 'cloudflare-email-service',
    name: 'cloudflare-email-service',
    description:
      'Send and receive transactional emails with Cloudflare Email Service. Use when building email sending, email routing, Agents SDK email handling, or integrating email into any app.',
  },
  {
    dir: 'sandbox-next',
    name: 'sandbox-next',
    description:
      'Use when building or changing Cloudflare Sandbox apps on @cloudflare/sandbox@next (Sandbox SDK 1.0 preview).',
  },
  {
    dir: 'sandbox-stable',
    name: 'sandbox-stable',
    description:
      'Use when building or changing Cloudflare Sandbox apps on the current stable @cloudflare/sandbox package.',
  },
  {
    dir: 'sandbox-migrate-to-next',
    name: 'sandbox-migrate-to-next',
    description:
      'Use when porting a Cloudflare Sandbox app from stable @cloudflare/sandbox to @cloudflare/sandbox@next (Sandbox SDK 1.0 preview).',
  },
  {
    dir: 'turnstile-spin',
    name: 'turnstile-spin',
    description:
      'Set up Cloudflare Turnstile end-to-end. Scan the codebase, create the widget via the Cloudflare API, embed it where user requests need bot verification, wire server-side siteverify, and validate.',
  },
  {
    dir: 'web-perf',
    name: 'web-perf',
    description:
      'Analyzes web performance using Chrome DevTools MCP. Measures Core Web Vitals (LCP, INP, CLS), identifies render-blocking resources, network dependency chains, layout shifts, and caching issues.',
  },
  {
    dir: 'workers-best-practices',
    name: 'workers-best-practices',
    description:
      'Reviews and authors Cloudflare Workers code against production best practices. Load when writing new Workers, reviewing Worker code, configuring wrangler.jsonc, or checking for common anti-patterns.',
  },
]

const name = 'skills-bundle'
const inject = ['skills']

function apply(ctx) {
  const failures = []
  for (const def of SKILLS) {
    const dir = path.join(SKILLS_ROOT, def.dir)
    const md = path.join(dir, 'SKILL.md')
    let content
    try {
      content = fs.readFileSync(md, 'utf8')
    } catch (e) {
      failures.push(def.dir + ': ' + e.message)
      continue
    }
    ctx.skills.register({
      name: def.name,
      description: def.description,
      ...(def.whenToUse ? { whenToUse: def.whenToUse } : {}),
      source: 'runtime',
      resourceBase: { kind: 'directory', path: dir },
      content,
    })
  }
  if (failures.length) {
    throw new Error('skills-bundle: cannot read SKILL.md at ' + failures.join('; '))
  }
}

module.exports = { name, inject, apply }
