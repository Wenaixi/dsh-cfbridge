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

## 关键一步：确认 bundle 真的被装载

**装了不等于生效。** 如果 cfbridge 只出现在 profile 的 `dependencies` 里，却不在 `dsh.profile.bundles` 中，补丁层根本不会加载 —— 表现为「插件列表里能看到它，但没有任何工具、也没有任何技能」，而且**不报任何错**。

安装后务必确认：

```powershell
Get-Content "$env:DSH_HOME\profiles\demo\package.json"
```

`dsh.profile.bundles` 里必须包含 `@wenaixi/cfbridge`（官方 `dsh plugin add` 通常会自动写入，但手工安装或从旧版本升级时需要补）：

```json
"dsh": {
  "profile": {
    "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@wenaixi/cfbridge"]
  }
}
```

改这个值**前先备份** `package.json` 与 `cordis.patch.yml`，改完重启 DSH 才会生效。

> 想用图形界面验收（插件页开关面板），还需要 `@deepseek-ai/dsh-web-app` 在 bundles 里，然后用 `dsh --profile demo --port <端口>` 打开 Web GUI。

如果 pnpm 阻止本地包的 prepare/build，在该独立 profile 的 pnpm 配置中允许本地构建脚本，再重新执行安装。

## 卸载验证

```powershell
npm run uninstall:bundle -- --profile demo --yes
dsh --profile demo --dump-config | Select-String 'cfbridge'   # 应无输出
```

`uninstall:bundle` 会移除依赖层、清理旧版 skill 软链残留，并验证层已消失。
