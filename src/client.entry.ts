// @wenaixi/cfbridge 浏览器半侧（双面插件的 client 面）。
//
// 目标：在「插件」页的 cfbridge 详情页里给用户一张现代、精致、高质感的控制面板。
//   - 运行模式卡片式单选（cfbridge 专属模式 / 全局加载模式）
//   - Cloudflare Code Mode MCP 工具总控开关（docs / search / execute）
//   - 技能一元化开关管理（合并双轴为单一开关，支持实时搜索与批量启停）
//   - 遵循 frontend-design 专业美学准则，原生适配 DSH 暗色/亮色主题。
//
// 本文件由 scripts/build-client.js 转译为 lib/client.js（CJS factory），是唯一来源。

import * as React from 'react'
import * as UI from '@deepseek-ai/dsh-client-ui-primitives'

/** 包名：plugins.bundle.config 的 key 就是它，宿主按 entryKey 匹配。 */
const PACKAGE_NAME = '@wenaixi/cfbridge'
/** 语言包命名空间。 */
const NS = 'cfbridge'
/** 本插件在 profile patch 里的行 id。 */
const ROW_ID = 'cfbridge'
/** plugins.row.config 的键 = <bundle>#<rowId>。 */
const ROW_CONFIG_KEY = PACKAGE_NAME + '#' + ROW_ID

// ---------------------------------------------------------------------------
// 语言包
// ---------------------------------------------------------------------------

const zh = {
  headerBadge: 'Cloudflare 边缘能力桥接',
  modeSection: '运行模式',
  modeHint: '定义特权工具与技能的会话作用域及安全隔离边界。',
  modePreset: 'cfbridge 专属模式',
  modePresetBadge: '推荐',
  modePresetDesc: '动态注册专属智能体预设并注入操作规范，普通会话严格隔离特权工具，杜绝非 Cloudflare 会话被特权干扰。',
  modeGlobal: '全局加载模式',
  modeGlobalDesc: '所有普通会话与智能体均可直接调用 Cloudflare MCP 三工具与 14 个专项技能。',
  mcpSection: 'Cloudflare MCP 工具 (Code Mode)',
  mcpHint: '基于 Cloudflare Code Mode 的三个核心特权工具。',
  mcpStatusOn: 'MCP 工具已激活',
  mcpStatusOff: 'MCP 工具已完全关闭',
  mcpToolDocs: 'docs · 官方文档与 API 检索',
  mcpToolSearch: 'search · REST API 端点与架构查询',
  mcpToolExecute: 'execute · 沙箱安全代码执行',
  mcpDisabledBanner: 'Cloudflare MCP 工具已在全系统所有会话中物理停用（禁止调用 docs / search / execute）',
  skillSection: '技能库管理',
  skillHint: '按需加载的专项技能库。关闭的技能不参与模型检索与人类调用。',
  searchPlaceholder: '搜索技能名称或功能描述…',
  enabledCount: '已启用',
  enableAll: '全部启用',
  disableAll: '全部停用',
  noMatchingSkills: '没有找到匹配的技能条目',
  skillName: '技能',
  skillActive: '已启用',
  skillInactive: '已停用',
  loading: '正在读取…',
  failed: '保存失败',
  readOnly: '当前实例的配置不可写。',
  noSkills: '没有发现技能。',
  guideTitle: '说明与 Token 提示',
  guideText: 'Cloudflare API Token 通过 %USERPROFILE%\\.dsh\\.env 中的 CLOUDFLARE_API_TOKEN 传入；修改 Token 后需重启宿主进程。下方列表可一键启停各个专项技能。',
}

const en = {
  headerBadge: 'Cloudflare Edge Capabilities',
  modeSection: 'Operating Mode',
  modeHint: 'Define the scope and isolation boundary for privileged tools and skills.',
  modePreset: 'cfbridge Preset Mode',
  modePresetBadge: 'Recommended',
  modePresetDesc: 'Dedicated agent preset with safety rules; completely isolated from standard chats to prevent interference.',
  modeGlobal: 'Global Mode',
  modeGlobalDesc: 'Cloudflare MCP tools and all 14 skills are globally available in all conversations.',
  mcpSection: 'Cloudflare MCP Tools (Code Mode)',
  mcpHint: 'Three privileged tools based on Cloudflare Code Mode.',
  mcpStatusOn: 'MCP Tools Active',
  mcpStatusOff: 'MCP Tools Disabled',
  mcpToolDocs: 'docs · Docs & API schema lookup',
  mcpToolSearch: 'search · REST endpoints discovery',
  mcpToolExecute: 'execute · Safe sandbox execution',
  mcpDisabledBanner: 'Cloudflare MCP tools are physically disabled across all sessions (docs / search / execute)',
  skillSection: 'Skills Management',
  skillHint: 'On-demand specialized skills. Disabled skills are excluded from model catalog and user selection.',
  searchPlaceholder: 'Search skill name or description...',
  enabledCount: 'Enabled',
  enableAll: 'Enable All',
  disableAll: 'Disable All',
  noMatchingSkills: 'No matching skills found',
  skillName: 'Skill',
  skillActive: 'Active',
  skillInactive: 'Disabled',
  loading: 'Reading…',
  failed: 'Save failed',
  readOnly: 'Configuration is read-only in this instance.',
  noSkills: 'No skills found.',
  guideTitle: 'Configuration & Token Notice',
  guideText: 'Cloudflare API Token is read from %USERPROFILE%\\.dsh\\.env; token rotation requires restarting DSH. Individual skills can be toggled below.',
}

type Dict = typeof zh
type Translate = (key: keyof Dict) => string

// ---------------------------------------------------------------------------
// 技能分类与人话简介
// ---------------------------------------------------------------------------

const SKILL_CATEGORY: Record<string, string> = {
  cfbridge: 'Core',
  cloudflare: 'Platform',
  wrangler: 'CLI',
  'agents-sdk': 'AI / Agents',
  'durable-objects': 'Storage',
  'cloudflare-one': 'Zero Trust',
  'cloudflare-one-migrations': 'Migration',
  'cloudflare-email-service': 'Email',
  'sandbox-stable': 'Containers',
  'sandbox-next': 'Containers',
  'sandbox-migrate-to-next': 'Migration',
  'turnstile-spin': 'Security',
  'web-perf': 'Performance',
  'workers-best-practices': 'Standards',
}

const SKILL_SUMMARY: Record<string, { zh: string; en: string }> = {
  'agents-sdk': { zh: '用 Agents SDK 构建有状态 AI Agent', en: 'Build stateful AI agents with the Agents SDK' },
  cfbridge: { zh: 'Cloudflare MCP 桥接与技能开关指南', en: 'Cloudflare MCP bridge and skill-switch guide' },
  cloudflare: { zh: 'Cloudflare 平台全能力总入口', en: 'Entry point to the whole Cloudflare platform' },
  'cloudflare-email-service': { zh: '收发事务邮件与邮件路由', en: 'Transactional email sending and routing' },
  'cloudflare-one': { zh: 'Zero Trust / SASE 接入与排障', en: 'Zero Trust and SASE setup and troubleshooting' },
  'cloudflare-one-migrations': { zh: '从 Zscaler 等迁移到 Cloudflare One', en: 'Migrate from Zscaler and others to Cloudflare One' },
  'durable-objects': { zh: '有状态协调与 Durable Objects', en: 'Stateful coordination with Durable Objects' },
  'sandbox-migrate-to-next': { zh: 'Sandbox 迁移到 1.0 预览版', en: 'Port Sandbox apps to the 1.0 preview' },
  'sandbox-next': { zh: 'Sandbox 1.0 预览版开发', en: 'Build on the Sandbox 1.0 preview' },
  'sandbox-stable': { zh: 'Sandbox 稳定版开发', en: 'Build on the stable Sandbox release' },
  'turnstile-spin': { zh: '接入 Turnstile 人机验证', en: 'Set up Cloudflare Turnstile end to end' },
  'web-perf': { zh: '用 DevTools 分析网页性能', en: 'Analyze web performance with DevTools' },
  'workers-best-practices': { zh: 'Workers 生产实践审查', en: 'Review Workers code against best practices' },
  wrangler: { zh: 'Wrangler CLI 命令指南', en: 'Wrangler CLI command reference' },
}

function detectLang(t: Translate): 'zh' | 'en' {
  return t('skillName') === zh.skillName ? 'zh' : 'en'
}

function skillSummary(name: string, lang: 'zh' | 'en'): string {
  const entry = SKILL_SUMMARY[name]
  return entry === undefined ? '' : entry[lang]
}

// ---------------------------------------------------------------------------
// 宿主表单控制器类型
// ---------------------------------------------------------------------------

interface FormState {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly value: Record<string, unknown> | undefined
  readonly user: unknown
  readonly revision: number | undefined
  readonly writable: boolean
}

interface PageForm {
  readonly state: FormState
  readonly mutate: (ops: readonly PathOp[], expectedRevision?: number) => Promise<boolean>
}

type PathOp =
  | { readonly op: 'set'; readonly path: readonly string[]; readonly value: unknown }
  | { readonly op: 'unset'; readonly path: readonly string[] }

interface Primitives {
  Switch: (props: Record<string, unknown>) => React.ReactElement
  StateDot: (props: Record<string, unknown>) => React.ReactElement
}

interface PanelProps {
  readonly view?: 'summary' | 'page'
  readonly form?: PageForm
  readonly t: Translate
  readonly ui: Primitives
  readonly [key: string]: unknown
}

const primitives = UI as unknown as Primitives

function msg(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim())
}

export interface SkillRowModel {
  readonly name: string
  readonly summary: string
  readonly category: string
  readonly enabled: boolean
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
}

export interface PanelSnapshot {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly writable: boolean
  readonly loadMode: 'global' | 'preset'
  readonly mcpEnabled: boolean
  readonly skills: readonly SkillRowModel[]
  readonly busy: boolean
  readonly error: string | null
}

// ---------------------------------------------------------------------------
// 客户端控制器（深模块）
// ---------------------------------------------------------------------------

export class PanelController {
  private form?: PageForm
  private t: Translate
  private lang: 'zh' | 'en'
  private _busy = false
  private _error: string | null = null

  constructor(form?: PageForm, t: Translate = (k) => k) {
    this.form = form
    this.t = t
    this.lang = detectLang(t)
  }

  update(form?: PageForm, t?: Translate): void {
    this.form = form
    if (t) {
      this.t = t
      this.lang = detectLang(t)
    }
  }

  isBusy(): boolean {
    return this._busy
  }

  getError(): string | null {
    return this._error
  }

  getSnapshot(): PanelSnapshot {
    const state = this.form?.state
    const writable = Boolean(state?.writable && state?.status === 'ready')
    if (!state || state.status === 'loading') {
      return {
        status: state?.status ?? 'unavailable',
        writable,
        loadMode: 'preset',
        mcpEnabled: true,
        skills: [],
        busy: this._busy,
        error: this._error,
      }
    }

    const user = (state.user && typeof state.user === 'object' && !Array.isArray(state.user) ? state.user : {}) as Record<string, unknown>
    const value = (state.value && typeof state.value === 'object' && !Array.isArray(state.value) ? state.value : {}) as Record<string, unknown>
    const disabled = strArray(user.disabledSkills)
    const modelHidden = strArray(user.modelHiddenSkills)
    const userHidden = strArray(user.userHiddenSkills)

    const rawMode = user.loadMode ?? value.loadMode
    const loadMode: 'global' | 'preset' = rawMode === 'global' ? 'global' : 'preset'

    const rawMcp = user.mcpEnabled ?? value.mcpEnabled
    const mcpEnabled = typeof rawMcp === 'boolean' ? rawMcp : true

    const names = strArray(value.availableSkills)
    const allNames = [...new Set([...names, ...disabled, ...modelHidden, ...userHidden])].sort()

    const skills: SkillRowModel[] = allNames.map((name) => {
      const isOff = disabled.includes(name) || (modelHidden.includes(name) && userHidden.includes(name))
      const enabled = !isOff
      return {
        name,
        summary: skillSummary(name, this.lang),
        category: SKILL_CATEGORY[name] ?? 'General',
        enabled,
        modelInvocable: enabled,
        userInvocable: enabled,
      }
    })

    return {
      status: state.status,
      writable,
      loadMode,
      mcpEnabled,
      skills,
      busy: this._busy,
      error: this._error,
    }
  }

  // 运行模式切换（同步互斥防重锁）
  async setMode(nextMode: 'global' | 'preset'): Promise<boolean> {
    const snap = this.getSnapshot()
    if (!snap.writable || this._busy || nextMode === snap.loadMode || !this.form) return false
    this._busy = true
    this._error = null
    try {
      const ok = await this.form.mutate(
        [{ op: 'set', path: ['loadMode'], value: nextMode }],
        this.form.state.revision,
      )
      if (!ok) this._error = this.t('failed')
      return ok
    } catch (e) {
      this._error = msg(e)
      return false
    } finally {
      this._busy = false
    }
  }

  // MCP 工具总控开关切换
  async setMcpEnabled(next: boolean): Promise<boolean> {
    const snap = this.getSnapshot()
    if (!snap.writable || this._busy || next === snap.mcpEnabled || !this.form) return false
    this._busy = true
    this._error = null
    try {
      const ok = await this.form.mutate(
        [{ op: 'set', path: ['mcpEnabled'], value: next }],
        this.form.state.revision,
      )
      if (!ok) this._error = this.t('failed')
      return ok
    } catch (e) {
      this._error = msg(e)
      return false
    } finally {
      this._busy = false
    }
  }

  // 单一技能开关翻转（单次原子 3-ops 批处理提交）
  // 保持重载兼容：toggle(name, next) 或 toggle(name, 'model'|'user', next)
  async toggle(name: string, nextOrAxis?: boolean | 'model' | 'user', explicitNext?: boolean): Promise<boolean> {
    const snap = this.getSnapshot()
    if (!snap.writable || this._busy || !this.form) return false
    const state = this.form.state
    const user = (state.user && typeof state.user === 'object' && !Array.isArray(state.user) ? state.user : {}) as Record<string, unknown>
    const disabled = new Set(strArray(user.disabledSkills))
    const modelHidden = new Set(strArray(user.modelHiddenSkills))
    const userHidden = new Set(strArray(user.userHiddenSkills))

    const isCurrentOff = disabled.has(name) || (modelHidden.has(name) && userHidden.has(name))

    let next: boolean
    if (typeof explicitNext === 'boolean') {
      next = explicitNext
    } else if (typeof nextOrAxis === 'boolean') {
      next = nextOrAxis
    } else {
      next = isCurrentOff
    }

    if (next) {
      disabled.delete(name)
      modelHidden.delete(name)
      userHidden.delete(name)
    } else {
      disabled.add(name)
      modelHidden.delete(name)
      userHidden.delete(name)
    }

    this._busy = true
    this._error = null
    try {
      const ok = await this.form.mutate(
        [
          { op: 'set', path: ['disabledSkills'], value: [...disabled].sort() },
          { op: 'set', path: ['modelHiddenSkills'], value: [...modelHidden].sort() },
          { op: 'set', path: ['userHiddenSkills'], value: [...userHidden].sort() },
        ],
        state.revision,
      )
      if (!ok) this._error = this.t('failed')
      return ok
    } catch (e) {
      this._error = msg(e)
      return false
    } finally {
      this._busy = false
    }
  }

  // 批量全开 / 全关
  async setAllSkills(enable: boolean): Promise<boolean> {
    const snap = this.getSnapshot()
    if (!snap.writable || this._busy || !this.form) return false
    const state = this.form.state
    const allNames = snap.skills.map((s) => s.name)
    const nextDisabled = enable ? [] : [...allNames].sort()

    this._busy = true
    this._error = null
    try {
      const ok = await this.form.mutate(
        [
          { op: 'set', path: ['disabledSkills'], value: nextDisabled },
          { op: 'set', path: ['modelHiddenSkills'], value: [] },
          { op: 'set', path: ['userHiddenSkills'], value: [] },
        ],
        state.revision,
      )
      if (!ok) this._error = this.t('failed')
      return ok
    } catch (e) {
      this._error = msg(e)
      return false
    } finally {
      this._busy = false
    }
  }
}

// ---------------------------------------------------------------------------
// 现代化前端组件（Frontend Design 专业设计系统）
// ---------------------------------------------------------------------------

const CF_ORANGE = '#f6821f'

function Badge(props: { label: string; color?: string; bg?: string }): React.ReactElement {
  return React.createElement(
    'span',
    {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 7px',
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 999,
        lineHeight: 1.2,
        color: props.color ?? CF_ORANGE,
        background: props.bg ?? 'rgba(246, 130, 31, 0.12)',
        border: '0.5px solid rgba(246, 130, 31, 0.25)',
      },
    },
    props.label,
  )
}

function HeroBanner(props: { snap: PanelSnapshot; t: Translate }): React.ReactElement {
  const { snap, t } = props
  const enabledCount = snap.skills.filter((s) => s.enabled).length

  return React.createElement(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        padding: '14px 18px',
        marginBottom: 20,
        borderRadius: 'var(--dsw-radius-md, 8px)',
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '0.5px solid var(--dsw-alias-border-l2)',
      },
    },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 10 } },
      React.createElement('div', {
        style: {
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: CF_ORANGE,
          boxShadow: '0 0 10px rgba(246, 130, 31, 0.6)',
        },
      }),
      React.createElement(
        'span',
        { style: { fontSize: 14, fontWeight: 600, letterSpacing: -0.2 } },
        t('headerBadge'),
      ),
    ),
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
      React.createElement(Badge, {
        label: snap.loadMode === 'preset' ? t('modePreset') : t('modeGlobal'),
        color: snap.loadMode === 'preset' ? CF_ORANGE : 'var(--dsw-alias-label-secondary)',
        bg: snap.loadMode === 'preset' ? 'rgba(246, 130, 31, 0.12)' : 'var(--dsw-alias-bg-layer-1)',
      }),
      React.createElement(Badge, {
        label: snap.mcpEnabled ? t('mcpStatusOn') : t('mcpStatusOff'),
        color: snap.mcpEnabled ? '#10b981' : 'var(--dsw-alias-state-error-primary)',
        bg: snap.mcpEnabled ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
      }),
      React.createElement(Badge, {
        label: `${enabledCount}/${snap.skills.length} ${t('enabledCount')}`,
        color: 'var(--dsw-alias-label-secondary)',
        bg: 'var(--dsw-alias-bg-layer-1)',
      }),
    ),
  )
}

function ModeCard(props: {
  mode: 'preset' | 'global'
  title: string
  desc: string
  badge?: string
  checked: boolean
  disabled: boolean
  onClick: () => void
}): React.ReactElement {
  const { title, desc, badge, checked, disabled, onClick } = props
  return React.createElement(
    'div',
    {
      onClick: disabled ? undefined : onClick,
      style: {
        flex: 1,
        minWidth: 240,
        padding: '14px 16px',
        borderRadius: 'var(--dsw-radius-md, 8px)',
        border: checked
          ? `1.5px solid ${CF_ORANGE}`
          : '0.5px solid var(--dsw-alias-border-l2)',
        background: checked
          ? 'rgba(246, 130, 31, 0.05)'
          : 'var(--dsw-alias-bg-layer-2)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.18s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      },
    },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        React.createElement('input', {
          type: 'radio',
          name: 'loadMode',
          value: props.mode,
          checked,
          disabled,
          onChange: onClick,
          style: { cursor: disabled ? 'default' : 'pointer', accentColor: CF_ORANGE, margin: 0 },
        }),
        React.createElement(
          'span',
          { style: { fontSize: 13, fontWeight: checked ? 600 : 500, color: 'var(--dsw-alias-label-primary)' } },
          title,
        ),
      ),
      badge ? React.createElement(Badge, { label: badge }) : null,
    ),
    React.createElement(
      'p',
      {
        style: {
          fontSize: 12,
          lineHeight: 1.5,
          color: 'var(--dsw-alias-label-tertiary)',
          margin: '2px 0 0 24px',
        },
      },
      desc,
    ),
  )
}

function McpMasterCard(props: {
  snap: PanelSnapshot
  t: Translate
  onToggle: (next: boolean) => void
}): React.ReactElement {
  const { snap, t, onToggle } = props
  return React.createElement(
    'div',
    {
      style: {
        marginBottom: 24,
        padding: '16px 18px',
        borderRadius: 'var(--dsw-radius-md, 8px)',
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '0.5px solid var(--dsw-alias-border-l2)',
      },
    },
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        },
      },
      React.createElement(
        'div',
        null,
        React.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          React.createElement('h4', { style: { fontSize: 14, fontWeight: 600, margin: 0 } }, t('mcpSection')),
          React.createElement(Badge, {
            label: snap.mcpEnabled ? t('mcpStatusOn') : t('mcpStatusOff'),
            color: snap.mcpEnabled ? '#10b981' : 'var(--dsw-alias-state-error-primary)',
            bg: snap.mcpEnabled ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          }),
        ),
        React.createElement(
          'p',
          {
            style: {
              fontSize: 12,
              color: 'var(--dsw-alias-label-tertiary)',
              margin: '4px 0 0',
            },
          },
          t('mcpHint'),
        ),
      ),
      React.createElement(primitives.Switch, {
        checked: snap.mcpEnabled,
        disabled: !snap.writable || snap.busy,
        label: t('mcpSection'),
        onChange: onToggle,
      }),
    ),
    React.createElement(
      'div',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 8,
          marginTop: 14,
          opacity: snap.mcpEnabled ? 1 : 0.45,
          transition: 'opacity 0.2s ease',
        },
      },
      React.createElement(
        'div',
        {
          style: {
            fontSize: 12,
            padding: '8px 10px',
            borderRadius: 'var(--dsw-radius-sm, 4px)',
            background: 'var(--dsw-alias-bg-layer-1)',
            border: '0.5px solid var(--dsw-alias-border-l1)',
          },
        },
        t('mcpToolDocs'),
      ),
      React.createElement(
        'div',
        {
          style: {
            fontSize: 12,
            padding: '8px 10px',
            borderRadius: 'var(--dsw-radius-sm, 4px)',
            background: 'var(--dsw-alias-bg-layer-1)',
            border: '0.5px solid var(--dsw-alias-border-l1)',
          },
        },
        t('mcpToolSearch'),
      ),
      React.createElement(
        'div',
        {
          style: {
            fontSize: 12,
            padding: '8px 10px',
            borderRadius: 'var(--dsw-radius-sm, 4px)',
            background: 'var(--dsw-alias-bg-layer-1)',
            border: '0.5px solid var(--dsw-alias-border-l1)',
          },
        },
        t('mcpToolExecute'),
      ),
    ),
    !snap.mcpEnabled
      ? React.createElement(
          'div',
          {
            style: {
              marginTop: 12,
              padding: '8px 12px',
              fontSize: 12,
              borderRadius: 'var(--dsw-radius-sm, 4px)',
              background: 'rgba(239, 68, 68, 0.08)',
              color: 'var(--dsw-alias-state-error-primary)',
              border: '0.5px solid rgba(239, 68, 68, 0.2)',
            },
          },
          t('mcpDisabledBanner'),
        )
      : null,
  )
}

function SkillCard(props: {
  skill: SkillRowModel
  busy: boolean
  writable: boolean
  t: Translate
  onToggle: (name: string, next: boolean) => void
}): React.ReactElement {
  const { skill, busy, writable, t, onToggle } = props

  return React.createElement(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '12px 14px',
        borderRadius: 'var(--dsw-radius-md, 6px)',
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        opacity: skill.enabled ? 1 : 0.55,
        transition: 'all 0.18s ease',
      },
    },
    React.createElement(
      'div',
      { style: { flex: 1, minWidth: 0 } },
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        React.createElement(
          'span',
          {
            style: {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 13,
              fontWeight: 600,
              color: skill.enabled ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
            },
          },
          skill.name,
        ),
        React.createElement(
          'span',
          {
            style: {
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 4,
              background: 'var(--dsw-alias-bg-layer-1)',
              color: 'var(--dsw-alias-label-secondary)',
              border: '0.5px solid var(--dsw-alias-border-l1)',
              fontWeight: 500,
            },
          },
          skill.category,
        ),
      ),
      React.createElement(
        'p',
        {
          style: {
            fontSize: 12,
            color: 'var(--dsw-alias-label-tertiary)',
            margin: '4px 0 0',
            lineHeight: 1.4,
          },
        },
        skill.summary === '' ? 'skills/' + skill.name : skill.summary,
      ),
    ),
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      React.createElement(
        'span',
        {
          style: {
            fontSize: 11,
            color: skill.enabled ? CF_ORANGE : 'var(--dsw-alias-label-tertiary)',
            fontWeight: 500,
          },
        },
        skill.enabled ? t('skillActive') : t('skillInactive'),
      ),
      React.createElement(primitives.Switch, {
        checked: skill.enabled,
        disabled: !writable || busy,
        label: skill.name,
        onChange: (next: boolean) => onToggle(skill.name, next),
      }),
    ),
  )
}

function Guide(props: { t: Translate }): React.ReactElement {
  return React.createElement(
    'div',
    {
      style: {
        fontSize: 12,
        lineHeight: 1.5,
        padding: '12px 14px',
        borderRadius: 'var(--dsw-radius-md, 6px)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderLeft: `3px solid ${CF_ORANGE}`,
      },
    },
    React.createElement(
      'div',
      { style: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: 4 } },
      props.t('guideTitle'),
    ),
    props.t('guideText'),
  )
}

// ---------------------------------------------------------------------------
// 页面主视图组件
// ---------------------------------------------------------------------------

function Panel(props: PanelProps, fallbackT: Translate): React.ReactElement {
  const t = props.t ?? fallbackT
  const [, setTick] = React.useState(0)
  const [controller] = React.useState(new PanelController(props.form, t))
  const [filterText, setFilterText] = React.useState('')
  controller.update(props.form, t)

  if (props.view !== 'page') {
    return React.createElement('span', null, t('skillHint'))
  }

  const snap = controller.getSnapshot()
  if (snap.status === 'loading') {
    return React.createElement(
      'div',
      { style: { padding: '16px 0', color: 'var(--dsw-alias-label-tertiary)' } },
      t('loading'),
    )
  }

  const trigger = (action: () => Promise<boolean>) => {
    setTick((v) => v + 1)
    action().finally(() => setTick((v) => v + 1))
  }

  const changeMode = (nextMode: 'global' | 'preset') => {
    trigger(() => controller.setMode(nextMode))
  }

  const toggleMcp = (next: boolean) => {
    trigger(() => controller.setMcpEnabled(next))
  }

  const toggleSkill = (name: string, next: boolean) => {
    trigger(() => controller.toggle(name, next))
  }

  const setAllSkills = (enable: boolean) => {
    trigger(() => controller.setAllSkills(enable))
  }

  const filteredSkills = snap.skills.filter((skill) => {
    if (!filterText.trim()) return true
    const q = filterText.toLowerCase().trim()
    return skill.name.toLowerCase().includes(q) || skill.summary.toLowerCase().includes(q) || skill.category.toLowerCase().includes(q)
  })

  return React.createElement(
    'div',
    { style: { padding: '8px 0', maxWidth: 720 } },

    snap.error === null
      ? null
      : React.createElement(
          'div',
          { role: 'status', style: { padding: '10px 14px', marginBottom: 12, borderRadius: 6, background: 'rgba(239, 68, 68, 0.1)', color: 'var(--dsw-alias-state-error-primary)' } },
          snap.error === t('failed') ? snap.error : t('failed') + ': ' + snap.error,
        ),

    snap.writable
      ? null
      : React.createElement(
          'p',
          {
            style: {
              fontSize: 12,
              padding: '8px 12px',
              margin: '0 0 12px',
              borderRadius: 'var(--dsw-radius-sm)',
              background: 'var(--dsw-alias-bg-layer-2)',
              color: 'var(--dsw-alias-state-warn-primary)',
              border: '0.5px solid var(--dsw-alias-border-l2)',
            },
          },
          t('readOnly'),
        ),

    // 头部状态微型展板
    React.createElement(HeroBanner, { snap, t }),

    // 1. 运行模式选择（双列卡片）
    React.createElement(
      'section',
      { style: { marginBottom: 24 } },
      React.createElement(
        'div',
        { style: { marginBottom: 10 } },
        React.createElement('h3', { style: { fontSize: 14, fontWeight: 600, margin: 0 } }, t('modeSection')),
        React.createElement('p', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', margin: '4px 0 0' } }, t('modeHint')),
      ),
      React.createElement(
        'div',
        { style: { display: 'flex', gap: 12, flexWrap: 'wrap' } },
        React.createElement(ModeCard, {
          mode: 'preset',
          title: t('modePreset'),
          desc: t('modePresetDesc'),
          badge: t('modePresetBadge'),
          checked: snap.loadMode === 'preset',
          disabled: !snap.writable || snap.busy,
          onClick: () => changeMode('preset'),
        }),
        React.createElement(ModeCard, {
          mode: 'global',
          title: t('modeGlobal'),
          desc: t('modeGlobalDesc'),
          checked: snap.loadMode === 'global',
          disabled: !snap.writable || snap.busy,
          onClick: () => changeMode('global'),
        }),
      ),
    ),

    // 2. Cloudflare MCP 工具总控卡片
    React.createElement(McpMasterCard, {
      snap,
      t,
      onToggle: toggleMcp,
    }),

    // 3. 技能库列表与即时搜索工具栏
    React.createElement(
      'section',
      { style: { marginBottom: 24 } },
      React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 12,
          },
        },
        React.createElement(
          'div',
          null,
          React.createElement('h3', { style: { fontSize: 14, fontWeight: 600, margin: 0 } }, t('skillSection')),
          React.createElement('p', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', margin: '4px 0 0' } }, t('skillHint')),
        ),
        React.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          React.createElement(
            'button',
            {
              type: 'button',
              disabled: !snap.writable || snap.busy,
              onClick: () => setAllSkills(true),
              style: {
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 4,
                cursor: !snap.writable || snap.busy ? 'default' : 'pointer',
                background: 'var(--dsw-alias-bg-layer-2)',
                border: '0.5px solid var(--dsw-alias-border-l2)',
                color: 'var(--dsw-alias-label-secondary)',
              },
            },
            t('enableAll'),
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              disabled: !snap.writable || snap.busy,
              onClick: () => setAllSkills(false),
              style: {
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 4,
                cursor: !snap.writable || snap.busy ? 'default' : 'pointer',
                background: 'var(--dsw-alias-bg-layer-2)',
                border: '0.5px solid var(--dsw-alias-border-l2)',
                color: 'var(--dsw-alias-label-secondary)',
              },
            },
            t('disableAll'),
          ),
        ),
      ),

      // 实时搜索框
      React.createElement(
        'div',
        {
          style: {
            position: 'relative',
            marginBottom: 12,
          },
        },
        React.createElement('input', {
          type: 'text',
          value: filterText,
          placeholder: t('searchPlaceholder'),
          onChange: (e: any) => setFilterText(e.target.value),
          style: {
            width: '100%',
            boxSizing: 'border-box',
            padding: '8px 12px',
            fontSize: 12,
            borderRadius: 'var(--dsw-radius-md, 6px)',
            background: 'var(--dsw-alias-bg-layer-2)',
            color: 'var(--dsw-alias-label-primary)',
            border: '0.5px solid var(--dsw-alias-border-l2)',
            outline: 'none',
          },
        }),
      ),

      // 技能卡片列表
      snap.skills.length === 0
        ? React.createElement('p', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, t('noSkills'))
        : filteredSkills.length === 0
        ? React.createElement('p', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', padding: '16px 0', textAlign: 'center' } }, t('noMatchingSkills'))
        : React.createElement(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            filteredSkills.map((skill) =>
              React.createElement(SkillCard, {
                key: skill.name,
                skill,
                busy: snap.busy,
                writable: snap.writable,
                t,
                onToggle: toggleSkill,
              }),
            ),
          ),
    ),

    // 4. 说明与配置引导
    React.createElement(Guide, { t }),

  )
}

// ---------------------------------------------------------------------------
// 插件入口注册
// ---------------------------------------------------------------------------

export function apply(ctx: any): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'cfbridge: dictionaries')
  const t = ctx.locale.bind(NS) as Translate

  ctx.effect(
    () =>
      ctx.slots.inject('plugins.detail.section', () =>
        ctx.slots.register(
          { name: 'plugins.detail.section', id: 'cfbridge-guide', locale: NS },
          (props: { subject?: { kind?: string; pkg?: { name?: string } } }) =>
            props.subject?.pkg?.name === PACKAGE_NAME
              ? React.createElement(Guide, { t })
              : null,
        ),
      ),
    'cfbridge: guide section in bundle detail',
  )

  ctx.effect(
    () =>
      ctx.slots.inject('plugins.row.config', () =>
        ctx.slots.register(
          { name: 'plugins.row.config', key: ROW_CONFIG_KEY, locale: NS },
          (props: PanelProps) => Panel(props, t),
        ),
      ),
    'cfbridge: config panel in row view',
  )
}

export const inject = ['slots', 'locale']
export default { apply, PanelController, inject }
