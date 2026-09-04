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
  SkillLookupOptions,
  SkillProvider,
} from '@deepseek-ai/dsh-skill'

const DEFAULT_PROVIDER_NAME = 'cfbridge'
const RUNTIME_PROVIDER_NAME = 'runtime'
const PROVIDER_RANK = 550
const DEFAULT_SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills')

export interface Config {
  providerName: string
  skillDir?: string
}

export const Config = Schema.object({
  providerName: Schema.string().default(DEFAULT_PROVIDER_NAME),
  skillDir: Schema.string().default(DEFAULT_SKILL_DIR),
}).description('@wenaixi/cfbridge Provider 配置')

export const name = DEFAULT_PROVIDER_NAME
export const inject = ['skills'] as const

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
    rank: PROVIDER_RANK,
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

export function createProviderForTest(
  skillDir: string,
  providerName = DEFAULT_PROVIDER_NAME,
  logger: Logger = console,
): SkillProvider {
  const root = resolve(skillDir)
  return {
    name: providerName,
    async list(options = {}) {
      throwIfAborted(options)
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
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        throwIfAborted(options)
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        const directory = join(root, entry.name)
        const path = join(directory, 'SKILL.md')
        try {
          await stat(path)
          const parsed = parseFrontmatter(await readFile(path, { encoding: 'utf8', signal: options.signal }))
          throwIfAborted(options)
          if (parsed === undefined) {
            logger.warn('[cfbridge] skip ' + path + ': missing or invalid frontmatter')
            continue
          }
          const candidate = makeCandidate(parsed, { path, directory }, providerName)
          if (candidate === undefined) {
            logger.warn('[cfbridge] skip ' + path + ': frontmatter requires a valid name and description')
            continue
          }
          if (seen.has(candidate.name)) {
            logger.warn('[cfbridge] skip ' + path + ': duplicate skill name ' + candidate.name)
            continue
          }
          seen.add(candidate.name)
          candidates.push(candidate)
        } catch (error) {
          if (isAbortError(error)) throw error
          logger.warn('[cfbridge] skip ' + path + ': ' + loggerMessage(error))
        }
      }
      return candidates
    },
    async get(candidate, options = {}) {
      throwIfAborted(options)
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
        definition = makeCandidate(parsed, locator, providerName)
      } catch (error) {
        logger.warn('[cfbridge] get ' + candidate.name + ': invalid invocation frontmatter: ' + loggerMessage(error))
        return undefined
      }
      if (definition === undefined || definition.name !== candidate.name) return undefined
      return {
        ...definition,
        content: parsed.body.trim(),
      } as SkillDefinition
    },
  }
}

function resolveSkillDir(configured: string | undefined): string {
  return resolve(configured || DEFAULT_SKILL_DIR)
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
  ctx.effect(() => {
    const disposeProvider = ctx.skills.registerProvider(() => createProviderForTest(skillDir, providerName, ctx.logger))
    const disposeListener = ctx.on('skills/change', () => ctx.logger.debug?.('[cfbridge] skills catalog changed'))
    return () => {
      disposeListener()
      disposeProvider()
    }
  })
}

export default { name, inject, Config, apply }
