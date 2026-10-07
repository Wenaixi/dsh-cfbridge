import { watch } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import Schema from '@deepseek-ai/schemastery'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import type { Context } from '@deepseek-ai/cordis'
import type {
  SkillCandidate,
  SkillDefinition,
  SkillInvocationPolicy,
  SkillLookupOptions,
  SkillProvider,
} from '@deepseek-ai/dsh-skill'

const DEFAULT_PROVIDER_NAME = 'cfbridge'
const RUNTIME_PROVIDER_NAME = 'runtime'
const PROVIDER_RANK = 0
const DEFAULT_SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills')

export type LoadMode = 'global' | 'preset'

export interface Config {
  providerName: string
  skillDir?: string
  rank?: number
  cache?: boolean
  watchSkills?: boolean
  /** 运行模式：global 全局加载，preset 仅在 cfbridge 模式下加载。 */
  loadMode?: LoadMode
  /** 被单独关闭的技能名列表；命中的技能不进入发现结果，等同不存在。 */
  disabledSkills?: string[]
  /** 不向模型开放的技能名列表；人类仍可调用。 */
  modelHiddenSkills?: string[]
  /** 不向人类开放的技能名列表；模型仍可调用。 */
  userHiddenSkills?: string[]
  /** 技能清单快照，由插件在发现后写回，供设置面板逐个渲染技能。 */
  availableSkills?: string[]
}

/**
 * 把配置里的 disabledSkills 归一成字符串数组。
 *
 * 这个字段是 volatile 的，而 volatile 字段在宿主里以懒求值形态传递
 * （见 dsh-app-boot 的 lazy 投影），所以它可能是：数组、返回数组的函数、
 * 或包装过的对象。这里统一收敛，调用方只面对数组。
 */
function readStringListConfig(raw: unknown): string[] {
  let value: unknown = raw
  // 懒求值包装：取出最内层的真实值，最多解几层，避免意外自引用。
  for (let i = 0; i < 4 && typeof value === 'function'; i += 1) {
    try {
      value = (value as () => unknown)()
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v !== '')
}

/**
 * 把配置里的 loadMode 归一为 'global' 或 'preset'。
 */
function readLoadModeConfig(raw: unknown): LoadMode {
  let value: unknown = raw
  for (let i = 0; i < 4 && typeof value === 'function'; i += 1) {
    try {
      value = (value as () => unknown)()
    } catch {
      return 'global'
    }
  }
  return value === 'preset' ? 'preset' : 'global'
}

/**
 * 把一处 schema 标记为 volatile：宿主设置面只允许写入 volatile 字段。
 * Schemastery 的 Meta 是可变对象，没有链式 setter，所以这里直接打标。
 */
function markVolatile<T>(schema: T): T {
  ;(schema as { meta: Record<string, unknown> }).meta.volatile = true
  return schema
}

export const Config = Schema.object({
  providerName: Schema.string().default(DEFAULT_PROVIDER_NAME),
  skillDir: Schema.string().default(DEFAULT_SKILL_DIR),
  rank: Schema.number().default(PROVIDER_RANK).description('Provider 优先级权重 (默认 0，数值越小优先级越高)'),
  cache: Schema.boolean().default(true).description('是否开启基于 mtime 的元数据内存缓存'),
  watchSkills: Schema.boolean().default(false).description('是否在开发模式下监听技能文件变动'),
  loadMode: markVolatile(
    Schema.union([
      Schema.const('global').description('全局加载（所有会话均可用 MCP 工具与技能）'),
      Schema.const('preset').description('cfbridge 模式（仅专属模式加载 MCP 工具与技能）'),
    ]).default('global').description('运行模式'),
  ),
  // meta.volatile 是宿主 settings 通道的硬要求：只有被标记为 volatile 的字段
  // 才允许在运行时通过设置面写入（见 dsh-settings 的 volatileForm）。
  // 少了它，settings.update 会以 "has no volatile fields" 拒绝 —— 面板的
  // 技能开关就无从落盘。Schemastery 没有 volatile() 链式方法，直接写 meta。
  disabledSkills: markVolatile(
    Schema.array(Schema.string())
      .default([])
      .description('被单独关闭的技能名列表；命中的技能不进入发现结果'),
  ),
  modelHiddenSkills: markVolatile(
    Schema.array(Schema.string())
      .default([])
      .description('不向模型开放的技能名列表；人类仍可调用'),
  ),
  userHiddenSkills: markVolatile(
    Schema.array(Schema.string())
      .default([])
      .description('不向人类开放的技能名列表；模型仍可调用'),
  ),
  availableSkills: markVolatile(
    Schema.array(Schema.string())
      .default([])
      .description('技能清单快照（插件发现后写回，供设置面板展示）'),
  ),

}).description('@wenaixi/cfbridge Provider 配置')

/**
 * Cloudflare 专属模式预置提示词：自动注入操作规范、检索工作流与安全审批要求。
 */
export const CFBRIDGE_SYSTEM_INSTRUCTIONS = `# Cloudflare 专属操作规范与安全指南

你正处于 Cloudflare 专属模式，已就绪 Cloudflare Code Mode MCP 工具与按需技能：

1. **核心原则（search-then-execute）**：
   - 不确定端点、数据结构或参数时，必须先使用 mcp__cloudflare__docs 或 mcp__cloudflare__search 检索确认，严禁臆测端点。
   - 检索确认后再使用 mcp__cloudflare__execute 运行接口调用。

2. **操作审批铁律**：
   - 任何涉及写操作（POST、PUT、PATCH、DELETE）的请求，在执行前必须先明确告知用户你要做什么，并等待用户明确确认。

3. **Wrangler 本地协同**：
   - 本地开发、构建、离线脚手架和测试优先使用项目本地的 Wrangler CLI，与 MCP 运行时紧密协同。

4. **按需技能参考**：
   - 涉及特定产品（Workers, Pages, KV, D1, R2, Vectorize, Durable Objects, Agents SDK, Cloudflare One, Turnstile 等）时，按需调用对应技能获取最新规范与最佳实践。`;

export const name = DEFAULT_PROVIDER_NAME
// settings 必须进 inject：技能清单要在 apply 里发布到设置面，而可选取用
// （ctx.get）在 apply 时机可能还没就绪，会让发布静默落空。
// 同时保留可选写法兜底，因为精简宿主可能没有 settings（插件仍应正常加载）。
export const inject = ['skills', 'settings'] as const

type Logger = {
  warn(message: string): void
  debug?(message: string): void
  info?(message: string): void
}

type Frontmatter = Record<string, unknown>
type ParsedSkillFile = { data: Frontmatter; body: string }
type SkillLocator = { path: string; directory: string }

function stringField(data: Frontmatter, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function optionalString(data: Frontmatter, key: string): Record<string, string> {
  const value = stringField(data, key)
  return value === undefined ? {} : { [key]: value }
}

function frontmatterBoolean(data: Frontmatter, key: string): boolean | undefined {
  if (!Object.hasOwn(data, key)) return undefined
  const value = data[key]
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (typeof value === 'string') {
    if (['true', 'yes', 'on'].includes(value.toLowerCase())) return true
    if (['false', 'no', 'off'].includes(value.toLowerCase())) return false
  }
  throw new TypeError('frontmatter field ' + key + ' must be a boolean')
}

function parseInvocation(data: Frontmatter) {
  for (const [legacy, canonical] of [
    ['disableModelInvocation', 'disable-model-invocation'],
    ['modelInvocable', 'disable-model-invocation'],
    ['userInvocable', 'user-invocable'],
  ]) {
    if (Object.hasOwn(data, legacy)) {
      throw new Error('frontmatter field ' + legacy + ' is unsupported; use ' + canonical)
    }
  }
  const disabled = frontmatterBoolean(data, 'disable-model-invocation')
  const userInvocable = frontmatterBoolean(data, 'user-invocable')
  return {
    modelInvocable: disabled !== true,
    userInvocable: userInvocable !== false,
  }
}

function optionalMetadata(data: Frontmatter): Record<string, Readonly<Record<string, unknown>>> {
  const metadata = data.metadata
  return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
    ? { metadata: metadata as Readonly<Record<string, unknown>> }
    : {}
}

function openingFrontmatter(raw: string): { bodyStart: number } | undefined {
  let lineStart = 0
  let inComment = false
  while (lineStart <= raw.length) {
    const newline = raw.indexOf('\n', lineStart)
    const lineEnd = newline < 0 ? raw.length : newline
    let line = raw.slice(lineStart, lineEnd).replace(/\r$/, '')
    if (line.charCodeAt(0) === 0xfeff) line = line.slice(1)
    const trimmed = line.trim()
    if (inComment) {
      if (trimmed.endsWith('-->')) inComment = false
    } else if (trimmed === '') {
      // 允许 vendored 文件头部的空行。
    } else if (trimmed === '---') {
      return { bodyStart: newline < 0 ? raw.length : newline + 1 }
    } else if (trimmed.startsWith('<!--')) {
      inComment = !trimmed.endsWith('-->')
    } else {
      return undefined
    }
    if (newline < 0) return undefined
    lineStart = newline + 1
  }
  return undefined
}

function closingFrontmatterLine(raw: string, start: number): { start: number; bodyStart: number } | undefined {
  let lineStart = start
  while (lineStart <= raw.length) {
    const newline = raw.indexOf('\n', lineStart)
    const lineEnd = newline < 0 ? raw.length : newline
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
      return { start: lineStart, bodyStart: newline < 0 ? raw.length : newline + 1 }
    }
    if (newline < 0) return undefined
    lineStart = newline + 1
  }
  return undefined
}

export function parseFrontmatter(raw: string): ParsedSkillFile | undefined {
  const opening = openingFrontmatter(raw)
  if (opening === undefined) return undefined
  const closing = closingFrontmatterLine(raw, opening.bodyStart)
  if (closing === undefined) return undefined
  let data: unknown
  try {
    data = parse(raw.slice(opening.bodyStart, closing.start))
  } catch {
    return undefined
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
  return { data: data as Frontmatter, body: raw.slice(closing.bodyStart) }
}

// watcher 事件过滤：只关心 Provider 可能读到的内容变化。
// watch(skillDir, { recursive: true }) 回调的 filename 是相对路径（Windows 用反斜杠）；
// 规则与 list() 的发现契约一一对齐：文件级只认 SKILL.md，目录级顶层事件一律放行
// （Windows 上目录删除/重命名与文件同形态，无法可靠区分），点目录与嵌套无关文件拦截。
export function isSkillCatalogEvent(filename: string | null | undefined): boolean {
  if (filename === null || filename === undefined) return true
  const norm = filename.replaceAll('\\', '/')
  // 空串与 null 不同源：null 是平台正常形态（保守放行），空串视为异常形态（宁漏勿错），
  // 若未来观测到某平台用空串表示文件事件，需改回放行。
  if (norm === '' || norm.startsWith('.')) return false
  if (norm === 'SKILL.md' || norm.endsWith('/SKILL.md')) return true
  if (!norm.includes('/')) return true
  return false
}

function loggerMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function throwIfAborted(options: SkillLookupOptions): void {
  options.signal?.throwIfAborted()
}

function makeCandidate(
  parsed: ParsedSkillFile,
  locator: SkillLocator,
  providerName: string,
  rank: number = PROVIDER_RANK,
): SkillCandidate | undefined {
  const skillName = stringField(parsed.data, 'name')
  const description = stringField(parsed.data, 'description')
  if (skillName === undefined || description === undefined || !isSkillName(skillName)) return undefined
  return {
    name: skillName,
    description,
    ...optionalString(parsed.data, 'whenToUse'),
    invocation: parseInvocation(parsed.data),
    source: 'bundled',
    provider: providerName,
    rank,
    locator,
    resourceBase: { kind: 'directory', path: locator.directory },
    path: locator.path,
    ...optionalMetadata(parsed.data),
  }
}

function locatorOf(candidate: SkillCandidate): SkillLocator | undefined {
  const locator = candidate.locator
  if (typeof locator !== 'object' || locator === null) return undefined
  if (!('path' in locator) || !('directory' in locator)) return undefined
  if (typeof locator.path !== 'string' || typeof locator.directory !== 'string') return undefined
  return { path: locator.path, directory: locator.directory }
}

/**
 * 两个方向独立的隐藏名单。
 *
 * DSH 的技能发现契约本身就区分 modelInvocable 与 userInvocable（见
 * dsh-skill 的 SkillInvocationPolicy），所以「不给模型」和「不给人」
 * 是两件独立的事，不该塞进同一个开关。
 */
export interface SkillVisibility {
  readonly model?: readonly string[]
  readonly user?: readonly string[]
}

/**
 * 技能可见性名单的规范化读取面。
 *
 * 把两个方向的名单收成一个只读结构，供投影函数与运行时开关共用。
 * 「不给模型」与「不给人类」是两个独立维度（见上），因此分开承载。
 */
export interface VisibilitySets {
  readonly model: ReadonlySet<string>
  readonly user: ReadonlySet<string>
}

/**
 * 按可见性名单重投影一个候选的 invocation。
 *
 * 这是「技能开关」这套规则的唯一实现。此前 list() 与 get() 各手写了一份
 * 语义相同、仅变量名不同的投影，两份必须永远保持一致却没有任何机制保证；
 * 这里收敛成一个纯函数，两条路径都以它为唯一来源。
 *
 * 泛型约束刻意只要求 { name, invocation }：list() 处理 SkillCandidate，
 * get() 处理 SkillDefinition（多一个 content 字段），两者形状不同但投影规则相同，
 * 所以不能把签名绑定在某一种具体类型上。
 *
 * 投影只改 invocation，不改候选身份 —— 技能仍在目录里，只是某个消费面看不到它。
 */
export function projectInvocation<T extends { name: string; invocation: SkillInvocationPolicy }>(
  item: T,
  hidden: VisibilitySets,
): T {
  return {
    ...item,
    invocation: {
      modelInvocable: item.invocation.modelInvocable && !hidden.model.has(item.name),
      userInvocable: item.invocation.userInvocable && !hidden.user.has(item.name),
    },
  }
}

/** Provider 额外暴露给宿主控制面的运行时开关（设置面板消费）。 */
export interface MutableSkillProvider extends SkillProvider {
  invalidate(): void
  setDisabledSkills(names: readonly string[]): void
  disabledSkillNames(): string[]
  setHiddenSkills(next: SkillVisibility): void
  hiddenSkillNames(): Required<SkillVisibility>
}

/** createSkillProvider 的入参。用具名选项对象而非位置参数： */
/** 调用点因此只需写出关心的那几项，读代码不必回查签名。 */
export interface SkillProviderOptions {
  /** 技能目录；相对路径按进程工作目录解析。 */
  skillDir: string
  /** 挂载标识，默认 cfbridge；禁止使用保留名 runtime。 */
  providerName?: string
  /** 日志出口，默认 console。 */
  logger?: Logger
  /** 发现优先级权重，默认 0。 */
  rank?: number
  /** 是否启用基于 mtime 的元数据内存缓存，默认 true。 */
  cacheEnabled?: boolean
  /** 宿主驱动失效时的回调（清缓存后触发，用于让上游重新收集目录）。 */
  onInvalidate?: () => void
  /** 被完全关闭的技能名，默认空。 */
  disabledSkills?: readonly string[]
  /** 两个方向独立的隐藏名单，默认空。 */
  hiddenSkills?: SkillVisibility
  /** 运行模式：global 全局加载，preset 仅在 cfbridge 模式下加载（支持响应式函数）。 */
  loadMode?: LoadMode | (() => LoadMode)
  /** 智能体预设服务句柄，用于在 preset 模式下探测会话所属模式（支持对象或动态函数）。 */
  agentPresets?: { composedPreset?: (scope: unknown) => string | undefined } | (() => { composedPreset?: (scope: unknown) => string | undefined } | undefined)
}

/**
 * 创建一个技能 Provider。
 *
 * 参数用具名选项对象承载：此前是 8 个位置参数（其中 5 个可选），
 * 调用点必须回查签名才知道第 4 个是什么、第 6 个的 () => {} 又是谁。
 * 选项对象让每个调用点自解释，且新增选项不再波及任何既有调用点。
 */
export function createSkillProvider(options: SkillProviderOptions): MutableSkillProvider {
  const {
    skillDir,
    providerName = DEFAULT_PROVIDER_NAME,
    logger = console,
    rank = PROVIDER_RANK,
    cacheEnabled = true,
    onInvalidate,
    disabledSkills = [],
    hiddenSkills = {},
    loadMode = 'global',
    agentPresets,
  } = options
  const root = resolve(skillDir)
  const getMode = typeof loadMode === 'function' ? loadMode : () => loadMode
  // 关闭名单在 list() 的最早位置生效：候选不进入结果，等同该技能不存在。
  // 用可变 Set（而非拷贝快照）承载：宿主控制面可以在不重载插件的前提下改它，
  // 改完调 invalidate() 让目录失效，下一次 list() 就按新名单过滤。
  const disabled = new Set(disabledSkills)
  // 两个方向独立的隐藏名单：不给模型 ≠ 不给人。
  // 用可变 Set 承载，宿主控制面可在运行中替换，改完调 invalidate()。
  const modelHidden = new Set(hiddenSkills.model ?? [])
  const userHidden = new Set(hiddenSkills.user ?? [])
  type CacheEntry = { mtimeMs: number; candidate: SkillCandidate }
  const cache = new Map<string, CacheEntry>()
  const isModeAllowed = (scope: unknown) => {
    if (getMode() !== 'preset') return true
    if (scope === undefined) return true
    const p = typeof agentPresets === 'function' ? agentPresets() : agentPresets
    if (typeof p?.composedPreset !== 'function') return true
    return p.composedPreset(scope) === 'cfbridge'
  }

  return {
    name: providerName,
    /** 运行时替换关闭名单；调用方随后应触发一次目录失效。 */
    setDisabledSkills(names: readonly string[]) {
      disabled.clear()
      for (const name of names) disabled.add(name)
    },
    disabledSkillNames() {
      return [...disabled]
    },
    setHiddenSkills(next: SkillVisibility) {
      modelHidden.clear()
      for (const name of next.model ?? []) modelHidden.add(name)
      userHidden.clear()
      for (const name of next.user ?? []) userHidden.add(name)
    },
    hiddenSkillNames() {
      return { model: [...modelHidden], user: [...userHidden] }
    },
    invalidate() {
      // 清空 mtime 内存缓存并通知宿主侧失效回调（如有）。
      // 宿主（dsh-skill registry）在 invalidate() 之内自行广播 skills/change，
      // 此处不重复 emit，避免双份刷新。
      cache.clear()
      onInvalidate?.()
    },
    async list(options = {}) {
      throwIfAborted(options)
      if (!isModeAllowed((options as { scope?: unknown }).scope)) return []
      let entries
      try {
        entries = await readdir(root, { withFileTypes: true })
      } catch (error) {
        if (isAbortError(error)) throw error
        logger.warn('[cfbridge] skillDir not found: ' + root)
        return []
      }
      const candidates: SkillCandidate[] = []
      const seen = new Set<string>()
      // 隐藏名单改写 invocation，不改候选身份：技能仍在目录里，只是某个
      // 消费面看不到它。缓存里存的是「原始候选」，这里每次都按当前名单重投影，
      // 这样运行中改名单无需清 mtime 缓存。
      const hidden: VisibilitySets = { model: modelHidden, user: userHidden }
      const project = (candidate: SkillCandidate): SkillCandidate =>
        projectInvocation(candidate, hidden)
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        throwIfAborted(options)
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        const directory = join(root, entry.name)
        const path = join(directory, 'SKILL.md')
        try {
          const fileStat = await stat(path)
          throwIfAborted(options)

          if (cacheEnabled && cache.has(path)) {
            const cached = cache.get(path)!
            if (cached.mtimeMs === fileStat.mtimeMs) {
              if (disabled.has(cached.candidate.name)) continue
              if (seen.has(cached.candidate.name)) {
                logger.warn('[cfbridge] skip ' + path + ': duplicate skill name ' + cached.candidate.name)
                continue
              }
              seen.add(cached.candidate.name)
              candidates.push(project(cached.candidate))
              continue
            }
          }

          const parsed = parseFrontmatter(await readFile(path, { encoding: 'utf8', signal: options.signal }))
          throwIfAborted(options)
          if (parsed === undefined) {
            logger.warn('[cfbridge] skip ' + path + ': missing or invalid frontmatter')
            cache.delete(path)
            continue
          }
          const candidate = makeCandidate(parsed, { path, directory }, providerName, rank)
          if (candidate === undefined) {
            logger.warn('[cfbridge] skip ' + path + ': frontmatter requires a valid name and description')
            cache.delete(path)
            continue
          }
          if (disabled.has(candidate.name)) continue
          if (seen.has(candidate.name)) {
            logger.warn('[cfbridge] skip ' + path + ': duplicate skill name ' + candidate.name)
            continue
          }
          seen.add(candidate.name)
          if (cacheEnabled) {
            cache.set(path, { mtimeMs: fileStat.mtimeMs, candidate })
          }
          candidates.push(project(candidate))
        } catch (error) {
          if (isAbortError(error)) throw error
          cache.delete(path)
          logger.warn('[cfbridge] skip ' + path + ': ' + loggerMessage(error))
        }
      }
      return candidates
    },
    async get(candidate, options = {}) {
      throwIfAborted(options)
      if (!isModeAllowed((options as { scope?: unknown }).scope)) return undefined
      // 关闭名单在加载阶段同样生效：调用方拿着关闭前的旧候选取正文时不放行。
      if (disabled.has(candidate.name)) return undefined
      const locator = locatorOf(candidate)
      if (locator === undefined) return undefined
      let raw: string
      try {
        raw = await readFile(locator.path, { encoding: 'utf8', signal: options.signal })
      } catch (error) {
        if (isAbortError(error)) throw error
        logger.warn('[cfbridge] get ' + candidate.name + ': read failed: ' + loggerMessage(error))
        return undefined
      }
      throwIfAborted(options)
      let parsed: ParsedSkillFile | undefined
      try {
        parsed = parseFrontmatter(raw)
      } catch (error) {
        logger.warn('[cfbridge] get ' + candidate.name + ': frontmatter parse failed: ' + loggerMessage(error))
        return undefined
      }
      if (parsed === undefined) return undefined
      let definition: SkillCandidate | undefined
      try {
        definition = makeCandidate(parsed, locator, providerName, rank)
      } catch (error) {
        logger.warn('[cfbridge] get ' + candidate.name + ': invalid invocation frontmatter: ' + loggerMessage(error))
        return undefined
      }
      if (definition === undefined || definition.name !== candidate.name) return undefined
      // 与 list() 共用同一条投影规则，杜绝两份手写实现漂移。
      // 关闭名单在加载阶段同样生效：调用方拿着关闭前的旧候选取正文时不放行。
      return {
        ...projectInvocation(definition, { model: modelHidden, user: userHidden }),
        content: parsed.body.trim(),
      } as SkillDefinition
    },
  }
}

function resolveSkillDir(configured: string | undefined): string {
  return resolve(configured || DEFAULT_SKILL_DIR)
}

/**
 * 技能运行时：把「当前活着的 Provider」与「失效入口」这两根共享线封装在内部。
 *
 * 拆解 apply() 之前，这两根线是裸的闭包变量，被三条互不相关的效果同时读写
 * （watcher 去抖回调、技能清单发布），于是想改其中一条效果就必须
 * 先读懂另外两条。收敛到这里之后，各效果只面对下面几个方法。
 *
 * 宿主注册与失效的时序契约（不变）：
 *   - registerProvider 的回调在宿主收集目录时被调用，返回的 Provider 被宿主持有；
 *   - provider.invalidate() 清自身 mtime 缓存，并触发宿主侧的 control.invalidate，
 *     由 dsh-skill registry 广播 skills/change —— 此处不再手动 emit，避免双份刷新。
 */
export interface SkillRuntime {
  /** 当前活着的 Provider；宿主尚未调用注册回调时为 undefined。 */
  current(): MutableSkillProvider | undefined
  /** 清目录缓存并通知宿主失效。Provider 尚未就绪时是空操作。 */
  invalidate(): void
  /** 用真实技能目录列一次候选；Provider 未就绪或读取失败时返回空数组。 */
  listNames(): Promise<string[]>
}

/**
 * 创建技能运行时，并把 Provider 注册进宿主。
 *
 * @returns [运行时, 注销函数]
 */
function installSkillRuntime(ctx: Context, options: {
  skillDir: string
  providerName: string
  rank: number
  cacheEnabled: boolean
  disabledSkills: readonly string[]
  hiddenSkills: SkillVisibility
  loadMode?: LoadMode | (() => LoadMode)
  agentPresets?: { composedPreset?: (scope: unknown) => string | undefined } | (() => { composedPreset?: (scope: unknown) => string | undefined } | undefined)
}): [SkillRuntime, () => void] {
  let liveProvider: MutableSkillProvider | undefined
  // 宿主 control.invalidate 与 provider.invalidate 的合流入口。
  // 初始为 no-op：宿主尚未回调时收到失效请求是合法的（仅一次空刷新）。
  let invalidateCatalog: () => void = () => {}

  const dispose = ctx.skills.registerProvider((control) => {
    const provider = createSkillProvider({
      skillDir: options.skillDir,
      providerName: options.providerName,
      logger: ctx.logger,
      rank: options.rank,
      cacheEnabled: options.cacheEnabled,
      onInvalidate: control.invalidate,
      disabledSkills: options.disabledSkills,
      hiddenSkills: options.hiddenSkills,
      loadMode: options.loadMode,
      agentPresets: options.agentPresets,
    })
    liveProvider = provider
    // 闭包捕获安全：provider 只持有 control.invalidate 这一个函数引用，
    // 宿主对已 dispose 的注册调用 invalidate 按 dsh-skill 契约是 no-op（不会抛错），
    // 因此 watcher 在卸载竞态窗口内触发也不会崩，仅是一次空刷新。
    invalidateCatalog = () => provider.invalidate()
    return provider
  })

  return [
    {
      current: () => liveProvider,
      invalidate: () => invalidateCatalog(),
      async listNames() {
        const provider = liveProvider
        if (provider === undefined) return []
        try {
          const listed = await provider.list({})
          // list() 有两种合法返回：直接给候选数组，或带上 complete 标记的观测对象。
          // readonly 数组让 Array.isArray 收窄不彻底，因此显式判形状。
          const candidates: readonly SkillCandidate[] =
            Array.isArray(listed) ? listed : (listed as { candidates: readonly SkillCandidate[] }).candidates
          return candidates.map((candidate) => candidate.name).sort()
        } catch {
          return []
        }
      },
    },
    dispose,
  ]
}

/**
 * 开发模式下的技能文件监听：去抖后走运行时失效入口。
 *
 * 过滤规则见 isSkillCatalogEvent —— 它与 list() 的发现契约一一对齐。
 * 返回 [启动结果, 关闭函数]；平台不支持递归 watch 时启动结果为 false（不抛错）。
 */
function installSkillsWatcher(
  ctx: Context,
  skillDir: string,
  runtime: SkillRuntime,
): [boolean, () => void] {
  let watcher: ReturnType<typeof watch> | undefined
  let debounceTimer: NodeJS.Timeout | undefined
  try {
    watcher = watch(skillDir, { recursive: true }, (_eventType, filename) => {
      if (!isSkillCatalogEvent(filename)) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        // 走失效入口而非手动 emit：由 registry 的 invalidate() 自动广播 skills/change。
        runtime.invalidate()
      }, 100)
    })
  } catch (e) {
    ctx.logger.warn?.('[cfbridge] failed to initialize skills watcher: ' + String(e))
    return [false, () => {}]
  }
  return [true, () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (watcher && typeof watcher.close === 'function') watcher.close()
  }]
}

interface SettingsRuntime {
  describe(options?: { redactSecrets?: boolean }): Array<{
    ns: string
    user?: { availableSkills?: unknown }
  }>
  update(namespace: string, patch: { availableSkills: string[] }): Promise<unknown>
  configure(options: { auto: boolean }): (() => void) | void
}

/**
 * 把发现到的技能清单写回设置面，供面板逐个渲染技能开关。
 *
 * 清单发布使用已注入的 settings 实例。目录失效后由调用方重新排队，
 * 发布过程串行化并只在清单变化时写入，避免旧异步结果覆盖新快照。
 */
async function publishSkillCatalog(
  ctx: Context,
  settings: SettingsRuntime | undefined,
  runtime: SkillRuntime,
  providerName: string,
  isActive: () => boolean = () => true,
): Promise<void> {
  if (settings === undefined || typeof settings.describe !== 'function') return
  const names = await runtime.listNames()
  if (!isActive()) return
  const view = settings
    .describe({ redactSecrets: true })
    .find((entry) => entry.ns === providerName)
  const current: unknown = view?.user?.availableSkills
  if (Array.isArray(current) && current.length === names.length
    && current.every((v: unknown, i: number) => v === names[i])) {
    return
  }
  try {
    await settings.update(providerName, { availableSkills: names })
  } catch (error) {
    ctx.logger.debug?.('[cfbridge] 技能清单发布失败: ' + loggerMessage(error))
  }
}

export function apply(ctx: Context, config: Config = {
  providerName: DEFAULT_PROVIDER_NAME,
  skillDir: DEFAULT_SKILL_DIR,
}): void {
  const providerName = config.providerName || DEFAULT_PROVIDER_NAME
  if (providerName === RUNTIME_PROVIDER_NAME) {
    throw new Error('[cfbridge] providerName "runtime" 为保留名，不可用')
  }
  const skillDir = resolveSkillDir(config.skillDir)
  const rank = config.rank ?? PROVIDER_RANK
  const cacheEnabled = config.cache ?? true
  const settings = (ctx as Context & { settings?: SettingsRuntime }).settings
  const getLoadMode = (): LoadMode => {
    if (settings !== undefined && typeof settings.describe === 'function') {
      try {
        const view = settings.describe().find((entry: any) => entry.ns === providerName)
        const live = (view as any)?.user?.loadMode ?? (view as any)?.value?.loadMode
        if (live === 'preset' || live === 'global') return live
      } catch {}
    }
    return readLoadModeConfig(config.loadMode)
  }
  // 去重并丢弃空串：配置由 UI 写回，脏值不应变成一次真实比对。
  const disabledSkills = readStringListConfig(config.disabledSkills)
  const hiddenSkills: SkillVisibility = {
    model: readStringListConfig(config.modelHiddenSkills),
    user: readStringListConfig(config.userHiddenSkills),
  }
  const getService = <T>(name: string): T | undefined => {
    try {
      const target = (ctx as any).root ?? ctx
      const val = typeof target.get === 'function' ? target.get(name) : (target as unknown as Record<string, unknown>)[name]
      if (val !== undefined) return val as T
      return (typeof ctx.get === 'function' ? ctx.get(name) : (ctx as unknown as Record<string, unknown>)[name]) as T | undefined
    } catch {
      return undefined
    }
  }
  const getAgentPresets = () => getService<{
    definitions?: Map<string, { config?: { plugins?: unknown[] } }>
    register?: (definition: Record<string, unknown>) => Promise<() => Promise<void>>
    composedPreset?: (scope: unknown) => string | undefined
  }>('agentPresets')
  const getSystemPrompt = () => getService<{
    section?: (spec: { name: string; order: number; text: (context: { scope?: unknown }) => string }) => () => void
  }>('systemPrompt')
  const getTools = () => getService<{
    restrict?: (filter: { deny?: string[] }) => () => void
  }>('tools')

  // 每条效果各自安装、各自持有自己的清理函数，apply 只负责装配与收尾。
  ctx.effect(() => {
    const [runtime, disposeProvider] = installSkillRuntime(ctx, {
      skillDir, providerName, rank, cacheEnabled, disabledSkills, hiddenSkills,
      loadMode: getLoadMode, agentPresets: getAgentPresets,
    })
    let disposed = false
    let pending = false
    let running = false
    const publish = async () => {
      if (disposed || running) {
        pending = true
        return
      }
      running = true
      try {
        do {
          pending = false
          if (!disposed) await publishSkillCatalog(ctx, settings, runtime, providerName, () => !disposed)
        } while (pending && !disposed)
      } finally {
        running = false
      }
    }
    const disposeListener = ctx.on('skills/change', () => {
      ctx.logger.debug?.('[cfbridge] skills catalog changed')
      pending = true
      void publish()
    })
    const [, disposeWatcher] = config.watchSkills
      ? installSkillsWatcher(ctx, skillDir, runtime)
      : [false, () => {}] as [boolean, () => void]
    void publish()

    // 响应式预设管理器：响应设置变化，动态注册或注销 cfbridge 专属模式
    let unregisterPreset: (() => Promise<void>) | undefined
    let presetSyncing = false

    const syncPreset = async () => {
      if (disposed || presetSyncing) return
      presetSyncing = true
      try {
        const mode = getLoadMode()
        const presets = getAgentPresets()
        if (mode === 'preset') {
          if (!unregisterPreset && presets !== undefined && typeof presets.register === 'function') {
            const standardDef = presets.definitions?.get?.('standard') ?? Array.from(presets.definitions?.values?.() ?? []).find((d: any) => Array.isArray(d?.config?.plugins) && d.config.plugins.length > 0)
            const basePlugins = Array.isArray(standardDef?.config?.plugins) ? standardDef.config.plugins : []
            if (basePlugins.length === 0 && presets.definitions && presets.definitions.size === 0) {
              setTimeout(() => { if (!disposed) void syncPreset() }, 500).unref()
              return
            }
            const unreg = await presets.register({
              id: 'cfbridge',
              name: 'Cloudflare',
              description: 'Cloudflare 专属模式：仅在本模式加载 Cloudflare MCP 工具与 14 个按需技能，预置操作规范',
              order: 10,
              plugins: basePlugins,
            })
            if (disposed) void unreg()
            else unregisterPreset = unreg
          }
        } else {
          if (unregisterPreset) {
            const fn = unregisterPreset
            unregisterPreset = undefined
            await fn()
          }
        }
      } catch (err: unknown) {
        ctx.logger.warn?.('[cfbridge] preset registration: ' + loggerMessage(err))
      } finally {
        presetSyncing = false
      }
    }

    void syncPreset()
    const bootTimer = setTimeout(() => { void syncPreset() }, 800)
    bootTimer.unref()

    const disposeSettingsListener = (ctx as any).on('settings/document-updated', (ns: string) => {
      if (ns === providerName) {
        runtime.invalidate()
        void syncPreset()
      }
    }, { global: true })

    // 专属模式预置提示词：当处于 cfbridge 模式时自动注入核心规范
    const sp = getSystemPrompt()
    const disposeSection = (sp !== undefined && typeof sp.section === 'function')
      ? sp.section({
          name: 'cfbridge:instructions',
          order: 550,
          text: (context: { scope?: unknown }) => {
            if (getLoadMode() === 'preset') {
              const presetId = getAgentPresets()?.composedPreset?.(context?.scope)
              if (presetId !== 'cfbridge') return ''
            }
            return CFBRIDGE_SYSTEM_INSTRUCTIONS
          },
        })
      : () => {}

    // preset 模式下对非 cfbridge 会话屏蔽 Cloudflare MCP 工具
    const disposeAgentListener = (ctx as any).on('agent/created', (agent: { ctx?: { tools?: { restrict?: (filter: { deny?: string[] }) => () => void } } }) => {
      if (getLoadMode() !== 'preset') return
      const t = getTools()
      if (t === undefined || typeof t.restrict !== 'function') return
      try {
        const presetId = getAgentPresets()?.composedPreset?.(agent.ctx)
        if (presetId !== 'cfbridge') {
          agent.ctx?.tools?.restrict?.({
            deny: ['mcp__cloudflare__docs', 'mcp__cloudflare__search', 'mcp__cloudflare__execute'],
          })
        }
      } catch {}
    })

    return () => {
      disposed = true
      pending = false
      clearTimeout(bootTimer)
      if (unregisterPreset) void unregisterPreset()
      disposeSettingsListener()
      disposeAgentListener()
      disposeSection()
      disposeWatcher()
      disposeListener()
      disposeProvider()
    }
  })

  // 宿主侧设置页：让「插件」页认可该 namespace 有配置面。
  if (settings !== undefined && typeof settings.configure === 'function') {
    ctx.effect(() => settings.configure({ auto: true }) ?? (() => {}), 'cfbridge: settings page')
  }
}

export default { name, inject, Config, apply }