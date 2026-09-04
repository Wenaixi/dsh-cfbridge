# SDD ledger — plan: docs/superpowers/plans/2026-08-23-cfbridge-provider-plan.md

Ruling: 按用户已明确的“直接干，自己验证”执行本地实现，并保留每个小模块独立提交；原因是用户已授权从设计进入实现，且不涉及 push、publish 或现有 web profile 写入；若错的代价是需要回退本地提交，不会影响远程仓库。
Ruling: 使用当前仓库 main 工作区而不是新建替代 web 目录；原因是用户要求修改当前项目并自行验证，独立性由后续临时 DSH_HOME/demo profile 保证；若错的代价是工作树隔离性较弱，但所有变更仍可由本地提交逐项回退。
Ruling: scripts/ 下增加局部 package.json 保持既有 CommonJS 检查脚本；原因是根 package.json 切到 ESM 后，现有 require 脚本必须继续可执行；若错的代价是多一个维护文件，后续可在脚本迁移到 ESM 后删除。

Task 1: complete (commits ce0befa..bb86a16, Provider 基座与 TypeScript 构建已提交；任务 2 实现合并在同一提交)
TDD RED: node --test tests/provider.test.mjs -> ERR_MODULE_NOT_FOUND: lib/cfbridge.js
TDD GREEN: npm run build、npm run typecheck、node --test tests/provider.test.mjs -> 3/3 passed
Review: pending task-level review for commits ce0befa..bb86a16

当前实现提交：
- ce0befa docs: specify cfbridge 0.5.0 provider architecture
- d0dc989 docs: add cfbridge provider implementation plan
- bb86a16 feat: add cfbridge TypeScript skill provider
