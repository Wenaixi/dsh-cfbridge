# cfbridge

[English](./README.md) | [中文](./README.zh.md)

[![npm](https://img.shields.io/npm/v/@wenaixi%2Fcfbridge?label=npm)](https://www.npmjs.com/package/@wenaixi/cfbridge)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-Bundle-7c3aed)](https://github.com/deepseek-ai/deepseek-harness)
[![Node](https://img.shields.io/badge/node-%3E%3D22-5FA04E)](https://nodejs.org)
[![CI](https://github.com/Wenaixi/dsh-cfbridge/actions/workflows/ci.yml/badge.svg)](https://github.com/Wenaixi/dsh-cfbridge/actions/workflows/ci.yml)

<img src="./icon.png" alt="@wenaixi/cfbridge" width="128" height="128">

A DeepSeek Harness (DSH) global bundle bridging Cloudflare's official Code Mode MCP (`docs` / `search` / `execute`) and 14 on-demand agent skills into all sessions. Mounting it to the `web` profile enables Cloudflare MCP tools across all conversations, paired with local project Wrangler CLI passthrough. Built with TypeScript, published as `lib/cfbridge.js`, distributed natively via `dsh.bundle`.

---

## Install

**Prerequisites**: A runnable DSH installation (`dsh --profile web`); Node and pnpm engines listed in the badges above; a Cloudflare API token — recommended: Account token (`cfat_` with `Account Resources: Read`) or Zone token (`cfut_` for DNS operations).

### Step 1: Provide API Token
Add your token to your private environment file (git-ignored, never commit real credentials):

```dotenv
# %USERPROFILE%\.dsh\.env
CLOUDFLARE_API_TOKEN=your_token_here
```

### Step 2: Install Bundle
Choose one of the installation methods below:

```powershell
# Method A - npm (Recommended)
dsh plugin --profile web add @wenaixi/cfbridge

# Method B - GitHub direct install
dsh plugin --profile web add github:Wenaixi/dsh-cfbridge

# Method C - Local clone & build
git clone https://github.com/Wenaixi/dsh-cfbridge.git; cd dsh-cfbridge
npm install
npm run install:bundle            # Installs to web profile by default; use -- --profile <name> for others
```

Pin a version by appending `@<version>` or `#v<version>` (check `npm view @wenaixi/cfbridge version`).

### Step 3: Restart & Verify
Restart DSH (`dsh --profile web`). New sessions automatically acquire `mcp__cloudflare__docs/search/execute` tools and the `cfbridge` skill.
Verify configuration with:

```powershell
dsh --profile web --dump-config | Select-String "cfbridge"
```

---

## What it is

```text
DSH Bundle (Globally mounted, on-demand activation)
  └─ Installed to web profile (default), auto-mounted across all sessions
       ├─ mcp__cloudflare__docs     ← Semantic documentation search
       ├─ mcp__cloudflare__search   ← OpenAPI endpoint & schema lookup
       ├─ mcp__cloudflare__execute  ← Execution in official isolated sandbox
       ├─ cfbridge SkillProvider    ← 14 skills discovered on demand
       ├─ cfbridge Skill            ← Thin bridge: search-then-execute & approval rules
       ├─ 13 vendored Skills        ← Official Cloudflare skills available offline
       └─ npm run wrangler ...      ← Pinned project Wrangler CLI passthrough
```

- **Two-Stage Progressive Disclosure**: During `list()`, only skill index metadata (`name/description/whenToUse`, ~120–180 tokens/skill, ~1.7–2.5k tokens total) is indexed. Full skill bodies are loaded strictly on demand during `get()` (e.g., `wrangler` ~4.5k tokens), eliminating context window waste.
- **Same-Name Precedence**: The official DSH registry arbitrates same-name collisions by ascending `rank`. This bundle defaults to **`rank: 0`**, having absolute first-priority precedence over project (100/200), custom (300), user (400/500), and system (600) layers.

---

## Operating Modes (`loadMode`)

cfbridge supports two operating modes, togglable via the plugin settings UI or config:

| Mode | Value | Scope & Isolation Boundary |
|---|---|---|
| **Global Mode** (Default) | `global` | Cloudflare MCP tools and all 14 skills are globally available in all conversations. |
| **cfbridge Preset Mode** | `preset` | Dynamically registers dedicated `cfbridge` agent preset and injects `CFBRIDGE_SYSTEM_INSTRUCTIONS` operational guidelines. Non-cfbridge sessions are isolated from Cloudflare tools via dual-layer defense (`tools.restrict` + `agentCtx.tools.guard`). |

---

## Skills

| Skill | Category | Description | Primary Triggers |
|---|---|---|---|
| `cfbridge` | Core Bridge | Cloudflare Code Mode MCP bridge, workflow & safety approvals | "use cfbridge", "Cloudflare API", "manage Cloudflare" |
| `cloudflare` | Platform | Workers, Pages, KV, D1, R2, Vectorize, Zero Trust, Pulumi/Terraform | Architecture decisions, platform overview |
| `wrangler` | CLI | Workers & Developer Platform CLI command reference | wrangler commands, configuration, deployments |
| `agents-sdk` | AI / Agents | Statefual agents, Durable Objects, WebSockets, Workflows | Agents SDK, state management, autonomous workflows |
| `durable-objects` | Storage / RPC | Stateful coordination, SQLite storage, WebSockets, alarms | Durable Objects, chat rooms, multiplayer games |
| `cloudflare-one` | Zero Trust | Access, Gateway, WARP, Tunnel, DLP, CASB, posture | Zero Trust, SASE, secure access |
| `cloudflare-one-migrations` | Migration | Migrating from Zscaler, Palo Alto, legacy VPN to Cloudflare One | SASE migration, policy mapping |
| `cloudflare-email-service` | Email | Email Sending & Routing, SPF/DKIM/DMARC setup | Email routing, transactional email sending |
| `sandbox-stable` | Containers | Cloudflare Sandbox stable container execution & commands | Sandbox containers, filesystem operations |
| `sandbox-next` | Containers | Cloudflare Sandbox preview SDK features & async execution | Sandbox preview, AI runners, mounts |
| `sandbox-migrate-to-next` | Migration | Upgrading from Sandbox stable to preview SDK | Code migration, package contract updates |
| `turnstile-spin` | Security | Turnstile CAPTCHA-free smart verification & server verify | Form verification, bot protection |
| `web-perf` | Performance | Chrome DevTools MCP analysis, Core Web Vitals optimization | Web performance audit, LCP/INP/CLS tuning |
| `workers-best-practices` | Standards | Production Workers review & anti-pattern checks | Pre-deployment review, streaming checks |

Standalone installation outside DSH is also supported:

```bash
# Claude Code
/plugin marketplace add cloudflare/skills -> /plugin install cloudflare@cloudflare

# Cursor
Settings -> Rules -> Add Rule -> Remote Rule (Github) -> cloudflare/skills

# Any Agent with skills CLI
npx skills add https://github.com/cloudflare/skills
```

---

## Skill Switches & UI Control

Open DSH -> **Plugins** -> **Cloudflare Bridge** card -> **Configure**:

- **Operating Mode**: Toggle between Global Mode and cfbridge Preset Mode at the top.
- **Dual-Axis Switches**: Each skill features two independent toggles:
  - **Model**: When disabled, the model cannot see or invoke the skill.
  - **Human**: When disabled, human slash-menu access is hidden while remaining invocable by the model.
  - **Both off = Fully disabled**: Completely omitted from catalog discovery.
- **Deep Controller Architecture (`PanelController`)**:
  - Toggles are powered by an in-memory domain controller (`PanelController`).
  - **Synchronous Mutex Guard**: An in-memory synchronous lock (`_busy`) physically eliminates React asynchronous microtask race conditions, preventing revision optimism lock conflicts caused by rapid double-clicks.
  - **Single Atomic Batch**: Flattens `disabledSkills`, `modelHiddenSkills`, and `userHiddenSkills` into a single atomic 3-ops `form.mutate` submission.

---

## Configuration (`Config Schema`)

cfbridge exports a standard Schemastery Schema, customizable in your profile's `cordis.patch.yml`:

| Field | Type | Default | Description |
|---|---|---|---|
| `providerName` | string | `'cfbridge'` | Provider identifier (reserved name `'runtime'` is banned) |
| `skillDir` | string | Bundled path | Absolute or relative path to skills directory |
| `rank` | number | `0` | Sorting weight (lower number = higher priority; 0 is highest) |
| `cache` | boolean | `true` | Enable in-memory mtime cache for skill metadata |
| `watchSkills` | boolean | `false` | Watch skill markdown files for live HMR reload in development |
| `loadMode` | string | `'global'` | Run mode: `'global'` or `'preset'` |
| `disabledSkills` | string[] | `[]` | Fully disabled skills (both model and human toggles off) |
| `modelHiddenSkills` | string[] | `[]` | Skills hidden from model invocation |
| `userHiddenSkills` | string[] | `[]` | Skills hidden from human slash-command invocation |
| `availableSkills` | string[] | `[]` | Skill catalog snapshot written back by plugin for UI display |

Example configuration overlay:

```yaml
- insert:
    - id: cfbridge
      name: '@wenaixi/cfbridge'
      config:
        loadMode: preset
        rank: 0
        cache: true
        watchSkills: false
        modelHiddenSkills:
          - wrangler
```

---

## Configuration Stability & Auto-Healing

cfbridge features an integrated self-healing engine to recover corrupted or malformed configuration files:

- **Two-Stage Resilient Parser**: Recovers active settings from truncated YAML (e.g. power-cut interruptions) and syntax-shattered files via heuristic line-scanning.
- **Automatic Backup**: Forces a timestamped `.bak.<timestamp>` backup before modifying files on disk.
- **Clean Regeneration**: Regenerates compliant 2-line patch YAML retaining secure dynamic `!!js` token templates.
- **One-Click CLI Tool**:
  ```powershell
  node scripts/repair-config.js                       # Diagnose & heal root cordis.patch.yml
  node scripts/repair-config.js --file <path>         # Heal specified config file
  node scripts/repair-config.js --profile web         # Heal web profile configuration
  node scripts/repair-config.js --dry-run             # Dry-run inspection without modifying files
  ```

---

## Default Workflow: search -> execute

Always adhere to the "search before execute" principle:

```javascript
// 1. Search: Look up Worker script endpoints from OpenAPI schema
async () => Object.entries(spec.paths)
  .filter(([path, item]) => path.includes('workers/scripts') && item.get)
  .slice(0, 10)
  .map(([path, item]) => ({ path, params: Object.keys(item.get.parameters || {}) }))

// 2. Execute: Perform real API call after confirmation
async () => cloudflare.request({
  method: 'GET',
  path: `/accounts/${accountId}/workers/scripts`,
})
```

---

## Verification & Quality Gates

Run the comprehensive validation suite:

```powershell
npm test               # Canonical quality gate (15/15 passed): build, typechecks, provider, healer, panel, controller headless tests & security checks
npm run check          # Security audit & repository checks (85/85 passed)
npm run validate:bundle -- --strict-router  # Bundle structure & metadata validation (98/98 passed)
npm run test:wrangler  # Wrangler CLI read-only contract verification (4/4 passed)
npm run dump:config    # Inspect active profile composition layer
```

---

## Management & Removal

```powershell
# Enable
dsh plugin --profile web add @wenaixi/cfbridge

# Disable / Uninstall
dsh plugin --profile web remove @wenaixi/cfbridge
# or: npm run uninstall:bundle -- --profile web
```

---

## License

MIT License. See [LICENSE](./LICENSE) for details.
