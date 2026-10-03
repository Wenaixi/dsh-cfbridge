import { watch } from 'node:fs';
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
/**
 * 把配置里的 disabledSkills 归一成字符串数组。
 *
 * 这个字段是 volatile 的，而 volatile 字段在宿主里以懒求值形态传递
 * （见 dsh-app-boot 的 lazy 投影），所以它可能是：数组、返回数组的函数、
 * 或包装过的对象。这里统一收敛，调用方只面对数组。
 */
function readStringListConfig(raw) {
    let value = raw;
    // 懒求值包装：取出最内层的真实值，最多解几层，避免意外自引用。
    for (let i = 0; i < 4 && typeof value === 'function'; i += 1) {
        try {
            value = value();
        }
        catch {
            return [];
        }
    }
    if (!Array.isArray(value))
        return [];
    return value.filter((v) => typeof v === 'string' && v !== '');
}
/**
 * 把一处 schema 标记为 volatile：宿主设置面只允许写入 volatile 字段。
 * Schemastery 的 Meta 是可变对象，没有链式 setter，所以这里直接打标。
 */
function markVolatile(schema) {
    ;
    schema.meta.volatile = true;
    return schema;
}
export const Config = Schema.object({
    providerName: Schema.string().default(DEFAULT_PROVIDER_NAME),
    skillDir: Schema.string().default(DEFAULT_SKILL_DIR),
    rank: Schema.number().default(PROVIDER_RANK).description('Provider 优先级权重 (默认 550)'),
    cache: Schema.boolean().default(true).description('是否开启基于 mtime 的元数据内存缓存'),
    watchSkills: Schema.boolean().default(false).description('是否在开发模式下监听技能文件变动'),
    // meta.volatile 是宿主 settings 通道的硬要求：只有被标记为 volatile 的字段
    // 才允许在运行时通过设置面写入（见 dsh-settings 的 volatileForm）。
    // 少了它，settings.update 会以 "has no volatile fields" 拒绝 —— 面板的
    // 技能开关就无从落盘。Schemastery 没有 volatile() 链式方法，直接写 meta。
    disabledSkills: markVolatile(Schema.array(Schema.string())
        .default([])
        .description('被单独关闭的技能名列表；命中的技能不进入发现结果')),
    modelHiddenSkills: markVolatile(Schema.array(Schema.string())
        .default([])
        .description('不向模型开放的技能名列表；人类仍可调用')),
    userHiddenSkills: markVolatile(Schema.array(Schema.string())
        .default([])
        .description('不向人类开放的技能名列表；模型仍可调用')),
    availableSkills: markVolatile(Schema.array(Schema.string())
        .default([])
        .description('技能清单快照（插件发现后写回，供设置面板展示）')),
}).description('@wenaixi/cfbridge Provider 配置');
export const name = DEFAULT_PROVIDER_NAME;
// settings 必须进 inject：技能清单要在 apply 里发布到设置面，而可选取用
// （ctx.get）在 apply 时机可能还没就绪，会让发布静默落空。
// 同时保留可选写法兜底，因为精简宿主可能没有 settings（插件仍应正常加载）。
export const inject = ['skills', 'settings'];
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
function openingFrontmatter(raw) {
    let lineStart = 0;
    let inComment = false;
    while (lineStart <= raw.length) {
        const newline = raw.indexOf('\n', lineStart);
        const lineEnd = newline < 0 ? raw.length : newline;
        let line = raw.slice(lineStart, lineEnd).replace(/\r$/, '');
        if (line.charCodeAt(0) === 0xfeff)
            line = line.slice(1);
        const trimmed = line.trim();
        if (inComment) {
            if (trimmed.endsWith('-->'))
                inComment = false;
        }
        else if (trimmed === '') {
            // 允许 vendored 文件头部的空行。
        }
        else if (trimmed === '---') {
            return { bodyStart: newline < 0 ? raw.length : newline + 1 };
        }
        else if (trimmed.startsWith('<!--')) {
            inComment = !trimmed.endsWith('-->');
        }
        else {
            return undefined;
        }
        if (newline < 0)
            return undefined;
        lineStart = newline + 1;
    }
    return undefined;
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
    const opening = openingFrontmatter(raw);
    if (opening === undefined)
        return undefined;
    const closing = closingFrontmatterLine(raw, opening.bodyStart);
    if (closing === undefined)
        return undefined;
    let data;
    try {
        data = parse(raw.slice(opening.bodyStart, closing.start));
    }
    catch {
        return undefined;
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data))
        return undefined;
    return { data: data, body: raw.slice(closing.bodyStart) };
}
// watcher 事件过滤：只关心 Provider 可能读到的内容变化。
// watch(skillDir, { recursive: true }) 回调的 filename 是相对路径（Windows 用反斜杠）；
// 规则与 list() 的发现契约一一对齐：文件级只认 SKILL.md，目录级顶层事件一律放行
// （Windows 上目录删除/重命名与文件同形态，无法可靠区分），点目录与嵌套无关文件拦截。
export function isSkillCatalogEvent(filename) {
    if (filename === null || filename === undefined)
        return true;
    const norm = filename.replaceAll('\\', '/');
    // 空串与 null 不同源：null 是平台正常形态（保守放行），空串视为异常形态（宁漏勿错），
    // 若未来观测到某平台用空串表示文件事件，需改回放行。
    if (norm === '' || norm.startsWith('.'))
        return false;
    if (norm === 'SKILL.md' || norm.endsWith('/SKILL.md'))
        return true;
    if (!norm.includes('/'))
        return true;
    return false;
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
function makeCandidate(parsed, locator, providerName, rank = PROVIDER_RANK) {
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
        rank,
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
export function projectInvocation(item, hidden) {
    return {
        ...item,
        invocation: {
            modelInvocable: item.invocation.modelInvocable && !hidden.model.has(item.name),
            userInvocable: item.invocation.userInvocable && !hidden.user.has(item.name),
        },
    };
}
/**
 * 创建一个技能 Provider。
 *
 * 参数用具名选项对象承载：此前是 8 个位置参数（其中 5 个可选），
 * 调用点必须回查签名才知道第 4 个是什么、第 6 个的 () => {} 又是谁。
 * 选项对象让每个调用点自解释，且新增选项不再波及任何既有调用点。
 */
export function createSkillProvider(options) {
    const { skillDir, providerName = DEFAULT_PROVIDER_NAME, logger = console, rank = PROVIDER_RANK, cacheEnabled = true, onInvalidate, disabledSkills = [], hiddenSkills = {}, } = options;
    const root = resolve(skillDir);
    // 关闭名单在 list() 的最早位置生效：候选不进入结果，等同该技能不存在。
    // 用可变 Set（而非拷贝快照）承载：宿主侧命令可以在不重载插件的前提下改它，
    // 改完调 invalidate() 让目录失效，下一次 list() 就按新名单过滤。
    const disabled = new Set(disabledSkills);
    // 两个方向独立的隐藏名单：不给模型 ≠ 不给人。
    // 用可变 Set 承载，宿主命令可在运行中替换，改完调 invalidate()。
    const modelHidden = new Set(hiddenSkills.model ?? []);
    const userHidden = new Set(hiddenSkills.user ?? []);
    const cache = new Map();
    return {
        name: providerName,
        /** 运行时替换关闭名单；调用方随后应触发一次目录失效。 */
        setDisabledSkills(names) {
            disabled.clear();
            for (const name of names)
                disabled.add(name);
        },
        disabledSkillNames() {
            return [...disabled];
        },
        setHiddenSkills(next) {
            modelHidden.clear();
            for (const name of next.model ?? [])
                modelHidden.add(name);
            userHidden.clear();
            for (const name of next.user ?? [])
                userHidden.add(name);
        },
        hiddenSkillNames() {
            return { model: [...modelHidden], user: [...userHidden] };
        },
        invalidate() {
            // 清空 mtime 内存缓存并通知宿主侧失效回调（如有）。
            // 宿主（dsh-skill registry）在 invalidate() 之内自行广播 skills/change，
            // 此处不重复 emit，避免双份刷新。
            cache.clear();
            onInvalidate?.();
        },
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
            // 隐藏名单改写 invocation，不改候选身份：技能仍在目录里，只是某个
            // 消费面看不到它。缓存里存的是「原始候选」，这里每次都按当前名单重投影，
            // 这样运行中改名单无需清 mtime 缓存。
            const hidden = { model: modelHidden, user: userHidden };
            const project = (candidate) => projectInvocation(candidate, hidden);
            for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
                throwIfAborted(options);
                if (!entry.isDirectory() || entry.name.startsWith('.'))
                    continue;
                const directory = join(root, entry.name);
                const path = join(directory, 'SKILL.md');
                try {
                    const fileStat = await stat(path);
                    throwIfAborted(options);
                    if (cacheEnabled && cache.has(path)) {
                        const cached = cache.get(path);
                        if (cached.mtimeMs === fileStat.mtimeMs) {
                            if (disabled.has(cached.candidate.name))
                                continue;
                            if (seen.has(cached.candidate.name)) {
                                logger.warn('[cfbridge] skip ' + path + ': duplicate skill name ' + cached.candidate.name);
                                continue;
                            }
                            seen.add(cached.candidate.name);
                            candidates.push(project(cached.candidate));
                            continue;
                        }
                    }
                    const parsed = parseFrontmatter(await readFile(path, { encoding: 'utf8', signal: options.signal }));
                    throwIfAborted(options);
                    if (parsed === undefined) {
                        logger.warn('[cfbridge] skip ' + path + ': missing or invalid frontmatter');
                        cache.delete(path);
                        continue;
                    }
                    const candidate = makeCandidate(parsed, { path, directory }, providerName, rank);
                    if (candidate === undefined) {
                        logger.warn('[cfbridge] skip ' + path + ': frontmatter requires a valid name and description');
                        cache.delete(path);
                        continue;
                    }
                    if (disabled.has(candidate.name))
                        continue;
                    if (seen.has(candidate.name)) {
                        logger.warn('[cfbridge] skip ' + path + ': duplicate skill name ' + candidate.name);
                        continue;
                    }
                    seen.add(candidate.name);
                    if (cacheEnabled) {
                        cache.set(path, { mtimeMs: fileStat.mtimeMs, candidate });
                    }
                    candidates.push(project(candidate));
                }
                catch (error) {
                    if (isAbortError(error))
                        throw error;
                    cache.delete(path);
                    logger.warn('[cfbridge] skip ' + path + ': ' + loggerMessage(error));
                }
            }
            return candidates;
        },
        async get(candidate, options = {}) {
            throwIfAborted(options);
            // 关闭名单在加载阶段同样生效：调用方拿着关闭前的旧候选取正文时不放行。
            if (disabled.has(candidate.name))
                return undefined;
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
            let definition;
            try {
                definition = makeCandidate(parsed, locator, providerName, rank);
            }
            catch (error) {
                logger.warn('[cfbridge] get ' + candidate.name + ': invalid invocation frontmatter: ' + loggerMessage(error));
                return undefined;
            }
            if (definition === undefined || definition.name !== candidate.name)
                return undefined;
            // 与 list() 共用同一条投影规则，杜绝两份手写实现漂移。
            // 关闭名单在加载阶段同样生效：调用方拿着关闭前的旧候选取正文时不放行。
            return {
                ...projectInvocation(definition, { model: modelHidden, user: userHidden }),
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
    const rank = config.rank ?? PROVIDER_RANK;
    const cacheEnabled = config.cache ?? true;
    // 去重并丢弃空串：配置由 UI 写回，脏值不应变成一次真实比对。
    const disabledSkills = readStringListConfig(config.disabledSkills);
    const hiddenSkills = {
        model: readStringListConfig(config.modelHiddenSkills),
        user: readStringListConfig(config.userHiddenSkills),
    };
    ctx.effect(() => {
        // 失效入口：宿主注册层（dsh-skill registry）与 watcher 共用。
        // 宿主侧 invalidate() 会清 registry 的 collectCache 并广播 skills/change；
        // provider.invalidate() 负责清 provider 自身的 mtime 缓存。
        let invalidateCatalog = () => { };
        // 当前活着的 provider，供 /cfbridge 命令在运行时改关闭名单。
        let liveProvider;
        const disposeProvider = ctx.skills.registerProvider((control) => {
            const provider = createSkillProvider({
                skillDir,
                providerName,
                logger: ctx.logger,
                rank,
                cacheEnabled,
                onInvalidate: control.invalidate,
                disabledSkills,
                hiddenSkills,
            });
            liveProvider = provider;
            // 闭包捕获安全：provider 只持有 control.invalidate 这一个函数引用，
            // 宿主对已 dispose 的注册调用 invalidate 按 dsh-skill 契约是 no-op（不会抛错），
            // 因此 watcher 在卸载竞态窗口内触发也不会崩，仅是一次空刷新。
            invalidateCatalog = () => provider.invalidate();
            return provider;
        });
        const disposeListener = ctx.on('skills/change', () => ctx.logger.debug?.('[cfbridge] skills catalog changed'));
        let watcher;
        let debounceTimer;
        if (config.watchSkills) {
            try {
                watcher = watch(skillDir, { recursive: true }, (_eventType, filename) => {
                    if (isSkillCatalogEvent(filename)) {
                        if (debounceTimer)
                            clearTimeout(debounceTimer);
                        debounceTimer = setTimeout(() => {
                            // 走失效入口而非手动 emit：由 registry 的 invalidate() 自动广播 skills/change。
                            invalidateCatalog();
                        }, 100);
                    }
                });
            }
            catch (e) {
                ctx.logger.warn?.('[cfbridge] failed to initialize skills watcher: ' + String(e));
            }
        }
        // 把发现到的技能清单写回设置面一次，供面板逐个渲染技能。
        // 技能目录在启动时即确定，所以这里只做一次性发布；清单没变就不写，
        // 避免无谓地触发 profile 重载。写入走宿主官方 settings 面，不自己碰文件。
        let published = false;
        const publishSkillNames = async () => {
            if (published)
                return;
            const provider = liveProvider;
            const settings = typeof ctx.get === 'function' ? ctx.get('settings') : undefined;
            if (provider === undefined || settings === undefined || typeof settings.describe !== 'function')
                return;
            let names;
            try {
                const listed = await provider.list({});
                // list() 有两种合法返回：直接给候选数组，或带上 complete 标记的观测对象。
                // readonly 数组让 Array.isArray 收窄不彻底，因此显式判形状。
                const candidates = Array.isArray(listed) ? listed : listed.candidates;
                names = candidates.map((candidate) => candidate.name).sort();
            }
            catch {
                return;
            }
            const view = settings
                .describe({ redactSecrets: true })
                .find((entry) => entry.ns === providerName);
            const current = view?.user?.availableSkills;
            if (Array.isArray(current) && current.length === names.length
                && current.every((v, i) => v === names[i])) {
                published = true;
                return;
            }
            try {
                await settings.update(providerName, { availableSkills: names });
                published = true;
            }
            catch (error) {
                // 发布失败不该影响技能本身可用：面板少一份展示数据而已，记一笔就够。
                ctx.logger.debug?.('[cfbridge] 技能清单发布失败: ' + loggerMessage(error));
            }
        };
        // 宿主命令面：/cfbridge 让用户在不重载插件的前提下开关技能。
        // Provider 就在同一进程里，所以这里直连它的可变名单，
        // 改完走 control.invalidate() 让 registry 重新收集目录。
        //
        // 三个维度各自独立：disable 完全关闭；hide-model / hide-user 只关一个消费面。
        // 持久化由设置面负责（面板写入 volatile 字段），命令只改运行时内存态 ——
        // 它是即时的调试与应急入口，重启后以配置里的名单为准。
        const commands = typeof ctx.get === 'function' ? ctx.get('commands') : undefined;
        const disposeCommand = commands === undefined ? () => { } : commands.register({
            name: 'cfbridge',
            description: '开关 Cloudflare 技能（list / enable / disable / hide-model / hide-user）',
            input: { hint: 'list | enable <s> | disable <s> | hide-model <s> | show-model <s> | hide-user <s> | show-user <s>' },
            handler: (invocation) => {
                const provider = liveProvider;
                if (provider === undefined)
                    return { kind: 'error', text: 'cfbridge Provider 尚未就绪' };
                const [action, ...rest] = String(invocation.rawInput ?? '').trim().split(/\s+/);
                const target = rest[0];
                const fail = () => ({
                    kind: 'error',
                    text: '用法：/cfbridge <enable|disable|hide-model|show-model|hide-user|show-user> <skill>',
                });
                const disabled = new Set(provider.disabledSkillNames());
                const hidden = provider.hiddenSkillNames();
                const modelHidden = new Set(hidden.model);
                const userHidden = new Set(hidden.user);
                if (target === undefined) {
                    if (action !== 'list')
                        return fail();
                    const off = [...disabled];
                    return {
                        kind: 'text',
                        text: off.length === 0
                            ? '技能全部开启（模型与人类均可调用）'
                            : '已关闭：' + off.join(', '),
                    };
                }
                switch (action) {
                    case 'enable':
                        disabled.delete(target);
                        modelHidden.delete(target);
                        userHidden.delete(target);
                        provider.setDisabledSkills([...disabled]);
                        provider.setHiddenSkills({ model: [...modelHidden], user: [...userHidden] });
                        break;
                    case 'disable':
                        disabled.add(target);
                        break;
                    case 'hide-model':
                        modelHidden.add(target);
                        break;
                    case 'show-model':
                        modelHidden.delete(target);
                        break;
                    case 'hide-user':
                        userHidden.add(target);
                        break;
                    case 'show-user':
                        userHidden.delete(target);
                        break;
                    default:
                        return fail();
                }
                invalidateCatalog();
                const label = {
                    enable: '已开启',
                    disable: '已关闭',
                    'hide-model': '已对模型隐藏',
                    'show-model': '已对模型开放',
                    'hide-user': '已对人类隐藏',
                    'show-user': '已对人类开放',
                };
                return { kind: 'text', text: label[action] + ' ' + target };
            },
        });
        void publishSkillNames();
        return () => {
            if (debounceTimer)
                clearTimeout(debounceTimer);
            if (watcher && typeof watcher.close === 'function')
                watcher.close();
            disposeCommand();
            disposeListener();
            disposeProvider();
        };
    });
    // 宿主侧设置页：让「插件」页认可本 bundle 有一块自己的配置面。
    // 这一步不是可选的装饰 —— 客户端的 plugins.bundle.config 插槽只在宿主
    // 为某个 namespace 提供了配置表单时才会被声明和渲染（见 dsh-context 的同款做法）。
    // 用可选调用是因为精简的宿主替身（测试里的 fake ctx）可能没有 settings / get()。
    const settings = typeof ctx.get === 'function' ? ctx.get('settings') : undefined;
    if (settings !== undefined && typeof settings.configure === 'function') {
        ctx.effect(() => settings.configure({ auto: true }), 'cfbridge: settings page');
    }
}
export default { name, inject, Config, apply };
//# sourceMappingURL=cfbridge.js.map