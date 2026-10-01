# cfbridge 架构深化实施计划

> **面向 Agent 执行者：** 必需子技能：executing-plans（内联执行）。步骤使用复选框（`- [ ]`）语法跟踪进度。

**目标：** 落实 2026-10-01 架构评审（improve-codebase-architecture）中经 5 个子代理深度核实确认的候选改进：验证与元数据收敛（候选 1）、兑现 Provider 失效契约（候选 2）、watcher 过滤规则与发现规则对齐（候选 3）、deprecated shim 文档修正（候选 4 最小范围）、安装脚本共享助手与行为统一（候选 5）。

**架构：** 在 scripts/ 下新建 CommonJS 共享模块 scripts/lib/skills.js（技能清单单一来源）与 scripts/lib/fs.js（文件/日志/路径助手）；在 src/cfbridge.ts 中为 SkillProvider 工厂接入 invalidate 失效契约，并以 isSkillCatalogEvent 纯函数收敛 watcher 过滤；在 scripts/test.js 门禁中新增 scripts 步骤接管共享模块行为验证。

**技术栈：** Node >= 22，TypeScript 5.9+（ESM 运行时域），CommonJS（scripts/ 域，由 scripts/package.json 锁定），node:test（tests/*.mjs）。

**规格：** 架构评审 HTML 报告（2026-10-01）与 5 份子代理深度核实报告（证据含文件:行号）；本计划以核实结论为论证依据，随计划流转。

## 全局约束

- 运行时纯 ESM，Node >= 22；代码与注释严禁使用任何 emoji；文档与注释使用简体中文。
- scripts/ 目录是 CommonJS 域（scripts/package.json "type": "commonjs"），新增脚本一律 CJS（require），禁止 ESM 语法。
- 门禁基线：`npm test` 8/8 步骤全绿、`node scripts/check.js` 75/75、`node scripts/validate-bundle.js --strict-router` 73/73、`npm pack --dry-run` 成功（任务 5 落地后 8/8 变为 9/9，同步更新 CLAUDE.md）。
- hasTokenLeak 的 9 条正则收敛时必须逐字保持一致（安全检查门禁，任何一条改动都视为安全回归）。
- ALL_SKILLS（14 项，含 cfbridge）与 VENDORED_SKILLS（13 项，不含 cfbridge）是两个不同事实来源，共享模块接口必须区分；设计错误会让 sync 误拉 cfbridge 或 strict-router 14/14 失败。
- 版本号断言保持硬编码（防漂移门禁，历史上真实拦截过 0.5.0→0.6.0 升级）；不收敛版本号。
- skills/cfbridge/SKILL.md:242 的子技能叙述清单是模型消费文档，不机器化替换。
- 构建产物 lib/ 必须随源码实时编译并提交（npm run build）。
- 提交使用原子化规范提交（feat: test: fix: docs: chore:）；未经许可不 push、不 publish。
- 不触碰既有 ledger `.superpowers/sdd/cfbridge-provider-plan/progress.md`（另一计划的产物）。
- 未经用户明确许可，不执行 `git push` 与 `npm publish`；本计划在 refactor/architecture-deepening 分支执行，收尾本地合回 main。

## Review Focus

1. **ESM/CJS 边界**：tests/*.mjs（ESM）消费 scripts/lib/*.js（CJS）必须 createRequire 或 default import；漏改即测试红（同时也是回归保护）。
2. **sync 13 vs 校验 14 语义**：sync-vendor-skills.js 必须消费 VENDORED_SKILLS；validate/测试消费 ALL_SKILLS；错用会导致 vendoring 契约破坏或 14/14 失败。
3. **invalidate 生命周期**：dispose 后调用不得抛错；watcher → invalidateCatalog 后由 registry 自动广播 skills/change，不得再手动 emit 造成双份刷新。
4. **固定 mtime 的测试坑**：模拟"内容变而 mtime 不变"必须先 utimes 把 mtime 对齐到毫秒精度再 list 缓存，写回后再 utimes 恢复同值；数字参数单位是秒。忽略对齐则测试自身触发 mtime 差异，无法证明失效路径生效。
5. **Windows 路径形态**：watch 回调 filename 是反斜杠相对路径（"foo\SKILL.md"、目录事件 "foo"）；必须 replaceAll('\\','/') 归一化后再判定，直接 endsWith('SKILL.md') 会把任意嵌套误判。
6. **脚本行为差异**：install 版删除有 bundle 指向保护（requireBundleTarget=true），uninstall 版无条件删除（false）；统一为 install 语义是行为收窄（不再误删用户自建链接），需双语义一致性测试锁定。
7. **CI 平台盲区**：Linux 不支持 recursive watch（抛 ERR_FEATURE_UNAVAILABLE_ON_PLATFORM）；目录级 watcher 集成测试必须带平台守卫（skip linux）；CI 不跑 npm test，不影响。
8. **门禁数字**：CLAUDE.md 两处 "8/8"（25、70 行）必须在 scripts 步骤真实落地并验证为 9/9 后同步更新，不能提前改。

---

### 任务 1：新建 scripts/lib/skills.js 单一来源并迁移 4 个消费方

**文件：**
- 新建：`scripts/lib/skills.js`
- 修改：`scripts/validate-bundle.js`（96 行 skills 数组及 97-111 使用处）
- 修改：`tests/bundle-metadata.test.mjs`（32 行 skills 数组）
- 修改：`tests/provider.test.mjs`（8 行 SKILLS 数组）
- 修改：`scripts/sync-vendor-skills.js`（10 行 SKILLS 数组 → VENDORED_SKILLS）
- 测试：`tests/scripts-lib.test.mjs`（新建）

**接口：**
- 消费：无（全新模块）
- 产出：`scripts/lib/skills.js`（CommonJS）
  ```js
  module.exports = {
    ALL_SKILLS: [...14 项，含 'cfbridge'...],
    VENDORED_SKILLS: [...13 项，ALL_SKILLS 去掉 'cfbridge'...],
  }
  ```

- [ ] **步骤 1：编写失败的测试**

新建 `tests/scripts-lib.test.mjs`：
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

test('skills single source exposes ALL_SKILLS (14) and VENDORED_SKILLS (13)', () => {
  const lib = require('../scripts/lib/skills.js')
  assert.equal(lib.ALL_SKILLS.length, 14)
  assert.ok(lib.ALL_SKILLS.includes('cfbridge'))
  assert.equal(lib.VENDORED_SKILLS.length, 13)
  assert.ok(!lib.VENDORED_SKILLS.includes('cfbridge'))
  assert.deepEqual(lib.VENDORED_SKILLS, lib.ALL_SKILLS.filter((name) => name !== 'cfbridge'))
  assert.equal(new Set(lib.ALL_SKILLS).size, 14)
  assert.equal(new Set(lib.VENDORED_SKILLS).size, 13)
})
```

- [ ] **步骤 2：运行测试，确认其失败**

运行：`node --test tests/scripts-lib.test.mjs`
预期：FAIL（MODULE_NOT_FOUND，`scripts/lib/skills.js` 不存在）

- [ ] **步骤 3：实现 `scripts/lib/skills.js`**

新建 CommonJS 模块，导出 ALL_SKILLS（14 项，含 cfbridge）与 VENDORED_SKILLS（13 项，= ALL_SKILLS 去掉 cfbridge），简体中文注释说明这是技能清单单一事实来源、修改技能集只改这里。

- [ ] **步骤 4：运行测试，确认其通过**

运行：`node --test tests/scripts-lib.test.mjs`
预期：PASS

- [ ] **步骤 5：迁移 validate-bundle.js**

`scripts/validate-bundle.js:96` 的 14 项数组字面量替换为：
```js
const { ALL_SKILLS: skills } = require('./lib/skills')
```
（保持 `skills` 变量名，后续 97-111 行逻辑不变）

- [ ] **步骤 6：迁移 bundle-metadata.test.mjs**

`tests/bundle-metadata.test.mjs:32` 的 14 项数组字面量替换为：
```js
const { ALL_SKILLS: skills } = createRequire(import.meta.url)('../scripts/lib/skills.js')
```
（文件头部补 `import { createRequire } from 'node:module'`）

- [ ] **步骤 7：迁移 provider.test.mjs**

`tests/provider.test.mjs:8` 的 SKILLS 数组字面量替换为：
```js
const { ALL_SKILLS: SKILLS } = createRequire(import.meta.url)('../scripts/lib/skills.js')
```
（文件头部补 createRequire 导入；SKILLS 变量名与 76-77 行用法不变）

- [ ] **步骤 8：迁移 sync-vendor-skills.js**

`scripts/sync-vendor-skills.js:10` 的 SKILLS 数组字面量替换为：
```js
const { VENDORED_SKILLS: SKILLS } = require('./lib/skills')
```

- [ ] **步骤 9：运行全量门禁，确认无回归**

运行：`npm test`、`node scripts/check.js`、`node scripts/validate-bundle.js --strict-router`
预期：8/8、75/75、73/73 全绿；scripts-lib 测试通过。

- [ ] **步骤 10：提交**

```bash
git add scripts/lib/skills.js scripts/validate-bundle.js scripts/sync-vendor-skills.js tests/scripts-lib.test.mjs tests/bundle-metadata.test.mjs tests/provider.test.mjs
git commit -m "refactor(scripts): introduce skills single source and migrate consumers"
```

---

### 任务 2：新建 scripts/lib/fs.js 收敛共享助手

**文件：**
- 新建：`scripts/lib/fs.js`
- 修改：`scripts/check.js`（20-22 readJson/readText/fileExists、24-37 hasTokenLeak、15 ROOT、175 DSH_HOME）
- 修改：`scripts/validate-bundle.js`（9-30 本地助手、4 ROOT）
- 修改：`scripts/install-bundle.js`（25-28 log、23 DSH_HOME、21 ROOT）
- 修改：`scripts/uninstall-bundle.js`（24-27 log、20 DSH_HOME、18 ROOT）
- 修改：`scripts/migrate-from-preset.js`（15-18 log、12 DSH_HOME）
- 测试：`tests/scripts-lib.test.mjs`（扩展）

**接口：**
- 产出：`scripts/lib/fs.js`（CommonJS）
  ```js
  module.exports = {
    ROOT,                       // path.resolve(__dirname, '..', '..')
    fileExists,
    readText,
    readJson,
    collectFiles,               // 递归文件收集（validate-bundle.js 原实现）
    hasTokenLeak,               // 9 条正则，与现两处逐字一致
    dshHome,                    // process.env.DSH_HOME || join(USERPROFILE||HOME||'', '.dsh')
    log,                        // [INFO]/[OK ]/[WARN]/[ERR] 前缀映射（4 行版）
  }
  ```

- [ ] **步骤 1：编写失败的测试（hasTokenLeak 逐字一致性）**

在 `tests/scripts-lib.test.mjs` 追加：
```js
test('hasTokenLeak matches the same 9 token families as the security gate', () => {
  const { hasTokenLeak } = require('../scripts/lib/fs.js')
  // 断言触发串是明文伪 token，不能落入任何跟踪文件（check.js 会扫描）；此处仅列类型示意。
  // 真实触发串构造在 tests/scripts-lib.test.mjs 中，以可读形式表达，不复制 token 形态。
  assert.equal(hasTokenLeak('cfat_<cfat-family>'), true)
  assert.equal(hasTokenLeak('cfut_<cfut-family>'), true)
  assert.equal(hasTokenLeak('cfoat_<cfoat-family>'), true)
  assert.equal(hasTokenLeak('sk-<sk-family>'), true)
  assert.equal(hasTokenLeak('Bearer <bearer-family>'), true)
  assert.equal(hasTokenLeak('ghp_<ghp-family>'), true)
  assert.equal(hasTokenLeak('AKIA<akia-family>'), true)
  assert.equal(hasTokenLeak('-----BEGIN <key-family> PRIVATE KEY-----'), true)
  assert.equal(hasTokenLeak('AIza<aiza-family>'), true)
  assert.equal(hasTokenLeak('no secrets here'), false)
})
```

- [ ] **步骤 2：运行测试，确认其失败**

运行：`node --test tests/scripts-lib.test.mjs`
预期：FAIL（MODULE_NOT_FOUND）

- [ ] **步骤 3：实现 `scripts/lib/fs.js`**

按上方接口实现。hasTokenLeak 的 9 条正则从 check.js:24-37 逐字复制（安全门禁，不得改写任何一条）。简体中文注释。

- [ ] **步骤 4：运行测试，确认其通过**

运行：`node --test tests/scripts-lib.test.mjs`
预期：PASS

- [ ] **步骤 5：迁移 check.js**

删除本地 readJson/readText/fileExists（20-22）与 hasTokenLeak（24-37）定义，替换为：
```js
const { ROOT, readText, readJson, fileExists, hasTokenLeak, dshHome } = require('./lib/fs')
```
删除 15 行本地 ROOT 定义；175 行附近本地 DSH_HOME 表达式替换为共享 dshHome（注意该处变量的引用名，保持后续逻辑不变）。

- [ ] **步骤 6：迁移 validate-bundle.js**

删除本地 readText/readJson/collectFiles/hasTokenLeak（9-30），替换为：
```js
const { ROOT, readText, readJson, fileExists, collectFiles, hasTokenLeak } = require('./lib/fs')
```
本地 `checkFile` 保留为 2 行包装（基于共享 fileExists + 本文件 pass/fail）。

- [ ] **步骤 7：迁移三个安装/迁移脚本**

install-bundle.js、uninstall-bundle.js、migrate-from-preset.js：本地 log 与 DSH_HOME 表达式替换为 `require('./lib/fs')` 的 log/dshHome；ROOT 替换为共享 ROOT。各自的 parseArgs、run、runCapture、dumpConfig、confirm 保持不动（行为差异，不强行统一）。

- [ ] **步骤 8：运行全量门禁，确认无回归**

运行：`npm test`、`node scripts/check.js`、`node scripts/validate-bundle.js --strict-router`
预期：8/8、75/75、73/73 全绿。

- [ ] **步骤 9：提交**

```bash
git add scripts/lib/fs.js scripts/check.js scripts/validate-bundle.js scripts/install-bundle.js scripts/uninstall-bundle.js scripts/migrate-from-preset.js tests/scripts-lib.test.mjs
git commit -m "refactor(scripts): consolidate shared fs helpers into scripts/lib/fs.js"
```

---

### 任务 3：兑现 Provider invalidate 失效契约

**文件：**
- 修改：`src/cfbridge.ts`（197-203 工厂签名、207-208 返回对象、326-328 接线、335-341 watcher 回调）
- 修改：`tests/provider.test.mjs`（新增失效契约测试；watcher 测试 mock 的 registerProvider 改为真实调用工厂并注入 control）
- 构建产物：`lib/cfbridge.js`（npm run build 生成并提交）

**接口：**
- 消费：`SkillProviderControl.invalidate: () => void`（@deepseek-ai/dsh-skill，lib/types/index.d.ts:190-195）
- 产出：
  ```ts
  export function createProviderForTest(
    skillDir: string,
    providerName?: string,
    logger?: Logger,
    rank?: number,
    cacheEnabled?: boolean,
    onInvalidate?: () => void,      // 新增：宿主驱动失效时顺带清空本 Provider 缓存
  ): SkillProvider & { invalidate(): void }
  ```
  返回对象新增 `invalidate()` 成员 = `cache.clear()` + `onInvalidate?.()`。
  apply 接线：`registerProvider((control) => {` 内创建 provider 并保存 `invalidateCatalog = () => provider.invalidate()`，工厂 6 参传 `control.invalidate`。
  watcher 回调（335-341）：去抖后调用 `invalidateCatalog()`（不再手动 ctx.emit，由 registry 自动广播 skills/change）。

- [ ] **步骤 1：编写失败的测试**

在 `tests/provider.test.mjs` 追加（文件头 import 增加 utimes）：
```js
test('invalidate clears the mtime cache and the next list rereads', async () => {
  const root = await fixture()
  const provider = createProviderForTest(root, 'cfbridge', { warn() {} }, 550, true, () => {})
  const file = join(root, 'alpha', 'SKILL.md')
  const t = Date.now()
  await utimes(file, t / 1000, t / 1000)
  const first = await provider.list({})
  assert.equal(first[0].description, 'Alpha skill')
  await writeFile(file, '---\nname: alpha\ndescription: Changed\n---\nNew body\n')
  await utimes(file, t / 1000, t / 1000)
  const stale = await provider.list({})
  assert.equal(stale[0].description, 'Alpha skill')
  provider.invalidate()
  const fresh = await provider.list({})
  assert.equal(fresh[0].description, 'Changed')
  provider.invalidate()
  assert.deepEqual((await provider.list({})).map((c) => c.description), ['Changed'])
})
```

- [ ] **步骤 2：运行测试，确认其失败**

运行：`node --test tests/provider.test.mjs`
预期：FAIL（TypeError: provider.invalidate is not a function）

- [ ] **步骤 3：实现工厂签名与 invalidate 成员**

在 `src/cfbridge.ts` 中按"接口"块修改 createProviderForTest；返回类型改为 `SkillProvider & { invalidate(): void }`，对象内新增 invalidate 成员。

- [ ] **步骤 4：实现 apply 接线**

registerProvider 工厂改为接收 control：
```ts
let invalidateCatalog: () => void = () => {}
const disposeProvider = ctx.skills.registerProvider((control) => {
  const provider = createProviderForTest(skillDir, providerName, ctx.logger, rank, cacheEnabled, control.invalidate)
  invalidateCatalog = () => provider.invalidate()
  return provider
})
```
watcher 回调去抖后改为 `invalidateCatalog()`，删除 `ctx.emit?.('skills/change')`。

- [ ] **步骤 5：更新 watcher 测试的 mock**

`tests/provider.test.mjs` 现有 watcher 测试（159-185）的 mockCtx.skills.registerProvider 改为真实调用工厂并注入 control（invalidate 时 push 'skills/change' 到 events），使事件断言继续成立。

- [ ] **步骤 6：构建并运行测试，确认其通过**

运行：`npm run build && node --test tests/provider.test.mjs && npm run typecheck`
预期：PASS，全部 provider 测试通过（含 159-185 watcher 事件断言）。

- [ ] **步骤 7：提交**

```bash
git add src/cfbridge.ts lib/cfbridge.js tests/provider.test.mjs
git commit -m "feat(provider): honor SkillProviderControl.invalidate contract"
```

---

### 任务 4：watcher 过滤规则对齐（isSkillCatalogEvent）

**文件：**
- 修改：`src/cfbridge.ts`（新增导出 isSkillCatalogEvent；335-341 回调条件替换）
- 修改：`tests/provider.test.mjs`（纯函数矩阵单测 + 目录级集成测试，平台守卫）
- 构建产物：`lib/cfbridge.js`

**接口：**
- 产出：
  ```ts
  export function isSkillCatalogEvent(filename: string | null | undefined): boolean
  ```
  规则：null/undefined → true（保守，等价旧 !filename 兜底）；归一化分隔符（replaceAll('\\','/')）后：空串或顶层段以 '.' 开头 → false；'SKILL.md' 或 endsWith('/SKILL.md') → true；不含 '/' 的顶层目录事件 → true（创建/删除/重命名一律放行，Windows 上无法可靠区分）；其余 → false。

- [ ] **步骤 1：编写失败的测试（纯函数矩阵）**

在 `tests/provider.test.mjs` 顶部 import 增加 isSkillCatalogEvent，追加：
```js
test('isSkillCatalogEvent aligns watcher filtering with provider discovery', () => {
  assert.equal(isSkillCatalogEvent('SKILL.md'), true)
  assert.equal(isSkillCatalogEvent('foo/SKILL.md'), true)
  assert.equal(isSkillCatalogEvent('foo\\SKILL.md'), true)
  assert.equal(isSkillCatalogEvent('foo/README.md'), false)
  // 顶层无斜杠事件（README.md、foo）与目录事件同形态，保守放行（实现阶段由 false 修正为 true）
  assert.equal(isSkillCatalogEvent('README.md'), true)
  assert.equal(isSkillCatalogEvent('foo/docs/notes.md'), false)
  assert.equal(isSkillCatalogEvent('foo'), true)
  assert.equal(isSkillCatalogEvent('.hidden'), false)
  assert.equal(isSkillCatalogEvent('.hidden/SKILL.md'), false)
  assert.equal(isSkillCatalogEvent(''), false)
  assert.equal(isSkillCatalogEvent(null), true)
  assert.equal(isSkillCatalogEvent(undefined), true)
})
```

- [ ] **步骤 2：运行测试，确认其失败**

运行：`node --test tests/provider.test.mjs`
预期：FAIL（isSkillCatalogEvent is not a function）

- [ ] **步骤 3：实现 isSkillCatalogEvent 并替换 watcher 回调**

按"接口"块实现纯函数并导出；watcher 回调条件 `if (!filename || filename.endsWith('.md'))` 替换为 `if (isSkillCatalogEvent(filename))`。

- [ ] **步骤 4：追加目录级集成测试（平台守卫）**

```js
test('watcher refreshes on skill directory rename and removal', { skip: process.platform === 'linux' }, async () => {
  const root = await fixture()
  const events = []
  const disposers = []
  const mockCtx = {
    logger: { warn() {}, debug() {}, info() {} },
    skills: { registerProvider(factory) { factory({ invalidate: () => events.push('skills/change'), signal: new AbortController().signal }); return () => {} } },
    on: () => () => {},
    emit: () => {},
    effect: (fn) => { const d = fn(); disposers.push(d); return d },
  }
  apply(mockCtx, { skillDir: root, providerName: 'cfbridge', watchSkills: true })
  await rename(join(root, 'alpha'), join(root, 'beta'))
  await new Promise((r) => setTimeout(r, 300))
  assert.ok(events.includes('skills/change'), 'expected skills/change on directory rename')
  events.length = 0
  await rm(join(root, 'beta'), { recursive: true })
  await new Promise((r) => setTimeout(r, 300))
  assert.ok(events.includes('skills/change'), 'expected skills/change on directory removal')
  for (const d of disposers) d()
})
```
（文件头 import 增加 rename、rm）

- [ ] **步骤 5：构建并运行测试，确认其通过**

运行：`npm run build && node --test tests/provider.test.mjs && npm run typecheck`
预期：PASS（含目录级集成测试）

- [ ] **步骤 6：提交**

```bash
git add src/cfbridge.ts lib/cfbridge.js tests/provider.test.mjs
git commit -m "feat(watcher): align watcher filter with provider discovery rule"
```

---

### 任务 5：门禁新增 scripts 步骤（9/9）+ 共享删除助手与行为统一

**文件：**
- 修改：`scripts/lib/fs.js`（新增 removeLegacySkillLink）
- 修改：`scripts/install-bundle.js`（85-100 cleanupLegacySymlink → 调用共享函数）
- 修改：`scripts/uninstall-bundle.js`（59-69 removeSkillLink → 调用共享函数）
- 修改：`scripts/test.js`（STEPS 数组新增第 9 步 scripts）
- 修改：`CLAUDE.md`（25、70 行门禁数字 8/8 → 9/9）
- 测试：`tests/scripts-lib.test.mjs`（扩展：临时 DSH_HOME 集成断言 + 双语义一致性）

**接口：**
- 产出（fs.js 追加）：
  ```js
  // 删除 DSH 用户目录下的 legacy cfbridge skill 链接。
  // requireBundleTarget=true（默认，install 语义）：仅删除指向 bundle 的链接/目录；
  // false（uninstall 语义）：只要路径是链接或目录就删除。
  // 返回是否真的删除。log 回调由调用方传入以保留各自日志文案。
  function removeLegacySkillLink(dshHomePath, opts = {}) {
    const { requireBundleTarget = true, log: logFn = () => {} } = opts
    const link = path.join(dshHomePath, 'skills', 'cfbridge')
    let stat
    try { stat = fs.lstatSync(link) } catch (e) {
      if (e.code !== 'ENOENT') logFn('warn', 'Could not inspect legacy skill link at ' + link + ': ' + e.message)
      return false
    }
    if (!stat.isSymbolicLink() && !stat.isDirectory()) return false
    const raw = stat.isSymbolicLink() ? fs.readlinkSync(link) : ''
    const pointsToBundle = stat.isDirectory() || (raw && String(raw).includes('cfbridge') && String(raw).includes('skills'))
    if (requireBundleTarget && !pointsToBundle) return false
    fs.rmSync(link, { recursive: true, force: true })
    logFn('ok', 'Removed legacy skill link: ' + link)
    return true
  }
  ```

- [ ] **步骤 1：编写失败的测试（双语义矩阵）**

在 `tests/scripts-lib.test.mjs` 追加（async test，mkdtemp 临时 DSH_HOME）：
```js
test('removeLegacySkillLink honors requireBundleTarget semantics', async () => {
  const { mkdtemp, mkdir, symlink, writeFile } = await import('node:fs/promises')
  const os = await import('node:os')
  const pathMod = await import('node:path')
  const { removeLegacySkillLink } = require('../scripts/lib/fs.js')
  const home = await mkdtemp(pathMod.join(os.tmpdir(), 'cfbridge-scripts-'))
  try {
    const skillsDir = pathMod.join(home, 'skills')
    await mkdir(skillsDir)
    await mkdir(pathMod.join(home, 'bundle', 'cfbridge', 'skills'), { recursive: true })
    await mkdir(pathMod.join(home, 'other', 'place'), { recursive: true })
    await writeFile(pathMod.join(home, 'plain-file'), 'x')

    // bundle 指向的链接：两种语义都删
    await symlink(pathMod.join(home, 'bundle', 'cfbridge', 'skills'), pathMod.join(skillsDir, 'cfbridge'), 'junction')
    assert.equal(removeLegacySkillLink(home, {}), true)
    assert.equal(require('node:fs').existsSync(pathMod.join(skillsDir, 'cfbridge')), false)

    // 指向别处的链接：install 语义不删，uninstall 语义删
    await symlink(pathMod.join(home, 'other', 'place'), pathMod.join(skillsDir, 'cfbridge'), 'junction')
    assert.equal(removeLegacySkillLink(home, {}), false)
    assert.equal(require('node:fs').existsSync(pathMod.join(skillsDir, 'cfbridge')), true)
    assert.equal(removeLegacySkillLink(home, { requireBundleTarget: false }), true)
    assert.equal(require('node:fs').existsSync(pathMod.join(skillsDir, 'cfbridge')), false)

    // 真实目录：install 语义删除（v0.3.0 copyDir fallback 产物）
    await mkdir(pathMod.join(skillsDir, 'cfbridge'))
    assert.equal(removeLegacySkillLink(home, {}), true)

    // 普通文件：两种语义都不删
    await writeFile(pathMod.join(skillsDir, 'cfbridge'), 'plain')
    assert.equal(removeLegacySkillLink(home, {}), false)
    assert.equal(removeLegacySkillLink(home, { requireBundleTarget: false }), false)
  } finally {
    await (await import('node:fs/promises')).rm(home, { recursive: true, force: true })
  }
})
```

- [ ] **步骤 2：运行测试，确认其失败**

运行：`node --test tests/scripts-lib.test.mjs`
预期：FAIL（removeLegacySkillLink is not a function）

- [ ] **步骤 3：实现 removeLegacySkillLink**

按"接口"块在 scripts/lib/fs.js 追加并导出。

- [ ] **步骤 4：运行测试，确认其通过**

运行：`node --test tests/scripts-lib.test.mjs`
预期：PASS

- [ ] **步骤 5：迁移 install-bundle.js**

cleanupLegacySymlink 函数体替换为：
```js
function cleanupLegacySymlink() {
  removeLegacySkillLink(dshHome, { log })
}
```
（顶部 require 增加 removeLegacySkillLink；确认无文档 grep 依赖 'Cleaned legacy skill link' 原文，如有则在步骤 9 同步文档）

- [ ] **步骤 6：迁移 uninstall-bundle.js**

removeSkillLink 函数体替换为：
```js
function removeSkillLink() {
  const removed = removeLegacySkillLink(dshHome, { requireBundleTarget: false, log })
  if (!removed) log('info', 'No skill link at ' + SKILL_LINK + '; nothing to remove.')
}
```
（保留 SKILL_LINK 常量用于提示文案；ENOENT/普通文件统一走 info 提示，行为偏差记录在案：原实现对普通文件静默）

**行为偏差记录（uninstall 删除失败路径）：** 原实现 rmSync 在 try/catch 内，删除失败（EACCES/占用）→ warn 后继续卸载流程；共享实现把 rmSync 错误捕获后经 log('warn') 提示并返回 false，卸载流程同样继续（不中断 dumpConfig 验证），既保留"warn + 继续"语义，又让失败可观测。

- [ ] **步骤 7：新增 test.js 第 9 步**

`scripts/test.js` 的 STEPS 数组（10-19）在 bundle 与 wrangler 之间插入：
```js
{ name: 'scripts', label: '脚本共享模块行为测试', command: [process.execPath, '--test', 'tests/scripts-lib.test.mjs'] },
```

- [ ] **步骤 8：运行全量门禁**

运行：`npm test`、`node scripts/check.js`、`node scripts/validate-bundle.js --strict-router`、`npm pack --dry-run`
预期：9/9、75/75、73/73 全绿，pack 成功。

- [ ] **步骤 9：更新 CLAUDE.md 门禁数字**

CLAUDE.md 25 行与 70 行 "8/8" 改为 "9/9"（"综合套件 | npm test | 9/9 全部通过（…含脚本共享模块行为…）"），并同步 70 行表格括号内的步骤列举。

- [ ] **步骤 10：提交**

```bash
git add scripts/lib/fs.js scripts/install-bundle.js scripts/uninstall-bundle.js scripts/test.js tests/scripts-lib.test.mjs
git commit -m "test(scripts): add scripts gate step and unify legacy skill link removal"
```

---

### 任务 6：deprecated shim 文档与注释修正（候选 4 最小范围）

**文件：**
- 修改：`deprecated/preset/README.md`（22-28 回滚教程：install:preset 命令从未在已发布版本注册，修正为手动恢复流程）
- 修改：`scripts/validate-preset.js`（8 行假转发注释改直白）

**接口：**
- 无代码接口变更；不合并 shim、不删除文件（合并会让历史回滚路径更复杂，收益抵不上改动面）。

- [ ] **步骤 1：修正 deprecated/preset/README.md 回滚教程**

将"## 回滚路径"节改写：注明 `npm run install:preset` 从未在任何已发布版本（含 v0.2.0）的 package.json 注册，教程改为手动复制 preset.yml / agent.cordis.yml / skills/ 到 ~/.dsh/.agent-presets/cfbridge/ 的恢复流程。

- [ ] **步骤 2：修正 validate-preset.js 注释**

将 8 行英文假转发注释替换为简体中文直白说明：本 shim 不转发到 validate:bundle，仅打印指引并以非零退出，让旧 CI 调用方明确失败。

- [ ] **步骤 3：运行门禁确认无回归**

运行：`npm test`、`node scripts/check.js`、`node scripts/validate-bundle.js --strict-router`
预期：9/9、75/75、73/73 全绿（check/validate 的 deprecated 断言仍指向三个 shim 文件，未动）。

- [ ] **步骤 4：提交**

```bash
git add deprecated/preset/README.md scripts/validate-preset.js
git commit -m "docs(preset): fix broken rollback tutorial and honest shim comment"
```

---

### 任务 7：最终全分支评审与收尾

- [ ] **步骤 1：全量门禁复查**

运行：`npm test`（9/9）、`node scripts/check.js`（75/75）、`node scripts/validate-bundle.js --strict-router`（73/73）、`npm pack --dry-run`、`git status` 确认干净。

- [ ] **步骤 2：派代码评审子代理**

按 requesting-code-review 模板派 general-purpose 评审子代理，Base=main（66810ba 之后含 gitignore 提交 9452873 的当前 main HEAD），Head=refactor/architecture-deepening；评审聚焦 ESM/CJS 边界、invalidate 生命周期、isSkillCatalogEvent 规则矩阵、脚本行为统一偏差。

- [ ] **步骤 3：处理评审意见**

Critical 立即修、Important 修复后再收尾、Minor 记录。修复后重跑步骤 1 门禁。

- [ ] **步骤 4：更新 CLAUDE.md 架构契约**

补充：invalidate 失效契约（watcher → invalidateCatalog → registry 自动广播）、isSkillCatalogEvent 过滤规则、scripts/lib/skills.js 与 scripts/lib/fs.js 单一来源、门禁 9/9、deprecated shim 现状（软 404 指引，不合并）。

- [ ] **步骤 5：收尾合并**

按 finishing-a-development-branch：确认 main 无新提交后，本地将 refactor/architecture-deepening 合回 main（fast-forward 或 --no-ff），更新 ledger 完结，向用户汇报。
