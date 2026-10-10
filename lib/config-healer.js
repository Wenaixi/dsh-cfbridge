import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { isSkillName } from '@deepseek-ai/dsh-skill';
const DEFAULT_PROVIDER_NAME = 'cfbridge';
const RUNTIME_PROVIDER_NAME = 'runtime';
const PROVIDER_RANK = 0;
/**
 * 递归展开可能存在的懒求值函数（最高 4 层，防死循环）。
 */
export function unwrapLazy(raw, defaultValue) {
    let value = raw;
    for (let i = 0; i < 4 && typeof value === 'function'; i += 1) {
        try {
            value = value();
        }
        catch {
            return defaultValue;
        }
    }
    return (value === undefined || value === null) ? defaultValue : value;
}
/**
 * 清洗并验证技能名称数组，剔除非法、空白及非字符串项，并去重。
 */
export function sanitizeSkillNames(raw) {
    const unwrapped = unwrapLazy(raw, []);
    if (!Array.isArray(unwrapped)) {
        return { names: [], dropped: [] };
    }
    const validNames = [];
    const dropped = [];
    const seen = new Set();
    for (const item of unwrapped) {
        if (typeof item === 'string') {
            const trimmed = item.trim();
            if (trimmed.length > 0 && isSkillName(trimmed)) {
                if (!seen.has(trimmed)) {
                    seen.add(trimmed);
                    validNames.push(trimmed);
                }
            }
            else {
                dropped.push(String(item));
            }
        }
        else if (item !== null && item !== undefined) {
            dropped.push(String(item));
        }
    }
    return { names: validNames, dropped };
}
/**
 * 清洗和修复运行时配置对象，补全默认值并过滤脏数据。
 */
export function healConfig(raw) {
    const repairs = [];
    let changed = false;
    const unwrapped = unwrapLazy(raw, {});
    const target = (typeof unwrapped === 'object' && unwrapped !== null && !Array.isArray(unwrapped))
        ? unwrapped
        : {};
    if (target !== unwrapped) {
        changed = true;
        repairs.push('配置根对象不是有效字典，已初始化为默认配置');
    }
    // 1. providerName
    let providerName = unwrapLazy(target.providerName, DEFAULT_PROVIDER_NAME);
    if (typeof providerName !== 'string' || providerName.trim() === '') {
        providerName = DEFAULT_PROVIDER_NAME;
        changed = true;
        repairs.push(`providerName 为空或非法，已重置为默认值 "${DEFAULT_PROVIDER_NAME}"`);
    }
    else {
        providerName = providerName.trim();
        if (providerName === RUNTIME_PROVIDER_NAME) {
            providerName = DEFAULT_PROVIDER_NAME;
            changed = true;
            repairs.push(`providerName 不能为保留名 "${RUNTIME_PROVIDER_NAME}"，已自动纠正为 "${DEFAULT_PROVIDER_NAME}"`);
        }
        else if (providerName !== target.providerName) {
            changed = true;
            repairs.push(`providerName 包含首尾空白，已自动修剪为 "${providerName}"`);
        }
    }
    // 2. loadMode
    const rawMode = unwrapLazy(target.loadMode, 'global');
    let loadMode = 'global';
    if (rawMode === 'preset') {
        loadMode = 'preset';
    }
    else if (rawMode === 'global') {
        loadMode = 'global';
    }
    else {
        changed = true;
        repairs.push(`loadMode 包含非法值 "${String(rawMode)}"，已回退为 "global"`);
    }
    // 3. rank
    const rawRank = unwrapLazy(target.rank, PROVIDER_RANK);
    let rank = PROVIDER_RANK;
    if (typeof rawRank === 'number' && Number.isFinite(rawRank)) {
        rank = rawRank;
    }
    else {
        changed = true;
        repairs.push(`rank 非有限数字 "${String(rawRank)}"，已回退为 ${PROVIDER_RANK}`);
    }
    // 4. cache
    const rawCache = unwrapLazy(target.cache, true);
    let cache = true;
    if (typeof rawCache === 'boolean') {
        cache = rawCache;
    }
    else if (rawCache === 'false' || rawCache === 0) {
        cache = false;
        changed = true;
        repairs.push('cache 字段已归一化为布尔值 false');
    }
    else if (rawCache === 'true' || rawCache === 1) {
        cache = true;
        changed = true;
        repairs.push('cache 字段已归一化为布尔值 true');
    }
    else {
        changed = true;
        repairs.push('cache 字段为未知类型，已恢复默认值 true');
    }
    // 5. watchSkills
    const rawWatch = unwrapLazy(target.watchSkills, false);
    let watchSkills = false;
    if (typeof rawWatch === 'boolean') {
        watchSkills = rawWatch;
    }
    else if (rawWatch === 'true' || rawWatch === 1) {
        watchSkills = true;
        changed = true;
        repairs.push('watchSkills 字段已归一化为布尔值 true');
    }
    else {
        if (rawWatch !== undefined && rawWatch !== false) {
            changed = true;
            repairs.push('watchSkills 字段为未知类型，已恢复默认值 false');
        }
    }
    // 6. 技能列表清洗
    const cleanList = (field) => {
        const rawList = target[field];
        const { names, dropped } = sanitizeSkillNames(rawList);
        if (dropped.length > 0) {
            changed = true;
            repairs.push(`${field} 包含 ${dropped.length} 个非法/脏技能名已剔除: ${dropped.join(', ')}`);
        }
        else if (rawList !== undefined && !Array.isArray(rawList)) {
            changed = true;
            repairs.push(`${field} 不是数组形态，已修复为空列表`);
        }
        return names;
    };
    const disabledSkills = cleanList('disabledSkills');
    const modelHiddenSkills = cleanList('modelHiddenSkills');
    const userHiddenSkills = cleanList('userHiddenSkills');
    const availableSkills = cleanList('availableSkills');
    const skillDir = typeof target.skillDir === 'string' && target.skillDir.trim() !== ''
        ? target.skillDir.trim()
        : undefined;
    const config = {
        providerName,
        rank,
        cache,
        watchSkills,
        loadMode,
        disabledSkills,
        modelHiddenSkills,
        userHiddenSkills,
        availableSkills,
        ...(skillDir ? { skillDir } : {}),
    };
    return { config, changed, repairs };
}
/**
 * 启发式行扫描器：当 YAML 彻底损坏（如断电截断、乱码、语法破坏）无法正常解析时，
 * 从文本行残片中提取残存的有效配置字段。
 */
function scanCorruptedLines(text) {
    const lines = text.split(/\r?\n/);
    const cfbridge = {};
    const mcp = {};
    const rawRepairs = [];
    let currentListField = null;
    const extractedLists = {
        disabledSkills: [],
        modelHiddenSkills: [],
        userHiddenSkills: [],
        availableSkills: [],
    };
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#'))
            continue;
        // 检查是否包含内联列表: e.g. disabledSkills: [a, b, "c"]
        const inlineMatch = line.match(/^(disabledSkills|modelHiddenSkills|userHiddenSkills|availableSkills)\s*:\s*\[(.*?)\]/i);
        if (inlineMatch) {
            const field = inlineMatch[1];
            const items = inlineMatch[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter((s) => s && isSkillName(s));
            if (items.length > 0) {
                extractedLists[field].push(...items);
                rawRepairs.push(`从断裂行中提取出内联 ${field}: ${items.join(', ')}`);
            }
            currentListField = null;
            continue;
        }
        // 检查列表键起始行: e.g. disabledSkills:
        const listKeyMatch = line.match(/^(disabledSkills|modelHiddenSkills|userHiddenSkills|availableSkills)\s*:/i);
        if (listKeyMatch) {
            currentListField = listKeyMatch[1];
            continue;
        }
        // 如果处于列表上下文，匹配列表项: e.g. - turnstile-spin
        if (currentListField) {
            const itemMatch = line.match(/^-\s*['"]?([a-zA-Z0-9_-]+)['"]?/);
            if (itemMatch) {
                const item = itemMatch[1];
                if (isSkillName(item)) {
                    extractedLists[currentListField].push(item);
                }
                continue;
            }
            // 如果遇到其他冒号键，说明列表结束
            if (line.includes(':')) {
                currentListField = null;
            }
        }
        // 提取 loadMode
        const modeMatch = line.match(/loadMode\s*:\s*['"]?(global|preset)['"]?/i);
        if (modeMatch) {
            const mode = modeMatch[1].toLowerCase();
            cfbridge.loadMode = mode;
            rawRepairs.push(`从损坏行中恢复 loadMode="${mode}"`);
        }
        // 提取 rank
        const rankMatch = line.match(/rank\s*:\s*(-?\d+)/i);
        if (rankMatch) {
            const num = parseInt(rankMatch[1], 10);
            if (Number.isFinite(num)) {
                cfbridge.rank = num;
                rawRepairs.push(`从损坏行中恢复 rank=${num}`);
            }
        }
        // 提取 cache / watchSkills
        const cacheMatch = line.match(/cache\s*:\s*(true|false)/i);
        if (cacheMatch) {
            cfbridge.cache = cacheMatch[1].toLowerCase() === 'true';
        }
        const watchMatch = line.match(/watchSkills\s*:\s*(true|false)/i);
        if (watchMatch) {
            cfbridge.watchSkills = watchMatch[1].toLowerCase() === 'true';
        }
        // 提取 MCP 相关参数
        const urlMatch = line.match(/url\s*:\s*['"]?(https?:\/\/[^\s'"\]]+)['"]?/i);
        if (urlMatch) {
            mcp.url = urlMatch[1];
            rawRepairs.push(`从损坏行中恢复 Cloudflare MCP 端点 URL: ${mcp.url}`);
        }
        const timeoutMatch = line.match(/toolCallTimeoutMs\s*:\s*(\d+)/i);
        if (timeoutMatch) {
            mcp.toolCallTimeoutMs = parseInt(timeoutMatch[1], 10);
        }
        const failMatch = line.match(/failOnStartupError\s*:\s*(true|false)/i);
        if (failMatch) {
            mcp.failOnStartupError = failMatch[1].toLowerCase() === 'true';
        }
    }
    // 归集列表
    for (const [key, items] of Object.entries(extractedLists)) {
        if (items.length > 0) {
            const unique = Array.from(new Set(items));
            cfbridge[key] = unique;
            rawRepairs.push(`成功抢救 ${key} 名单 (${unique.length} 项): ${unique.join(', ')}`);
        }
    }
    return { cfbridge, mcp, rawRepairs };
}
/**
 * 从损坏的 YAML 文本中提取配置。
 * 结合宽松解析与启发式文本扫描，最大程度抢救残存配置。
 */
export function extractCorruptedYaml(corruptedText) {
    const rawRepairs = [];
    // 阶段 1：尝试标准解析
    try {
        const parsed = parse(corruptedText);
        if (typeof parsed === 'object' && parsed !== null) {
            const cfbridge = {};
            const mcp = {};
            // 检查 cordis patch 结构
            let rows = [];
            if (Array.isArray(parsed)) {
                for (const item of parsed) {
                    if (Array.isArray(item?.insert))
                        rows.push(...item.insert);
                    else if (item?.id)
                        rows.push(item);
                }
            }
            else if (Array.isArray(parsed.insert)) {
                rows = parsed.insert;
            }
            else {
                // 单个配置对象
                rows = [parsed];
            }
            for (const row of rows) {
                if (!row || typeof row !== 'object')
                    continue;
                if (row.id === 'mcp-cloudflare' || row.serverName === 'cloudflare') {
                    const cfg = row.config || row;
                    if (cfg.url)
                        mcp.url = cfg.url;
                    if (cfg.toolCallTimeoutMs)
                        mcp.toolCallTimeoutMs = cfg.toolCallTimeoutMs;
                    if (cfg.failOnStartupError !== undefined)
                        mcp.failOnStartupError = cfg.failOnStartupError;
                    if (cfg.reconnect)
                        mcp.reconnect = cfg.reconnect;
                }
                else if (row.id === 'cfbridge' || row.name === '@wenaixi/cfbridge') {
                    const cfg = row.config || row;
                    if (cfg.loadMode)
                        cfbridge.loadMode = cfg.loadMode;
                    if (cfg.rank !== undefined)
                        cfbridge.rank = cfg.rank;
                    if (cfg.cache !== undefined)
                        cfbridge.cache = cfg.cache;
                    if (cfg.watchSkills !== undefined)
                        cfbridge.watchSkills = cfg.watchSkills;
                    if (Array.isArray(cfg.disabledSkills))
                        cfbridge.disabledSkills = sanitizeSkillNames(cfg.disabledSkills).names;
                    if (Array.isArray(cfg.modelHiddenSkills))
                        cfbridge.modelHiddenSkills = sanitizeSkillNames(cfg.modelHiddenSkills).names;
                    if (Array.isArray(cfg.userHiddenSkills))
                        cfbridge.userHiddenSkills = sanitizeSkillNames(cfg.userHiddenSkills).names;
                    if (Array.isArray(cfg.availableSkills))
                        cfbridge.availableSkills = sanitizeSkillNames(cfg.availableSkills).names;
                }
                else {
                    // 兜底提取顶层字段
                    if (row.loadMode)
                        cfbridge.loadMode = row.loadMode;
                    if (Array.isArray(row.disabledSkills))
                        cfbridge.disabledSkills = sanitizeSkillNames(row.disabledSkills).names;
                }
            }
            return { cfbridge, mcp, rawRepairs: ['通过标准语法解析成功提取配置'] };
        }
    }
    catch (err) {
        rawRepairs.push(`标准 YAML 解析失败 (${err.message})，已切换至启发式扫描引擎抢救数据`);
    }
    // 阶段 2：启发式行扫描
    const scanned = scanCorruptedLines(corruptedText);
    return {
        cfbridge: scanned.cfbridge,
        mcp: scanned.mcp,
        rawRepairs: [...rawRepairs, ...scanned.rawRepairs],
    };
}
/**
 * 按照 DSH 官方契约重新生成标准、合法的 cordis.patch.yml 文本。
 */
export function generatePatchYaml(options = {}) {
    const { cfbridgeConfig = {}, mcpOverrides = {} } = options;
    // 清洗 cfbridge 配置
    const healed = healConfig(cfbridgeConfig).config;
    // 构造 cfbridge 自定义配置块
    const customConfig = [];
    if (healed.loadMode === 'preset') {
        customConfig.push('        loadMode: preset');
    }
    if (healed.rank !== PROVIDER_RANK) {
        customConfig.push(`        rank: ${healed.rank}`);
    }
    if (!healed.cache) {
        customConfig.push('        cache: false');
    }
    if (healed.watchSkills) {
        customConfig.push('        watchSkills: true');
    }
    const renderList = (field, items) => {
        if (items.length > 0) {
            customConfig.push(`        ${field}:`);
            for (const item of items) {
                customConfig.push(`          - ${item}`);
            }
        }
    };
    renderList('disabledSkills', healed.disabledSkills);
    renderList('modelHiddenSkills', healed.modelHiddenSkills);
    renderList('userHiddenSkills', healed.userHiddenSkills);
    const cfbridgeConfigBlock = customConfig.length > 0
        ? `\n      config:\n${customConfig.join('\n')}`
        : '';
    const mcpUrl = mcpOverrides.url || 'https://mcp.cloudflare.com/mcp';
    const timeoutMs = mcpOverrides.toolCallTimeoutMs ?? 120000;
    const failOnStartupError = mcpOverrides.failOnStartupError ?? false;
    const authHeader = "          Authorization: !!js '`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`'";
    const lines = [
        '# @wenaixi/cfbridge — DSH Bundle Patch（host composition）',
        '#',
        '# 安装后作为 web profile 的一个 Bundle 层全局生效；所有会话均自动获得',
        '# Cloudflare Code Mode MCP 三工具与 cfbridge SkillProvider 提供的 14 个按需技能。',
        '#',
        '# 设计要点：',
        '# 1. mcp-cloudflare：走 dsh-mcp-client，把 mcp__cloudflare__* 工具注册到 host 的 tools registry。',
        '# 2. cfbridge：按包名挂载 TypeScript 编译产物，Provider 在 list() 解析技能元数据，get() 按需读取正文。',
        '# 3. 不在 patch 中重复声明 persona / agent-instructions / tool-fs / skill-filesystem /',
        '#    tool-skill / planning 等 host 已提供的 agent 栈行。',
        '# 4. Authorization 用 !!js 动态引用 process.env.CLOUDFLARE_API_TOKEN；token 只放在被忽略的',
        '#    %USERPROFILE%\\.dsh\\.env 中。',
        '# 5. failOnStartupError 保持 false：无 token 时不阻断 DSH 启动，工具调用时再报告配置问题。',
        '',
        '- insert:',
        '    - id: mcp-cloudflare',
        "      name: '@deepseek-ai/dsh-mcp-client'",
        '      config:',
        '        serverName: cloudflare',
        '        transport: streamable-http',
        `        url: ${mcpUrl}`,
        '        headers:',
        authHeader,
        `        toolCallTimeoutMs: ${timeoutMs}`,
        `        failOnStartupError: ${failOnStartupError}`,
        '        reconnect:',
        '          enabled: true',
        '          initialDelayMs: 500',
        '          maxDelayMs: 30000',
        '          maxAttempts: 10',
        '',
        `    - id: cfbridge`,
        `      name: '@wenaixi/cfbridge'${cfbridgeConfigBlock}`,
        '',
    ];
    return lines.join('\n');
}
/**
 * 检查文件是否损坏，若是则自动备份原文件为 .bak.<timestamp>，并自动提取配置重新生成。
 */
export async function autoHealConfigFile(filePath, options = {}) {
    const { backup = true, dryRun = false } = options;
    let originalContent = '';
    let needsHealing = false;
    const repairs = [];
    try {
        originalContent = await readFile(filePath, 'utf8');
    }
    catch (err) {
        // 文件完全不存在或无法读取，直接生成全新默认配置
        const newContent = generatePatchYaml();
        if (!dryRun) {
            await writeFile(filePath, newContent, 'utf8');
        }
        return {
            healed: true,
            content: newContent,
            repairs: [`文件不存在或无法读取 (${err.message})，已自动生成健康的标准配置`],
        };
    }
    // 检验文件健康度
    try {
        const parsed = parse(originalContent);
        if (!parsed || typeof parsed !== 'object') {
            needsHealing = true;
            repairs.push('配置文件根结构不是有效对象');
        }
        else {
            // 检查关键标识是否存在
            const text = originalContent;
            const hasMcp = /id:\s*mcp-cloudflare\b/.test(text);
            const hasBridge = /id:\s*cfbridge\b/.test(text);
            const hasToken = /Authorization:\s*!!js\s+'`Bearer \${process\.env\.CLOUDFLARE_API_TOKEN}`'/.test(text);
            if (!hasMcp || !hasBridge || !hasToken) {
                needsHealing = true;
                repairs.push('配置文件缺少必需的核心插件行或安全 Token 授权模板');
            }
        }
    }
    catch (err) {
        needsHealing = true;
        repairs.push(`YAML 语法损坏无法解析: ${err.message}`);
    }
    if (!needsHealing) {
        return { healed: false, content: originalContent, repairs: [] };
    }
    // 执行自愈流程
    let backupPath;
    if (backup && !dryRun) {
        backupPath = `${filePath}.bak.${Date.now()}`;
        try {
            await copyFile(filePath, backupPath);
            repairs.push(`已将损坏的原始配置安全备份至: ${backupPath}`);
        }
        catch (e) {
            repairs.push(`备份原文件失败: ${e.message}`);
        }
    }
    // 提取配置
    const extracted = extractCorruptedYaml(originalContent);
    repairs.push(...extracted.rawRepairs);
    // 重新生成健康 YAML
    const newContent = generatePatchYaml({
        cfbridgeConfig: extracted.cfbridge,
        mcpOverrides: extracted.mcp,
    });
    if (!dryRun) {
        await writeFile(filePath, newContent, 'utf8');
        repairs.push('已根据提取到的有效配置自动重新生成标准配置文件');
    }
    return {
        healed: true,
        backupPath,
        content: newContent,
        repairs,
    };
}
//# sourceMappingURL=config-healer.js.map