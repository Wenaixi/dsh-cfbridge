import Schema from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
import type { SkillInvocationPolicy, SkillProvider } from '@deepseek-ai/dsh-skill';
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
/**
 * 技能可见性名单的规范化读取面。
 *
 * 把两个方向的名单收成一个只读结构，供投影函数与运行时开关共用。
 * 「不给模型」与「不给人类」是两个独立维度（见上），因此分开承载。
 */
export interface VisibilitySets {
    readonly model: ReadonlySet<string>;
    readonly user: ReadonlySet<string>;
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
export declare function projectInvocation<T extends {
    name: string;
    invocation: SkillInvocationPolicy;
}>(item: T, hidden: VisibilitySets): T;
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