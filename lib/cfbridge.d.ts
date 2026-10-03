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
/** createSkillProvider 的入参。用具名选项对象而非位置参数： */
/** 调用点因此只需写出关心的那几项，读代码不必回查签名。 */
export interface SkillProviderOptions {
    /** 技能目录；相对路径按进程工作目录解析。 */
    skillDir: string;
    /** 挂载标识，默认 cfbridge；禁止使用保留名 runtime。 */
    providerName?: string;
    /** 日志出口，默认 console。 */
    logger?: Logger;
    /** 发现优先级权重，默认 550。 */
    rank?: number;
    /** 是否启用基于 mtime 的元数据内存缓存，默认 true。 */
    cacheEnabled?: boolean;
    /** 宿主驱动失效时的回调（清缓存后触发，用于让上游重新收集目录）。 */
    onInvalidate?: () => void;
    /** 被完全关闭的技能名，默认空。 */
    disabledSkills?: readonly string[];
    /** 两个方向独立的隐藏名单，默认空。 */
    hiddenSkills?: SkillVisibility;
}
/**
 * 创建一个技能 Provider。
 *
 * 参数用具名选项对象承载：此前是 8 个位置参数（其中 5 个可选），
 * 调用点必须回查签名才知道第 4 个是什么、第 6 个的 () => {} 又是谁。
 * 选项对象让每个调用点自解释，且新增选项不再波及任何既有调用点。
 */
export declare function createSkillProvider(options: SkillProviderOptions): MutableSkillProvider;
/**
 * 技能运行时：把「当前活着的 Provider」与「失效入口」这两根共享线封装在内部。
 *
 * 拆解 apply() 之前，这两根线是裸的闭包变量，被三条互不相关的效果同时读写
 * （watcher 去抖回调、/cfbridge 命令、清单发布），于是想改其中一条效果就必须
 * 先读懂另外两条。收敛到这里之后，各效果只面对下面几个方法。
 *
 * 宿主注册与失效的时序契约（不变）：
 *   - registerProvider 的回调在宿主收集目录时被调用，返回的 Provider 被宿主持有；
 *   - provider.invalidate() 清自身 mtime 缓存，并触发宿主侧的 control.invalidate，
 *     由 dsh-skill registry 广播 skills/change —— 此处不再手动 emit，避免双份刷新。
 */
export interface SkillRuntime {
    /** 当前活着的 Provider；宿主尚未调用注册回调时为 undefined。 */
    current(): MutableSkillProvider | undefined;
    /** 清目录缓存并通知宿主失效。Provider 尚未就绪时是空操作。 */
    invalidate(): void;
    /** 用真实技能目录列一次候选；Provider 未就绪或读取失败时返回空数组。 */
    listNames(): Promise<string[]>;
}
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