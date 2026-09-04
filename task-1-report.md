状态：DONE

已完成 TypeScript 基座、依赖安装与 Provider 合同测试；实现代码在任务 2 中完成并已通过。

TDD RED：
- 命令：node --test tests/provider.test.mjs
- 结果：FAIL，ERR_MODULE_NOT_FOUND，缺少 lib/cfbridge.js。

TDD GREEN：
- 命令：npm run build
- 结果：退出码 0，生成 lib/cfbridge.js 与声明文件。
- 命令：npm run typecheck
- 结果：退出码 0。
- 命令：node --test tests/provider.test.mjs
- 结果：3/3 通过。

变更文件：package.json、package-lock.json、tsconfig.json、tsconfig.build.json、scripts/package.json、tests/provider.test.mjs、src/cfbridge.ts、lib/。

顾虑：当前仓库 package.json 切为 ESM，scripts/package.json 是为保留现有 CommonJS 脚本而增加的局部兼容声明，后续完整验证需覆盖全部脚本。
