import Schema from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
import type { SkillProvider } from '@deepseek-ai/dsh-skill';
export interface Config {
    providerName: string;
    skillDir?: string;
    rank?: number;
    cache?: boolean;
    watchSkills?: boolean;
    /** 被单独关闭的技能名列表；命中的技能不进入发现结果，等同不存在。 */
    disabledSkills?: string[];
    /** 不向模型开放的技能名列表；人类仍可调用。 */
    modelHiddenSkills?: string[];
    /** 不向人类开放的技能名列表；模型仍可调用。 */
    userHiddenSkills?: string[];
    /** 技能清单快照，由插件在发现后写回，供设置面板逐个渲染技能。 */
    availableSkills?: string[];
}
export declare const Config: Schema<Schemastery.ObjectS<{
    providerName: Schema<string, string>;
    skillDir: Schema<string, string>;
    rank: Schema<number, number>;
    cache: Schema<boolean, boolean>;
    watchSkills: Schema<boolean, boolean>;
    disabledSkills: Schema<string[], string[]>;
    modelHiddenSkills: Schema<string[], string[]>;
    userHiddenSkills: Schema<string[], string[]>;
    availableSkills: Schema<string[], string[]>;
}>, Schemastery.ObjectT<{
    providerName: Schema<string, string>;
    skillDir: Schema<string, string>;
    rank: Schema<number, number>;
    cache: Schema<boolean, boolean>;
    watchSkills: Schema<boolean, boolean>;
    disabledSkills: Schema<string[], string[]>;
    modelHiddenSkills: Schema<string[], string[]>;
    userHiddenSkills: Schema<string[], string[]>;
    availableSkills: Schema<string[], string[]>;
}>>;
export declare const name = "cfbridge";
export declare const inject: readonly ["skills", "settings"];
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
/**
 * 两个方向独立的隐藏名单。
 *
 * DSH 的技能发现契约本身就区分 modelInvocable 与 userInvocable（见
 * dsh-skill 的 SkillInvocationPolicy），所以「不给模型」和「不给人」
 * 是两件独立的事，不该塞进同一个开关。
 */
export interface SkillVisibility {
    readonly model?: readonly string[];
    readonly user?: readonly string[];
}
/** Provider 额外暴露给宿主控制面的运行时开关（设置面板与 /cfbridge 命令共用）。 */
export interface MutableSkillProvider extends SkillProvider {
    invalidate(): void;
    setDisabledSkills(names: readonly string[]): void;
    disabledSkillNames(): string[];
    setHiddenSkills(next: SkillVisibility): void;
    hiddenSkillNames(): Required<SkillVisibility>;
}
export declare function createProviderForTest(skillDir: string, providerName?: string, logger?: Logger, rank?: number, cacheEnabled?: boolean, onInvalidate?: () => void, disabledSkills?: readonly string[], hiddenSkills?: SkillVisibility): MutableSkillProvider;
export declare function apply(ctx: Context, config?: Config): void;
declare const _default: {
    name: string;
    inject: readonly ["skills", "settings"];
    Config: Schema<Schemastery.ObjectS<{
        providerName: Schema<string, string>;
        skillDir: Schema<string, string>;
        rank: Schema<number, number>;
        cache: Schema<boolean, boolean>;
        watchSkills: Schema<boolean, boolean>;
        disabledSkills: Schema<string[], string[]>;
        modelHiddenSkills: Schema<string[], string[]>;
        userHiddenSkills: Schema<string[], string[]>;
        availableSkills: Schema<string[], string[]>;
    }>, Schemastery.ObjectT<{
        providerName: Schema<string, string>;
        skillDir: Schema<string, string>;
        rank: Schema<number, number>;
        cache: Schema<boolean, boolean>;
        watchSkills: Schema<boolean, boolean>;
        disabledSkills: Schema<string[], string[]>;
        modelHiddenSkills: Schema<string[], string[]>;
        userHiddenSkills: Schema<string[], string[]>;
        availableSkills: Schema<string[], string[]>;
    }>>;
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=cfbridge.d.ts.map