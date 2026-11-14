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
// 目标：在「插件」页的 cfbridge 详情页里给用户一张现代、精致、高质感的控制面板。
//   - 运行模式卡片式单选（cfbridge 专属模式 / 全局加载模式）
//   - Cloudflare Code Mode MCP 工具总控开关（docs / search / execute）
//   - 技能一元化开关管理（合并双轴为单一开关，支持实时搜索与批量启停）
//   - 遵循 frontend-design 专业美学准则，原生适配 DSH 暗色/亮色主题。
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
exports.inject = exports.PanelController = void 0;
exports.apply = apply;
const React = __importStar(require("react"));
const UI = __importStar(require("@deepseek-ai/dsh-client-ui-primitives"));
/** 包名：plugins.bundle.config 的 key 就是它，宿主按 entryKey 匹配。 */
const PACKAGE_NAME = '@wenaixi/cfbridge';
/** 语言包命名空间。 */
const NS = 'cfbridge';
/** 本插件在 profile patch 里的行 id。 */
const ROW_ID = 'cfbridge';
/** plugins.row.config 的键 = <bundle>#<rowId>。 */
const ROW_CONFIG_KEY = PACKAGE_NAME + '#' + ROW_ID;
// ---------------------------------------------------------------------------
// 语言包
// ---------------------------------------------------------------------------
const zh = {
    headerBadge: 'Cloudflare 边缘能力桥接',
    modeSection: '运行模式',
    modeHint: '定义特权工具与技能的会话作用域及安全隔离边界。',
    modePreset: 'Cloudflare 模式',
    modePresetBadge: '推荐',
    modePresetDesc: '动态注册专属智能体预设并注入操作规范，普通会话严格隔离特权工具，杜绝非 Cloudflare 会话被特权干扰。',
    modeGlobal: '全局加载模式',
    modeGlobalDesc: '所有普通会话与智能体均可直接调用 Cloudflare MCP 三工具与 14 个专项技能。',
    mcpSection: 'Cloudflare MCP 工具 (Code Mode)',
    mcpHint: '基于 Cloudflare Code Mode 的三个核心特权工具。',
    mcpStatusOn: 'MCP 工具已激活',
    mcpStatusOff: 'MCP 工具已完全关闭',
    mcpToolDocs: 'docs · 官方文档与 API 检索',
    mcpToolSearch: 'search · REST API 端点与架构查询',
    mcpToolExecute: 'execute · 沙箱安全代码执行',
    mcpDisabledBanner: 'Cloudflare MCP 工具已在全系统所有会话中物理停用（禁止调用 docs / search / execute）',
    skillSection: '技能库管理',
    skillHint: '按需加载的专项技能库。关闭的技能不参与模型检索与人类调用。',
    searchPlaceholder: '搜索技能名称或功能描述…',
    enabledCount: '已启用',
    enableAll: '全部启用',
    disableAll: '全部停用',
    noMatchingSkills: '没有找到匹配的技能条目',
    skillName: '技能',
    skillActive: '已启用',
    skillInactive: '已停用',
    loading: '正在读取…',
    failed: '保存失败',
    readOnly: '当前实例的配置不可写。',
    noSkills: '没有发现技能。',
    guideTitle: '说明与 Token 提示',
    guideText: 'Cloudflare API Token 通过 %USERPROFILE%\\.dsh\\.env 中的 CLOUDFLARE_API_TOKEN 传入；修改 Token 后需重启宿主进程。下方列表可一键启停各个专项技能。',
};
const en = {
    headerBadge: 'Cloudflare Edge Capabilities',
    modeSection: 'Operating Mode',
    modeHint: 'Define the scope and isolation boundary for privileged tools and skills.',
    modePreset: 'Cloudflare Mode',
    modePresetBadge: 'Recommended',
    modePresetDesc: 'Dedicated agent preset with safety rules; completely isolated from standard chats to prevent interference.',
    modeGlobal: 'Global Mode',
    modeGlobalDesc: 'Cloudflare MCP tools and all 14 skills are globally available in all conversations.',
    mcpSection: 'Cloudflare MCP Tools (Code Mode)',
    mcpHint: 'Three privileged tools based on Cloudflare Code Mode.',
    mcpStatusOn: 'MCP Tools Active',
    mcpStatusOff: 'MCP Tools Disabled',
    mcpToolDocs: 'docs · Docs & API schema lookup',
    mcpToolSearch: 'search · REST endpoints discovery',
    mcpToolExecute: 'execute · Safe sandbox execution',
    mcpDisabledBanner: 'Cloudflare MCP tools are physically disabled across all sessions (docs / search / execute)',
    skillSection: 'Skills Management',
    skillHint: 'On-demand specialized skills. Disabled skills are excluded from model catalog and user selection.',
    searchPlaceholder: 'Search skill name or description...',
    enabledCount: 'Enabled',
    enableAll: 'Enable All',
    disableAll: 'Disable All',
    noMatchingSkills: 'No matching skills found',
    skillName: 'Skill',
    skillActive: 'Active',
    skillInactive: 'Disabled',
    loading: 'Reading…',
    failed: 'Save failed',
    readOnly: 'Configuration is read-only in this instance.',
    noSkills: 'No skills found.',
    guideTitle: 'Configuration & Token Notice',
    guideText: 'Cloudflare API Token is read from %USERPROFILE%\\.dsh\\.env; token rotation requires restarting DSH. Individual skills can be toggled below.',
};
// ---------------------------------------------------------------------------
// 技能分类与人话简介
// ---------------------------------------------------------------------------
const SKILL_CATEGORY = {
    cfbridge: 'Core',
    cloudflare: 'Platform',
    wrangler: 'CLI',
    'agents-sdk': 'AI / Agents',
    'durable-objects': 'Storage',
    'cloudflare-one': 'Zero Trust',
    'cloudflare-one-migrations': 'Migration',
    'cloudflare-email-service': 'Email',
    'sandbox-stable': 'Containers',
    'sandbox-next': 'Containers',
    'sandbox-migrate-to-next': 'Migration',
    'turnstile-spin': 'Security',
    'web-perf': 'Performance',
    'workers-best-practices': 'Standards',
};
const SKILL_SUMMARY = {
    'agents-sdk': { zh: '用 Agents SDK 构建有状态 AI Agent', en: 'Build stateful AI agents with the Agents SDK' },
    cfbridge: { zh: 'Cloudflare MCP 桥接与技能开关指南', en: 'Cloudflare MCP bridge and skill-switch guide' },
    cloudflare: { zh: 'Cloudflare 平台全能力总入口', en: 'Entry point to the whole Cloudflare platform' },
    'cloudflare-email-service': { zh: '收发事务邮件与邮件路由', en: 'Transactional email sending and routing' },
    'cloudflare-one': { zh: 'Zero Trust / SASE 接入与排障', en: 'Zero Trust and SASE setup and troubleshooting' },
    'cloudflare-one-migrations': { zh: '从 Zscaler 等迁移到 Cloudflare One', en: 'Migrate from Zscaler and others to Cloudflare One' },
    'durable-objects': { zh: '有状态协调与 Durable Objects', en: 'Stateful coordination with Durable Objects' },
    'sandbox-migrate-to-next': { zh: 'Sandbox 迁移到 1.0 预览版', en: 'Port Sandbox apps to the 1.0 preview' },
    'sandbox-next': { zh: 'Sandbox 1.0 预览版开发', en: 'Build on the Sandbox 1.0 preview' },
    'sandbox-stable': { zh: 'Sandbox 稳定版开发', en: 'Build on the stable Sandbox release' },
    'turnstile-spin': { zh: '接入 Turnstile 人机验证', en: 'Set up Cloudflare Turnstile end to end' },
    'web-perf': { zh: '用 DevTools 分析网页性能', en: 'Analyze web performance with DevTools' },
    'workers-best-practices': { zh: 'Workers 生产实践审查', en: 'Review Workers code against best practices' },
    wrangler: { zh: 'Wrangler CLI 命令指南', en: 'Wrangler CLI command reference' },
};
function detectLang(t) {
    return t('skillName') === zh.skillName ? 'zh' : 'en';
}
function skillSummary(name, lang) {
    const entry = SKILL_SUMMARY[name];
    return entry === undefined ? '' : entry[lang];
}
/**
 * 把宿主的 ConfigForm 适配成面板期待的 PageForm 形态。
 *
 * ConfigForm 的真实接口是 getSnapshot()/subscribe()/mutate()；
 * 面板内部统一用 { state, mutate }。state 是 getSnapshot() 的实时投影，
 * 因此每次读都是最新值，不需要额外缓存。
 */
function adaptConfigForm(scope) {
    return {
        get state() {
            return scope.getSnapshot();
        },
        mutate: (ops, expectedRevision) => scope.mutate(ops, expectedRevision),
    };
}
const primitives = UI;
function msg(error) {
    return error instanceof Error ? error.message : String(error);
}
function strArray(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .filter((v) => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.trim());
}
// ---------------------------------------------------------------------------
// 客户端控制器（深模块）
// ---------------------------------------------------------------------------
class PanelController {
    form;
    t;
    lang;
    _busy = false;
    _error = null;
    constructor(form, t = (k) => k) {
        this.form = form;
        this.t = t;
        this.lang = detectLang(t);
    }
    update(form, t) {
        this.form = form;
        if (t) {
            this.t = t;
            this.lang = detectLang(t);
        }
    }
    isBusy() {
        return this._busy;
    }
    getError() {
        return this._error;
    }
    getSnapshot() {
        const state = this.form?.state;
        const writable = Boolean(state?.writable && state?.status === 'ready');
        if (!state || state.status === 'loading') {
            return {
                status: state?.status ?? 'unavailable',
                writable,
                loadMode: 'preset',
                mcpEnabled: true,
                skills: [],
                busy: this._busy,
                error: this._error,
            };
        }
        const user = (state.user && typeof state.user === 'object' && !Array.isArray(state.user) ? state.user : {});
        const value = (state.value && typeof state.value === 'object' && !Array.isArray(state.value) ? state.value : {});
        const disabled = strArray(user.disabledSkills);
        const rawMode = user.loadMode ?? value.loadMode;
        const loadMode = rawMode === 'global' ? 'global' : 'preset';
        const rawMcp = user.mcpEnabled ?? value.mcpEnabled;
        const mcpEnabled = typeof rawMcp === 'boolean' ? rawMcp : true;
        const names = strArray(value.availableSkills);
        const allNames = [...new Set([...names, ...disabled])].sort();
        const skills = allNames.map((name) => {
            const enabled = !disabled.includes(name);
            return {
                name,
                summary: skillSummary(name, this.lang),
                category: SKILL_CATEGORY[name] ?? 'General',
                enabled,
                modelInvocable: enabled,
                userInvocable: enabled,
            };
        });
        return {
            status: state.status,
            writable,
            loadMode,
            mcpEnabled,
            skills,
            busy: this._busy,
            error: this._error,
        };
    }
    // 运行模式切换（同步互斥防重锁）
    async setMode(nextMode) {
        const snap = this.getSnapshot();
        if (!snap.writable || this._busy || nextMode === snap.loadMode || !this.form)
            return false;
        this._busy = true;
        this._error = null;
        try {
            const ok = await this.form.mutate([{ op: 'set', path: ['loadMode'], value: nextMode }], this.form.state.revision);
            if (!ok)
                this._error = this.t('failed');
            return ok;
        }
        catch (e) {
            this._error = msg(e);
            return false;
        }
        finally {
            this._busy = false;
        }
    }
    // MCP 工具总控开关切换
    async setMcpEnabled(next) {
        const snap = this.getSnapshot();
        if (!snap.writable || this._busy || next === snap.mcpEnabled || !this.form)
            return false;
        this._busy = true;
        this._error = null;
        try {
            const ok = await this.form.mutate([{ op: 'set', path: ['mcpEnabled'], value: next }], this.form.state.revision);
            if (!ok)
                this._error = this.t('failed');
            return ok;
        }
        catch (e) {
            this._error = msg(e);
            return false;
        }
        finally {
            this._busy = false;
        }
    }
    // 单一技能开关翻转（单次原子 1-op 批处理提交）
    async toggle(name, nextOrAxis, explicitNext) {
        const snap = this.getSnapshot();
        if (!snap.writable || this._busy || !this.form)
            return false;
        const state = this.form.state;
        const user = (state.user && typeof state.user === 'object' && !Array.isArray(state.user) ? state.user : {});
        const disabled = new Set(strArray(user.disabledSkills));
        const isCurrentOff = disabled.has(name);
        let next;
        if (typeof explicitNext === 'boolean') {
            next = explicitNext;
        }
        else if (typeof nextOrAxis === 'boolean') {
            next = nextOrAxis;
        }
        else {
            next = isCurrentOff;
        }
        if (next) {
            disabled.delete(name);
        }
        else {
            disabled.add(name);
        }
        this._busy = true;
        this._error = null;
        try {
            const ok = await this.form.mutate([
                { op: 'set', path: ['disabledSkills'], value: [...disabled].sort() },
            ], state.revision);
            if (!ok)
                this._error = this.t('failed');
            return ok;
        }
        catch (e) {
            this._error = msg(e);
            return false;
        }
        finally {
            this._busy = false;
        }
    }
    // 批量全开 / 全关
    async setAllSkills(enable) {
        const snap = this.getSnapshot();
        if (!snap.writable || this._busy || !this.form)
            return false;
        const state = this.form.state;
        const allNames = snap.skills.map((s) => s.name);
        const nextDisabled = enable ? [] : [...allNames].sort();
        this._busy = true;
        this._error = null;
        try {
            const ok = await this.form.mutate([
                { op: 'set', path: ['disabledSkills'], value: nextDisabled },
            ], state.revision);
            if (!ok)
                this._error = this.t('failed');
            return ok;
        }
        catch (e) {
            this._error = msg(e);
            return false;
        }
        finally {
            this._busy = false;
        }
    }
}
exports.PanelController = PanelController;
// ---------------------------------------------------------------------------
// 现代化前端组件（Frontend Design 专业设计系统）
// ---------------------------------------------------------------------------
function HeroBanner(props) {
    const { snap, t } = props;
    const enabledCount = snap.skills.filter((s) => s.enabled).length;
    return React.createElement('div', {
        style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            padding: '14px 18px',
            marginBottom: 20,
            borderRadius: 'var(--dsw-radius-md, 8px)',
            background: 'var(--dsw-alias-bg-layer-2)',
            border: '0.5px solid var(--dsw-alias-border-l2)',
        },
    }, React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } }, React.createElement(primitives.StateDot, { state: 'on' }), React.createElement('span', { style: { fontSize: 14, fontWeight: 600, letterSpacing: -0.2 } }, t('headerBadge'))), React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, React.createElement(primitives.Tag, {
        label: snap.loadMode === 'preset' ? t('modePreset') : t('modeGlobal'),
    }), React.createElement(primitives.Tag, {
        label: snap.mcpEnabled ? t('mcpStatusOn') : t('mcpStatusOff'),
    }), React.createElement(primitives.Tag, {
        label: `${enabledCount}/${snap.skills.length} ${t('enabledCount')}`,
    })));
}
function McpMasterCard(props) {
    const { snap, t, onToggle } = props;
    return React.createElement('div', {
        style: {
            marginBottom: 24,
            padding: '16px 18px',
            borderRadius: 'var(--dsw-radius-md, 8px)',
            background: 'var(--dsw-alias-bg-layer-2)',
            border: '0.5px solid var(--dsw-alias-border-l2)',
        },
    }, React.createElement('div', {
        style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
        },
    }, React.createElement('div', null, React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } }, React.createElement('h4', { style: { fontSize: 14, fontWeight: 600, margin: 0 } }, t('mcpSection')), React.createElement(primitives.Tag, {
        label: snap.mcpEnabled ? t('mcpStatusOn') : t('mcpStatusOff'),
    })), React.createElement('p', {
        style: {
            fontSize: 12,
            color: 'var(--dsw-alias-label-tertiary)',
            margin: '4px 0 0',
        },
    }, t('mcpHint'))), React.createElement(primitives.Switch, {
        checked: snap.mcpEnabled,
        disabled: !snap.writable || snap.busy,
        label: t('mcpSection'),
        onChange: onToggle,
    })), React.createElement('div', {
        style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 8,
            marginTop: 14,
            opacity: snap.mcpEnabled ? 1 : 0.45,
            transition: 'opacity 0.2s ease',
        },
    }, React.createElement('div', {
        style: {
            fontSize: 12,
            padding: '8px 10px',
            borderRadius: 'var(--dsw-radius-sm, 4px)',
            background: 'var(--dsw-alias-bg-layer-1)',
            border: '0.5px solid var(--dsw-alias-border-l1)',
        },
    }, t('mcpToolDocs')), React.createElement('div', {
        style: {
            fontSize: 12,
            padding: '8px 10px',
            borderRadius: 'var(--dsw-radius-sm, 4px)',
            background: 'var(--dsw-alias-bg-layer-1)',
            border: '0.5px solid var(--dsw-alias-border-l1)',
        },
    }, t('mcpToolSearch')), React.createElement('div', {
        style: {
            fontSize: 12,
            padding: '8px 10px',
            borderRadius: 'var(--dsw-radius-sm, 4px)',
            background: 'var(--dsw-alias-bg-layer-1)',
            border: '0.5px solid var(--dsw-alias-border-l1)',
        },
    }, t('mcpToolExecute'))), !snap.mcpEnabled
        ? React.createElement('div', {
            style: {
                marginTop: 12,
                padding: '8px 12px',
                fontSize: 12,
                borderRadius: 'var(--dsw-radius-sm, 4px)',
                background: 'rgba(239, 68, 68, 0.08)',
                color: 'var(--dsw-alias-state-error-primary)',
                border: '0.5px solid rgba(239, 68, 68, 0.2)',
            },
        }, t('mcpDisabledBanner'))
        : null);
}
function SkillCard(props) {
    const { skill, busy, writable, t, onToggle } = props;
    return React.createElement('div', {
        style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '12px 14px',
            borderRadius: 'var(--dsw-radius-md, 6px)',
            background: 'var(--dsw-alias-bg-layer-2)',
            border: '0.5px solid var(--dsw-alias-border-l2)',
            transition: 'all 0.18s ease',
        },
    }, React.createElement('div', { style: { flex: 1, minWidth: 0 } }, React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } }, React.createElement('span', {
        style: {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 13,
            fontWeight: 600,
            color: skill.enabled ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
        },
    }, skill.name), React.createElement('span', {
        style: {
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 'var(--dsw-radius-sm)',
            background: 'var(--dsw-alias-bg-layer-1)',
            color: 'var(--dsw-alias-label-secondary)',
            border: '0.5px solid var(--dsw-alias-border-l1)',
            fontWeight: 500,
        },
    }, skill.category)), React.createElement('p', {
        style: {
            fontSize: 12,
            color: 'var(--dsw-alias-label-tertiary)',
            margin: '4px 0 0',
            lineHeight: 1.4,
        },
    }, skill.summary === '' ? 'skills/' + skill.name : skill.summary)), React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } }, React.createElement(primitives.StateDot, { state: skill.enabled ? 'on' : 'off' }), React.createElement(primitives.Switch, {
        checked: skill.enabled,
        disabled: !writable || busy,
        label: skill.name,
        onChange: (next) => onToggle(skill.name, next),
    })));
}
// ---------------------------------------------------------------------------
// 页面主视图组件
// ---------------------------------------------------------------------------
function Panel(props, fallbackT) {
    const t = props.t ?? fallbackT;
    const [, setTick] = React.useState(0);
    const [controller] = React.useState(new PanelController(props.form, t));
    const [filterText, setFilterText] = React.useState('');
    controller.update(props.form, t);
    if (props.view !== 'page') {
        return React.createElement('span', null, t('skillHint'));
    }
    const snap = controller.getSnapshot();
    if (snap.status === 'loading') {
        return React.createElement('div', { style: { padding: '16px 0', color: 'var(--dsw-alias-label-tertiary)' } }, t('loading'));
    }
    const trigger = (action) => {
        setTick((v) => v + 1);
        action().finally(() => setTick((v) => v + 1));
    };
    const changeMode = (nextMode) => {
        trigger(() => controller.setMode(nextMode));
    };
    const toggleMcp = (next) => {
        trigger(() => controller.setMcpEnabled(next));
    };
    const toggleSkill = (name, next) => {
        trigger(() => controller.toggle(name, next));
    };
    const setAllSkills = (enable) => {
        trigger(() => controller.setAllSkills(enable));
    };
    const filteredSkills = snap.skills.filter((skill) => {
        if (!filterText.trim())
            return true;
        const q = filterText.toLowerCase().trim();
        return skill.name.toLowerCase().includes(q) || skill.summary.toLowerCase().includes(q) || skill.category.toLowerCase().includes(q);
    });
    return React.createElement('div', { style: { padding: '8px 0', maxWidth: 720 } }, snap.error === null
        ? null
        : React.createElement('div', { role: 'status', style: { padding: '10px 14px', marginBottom: 12, borderRadius: 6, background: 'rgba(239, 68, 68, 0.1)', color: 'var(--dsw-alias-state-error-primary)' } }, snap.error === t('failed') ? snap.error : t('failed') + ': ' + snap.error), snap.writable
        ? null
        : React.createElement('p', {
            style: {
                fontSize: 12,
                padding: '8px 12px',
                margin: '0 0 12px',
                borderRadius: 'var(--dsw-radius-sm)',
                background: 'var(--dsw-alias-bg-layer-2)',
                color: 'var(--dsw-alias-state-warn-primary)',
                border: '0.5px solid var(--dsw-alias-border-l2)',
            },
        }, t('readOnly')), 
    // 头部状态微型展板
    React.createElement(HeroBanner, { snap, t }), 
    // 1. 运行模式选择（分段控件）
    React.createElement('section', { style: { marginBottom: 24 } }, React.createElement('div', { style: { marginBottom: 10 } }, React.createElement('h3', { style: { fontSize: 14, fontWeight: 600, margin: 0 } }, t('modeSection'))), React.createElement(primitives.SegmentedControl, {
        id: 'cfbridge-load-mode',
        options: [
            { value: 'preset', label: t('modePreset') },
            { value: 'global', label: t('modeGlobal') },
        ],
        value: snap.loadMode,
        disabled: !snap.writable || snap.busy,
        onChange: (next) => changeMode(next === 'global' ? 'global' : 'preset'),
        label: t('modeSection'),
    }), React.createElement('p', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', margin: '8px 0 0', lineHeight: 1.5 } }, snap.loadMode === 'preset' ? t('modePresetDesc') : t('modeGlobalDesc'))), 
    // 2. Cloudflare MCP 工具总控卡片
    React.createElement(McpMasterCard, {
        snap,
        t,
        onToggle: toggleMcp,
    }), 
    // 3. 技能库列表与即时搜索工具栏
    React.createElement('section', { style: { marginBottom: 24 } }, React.createElement('div', {
        style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 12,
        },
    }, React.createElement('div', null, React.createElement('h3', { style: { fontSize: 14, fontWeight: 600, margin: 0 } }, t('skillSection')), React.createElement('p', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', margin: '4px 0 0' } }, t('skillHint'))), React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } }, React.createElement(primitives.Button, {
        variant: 'outline',
        size: 'sm',
        disabled: !snap.writable || snap.busy,
        onClick: () => setAllSkills(true),
    }, t('enableAll')), React.createElement(primitives.Button, {
        variant: 'outline',
        size: 'sm',
        disabled: !snap.writable || snap.busy,
        onClick: () => setAllSkills(false),
    }, t('disableAll')))), 
    // 实时搜索框
    React.createElement('div', { style: { position: 'relative', marginBottom: 12 } }, React.createElement(primitives.Input, {
        value: filterText,
        placeholder: t('searchPlaceholder'),
        onChange: (e) => setFilterText(e.target.value),
    })), 
    // 技能卡片列表
    snap.skills.length === 0
        ? React.createElement('p', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, t('noSkills'))
        : filteredSkills.length === 0
            ? React.createElement('p', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', padding: '16px 0', textAlign: 'center' } }, t('noMatchingSkills'))
            : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, filteredSkills.map((skill) => React.createElement(SkillCard, {
                key: skill.name,
                skill,
                busy: snap.busy,
                writable: snap.writable,
                t,
                onToggle: toggleSkill,
            })))), 
    // 4. 说明与配置引导（折叠控件，默认收起）
    React.createElement(primitives.DisclosureRow, { title: t('guideTitle'), defaultOpen: false }, t('guideText')));
}
// ---------------------------------------------------------------------------
// 插件入口注册
// ---------------------------------------------------------------------------
function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'cfbridge: dictionaries');
    const t = ctx.locale.bind(NS);
    ctx.effect(() => ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({ name: 'plugins.detail.section', id: 'cfbridge-guide', locale: NS }, (props) => props.subject?.pkg?.name === PACKAGE_NAME
        ? React.createElement(primitives.DisclosureRow, { title: t('guideTitle'), defaultOpen: false }, t('guideText'))
        : null)), 'cfbridge: guide section in bundle detail');
    // 配置卡的 form 来源：宿主 props 不带 form（实测恒 undefined）。
    // 必须照 prompt-history 的姿势用 ctx.inject(['configForms']) 响应式拿到服务，
    // 并在注册时把 forms 闭包捕获；ctx.get 的一次性读取拿不到这个服务。
    // 注意 namespace 是 profile 条目 id（'cfbridge'），不是包名。
    ctx.inject(['configForms'], (raw) => {
        const forms = raw?.configForms ?? raw;
        if (typeof forms?.get !== 'function') {
            ctx.logger?.debug?.('[cfbridge] configForms 不可用，配置卡退回 props.form');
            registerPanel(ctx, t, () => undefined);
            return;
        }
        registerPanel(ctx, t, () => {
            try {
                const got = forms.get(ROW_ID);
                if (got === undefined)
                    return undefined;
                // ConfigForm 没有 .state，必须经适配器投影
                return got.state !== undefined
                    ? got
                    : adaptConfigForm(got);
            }
            catch (e) {
                ctx.logger?.debug?.('[cfbridge] configForms.get 抛错：' + String(e));
                return undefined;
            }
        });
    });
}
/** 注册插件详情页的配置卡；formOf 每次求值，让服务晚就绪时也能拿到最新 form。 */
function registerPanel(ctx, t, formOf) {
    ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: PACKAGE_NAME, locale: NS }, (props) => Panel({ ...props, form: props.form ?? formOf() }, t))), 'cfbridge: config panel in bundle detail page');
}
exports.inject = ['slots', 'locale'];
exports.default = { apply, PanelController, inject: exports.inject };

    return module.exports;
  },
});
