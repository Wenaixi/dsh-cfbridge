// 由 scripts/build-client.js 从 src/client.entry.ts 生成，请勿手改。
window.__ModuleLoader__.load({
  id: "@wenaixi/cfbridge",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
// @wenaixi/cfbridge 浏览器半侧（双面插件的 client 面）。
//
// 目标：在「插件」页的 cfbridge 详情页里给用户一张开关面板。
//   - 宿主组件（Cloudflare MCP / cfbridge Provider）的启用态只读展示；
//     真正的逐行开关由宿主自己的「包含的组件」列表提供，面板不重复实现。
//   - 技能开关是本插件独有的能力，通过宿主送到 props 上的表单控制器写入。
//
// 这里刻意不碰任何 Remote 服务、不等任何 ctx.inject：
// plugins.bundle.config 的 owner props 本身就是 { view, form }，
// form 是宿主配置表单控制器（state + mutate），写入落盘、版本栅栏、
// 重载判定都由宿主负责。这比自建通道少了整整一层跨端协议。
//
// 本文件由 scripts/build-client.js 转译为 lib/client.js（CJS factory），是唯一来源。
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = apply;
const React = __importStar(require("react"));
const UI = __importStar(require("@deepseek-ai/dsh-client-ui-primitives"));
/** 包名：plugins.bundle.config 的 key 就是它，宿主按 entryKey 匹配。 */
const PACKAGE_NAME = '@wenaixi/cfbridge';
/** 语言包命名空间。 */
const NS = 'cfbridge';
/**
 * 本插件在 profile patch 里的行 id。
 *
 * 它同时是三个身份：settings 描述面的 namespace、settings.update 的写入键，
 * 以及宿主 plugins.row.config 的 entryKey 组成（宿主按 <包名>#<行id> 拼键）。
 */
const ROW_ID = 'cfbridge';
/** plugins.row.config 的键 = <bundle>#<rowId>（与宿主 rowConfigKey 同一算法）。 */
const ROW_CONFIG_KEY = PACKAGE_NAME + '#' + ROW_ID;
// ---------------------------------------------------------------------------
// 语言包
// ---------------------------------------------------------------------------
const zh = {
    hostSection: '宿主组件',
    hostHint: '在「包含的组件」里可以逐行启用或停用。',
    skillSection: '技能开关',
    skillHint: '每个技能有两个独立开关：模型可调用、人类可调用。两个都关等于完全关闭。',
    skillName: '技能',
    model: '模型',
    user: '人类',
    loading: '正在读取…',
    failed: '保存失败',
    readOnly: '当前实例的配置不可写。',
    noSkills: '没有发现技能。',
    slashHint: '也可以在输入框里用 /cfbridge disable <skill>、/cfbridge hide-model <skill> 切换。',
    guideText: '开关位置：下方「包含的组件」可逐行启用或停用 MCP 与 Provider；技能开关在 cfbridge 行的「配置」页里，每个技能有「模型」与「人类」两个独立开关。',
};
const en = {
    hostSection: 'Host components',
    hostHint: 'Enable or disable each one under "Included components".',
    skillSection: 'Skills',
    skillHint: 'Each skill has two independent switches: model-invocable and user-invocable. Both off means fully disabled.',
    skillName: 'Skill',
    model: 'Model',
    user: 'Human',
    loading: 'Reading…',
    failed: 'Save failed',
    readOnly: 'Configuration is read-only in this instance.',
    noSkills: 'No skills found.',
    slashHint: 'You can also use /cfbridge disable <skill> or /cfbridge hide-model <skill> in the composer.',
    guideText: 'Where the switches are: "Included components" below toggles the MCP and Provider rows; skill switches live in the cfbridge row config page, with independent Model and Human switches per skill.',
};
const primitives = UI;
function msg(error) {
    return error instanceof Error ? error.message : String(error);
}
function strArray(value) {
    return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
}
/**
 * 一行：标题 + 说明 + 状态点 + 可选开关。
 * 状态点自身 aria-hidden，状态文案必须由渲染方给出（无障碍配对要求）。
 */
/** 一个带标签的开关：无障碍要求 label 必须由渲染方给出（组件读不到 locale）。 */
function LabelledSwitch(props) {
    return React.createElement('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 } }, React.createElement(primitives.Switch, {
        checked: props.checked,
        disabled: props.disabled === true,
        label: props.label,
        onChange: props.onChange,
    }), React.createElement('span', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, props.label));
}
/**
 * 一行技能：名字 + 说明 + 两个独立开关（模型 / 人类）。
 * 两个都关等于完全关闭；这与 Host 侧 disabledSkills 的语义一致，
 * 所以面板把三个 volatile 字段当作同一件事的三个投影来写。
 */
function SkillRow(props) {
    const { name, modelInvocable, userInvocable, busy, writable, t, onToggle } = props;
    const off = !modelInvocable && !userInvocable;
    return React.createElement('li', {
        style: {
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '10px 0',
            borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
        },
    }, React.createElement('div', { style: { flex: 1, minWidth: 0 } }, React.createElement('div', { style: { fontWeight: 500, color: off ? 'var(--dsw-alias-label-tertiary)' : undefined } }, name), React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, 'skills/' + name)), React.createElement(LabelledSwitch, {
        label: t('model'),
        checked: modelInvocable,
        disabled: !writable || busy,
        onChange: (next) => onToggle(name, 'model', next),
    }), React.createElement(LabelledSwitch, {
        label: t('user'),
        checked: userInvocable,
        disabled: !writable || busy,
        onChange: (next) => onToggle(name, 'user', next),
    }));
}
/** bundle 详情页的引导块：告诉用户两处开关分别在哪个位置。 */
function Guide(props) {
    return React.createElement('p', {
        style: {
            fontSize: 12,
            padding: '8px 10px',
            borderRadius: 'var(--dsw-radius-sm)',
            background: 'var(--dsw-alias-bg-layer-2)',
            color: 'var(--dsw-alias-label-secondary)',
            border: '0.5px solid var(--dsw-alias-border-l2)',
        },
    }, props.t('guideText'));
}
function head(title, hint) {
    return React.createElement('div', { style: { marginBottom: 6 } }, React.createElement('h4', { style: { fontSize: 13, fontWeight: 600, margin: 0 } }, title), React.createElement('p', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', margin: '4px 0 0' } }, hint));
}
function Panel(props, t) {
    const { form } = props;
    const [error, setError] = React.useState(null);
    const [busy, setBusy] = React.useState(null);
    // 摘要位交给宿主渲染说明文案；这里只画页面视图。
    if (props.view !== 'page') {
        return React.createElement('span', null, t('skillHint'));
    }
    const state = form?.state;
    if (state === undefined || state.status === 'loading') {
        return React.createElement('div', { style: { padding: '12px 0', color: 'var(--dsw-alias-label-tertiary)' } }, t('loading'));
    }
    // 三个 volatile 字段是同一件事的三个投影：
    //   disabledSkills    —— 完全关闭（模型与人类都不可调用）
    //   modelHiddenSkills —— 只不给模型
    //   userHiddenSkills  —— 只不给人类
    // 面板把它们合成每行的两个开关，写入时再拆回去。
    const user = (state.user ?? {});
    const disabled = strArray(user.disabledSkills);
    const modelHidden = strArray(user.modelHiddenSkills);
    const userHidden = strArray(user.userHiddenSkills);
    // 清单由 Host 侧 Provider 发现后发布（config.availableSkills），面板不自己扫目录。
    const names = strArray(state.value?.availableSkills);
    const skills = [...new Set([...names, ...disabled, ...modelHidden, ...userHidden])].sort();
    const writable = state.writable && state.status === 'ready';
    const toggle = (name, axis, next) => {
        if (form === undefined)
            return;
        const off = new Set(disabled);
        const hiddenModel = new Set(modelHidden);
        const hiddenUser = new Set(userHidden);
        if (axis === 'model') {
            if (next)
                hiddenModel.delete(name);
            else
                hiddenModel.add(name);
        }
        else {
            if (next)
                hiddenUser.delete(name);
            else
                hiddenUser.add(name);
        }
        // 两个都关 = 完全关闭，用 disabledSkills 表达（模型与人类都拿不到它）。
        if (hiddenModel.has(name) && hiddenUser.has(name))
            off.add(name);
        else
            off.delete(name);
        setBusy(name);
        setError(null);
        form
            .mutate([
            { op: 'set', path: ['disabledSkills'], value: [...off] },
            { op: 'set', path: ['modelHiddenSkills'], value: [...hiddenModel] },
            { op: 'set', path: ['userHiddenSkills'], value: [...hiddenUser] },
        ], state.revision)
            .then((ok) => { if (!ok)
            setError(t('failed')); })
            .catch((e) => setError(msg(e)))
            .finally(() => setBusy(null));
    };
    return React.createElement('div', { style: { padding: '4px 0', maxWidth: 680 } }, error === null
        ? null
        : React.createElement('div', { role: 'status', style: { padding: '10px 0', color: 'var(--dsw-alias-state-error-primary)' } }, t('failed') + ': ' + error), writable
        ? null
        : React.createElement('p', {
            style: {
                fontSize: 12,
                padding: '8px 10px',
                margin: '0 0 4px',
                borderRadius: 'var(--dsw-radius-sm)',
                background: 'var(--dsw-alias-bg-layer-2)',
                color: 'var(--dsw-alias-state-warn-primary)',
                border: '0.5px solid var(--dsw-alias-border-l2)',
            },
        }, t('readOnly')), React.createElement('section', { style: { marginTop: 18 } }, head(t('skillSection'), t('skillHint')), skills.length === 0
        ? React.createElement('p', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, t('noSkills'))
        : React.createElement('ul', { style: { listStyle: 'none', margin: 0, padding: 0 } }, skills.map((name) => React.createElement(SkillRow, {
            key: name,
            name,
            modelInvocable: !disabled.includes(name) && !modelHidden.includes(name),
            userInvocable: !disabled.includes(name) && !userHidden.includes(name),
            busy: busy === name,
            writable,
            t,
            onToggle: toggle,
        })))), React.createElement('p', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginTop: 14 } }, t('slashHint')));
}
// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------
/**
 * 只声明 slots：其余一律不需要。
 * plugins.bundle.config 由「插件」页在挂载时声明为子插槽，注入会在那一刻挂起，
 * 页面打开后自动放行 —— 不必自己判断时机，也不必 ctx.inject 等待任何服务。
 */
function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'cfbridge: dictionaries');
    const t = ctx.locale.bind(NS);
    // bundle 详情页：宿主在这一层不送 form（见宿主 PackageDetail 的 renderSlot 调用），
    // 而动态插件的 ctx.inject 回调参数只有 fiber，拿不到 remote —— 也就是说第三方
    // 插件在这一页没有任何写通道。所以这里只放引导，不带开关。
    ctx.effect(() => ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({ name: 'plugins.detail.section', id: 'cfbridge-guide', locale: NS }, (props) => props.subject?.pkg?.name === PACKAGE_NAME
        ? React.createElement(Guide, { t })
        : null)), 'cfbridge: bundle guide');
    // 行详情页：宿主在这里送 form（它的 ConfigForm 控制器），
    // 而 formFor 用的正是行 id —— 与 settings 描述面的 namespace 同名。
    // 因此技能开关零跨端代码：写入、落盘、版本栅栏都由宿主表单控制器负责。
    ctx.effect(() => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({ name: 'plugins.row.config', key: ROW_CONFIG_KEY, locale: NS }, (props) => Panel(props, t))), 'cfbridge: row page panel');
}
exports.default = { apply, inject: ['slots', 'locale'] };

    return module.exports;
  },
});
