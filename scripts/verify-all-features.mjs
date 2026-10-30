// @wenaixi/cfbridge 全功能端到端真机验收测试脚本
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = resolve('.');
const { ALL_SKILLS } = require('./lib/skills.js');

console.log('====================================================');
console.log('>>> 开始执行 @wenaixi/cfbridge 插件全功能真实环境验收 <<<');
console.log('====================================================\n');

// ---------------------------------------------------------------------------
// 验证 1：配置真实落盘与 YAML 契约
// ---------------------------------------------------------------------------
console.log('[功能 1] 验证配置磁盘持久化落盘与 YAML 契约...');
const profilePatchPath = 'C:\\Users\\Administrator\\.dsh\\profiles\\web\\cordis.patch.yml';
const patchContent = await readFile(profilePatchPath, 'utf8');

assert.match(patchContent, /id:\s*cfbridge/, 'patch 必须包含 cfbridge 节点');
assert.match(patchContent, /name:\s*['"]?@wenaixi\/cfbridge['"]?/, 'patch 必须指向 @wenaixi/cfbridge');
assert.match(patchContent, /loadMode:\s*preset/, '磁盘配置中的运行模式已落盘为 preset (专属模式)');
assert.match(patchContent, /mcpEnabled:\s*true/, '磁盘配置中的 MCP 总控已落盘为 true');
assert.ok(patchContent.includes('availableSkills:'), '磁盘配置必须包含已发现技能清单 availableSkills');

const { healConfig } = await import(pathToFileURL(join(ROOT, 'lib', 'cfbridge.js')).href);
const { parse } = await import('yaml');
const parsedPatch = parse(patchContent);
const cfbridgeEntry = (Array.isArray(parsedPatch) ? parsedPatch : []).find((e) => e.id === 'cfbridge');
const healed = healConfig(cfbridgeEntry?.config || {}).config;
assert.equal(healed.loadMode, 'preset', '自愈清洗后运行模式确认收敛为 preset');
assert.equal(healed.mcpEnabled, true, '自愈清洗后 MCP 总控确认有效');
assert.ok(!('modelHiddenSkills' in healed), '自愈清洗后严禁残留废弃字段 modelHiddenSkills');
assert.ok(!('userHiddenSkills' in healed), '自愈清洗后严禁残留废弃字段 userHiddenSkills');
console.log('   ✓ [通过] 配置真实落盘在 cordis.patch.yml，且经自愈引擎清洗后字段纯净，旧废弃字段彻底剥离！\n');

// ---------------------------------------------------------------------------
// 验证 2：加载编译产物与预设命名规范化（Cloudflare 模式）
// ---------------------------------------------------------------------------
console.log('[功能 2] 验证插件预设动态注册与命名规范化...');
const { Context } = require(join(ROOT, 'node_modules', '@deepseek-ai', 'cordis'));
const { apply, createSkillProvider, CFBRIDGE_SYSTEM_INSTRUCTIONS } = await import(pathToFileURL(join(ROOT, 'lib', 'cfbridge.js')).href);

const ctx = new Context();
let registeredPreset = null;
let registeredSection = null;
let globalGuard = null;
const agentListeners = [];
const toolsChangeListeners = [];

const mockAgentPresets = {
  definitions: new Map([['standard', { config: { plugins: [{ id: 'base' }] } }]]),
  register: async (preset) => {
    registeredPreset = preset;
    return async () => { registeredPreset = null; };
  },
  composedPreset: (scope) => {
    if (scope === 'cf-session' || scope?.presetId === 'cfbridge' || scope?.ctx?.presetId === 'cfbridge') {
      return 'cfbridge';
    }
    return 'standard';
  },
};

const mockSystemPrompt = {
  section: (spec) => {
    registeredSection = spec;
    return () => {};
  },
};

const mockTools = {
  guard: (fn) => {
    globalGuard = fn;
    return () => {};
  },
};

ctx.agentPresets = mockAgentPresets;
ctx.systemPrompt = mockSystemPrompt;
ctx.tools = mockTools;
ctx.skills = { registerProvider: (factory) => factory({ invalidate() {} }) };

ctx.get = (name) => {
  if (name === 'agentPresets') return mockAgentPresets;
  if (name === 'systemPrompt') return mockSystemPrompt;
  if (name === 'tools') return mockTools;
  return undefined;
};

ctx.on = (evt, fn) => {
  if (evt === 'agent/created') agentListeners.push(fn);
  if (evt === 'tools/change') toolsChangeListeners.push(fn);
  return () => {};
};

apply(ctx, {
  providerName: 'cfbridge',
  skillDir: join(ROOT, 'skills'),
  loadMode: 'preset',
  mcpEnabled: true,
  disabledSkills: [],
});

assert.ok(registeredPreset, '必须向宿主注册智能体预设');
assert.equal(registeredPreset.name, 'Cloudflare 模式', '预设名称必须严格对齐为「Cloudflare 模式」');
assert.match(registeredPreset.description, /Cloudflare 模式：仅在本模式加载/, '预设描述必须清晰标明专属模式职责');
console.log('   ✓ [通过] 预设注册成功，名称正式展示为「' + registeredPreset.name + '」，描述对齐规范！\n');

// ---------------------------------------------------------------------------
// 验证 3：系统提示词操作规范条件注入
// ---------------------------------------------------------------------------
console.log('[功能 3] 验证系统提示词操作规范注入...');
assert.ok(registeredSection, '必须向 systemPrompt 注册提示词小节');
const cfPrompt = registeredSection.text({ scope: 'cf-session' });
assert.match(cfPrompt, /# Cloudflare 专属操作规范与安全指南/, 'Cloudflare 模式下必须注入操作规范提示词');
assert.match(cfPrompt, /search-then-execute/, '必须包含核心 search-then-execute 原则');

const standardPrompt = registeredSection.text({ scope: 'standard-session' });
assert.equal(standardPrompt, '', '非 Cloudflare 模式下提示词必须为空字符串，严禁污染普通会话');
console.log('   ✓ [通过] 专属提示词在 Cloudflare 模式正常激活，普通会话严格隔离！\n');

// ---------------------------------------------------------------------------
// 验证 4：非专属会话特权工具双层隔离与根级全局 Guard 单调拦截
// ---------------------------------------------------------------------------
console.log('[功能 4] 验证普通会话特权工具双层隔离与根级 Guard 单调拦截...');
assert.ok(typeof globalGuard === 'function', '必须向 tools 注册根级全局守卫');

const standardAgent = {
  presetId: 'standard',
  ctx: {
    presetId: 'standard',
    tools: {
      restrict: (opts) => { standardAgent.restricted = opts.deny; },
      guard: (fn) => { standardAgent.localGuard = fn; },
      view: () => ({ restrictableNames: new Set(['mcp__cloudflare__docs', 'mcp__cloudflare__search', 'mcp__cloudflare__execute']) }),
    },
  },
};

for (const listener of agentListeners) {
  listener({ agent: standardAgent });
}

assert.ok(standardAgent.restricted && standardAgent.restricted.length === 3, '普通会话必须被第一道防线 tools.restrict 移除特权工具');
const rootBlockReason = globalGuard({ name: 'mcp__cloudflare__docs', agent: standardAgent });
assert.equal(rootBlockReason, 'Cloudflare MCP 工具仅在 Cloudflare 模式下可用', '根级全局 Guard 必须物理阻断普通会话调用 MCP 工具');

const localBlockReason = standardAgent.localGuard({ name: 'mcp__cloudflare__execute' });
assert.equal(localBlockReason, 'Cloudflare MCP 工具仅在 Cloudflare 模式下可用', '局部会话 Guard 同样实施严格拦截');
console.log('   ✓ [通过] 普通会话第一层 tools.restrict 与第二层根级 Guard 双重阻断生效！\n');

// ---------------------------------------------------------------------------
// 验证 5：异步远程 MCP 客户端网络握手延迟防穿透验证
// ---------------------------------------------------------------------------
console.log('[功能 5] 验证异步远程 MCP 客户端延迟上线后的动态重同步...');
const lateArrivingAgent = {
  presetId: 'standard',
  ctx: {
    presetId: 'standard',
    tools: {
      restrict: (opts) => { lateArrivingAgent.restricted = opts.deny; },
      guard: () => {},
      // 模拟创建瞬间 MCP 尚未连接成功，没有任何 cloudflare 工具
      view: () => ({ restrictableNames: new Set(['unrelated_tool']) }),
    },
  },
};

for (const listener of agentListeners) {
  listener({ agent: lateArrivingAgent });
}
assert.equal(lateArrivingAgent.restricted, undefined, '创建瞬间由于没有 cloudflare 工具，未调用 restrict');

// 模拟 1 秒后远程 MCP 握手完成，注入全局工具并触发 tools/change
lateArrivingAgent.ctx.tools.view = () => ({
  restrictableNames: new Set(['unrelated_tool', 'mcp__cloudflare__docs', 'mcp__cloudflare__search', 'mcp__cloudflare__execute']),
});
for (const listener of toolsChangeListeners) {
  listener();
}
assert.ok(lateArrivingAgent.restricted && lateArrivingAgent.restricted.length === 3, 'tools/change 触发后自动为滞后会话补齐限制');
console.log('   ✓ [通过] 远程 MCP 工具异步上线后，动态事件成功补加工具限制，彻底根除时序漏洞！\n');

// ---------------------------------------------------------------------------
// 验证 6：Cloudflare 模式专属会话特权工具畅通无阻
// ---------------------------------------------------------------------------
console.log('[功能 6] 验证 Cloudflare 模式专属会话特权工具畅通放行...');
const cfAgent = {
  presetId: 'cfbridge',
  ctx: {
    presetId: 'cfbridge',
    tools: {
      restrict: (opts) => { cfAgent.restricted = opts.deny; },
      guard: (fn) => { cfAgent.localGuard = fn; },
    },
  },
};

for (const listener of agentListeners) {
  listener({ agent: cfAgent });
}
assert.equal(cfAgent.restricted, undefined, 'Cloudflare 模式专属会话绝不可被 restrict 剥离工具');
assert.equal(globalGuard({ name: 'mcp__cloudflare__docs', agent: cfAgent }), undefined, '专属会话执行 docs 正常放行');
assert.equal(globalGuard({ name: 'mcp__cloudflare__search', agent: cfAgent }), undefined, '专属会话执行 search 正常放行');
assert.equal(globalGuard({ name: 'mcp__cloudflare__execute', agent: cfAgent }), undefined, '专属会话执行 execute 正常放行');
console.log('   ✓ [通过] Cloudflare 模式专属会话下，特权 MCP 三工具完全可用、畅通无阻！\n');

// ---------------------------------------------------------------------------
// 验证 7：MCP 总控开关一键全局切断
// ---------------------------------------------------------------------------
console.log('[功能 7] 验证 mcpEnabled: false 总控一键物理切断...');
apply(ctx, {
  providerName: 'cfbridge',
  skillDir: join(ROOT, 'skills'),
  loadMode: 'preset',
  mcpEnabled: false, // 关闭总控
  disabledSkills: [],
});

const mcpOffReasonStandard = globalGuard({ name: 'mcp__cloudflare__docs', agent: standardAgent });
assert.equal(mcpOffReasonStandard, 'Cloudflare MCP 工具已在设置中关闭');
const mcpOffReasonCf = globalGuard({ name: 'mcp__cloudflare__docs', agent: cfAgent });
assert.equal(mcpOffReasonCf, 'Cloudflare MCP 工具已在设置中关闭', '即使在专属模式下，总控关闭也必须物理阻断');
console.log('   ✓ [通过] mcpEnabled: false 时全系统物理切断，提示「Cloudflare MCP 工具已在设置中关闭」！\n');

// ---------------------------------------------------------------------------
// 验证 8：技能发现与单一开关按需加载
// ---------------------------------------------------------------------------
console.log('[功能 8] 验证 14 个专项技能按需发现与单一开关过滤...');
const provider = createSkillProvider({
  skillDir: join(ROOT, 'skills'),
  providerName: 'cfbridge',
  loadMode: 'preset',
  agentPresets: mockAgentPresets,
  disabledSkills: ['turnstile-spin'],
});

const cfSkills = await provider.list({ scope: cfAgent });
assert.equal(cfSkills.length, 13, '开启单一开关下，已禁用的 turnstile-spin 被彻底排除');
assert.ok(!cfSkills.some(s => s.name === 'turnstile-spin'), '被禁用的技能严禁出现在候选列表中');

const standardSkills = await provider.list({ scope: standardAgent });
assert.equal(standardSkills.length, 0, '非 Cloudflare 模式会话禁止获得任何 Cloudflare 专项技能');

const loadedSkill = await provider.get(cfSkills.find(s => s.name === 'wrangler'), { scope: cfAgent });
assert.ok(loadedSkill && loadedSkill.content.length > 50, '专属模式下按需读取正文成功');
console.log('   ✓ [通过] 技能库按需加载正常，单开关过滤有效，普通会话无技能泄露！\n');

// ---------------------------------------------------------------------------
// 验证 9：客户端双面 UI 面板控制器 PanelController
// ---------------------------------------------------------------------------
console.log('[功能 9] 验证客户端 PanelController 状态机与原子提交...');
const clientSource = await readFile(join(ROOT, 'lib', 'client.js'), 'utf8');
let captured = null;
const { runInNewContext } = await import('node:vm');
runInNewContext(clientSource, {
  window: { __ModuleLoader__: { load(entry) { captured = entry; } } },
  console,
  Symbol,
  Object,
  Array,
  Set,
  JSON,
});
const exportsObj = captured.factory((name) => {
  if (name === 'react') return { createElement: () => null, useState: (v) => [v, () => {}] };
  if (name === '@deepseek-ai/dsh-client-ui-primitives') return { Switch: () => null, StateDot: () => null };
  throw new Error('unexpected require: ' + name);
});
const PanelController = exportsObj.PanelController ?? exportsObj.default?.PanelController;

let mutatedOps = null;
const mockForm = {
  state: {
    status: 'ready',
    writable: true,
    revision: 1,
    user: {
      loadMode: 'preset',
      mcpEnabled: true,
      disabledSkills: [],
    },
    value: {
      availableSkills: [...ALL_SKILLS],
    },
  },
  mutate: async (ops) => {
    mutatedOps = ops;
    return true;
  },
};

const controller = new PanelController(mockForm);
const snap = controller.getSnapshot();
assert.equal(snap.loadMode, 'preset');
assert.equal(snap.mcpEnabled, true);
assert.equal(snap.skills.length, 14, '客户端正确展示全部 14 个技能');

const toJson = (v) => JSON.parse(JSON.stringify(v));

// 测试单开关切换
await controller.toggle('wrangler', false);
assert.deepEqual(toJson(mutatedOps), [{ op: 'set', path: ['disabledSkills'], value: ['wrangler'] }], '单开关必须以纯净原子 1-op 提交');

// 测试运行模式切换
await controller.setMode('global');
assert.deepEqual(toJson(mutatedOps), [{ op: 'set', path: ['loadMode'], value: 'global' }], '运行模式切换原子 1-op 提交');
console.log('   ✓ [通过] 客户端控制器完全符合深模块契约与原子 1-op 批处理规范！\n');

console.log('====================================================');
console.log('>>> 全部 9 项真实功能端到端验收全部 100% 绿通！恭喜主人！ <<<');
console.log('====================================================');
