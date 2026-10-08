// @wenaixi/cfbridge 浏览器半侧（双面插件的 client 面）。
//
// 目标：在「插件」页的 cfbridge 详情页里给用户一张开关面板。
//   - 宿主组件（Cloudflare MCP / cfbridge Provider）的启用态只读展示；
//     真正的逐行开关由宿主自己的「包含的组件」列表提供，面板不重复实现。
//   - 技能开关是本插件独有的能力，通过宿主送到 props 上的表单控制器写入。
//
// 这里刻意不碰任何 Remote 服务、不等任何 ctx.inject：
// plugins.row.config 的 owner props 本身就是 { view, form }，
// form 是宿主配置表单控制器（state + mutate），写入落盘、版本栅栏、
// 重载判定都由宿主负责。这比自建通道少了整整一层跨端协议。
//
// 本文件由 scripts/build-client.js 转译为 lib/client.js（CJS factory），是唯一来源。

import * as React from 'react'
import * as UI from '@deepseek-ai/dsh-client-ui-primitives'

/** 包名：plugins.bundle.config 的 key 就是它，宿主按 entryKey 匹配。 */
const PACKAGE_NAME = '@wenaixi/cfbridge'
/** 语言包命名空间。 */
const NS = 'cfbridge'
/**
 * 本插件在 profile patch 里的行 id。
 *
 * 它同时是三个身份：settings 描述面的 namespace、settings.update 的写入键，
 * 以及宿主 plugins.row.config 的 entryKey 组成（宿主按 <包名>#<行id> 拼键）。
 */
const ROW_ID = 'cfbridge'
/** plugins.row.config 的键 = <bundle>#<rowId>（与宿主 rowConfigKey 同一算法）。 */
const ROW_CONFIG_KEY = PACKAGE_NAME + '#' + ROW_ID

// ---------------------------------------------------------------------------
// 语言包
// ---------------------------------------------------------------------------

const zh = {
  modeSection: '运行模式',
  modeHint: '选择技能与 MCP 工具的加载范围。',
  modeGlobal: '全局加载（所有会话可用）',
  modePreset: 'cfbridge 模式（仅专属模式可用）',
  hostSection: '宿主组件',
  hostHint: '在「包含的组件」里可以逐行启用或停用。',
  skillSection: '技能开关',
  skillHint: '每个技能有两个独立开关：模型可调用、人类可调用。两个都关等于完全关闭。',
  skillName: '技能',
  model: '模型',
  user: '人类',
  loading: '正在读取…',
  failed: '保存失败',
  readOnly: '当前实例的配置不可写。',
  noSkills: '没有发现技能。',
  guideText: '开关位置：下方「包含的组件」可逐行启用或停用 MCP 与 Provider；技能开关在 cfbridge 行的「配置」页里，每个技能有「模型」与「人类」两个独立开关。',
}

const en = {
  modeSection: 'Run Mode',
  modeHint: 'Choose the loading scope for skills and MCP tools.',
  modeGlobal: 'Global (Available in all sessions)',
  modePreset: 'cfbridge Mode (Available only in cfbridge mode)',
  hostSection: 'Host components',
  hostHint: 'Enable or disable each one under "Included components".',
  skillSection: 'Skills',
  skillHint: 'Each skill has two independent switches: model-invocable and user-invocable. Both off means fully disabled.',
  skillName: 'Skill',
  model: 'Model',
  user: 'Human',
  loading: 'Reading…',
  failed: 'Save failed',
  readOnly: 'Configuration is read-only in this instance.',
  noSkills: 'No skills found.',
  guideText: 'Where the switches are: "Included components" below toggles the MCP and Provider rows; skill switches live in the cfbridge row config page, with independent Model and Human switches per skill.',
}

type Dict = typeof zh
type Translate = (key: keyof Dict) => string

// ---------------------------------------------------------------------------
// 技能简介（面板每行显示的一句话说明）
// ---------------------------------------------------------------------------
//
// 为什么不直接用 SKILL.md frontmatter 里的 description：那是**面向模型**的
// 触发说明（英文，实测 160–551 字符，形如 "Load when creating stateful agents,
// durable workflows, ..."），塞进面板既长又难读，且面板是中文界面。
// 因此这里维护一份人类可读的短简介，并在 tests 中锁定：
//   - 每个技能都必须有简介（新增技能忘了写会红）
//   - 简介长度有上限（防止有人把整段描述贴进来）
//
// 与技能清单的关系：清单由 Host 侧 Provider 发现后发布（config.availableSkills），
// 本表只负责"把名字翻译成人话"，不参与发现。表里多出的条目不会渲染。
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

/**
 * 探测当前语言。
 *
 * 宿主送给面板的 props 只有 t / ui / form / view，不含语言字段；
 * 而 ctx.locale.bind(NS) 返回的 t 已按当前语言解析。这里用一个中英文案
 * 明显不同的已注册 key 做哨兵：读回来的值等于哪份字典，当前就是哪种语言。
 * 比新增宿主依赖更稳，也不改变任何既有契约。
 */
function detectLang(t: Translate): 'zh' | 'en' {
  return t('skillName') === zh.skillName ? 'zh' : 'en'
}

/** 取某个技能当前语言的简介；没有登记则返回空串（面板据此回退为目录名）。 */
function skillSummary(name: string, lang: 'zh' | 'en'): string {
  const entry = SKILL_SUMMARY[name]
  return entry === undefined ? '' : entry[lang]
}

// ---------------------------------------------------------------------------
// 宿主送到 props 上的表单控制器（面板只用到其中两个成员）
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
  /** 页面只要求 'page' 视图；'summary' 是同一插槽的摘要位，不要在这里渲染表单。 */
  readonly view?: 'summary' | 'page'
  readonly form?: PageForm
  readonly t: Translate
  readonly ui: Primitives
}

const primitives = UI as unknown as Primitives

function msg(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/**
 * 一行：标题 + 说明 + 状态点 + 可选开关。
 * 状态点自身 aria-hidden，状态文案必须由渲染方给出（无障碍配对要求）。
 */
/** 一个带标签的开关：无障碍要求 label 必须由渲染方给出（组件读不到 locale）。 */
function LabelledSwitch(props: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}): React.ReactElement {
  return React.createElement(
    'label',
    { style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 } },
    React.createElement(primitives.Switch, {
      checked: props.checked,
      disabled: props.disabled === true,
      label: props.label,
      onChange: props.onChange,
    }),
    React.createElement(
      'span',
      { style: { color: 'var(--dsw-alias-label-tertiary)' } },
      props.label,
    ),
  )
}

/**
 * 一行技能：名字 + 说明 + 两个独立开关（模型 / 人类）。
 * 两个都关等于完全关闭；这与 Host 侧 disabledSkills 的语义一致，
 * 所以面板把三个 volatile 字段当作同一件事的三个投影来写。
 */
function SkillRow(props: {
  name: string
  /** 一句话简介（当前语言）；为空串时不渲染说明行。由调用方按语言取好再传入。 */
  summary: string
  modelInvocable: boolean
  userInvocable: boolean
  /** 本行是否正在保存（由调用方按技能名比对后传来，这里只当布尔用）。 */
  busy: boolean
  writable: boolean
  t: Translate
  onToggle: (name: string, axis: 'model' | 'user', next: boolean) => void
}): React.ReactElement {
  const { name, summary, modelInvocable, userInvocable, busy, writable, t, onToggle } = props
  const off = !modelInvocable && !userInvocable
  return React.createElement(
    'li',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '10px 0',
        borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
      },
    },
    React.createElement(
      'div',
      { style: { flex: 1, minWidth: 0 } },
      React.createElement(
        'div',
        { style: { fontWeight: 500, color: off ? 'var(--dsw-alias-label-tertiary)' : undefined } },
        name,
      ),
      // 说明行：优先显示人话简介；没有登记简介时回退为目录名，
      // 保证任何情况下这一行都不是空白（新技能在补简介前也能看出它是什么）。
      React.createElement(
        'div',
        { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginTop: 2 } },
        summary === '' ? 'skills/' + name : summary,
      ),
    ),
    React.createElement(LabelledSwitch, {
      label: t('model'),
      checked: modelInvocable,
      disabled: !writable || busy,
      onChange: (next: boolean) => onToggle(name, 'model', next),
    }),
    React.createElement(LabelledSwitch, {
      label: t('user'),
      checked: userInvocable,
      disabled: !writable || busy,
      onChange: (next: boolean) => onToggle(name, 'user', next),
    }),
  )
}

/** bundle 详情页的引导块：告诉用户两处开关分别在哪个位置。 */
function Guide(props: { t: Translate }): React.ReactElement {
  return React.createElement(
    'p',
    {
      style: {
        fontSize: 12,
        padding: '8px 10px',
        borderRadius: 'var(--dsw-radius-sm)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        border: '0.5px solid var(--dsw-alias-border-l2)',
      },
    },
    props.t('guideText'),
  )
}

function head(title: string, hint: string): React.ReactElement {
  return React.createElement(
    'div',
    { style: { marginBottom: 6 } },
    React.createElement('h4', { style: { fontSize: 13, fontWeight: 600, margin: 0 } }, title),
    React.createElement(
      'p',
      { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', margin: '4px 0 0' } },
      hint,
    ),
  )
}

function Panel(props: PanelProps, t: Translate): React.ReactElement {
  const { form } = props
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  // 摘要位交给宿主渲染说明文案；这里只画页面视图。
  if (props.view !== 'page') {
    return React.createElement('span', null, t('skillHint'))
  }

  const state = form?.state
  if (state === undefined || state.status === 'loading') {
    return React.createElement(
      'div',
      { style: { padding: '12px 0', color: 'var(--dsw-alias-label-tertiary)' } },
      t('loading'),
    )
  }

  // 三个 volatile 字段是同一件事的三个投影：
  //   disabledSkills    —— 完全关闭（模型与人类都不可调用）
  //   modelHiddenSkills —— 只不给模型
  //   userHiddenSkills  —— 只不给人类
  // 面板把它们合成每行的两个开关，写入时再拆回去。
  const user = (state.user ?? {}) as Record<string, unknown>
  const disabled = strArray(user.disabledSkills)
  const modelHidden = strArray(user.modelHiddenSkills)
  const userHidden = strArray(user.userHiddenSkills)
  const rawLoadMode = user.loadMode
  const loadMode: 'global' | 'preset' = rawLoadMode === 'preset' ? 'preset' : 'global'
  // 清单由 Host 侧 Provider 发现后发布（config.availableSkills），面板不自己扫目录。
  const names = strArray(state.value?.availableSkills)
  const skills = [...new Set([...names, ...disabled, ...modelHidden, ...userHidden])].sort()
  const writable = state.writable && state.status === 'ready'
  // 语言只探测一次，避免每行重复比较。
  const lang = detectLang(t)

  const changeMode = (nextMode: 'global' | 'preset') => {
    if (form === undefined || nextMode === loadMode || busy !== null) return
    setBusy('loadMode')
    setError(null)
    form
      .mutate(
        [{ op: 'set', path: ['loadMode'], value: nextMode }],
        state.revision,
      )
      .then((ok) => { if (!ok) setError(t('failed')) })
      .catch((e: unknown) => setError(msg(e)))
      .finally(() => setBusy(null))
  }

  const toggle = (name: string, axis: 'model' | 'user', next: boolean) => {
    if (form === undefined || busy !== null) return
    // 先还原「两轴当前的真实开合状态」：disabledSkills 表示两轴都关，
    // 所以它必须同时投影到两个 hidden 集合，不能当成第三个独立字段。
    // 少了这一步，历史落盘形态（技能只在 disabledSkills 里）下只打开一轴时，
    // 另一轴会被静默打开 —— 用户没碰过的开关自己变了。
    const wasOff = disabled.includes(name)
    const modelOff = wasOff || modelHidden.includes(name)
    const userOff = wasOff || userHidden.includes(name)
    // 只翻转被点击的那一轴，另一轴保持原状。
    const nextModelOff = axis === 'model' ? !next : modelOff
    const nextUserOff = axis === 'user' ? !next : userOff
    const hiddenModel = new Set(modelHidden)
    const hiddenUser = new Set(userHidden)
    if (nextModelOff) hiddenModel.add(name)
    else hiddenModel.delete(name)
    if (nextUserOff) hiddenUser.add(name)
    else hiddenUser.delete(name)
    // 两个都关 = 完全关闭：用 disabledSkills 单一表达，并把它从两个 hidden 列表里移除，
    // 否则同一个事实有两个来源，读回时语义就会漂移。
    const off = new Set(disabled)
    if (nextModelOff && nextUserOff) {
      off.add(name)
      hiddenModel.delete(name)
      hiddenUser.delete(name)
    } else {
      off.delete(name)
    }
    setBusy(name)
    setError(null)
    form
      .mutate(
        [
          { op: 'set', path: ['disabledSkills'], value: [...off] },
          { op: 'set', path: ['modelHiddenSkills'], value: [...hiddenModel] },
          { op: 'set', path: ['userHiddenSkills'], value: [...hiddenUser] },
        ],
        state.revision,
      )
      .then((ok) => { if (!ok) setError(t('failed')) })
      .catch((e: unknown) => setError(msg(e)))
      .finally(() => setBusy(null))
  }

  return React.createElement(
    'div',
    { style: { padding: '4px 0', maxWidth: 680 } },

    error === null
      ? null
      : React.createElement(
          'div',
          { role: 'status', style: { padding: '10px 0', color: 'var(--dsw-alias-state-error-primary)' } },
          error === t('failed') ? error : t('failed') + ': ' + error,
        ),
    writable
      ? null
      : React.createElement(
          'p',
          {
            style: {
              fontSize: 12,
              padding: '8px 10px',
              margin: '0 0 4px',
              borderRadius: 'var(--dsw-radius-sm)',
              background: 'var(--dsw-alias-bg-layer-2)',
              color: 'var(--dsw-alias-state-warn-primary)',
              border: '0.5px solid var(--dsw-alias-border-l2)',
            },
          },
          t('readOnly'),
        ),

    React.createElement(
      'section',
      { style: { marginTop: 12, marginBottom: 18 } },
      head(t('modeSection'), t('modeHint')),
      React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            marginTop: 8,
            padding: '12px 14px',
            borderRadius: 'var(--dsw-radius-md, 6px)',
            background: 'var(--dsw-alias-bg-layer-2)',
            border: '0.5px solid var(--dsw-alias-border-l2)',
          },
        },
        React.createElement(
          'label',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: writable && busy === null ? 'pointer' : 'default',
              fontSize: 13,
            },
          },
          React.createElement('input', {
            type: 'radio',
            name: 'loadMode',
            value: 'global',
            checked: loadMode === 'global',
            disabled: !writable || busy !== null,
            onChange: () => changeMode('global'),
            style: { cursor: writable && busy === null ? 'pointer' : 'default' },
          }),
          React.createElement('span', { style: { fontWeight: loadMode === 'global' ? 600 : 400 } }, t('modeGlobal')),
        ),
        React.createElement(
          'label',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: writable && busy === null ? 'pointer' : 'default',
              fontSize: 13,
            },
          },
          React.createElement('input', {
            type: 'radio',
            name: 'loadMode',
            value: 'preset',
            checked: loadMode === 'preset',
            disabled: !writable || busy !== null,
            onChange: () => changeMode('preset'),
            style: { cursor: writable && busy === null ? 'pointer' : 'default' },
          }),
          React.createElement('span', { style: { fontWeight: loadMode === 'preset' ? 600 : 400 } }, t('modePreset')),
        ),
      ),
    ),

    React.createElement(
      'section',
      { style: { marginTop: 18 } },
      head(t('skillSection'), t('skillHint')),
      skills.length === 0
        ? React.createElement(
            'p',
            { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } },
            t('noSkills'),
          )
        : React.createElement(
            'ul',
            { style: { listStyle: 'none', margin: 0, padding: 0 } },
            skills.map((name) =>
              React.createElement(SkillRow, {
                key: name,
                name,
                summary: skillSummary(name, lang),
                modelInvocable: !disabled.includes(name) && !modelHidden.includes(name),
                userInvocable: !disabled.includes(name) && !userHidden.includes(name),
                busy: busy === name,
                writable,
                t,
                onToggle: toggle,
              }),
            ),
          ),
    ),

  )
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * 只声明 slots：其余一律不需要。
 * plugins.row.config 由「插件」页在挂载时声明为子插槽，注入会在那一刻挂起，
 * 页面打开后自动放行 —— 不必自己判断时机，也不必 ctx.inject 等待任何服务。
 */
export function apply(ctx: any): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'cfbridge: dictionaries')
  const t = ctx.locale.bind(NS) as Translate

  // bundle 详情页：宿主在这一层不送 form（见宿主 PackageDetail 的 renderSlot 调用），
  // 而动态插件的 ctx.inject 回调参数只有 fiber，拿不到 remote —— 也就是说第三方
  // 插件在这一页没有任何写通道。所以这里只放引导，不带开关。
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
    'cfbridge: bundle guide',
  )

  // 行详情页：宿主在这里送 form（它的 ConfigForm 控制器），
  // 而 formFor 用的正是行 id —— 与 settings 描述面的 namespace 同名。
  // 因此技能开关零跨端代码：写入、落盘、版本栅栏都由宿主表单控制器负责。
  ctx.effect(
    () =>
      ctx.slots.inject('plugins.row.config', () =>
        ctx.slots.register(
          { name: 'plugins.row.config', key: ROW_CONFIG_KEY, locale: NS },
          (props: PanelProps) => Panel(props, t),
        ),
      ),
    'cfbridge: row page panel',
  )
}

export default { apply, inject: ['slots', 'locale'] }