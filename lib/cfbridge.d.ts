import Schema from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
import type { SkillProvider } from '@deepseek-ai/dsh-skill';
export interface Config {
    providerName: string;
    skillDir?: string;
    rank?: number;
    cache?: boolean;
    watchSkills?: boolean;
}
export declare const Config: Schema<Schemastery.ObjectS<{
    providerName: Schema<string, string>;
    skillDir: Schema<string, string>;
    rank: Schema<number, number>;
    cache: Schema<boolean, boolean>;
    watchSkills: Schema<boolean, boolean>;
}>, Schemastery.ObjectT<{
    providerName: Schema<string, string>;
    skillDir: Schema<string, string>;
    rank: Schema<number, number>;
    cache: Schema<boolean, boolean>;
    watchSkills: Schema<boolean, boolean>;
}>>;
export declare const name = "cfbridge";
export declare const inject: readonly ["skills"];
type Logger = {
    warn(message: string): void;
    debug?(message: string): void;
    info?(message: string): void;
};
type Frontmatter = Record<string, unknown>;
type ParsedSkillFile = {
    data: Frontmatter;
    body: string;
};
export declare function parseFrontmatter(raw: string): ParsedSkillFile | undefined;
export declare function isSkillCatalogEvent(filename: string | null | undefined): boolean;
export declare function createProviderForTest(skillDir: string, providerName?: string, logger?: Logger, rank?: number, cacheEnabled?: boolean, onInvalidate?: () => void): SkillProvider & {
    invalidate(): void;
};
export declare function apply(ctx: Context, config?: Config): void;
declare const _default: {
    name: string;
    inject: readonly ["skills"];
    Config: Schema<Schemastery.ObjectS<{
        providerName: Schema<string, string>;
        skillDir: Schema<string, string>;
        rank: Schema<number, number>;
        cache: Schema<boolean, boolean>;
        watchSkills: Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        providerName: Schema<string, string>;
        skillDir: Schema<string, string>;
        rank: Schema<number, number>;
        cache: Schema<boolean, boolean>;
        watchSkills: Schema<boolean, boolean>;
    }>>;
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=cfbridge.d.ts.map