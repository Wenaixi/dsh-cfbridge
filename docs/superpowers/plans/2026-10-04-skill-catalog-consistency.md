# cfbridge 技能清单运行时一致性实施计划

> **面向 Agent 执行者：** 本计划按 executing-plans 内联执行；每个任务先 RED，再 GREEN，再提交。

**目标：** 修复 watchSkills 后 settings.availableSkills 陈旧的问题，并让发布链路使用已注入的 settings 实例且受生命周期控制。

**架构：** 保留现有 SkillProvider、SkillRuntime、registry invalidate 和客户端 form 写入 seam。仅在 Host 侧把目录快照发布收进一个小型生命周期协作者，外部仍只依赖现有 settings.update 与 runtime.invalidate 行为。

**技术栈：** Node.js 22、TypeScript、Cordis、DSH SkillProvider、Node Test、现有 npm 综合门禁。

**规格：** CLAUDE.md 架构契约；dsh-plugin-dev references/skill-provider.md；官方 settings update 语义。

## 全局约束

- watcher -> runtime.invalidate -> control.invalidate -> skills/change 链路保持不变，不手动 emit。
- Provider 继续保持 list 只读 Frontmatter、get 才读正文、AbortSignal 穿透和 mtime 原始候选缓存。
- availableSkills 继续是 volatile 字段，只通过 settings.update 写入。
- 客户端继续只消费 form.state.value.availableSkills，不扫描目录。
- 所有外部资源继续由 ctx.effect 管理并返回清理函数。
- 不新建跨包公开 module；一个 adapter 不设新的 seam。

## Review Focus

- 空目录：删除最后一个技能后，理性使用者期待 availableSkills 变成空数组，而不是保留旧技能。
- 连续 watcher 事件：快速增删改时，理性使用者期待最终清单稳定为最新快照，而不是旧异步结果覆盖新结果。
- 卸载竞态：插件卸载后，理性使用者期待未完成发布不再写入 settings。
- 精简测试 Context：没有 ctx.get 时，只要注入的 settings 属性存在，理性使用者期待仍能发布清单和配置页面。
- 既有 DSH 契约：理性使用者期待 Provider 注册、单次 skills/change、客户端三字段开关语义全部保持。

### 任务 1：锁定目录清单发布行为

**文件：** 修改 tests/provider.test.mjs；测试通过 apply 的真实产物行为验证 Host 发布函数。

- [ ] 编写失败测试：验证初始清单发布、watch 后新增/删除更新、删除最后一项写入空数组，以及 settings 注入实例可用而 ctx.get 不可用。
- [ ] 运行 node --test tests/provider.test.mjs，预期新增断言失败。
- [ ] 提交测试变更。

### 任务 2：实现发布协作者与注入 seam

**文件：** 修改 src/cfbridge.ts；产物 lib/cfbridge.js、lib/cfbridge.d.ts。

- [ ] 让 publishSkillCatalog 接收已注入 settings，不再依赖 ctx.get 发现 settings。
- [ ] 允许 names 为空数组参与比较和 update。
- [ ] 在 skills/change 后重新计算并发布，采用串行 generation 保护，防止旧快照覆盖新快照。
- [ ] 让发布任务在 disposer 后失效，不产生迟到写入。
- [ ] 保持 settings.describe 与 settings.configure 的两个能力面分离。
- [ ] 运行 Provider 测试、类型检查和客户端类型检查。
- [ ] 提交实现与产物。

### 任务 3：更新项目记忆并完成门禁

**文件：** 修改 CLAUDE.md；验证 npm test、npm pack --dry-run。

- [ ] 记录 availableSkills 增量发布契约和生命周期约束。
- [ ] 串行运行完整综合门禁、打包预检。
- [ ] 检查工作区、提交最终改动。

## 成功标准

- watchSkills 开启时，技能目录增删会刷新 Provider 和 availableSkills。
- 清空目录会写入 availableSkills: []。
- 快速事件不会让旧发布覆盖新发布。
- settings 通过注入实例可用，不依赖 ctx.get 探测。
- npm test 全部通过，npm pack --dry-run 无冗余文件。
