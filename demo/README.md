# cfbridge 独立 Demo

这个目录用于验证本地 Bundle，不写入现有 web profile，也不替换当前 Web GUI。验证使用单独的 DSH_HOME 和 demo profile。仓库需先执行 `npm run build`，生成并提交 `lib/cfbridge.js`。

## PowerShell

在仓库根目录执行：

```powershell
$env:DSH_HOME = Join-Path $PWD '.demo-dsh-home'
dsh --profile demo --dump-default-config | Out-Null
dsh plugin --profile demo add link:$PWD
dsh --profile demo --dump-config | Select-String 'id: cfbridge|name: @wenaixi/cfbridge'
dsh --profile demo
```

预期配置中出现 `id: cfbridge` 与 `name: @wenaixi/cfbridge`，不出现旧 Skill 行或源码子路径。退出 demo 后可删除 `.demo-dsh-home`。

如果 pnpm 阻止本地包的 prepare/build，在该独立 profile 的 pnpm 配置中允许本地构建脚本，再重新执行安装。
