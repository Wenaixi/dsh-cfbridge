import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import Schema from '@deepseek-ai/schemastery';
import { isSkillName } from '@deepseek-ai/dsh-skill';
const DEFAULT_PROVIDER_NAME = 'cfbridge';
const RUNTIME_PROVIDER_NAME = 'runtime';
const PROVIDER_RANK = 550;
const DEFAULT_SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills');
export const Config = Schema.object({
    providerName: Schema.string().default(DEFAULT_PROVIDER_NAME),
    skillDir: Schema.string(),
}).description('@wenaixi/cfbridge Provider 配置');
export const name = DEFAULT_PROVIDER_NAME;
export const inject = ['skills'];
function stringField(data, key) {
    const value = data[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function optionalString(data, key) {
    const value = stringField(data, key);
    return value === undefined ? {} : { [key]: value };
}
function frontmatterBoolean(data, key) {
    if (!Object.hasOwn(data, key))
        return undefined;
    const value = data[key];
    if (typeof value === 'boolean')
        return value;
    if (value === 1 || value === '1')
        return true;
    if (value === 0 || value === '0')
        return false;
    if (typeof value === 'string') {
        if (['true', 'yes', 'on'].includes(value.toLowerCase()))
            return true;
        if (['false', 'no', 'off'].includes(value.toLowerCase()))
            return false;
    }
    throw new TypeError('frontmatter field ' + key + ' must be a boolean');
}
function parseInvocation(data) {
    for (const [legacy, canonical] of [
        ['disableModelInvocation', 'disable-model-invocation'],
        ['modelInvocable', 'disable-model-invocation'],
        ['userInvocable', 'user-invocable'],
    ]) {
        if (Object.hasOwn(data, legacy)) {
            throw new Error('frontmatter field ' + legacy + ' is unsupported; use ' + canonical);
        }
    }
    const disabled = frontmatterBoolean(data, 'disable-model-invocation');
    const userInvocable = frontmatterBoolean(data, 'user-invocable');
    return {
        modelInvocable: disabled !== true,
        userInvocable: userInvocable !== false,
    };
}
function optionalMetadata(data) {
    const metadata = data.metadata;
    return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
        ? { metadata: metadata }
        : {};
}
function closingFrontmatterLine(raw, start) {
    let lineStart = start;
    while (lineStart <= raw.length) {
        const newline = raw.indexOf('\n', lineStart);
        const lineEnd = newline < 0 ? raw.length : newline;
        if (raw.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
            return { start: lineStart, bodyStart: newline < 0 ? raw.length : newline + 1 };
        }
        if (newline < 0)
            return undefined;
        lineStart = newline + 1;
    }
    return undefined;
}
export function parseFrontmatter(raw) {
    if (raw.charCodeAt(0) === 0xfeff)
        raw = raw.slice(1);
    const firstNewline = raw.indexOf('\n');
    if (firstNewline < 0 || raw.slice(0, firstNewline).replace(/\r$/, '') !== '---')
        return undefined;
    const closing = closingFrontmatterLine(raw, firstNewline + 1);
    if (closing === undefined)
        return undefined;
    const data = parse(raw.slice(firstNewline + 1, closing.start));
    if (typeof data !== 'object' || data === null || Array.isArray(data))
        return undefined;
    return { data: data, body: raw.slice(closing.bodyStart) };
}
function loggerMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function isAbortError(error) {
    return error instanceof Error && error.name === 'AbortError';
}
function throwIfAborted(options) {
    options.signal?.throwIfAborted();
}
function makeCandidate(parsed, locator, providerName) {
    const skillName = stringField(parsed.data, 'name');
    const description = stringField(parsed.data, 'description');
    if (skillName === undefined || description === undefined || !isSkillName(skillName))
        return undefined;
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
    };
}
function locatorOf(candidate) {
    const locator = candidate.locator;
    if (typeof locator !== 'object' || locator === null)
        return undefined;
    if (!('path' in locator) || !('directory' in locator))
        return undefined;
    if (typeof locator.path !== 'string' || typeof locator.directory !== 'string')
        return undefined;
    return { path: locator.path, directory: locator.directory };
}
export function createProviderForTest(skillDir, providerName = DEFAULT_PROVIDER_NAME, logger = console) {
    const root = resolve(skillDir);
    return {
        name: providerName,
        async list(options = {}) {
            throwIfAborted(options);
            let entries;
            try {
                entries = await readdir(root, { withFileTypes: true });
            }
            catch (error) {
                if (isAbortError(error))
                    throw error;
                logger.warn('[cfbridge] skillDir not found: ' + root);
                return [];
            }
            const candidates = [];
            const seen = new Set();
            for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
                throwIfAborted(options);
                if (!entry.isDirectory() || entry.name.startsWith('.'))
                    continue;
                const directory = join(root, entry.name);
                const path = join(directory, 'SKILL.md');
                try {
                    await stat(path);
                    const parsed = parseFrontmatter(await readFile(path, { encoding: 'utf8', signal: options.signal }));
                    if (parsed === undefined) {
                        logger.warn('[cfbridge] skip ' + path + ': missing or invalid frontmatter');
                        continue;
                    }
                    const candidate = makeCandidate(parsed, { path, directory }, providerName);
                    if (candidate === undefined) {
                        logger.warn('[cfbridge] skip ' + path + ': frontmatter requires a valid name and description');
                        continue;
                    }
                    if (seen.has(candidate.name)) {
                        logger.warn('[cfbridge] skip ' + path + ': duplicate skill name ' + candidate.name);
                        continue;
                    }
                    seen.add(candidate.name);
                    candidates.push(candidate);
                }
                catch (error) {
                    if (isAbortError(error))
                        throw error;
                    logger.warn('[cfbridge] skip ' + path + ': ' + loggerMessage(error));
                }
            }
            return candidates;
        },
        async get(candidate, options = {}) {
            throwIfAborted(options);
            const locator = locatorOf(candidate);
            if (locator === undefined)
                return undefined;
            let raw;
            try {
                raw = await readFile(locator.path, { encoding: 'utf8', signal: options.signal });
            }
            catch (error) {
                if (isAbortError(error))
                    throw error;
                logger.warn('[cfbridge] get ' + candidate.name + ': read failed: ' + loggerMessage(error));
                return undefined;
            }
            throwIfAborted(options);
            let parsed;
            try {
                parsed = parseFrontmatter(raw);
            }
            catch (error) {
                logger.warn('[cfbridge] get ' + candidate.name + ': frontmatter parse failed: ' + loggerMessage(error));
                return undefined;
            }
            if (parsed === undefined)
                return undefined;
            const definition = makeCandidate(parsed, locator, providerName);
            if (definition === undefined || definition.name !== candidate.name)
                return undefined;
            return {
                ...definition,
                content: parsed.body.trim(),
            };
        },
    };
}
function resolveSkillDir(configured) {
    return resolve(configured || DEFAULT_SKILL_DIR);
}
export function apply(ctx, config = {
    providerName: DEFAULT_PROVIDER_NAME,
    skillDir: DEFAULT_SKILL_DIR,
}) {
    const providerName = config.providerName || DEFAULT_PROVIDER_NAME;
    if (providerName === RUNTIME_PROVIDER_NAME) {
        throw new Error('[cfbridge] providerName "runtime" 为保留名，不可用');
    }
    const skillDir = resolveSkillDir(config.skillDir);
    ctx.effect(() => {
        const disposeProvider = ctx.skills.registerProvider(() => createProviderForTest(skillDir, providerName, ctx.logger));
        const disposeListener = ctx.on('skills/change', () => ctx.logger.debug?.('[cfbridge] skills catalog changed'));
        return () => {
            disposeListener();
            disposeProvider();
        };
    });
}
export default { name, inject, Config, apply };
//# sourceMappingURL=cfbridge.js.map