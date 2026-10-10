import type { Config, LoadMode } from './cfbridge.js';
export type { LoadMode };
export interface HealedConfig extends Config {
    providerName: string;
    rank: number;
    cache: boolean;
    watchSkills: boolean;
    loadMode: LoadMode;
    disabledSkills: string[];
    modelHiddenSkills: string[];
    userHiddenSkills: string[];
    availableSkills: string[];
}
export interface HealResult {
    config: HealedConfig;
    changed: boolean;
    repairs: string[];
}
export interface ExtractedMcpConfig {
    serverName?: string;
    transport?: string;
    url?: string;
    failOnStartupError?: boolean;
    toolCallTimeoutMs?: number;
    reconnect?: {
        enabled?: boolean;
        initialDelayMs?: number;
        maxDelayMs?: number;
        maxAttempts?: number;
    };
}
export interface ExtractedPatchConfig {
    cfbridge: Partial<HealedConfig>;
    mcp: ExtractedMcpConfig;
    rawRepairs: string[];
}
export interface AutoHealFileResult {
    healed: boolean;
    backupPath?: string;
    content: string;
    repairs: string[];
}
/**
 * 递归展开可能存在的懒求值函数（最高 4 层，防死循环）。
 */
export declare function unwrapLazy<T>(raw: unknown, defaultValue: T): T;
/**
 * 清洗并验证技能名称数组，剔除非法、空白及非字符串项，并去重。
 */
export declare function sanitizeSkillNames(raw: unknown): {
    names: string[];
    dropped: string[];
};
/**
 * 清洗和修复运行时配置对象，补全默认值并过滤脏数据。
 */
export declare function healConfig(raw: unknown): HealResult;
/**
 * 从损坏的 YAML 文本中提取配置。
 * 结合宽松解析与启发式文本扫描，最大程度抢救残存配置。
 */
export declare function extractCorruptedYaml(corruptedText: string): ExtractedPatchConfig;
/**
 * 按照 DSH 官方契约重新生成标准、合法的 cordis.patch.yml 文本。
 */
export declare function generatePatchYaml(options?: {
    cfbridgeConfig?: Partial<Config>;
    mcpOverrides?: ExtractedMcpConfig;
}): string;
/**
 * 检查文件是否损坏，若是则自动备份原文件为 .bak.<timestamp>，并自动提取配置重新生成。
 */
export declare function autoHealConfigFile(filePath: string, options?: {
    backup?: boolean;
    dryRun?: boolean;
}): Promise<AutoHealFileResult>;
//# sourceMappingURL=config-healer.d.ts.map