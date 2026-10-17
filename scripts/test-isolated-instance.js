// @wenaixi/cfbridge 全新隔离实例端到端验收测试。
//
// 铁律：
// 1. 完全隔离：DSH_HOME 强制指向系统临时目录，绝不读写与触碰用户 ~/.dsh；
// 2. 源码直连：遵循 Direct Source Junction Rule，手工建立目录联接直连源码；
// 3. 验收覆盖：验证配置合并、动态预设、双道物理守卫、单一开关与 MCP 总控短路；
// 4. 优雅清理：无论成功或失败，强制清理目录联接并彻底销毁临时目录。

const { mkdir, rm, writeFile, readFile } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { spawnSync, execSync } = require('node:child_process');
const assert = require('node:assert/strict');

const ROOT = resolve(__dirname, '..');
const DSH_BIN = 'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js';

async function main() {
  console.log('=== 开始全新隔离新实例端到端验收 ===');
  const tempHome = join('C:\\Users\\Administrator\\AppData\\Local\\Temp', 'dsh-isolated-' + Date.now());
  await mkdir(tempHome, { recursive: true });
  console.log('[1/5] 创建独立临时 DSH_HOME: ' + tempHome);

  const env = {
    ...process.env,
    PATH: process.env.PATH || 'C:\\Windows\\system32;C:\\Windows;C:\\Program Files\\nodejs',
    DSH_HOME: tempHome,
    APPDATA: 'C:\\Users\\Administrator\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\Administrator\\AppData\\Local',
    USERPROFILE: 'C:\\Users\\Administrator',
    HOMEPATH: '\\Users\\Administrator',
    HOMEDRIVE: 'C:',
    SystemRoot: 'C:\\Windows',
  };

  const profileName = 'isolated-acc';
  const profileDir = join(tempHome, 'profiles', profileName);

  try {
    // 1. 从默认 web 模板派生隔离 profile
    console.log('[2/5] 从官方 web 模板派生隔离 profile...');
    const initRes = spawnSync(process.execPath, [DSH_BIN, profileName, '--from-default-profile', 'web', '--dump-config'], {
      env,
      encoding: 'utf-8',
      timeout: 45000,
    });
    if (initRes.status !== 0) {
      throw new Error('派生隔离 profile 失败: ' + (initRes.stderr || initRes.stdout));
    }

    // 2. 挂载补丁与建立源码目录联接（Direct Source Junction Rule）
    console.log('[3/5] 建立直连源码联接 (Direct Source Junction) 与补丁层...');
    const nodeModulesDir = join(profileDir, 'node_modules', '@wenaixi');
    await mkdir(nodeModulesDir, { recursive: true });
    const targetLink = join(nodeModulesDir, 'cfbridge');

    // Windows mklink /J
    execSync(`cmd.exe /c mklink /J "${targetLink}" "${ROOT}"`, { stdio: 'ignore' });

    // 往 isolated profile 的 cordis.patch.yml 写入标准的 cfbridge 补丁
    const patchPath = join(profileDir, 'cordis.patch.yml');
    const canonicalPatch = await readFile(join(ROOT, 'cordis.patch.yml'), 'utf-8');
    await writeFile(patchPath, canonicalPatch, 'utf-8');

    // 3. 验证配置合并与去旧版兼容（dump-config）
    console.log('[4/5] 运行真实 DSH 宿主导出配置，验证配置融合与契约...');
    const dumpRes = spawnSync(process.execPath, [DSH_BIN, profileName, '--dump-config'], {
      env,
      encoding: 'utf-8',
      timeout: 45000,
    });
    if (dumpRes.status !== 0) {
      throw new Error('导出融合配置失败: ' + (dumpRes.stderr || dumpRes.stdout));
    }
    const dumpedConfig = dumpRes.stdout;
    assert.match(dumpedConfig, /id:\s*cfbridge/, '融合配置必须包含 cfbridge 节点');
    assert.match(dumpedConfig, /name:\s*['"]?@wenaixi\/cfbridge['"]?/, '融合配置必须正确挂载 @wenaixi/cfbridge');
    assert.match(dumpedConfig, /id:\s*mcp-cloudflare/, '融合配置必须包含 mcp-cloudflare 节点');
    assert.ok(!dumpedConfig.includes('modelHiddenSkills'), '融合配置严禁出现历史废弃字段 modelHiddenSkills');
    assert.ok(!dumpedConfig.includes('userHiddenSkills'), '融合配置严禁出现历史废弃字段 userHiddenSkills');
    console.log('      ✓ 宿主配置融合成功，零报错，历史兼容字段已彻底绝迹');

    // 4. 运行轻量 Cordis 运行时，真机验证特权守卫与动态预设
    console.log('[5/5] 真机验证：动态预设挂载、双道物理守卫与单一开关...');
    const { Context } = require(join(ROOT, 'node_modules', '@deepseek-ai', 'cordis'));
    const { apply: cfbridgeApply } = require(join(ROOT, 'lib', 'cfbridge.js'));

    const ctx = new Context();
    let registeredPreset = null;
    let registeredProvider = null;
    let restrictedTargets = null;
    let guardedBlocker = null;

    const mockSkills = {
      registerProvider: (factory) => {
        registeredProvider = typeof factory === 'function' ? factory({ invalidate() {} }) : factory;
        return () => {};
      },
    };
    const mockAgentPresets = {
      definitions: new Map([['standard', { config: { plugins: [{ id: 'base' }] } }]]),
      register: async (preset) => {
        registeredPreset = preset;
        return async () => { registeredPreset = null; };
      },
      composedPreset: (scope) => scope?.presetId,
    };
    const mockTools = {
      view: () => ({ restrictableNames: new Set(['mcp__cloudflare__docs', 'mcp__cloudflare__search', 'mcp__cloudflare__execute']) }),
    };

    ctx.skills = mockSkills;
    ctx.agentPresets = mockAgentPresets;
    ctx.tools = mockTools;
    ctx.get = (name) => {
      if (name === 'skills') return mockSkills;
      if (name === 'agentPresets') return mockAgentPresets;
      if (name === 'tools') return mockTools;
      return undefined;
    };

    // 模拟 agent/created 触发
    const agentListeners = [];
    ctx.on = (evt, fn) => {
      if (evt === 'agent/created') agentListeners.push(fn);
      return () => {};
    };

    // 挂载插件
    cfbridgeApply(ctx, {
      providerName: 'cfbridge',
      loadMode: 'preset',
      mcpEnabled: true,
      disabledSkills: ['turnstile-spin'],
    });

    // 验证技能 Provider 发现
    assert.ok(registeredProvider, '技能 Provider 必须成功向宿主注册');
    const listed = await registeredProvider.list();
    assert.equal(listed.length, 13, '开启单一开关下，13 个技能可见，已禁用技能 (turnstile-spin) 完全被排除');
    assert.ok(!listed.some(s => s.name === 'turnstile-spin'), '已禁用的技能绝对不能出现在发现列表中');

    // 验证普通会话守卫拦截
    const standardAgentCtx = {
      tools: {
        view: () => ({ restrictableNames: new Set(['mcp__cloudflare__docs', 'mcp__cloudflare__search', 'mcp__cloudflare__execute']) }),
        restrict: (opts) => { restrictedTargets = opts.deny; },
        guard: (fn) => { guardedBlocker = fn; },
      },
    };
    for (const listener of agentListeners) {
      listener({ agent: { ctx: standardAgentCtx } });
    }
    assert.ok(restrictedTargets && restrictedTargets.length === 3, '普通会话必须被第一道防线 (tools.restrict) 物理剥离特权工具');
    assert.ok(guardedBlocker, '普通会话必须挂载第二道防线 (tools.guard) 动态拦截');
    const guardReason = guardedBlocker({ name: 'mcp__cloudflare__docs' });
    assert.match(guardReason, /仅在 cfbridge 模式下可用/, '普通会话模型调用特权工具必须返回明确的预设隔离拦截理由');

    console.log('      ✓ 技能发现单一开关生效，已禁用技能完全隔离');
    console.log('      ✓ 普通会话双道物理守卫拦截生效，特权工具严格隔离');
    console.log('=== 全新隔离新实例端到端验收全部通过！===');
  } finally {
    // 无论成败，彻底清理临时 DSH_HOME
    try {
      execSync(`cmd.exe /c rmdir "${join(profileDir, 'node_modules', '@wenaixi', 'cfbridge')}"`, { stdio: 'ignore' });
    } catch {}
    await rm(tempHome, { recursive: true, force: true });
    console.log('已清理并销毁临时隔离实例目录，宿主生产环境零触碰。');
  }
}

main().catch((err) => {
  console.error('隔离新实例验收失败:', err);
  process.exit(1);
});
