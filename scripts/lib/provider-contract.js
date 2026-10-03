// Provider 契约校验（CommonJS，scripts/ 域）。
//
// 为什么需要这个模块：
// 历史上 check.js 与 validate-bundle.js 各自用正则去匹配 src/cfbridge.ts 的
// 源码文本，来断言「Provider 注入了 skills」「rank 是 550」这类事情。这种做法
// 有两个方向的错误，且都已被实验证实：
//
//   误报 —— 把常量 PROVIDER_RANK 改名 DEFAULT_RANK（行为完全不变），两个门禁
//           同时报错，因为断言钉在标识符拼写上而不是值上。
//   漏报 —— 把 ctx.skills.registerProvider 调用短路掉（Provider 永远注册不上，
//           功能彻底失效），两个门禁的 Provider 断言全部通过，检查总数毫无变化。
//
// 本模块改为 import 构建产物 lib/cfbridge.js，断言真实的导出值与真实行为：
//   - inject 是否真的声明了 skills（读导出值，不读源码文本）
//   - Config 归一后的 rank 是否真的是 550（读运行时值）
//   - apply 跑完之后是否真的注册了恰好一个 Provider，且它真的能列出技能
//
// 契约是"接口面"而非"实现细节"：改内部结构、改常量名都不会让它误报；
// 而一旦 Provider 注册不上或技能发现失效，它必然报错。
//
// 唯一保留的源码文本检查是「保留名 runtime 防御」——那是一条必须在 apply 阶段
// 抛出的行为契约，用真实调用验证（见下）。

const fs = require('fs')
const path = require('path')

const POLICY = 'must' // 所有断言都是必需项；保留字段以便未来加入"提示级"检查

/** 读取 package.json 声明的入口（默认 lib/cfbridge.js），用于定位构建产物。 */
function resolveEntry(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const rel = (pkg.main || 'lib/cfbridge.js').replace(/^\.\//, '')
  return path.join(root, rel)
}

/**
 * 构造一个最小的宿主替身，只实现 Provider 注册契约。
 * 这不是"造假"：dsh-skill 的 registerProvider(factory) 契约就是
 * 「把工厂收下，宿主稍后调用它并注入 control」。替身如实复现这一步。
 */
function makeHostStub() {
  const registrations = []
  return {
    registrations,
    logger: { warn() {}, debug() {}, info() {} },
    skills: {
      registerProvider(factory) {
        registrations.push(factory)
        return () => {}
      },
    },
    effect(effect) {
      return effect()
    },
    on() {
      return () => {}
    },
  }
}

/**
 * 校验 Provider 契约。
 * @param {string} root 仓库根目录
 * @returns {Promise<Array<{name: string, ok: boolean, detail: string, policy: string}>>}
 */
async function verifyProviderContract(root) {
  const results = []
  const record = (name, ok, detail = '') => {
    results.push({ name, ok: Boolean(ok), detail: detail ? String(detail) : '', policy: POLICY })
  }

  const entry = resolveEntry(root)
  if (!fs.existsSync(entry)) {
    record('Provider built entry is importable', false, 'missing: ' + entry)
    return results
  }

  let mod
  try {
    mod = await import(require('url').pathToFileURL(entry).href)
  } catch (error) {
    record('Provider built entry is importable', false, String(error && error.message))
    return results
  }
  record('Provider built entry is importable', true, path.relative(root, entry))

  // 导出面：这些是宿主与消费方依赖的接口，缺一不可。
  record('Provider exports name', typeof mod.name === 'string' && mod.name.length > 0,
    'got: ' + JSON.stringify(mod.name))
  record('Provider exports apply', typeof mod.apply === 'function')
  record('Provider exports Config', typeof mod.Config === 'function')

  // inject 读的是导出值，不是源码文本。改名/加依赖都不会误报。
  const inject = Array.isArray(mod.inject) ? mod.inject : []
  record('Provider injects skills', inject.includes('skills'), 'got: ' + JSON.stringify(inject))
  record('Provider injects settings', inject.includes('settings'), 'got: ' + JSON.stringify(inject))

  // rank 读运行时归一值：改常量名不影响，改错了必然红。
  let rank
  try {
    rank = mod.Config({}).rank
  } catch (error) {
    record('Config normalizes without throwing', false, String(error && error.message))
  }
  record('Provider rank is 550', rank === 550, 'got: ' + String(rank))

  // 行为契约：apply 必须注册恰好一个 Provider，且它真的能发现技能。
  const ctx = makeHostStub()
  const skillDir = path.join(root, 'skills')
  try {
    mod.apply(ctx, { skillDir, providerName: 'cfbridge', cache: false })
  } catch (error) {
    record('apply registers exactly one Provider', false, 'apply threw: ' + String(error && error.message))
    return results
  }
  record('apply registers exactly one Provider', ctx.registrations.length === 1,
    'registration count: ' + ctx.registrations.length)

  if (ctx.registrations.length === 1) {
    let provider
    try {
      provider = ctx.registrations[0]({ invalidate() {}, signal: new AbortController().signal })
    } catch (error) {
      record('registered Provider exposes list/get', false, 'factory threw: ' + String(error && error.message))
      return results
    }
    record('registered Provider exposes list/get',
      typeof provider.list === 'function' && typeof provider.get === 'function')

    let candidates = []
    try {
      const listed = await provider.list({})
      candidates = Array.isArray(listed) ? listed : listed.candidates
    } catch (error) {
      record('registered Provider lists skills', false, String(error && error.message))
      return results
    }
    const diskSkills = fs.existsSync(skillDir)
      ? fs.readdirSync(skillDir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
          .map((e) => e.name).sort()
      : []
    const listedNames = candidates.map((c) => c.name).sort()
    record('registered Provider lists every skill on disk',
      JSON.stringify(listedNames) === JSON.stringify(diskSkills),
      'listed=' + listedNames.length + ' disk=' + diskSkills.length)

    // 两段式加载的契约：list() 不读正文，get() 才读。
    const sample = candidates.find((c) => c.name === 'cfbridge') || candidates[0]
    if (sample === undefined) {
      record('list() omits body and get() supplies it', false, 'no candidate to sample')
    } else {
      const listedWithoutBody = sample.content === undefined
      const loaded = await provider.get(sample, {})
      record('list() omits body and get() supplies it',
        listedWithoutBody && typeof loaded?.content === 'string' && loaded.content.length > 0,
        'listContent=' + String(sample.content) + ' getBytes=' + (loaded?.content ? loaded.content.length : 0))
    }
  }

  // 保留名防御是 apply 阶段的行为契约，用真实调用验证。
  let reservedRejected = false
  try {
    mod.apply(makeHostStub(), { skillDir, providerName: 'runtime' })
  } catch {
    reservedRejected = true
  }
  record('apply rejects reserved providerName "runtime"', reservedRejected)

  return results
}

module.exports = { verifyProviderContract }
