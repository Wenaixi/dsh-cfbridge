// 构建双面插件的浏览器半侧产物 lib/client.js。
//
// 背景：DSH 客户端只接受 CJS factory 形态（window.__ModuleLoader__.load({id, factory})），
// 这不是 tsc 能从 ESM/TS 直接产出的形态，所以 client 半侧由本脚本从 src/client.entry.ts
// 生成——全仓 lib/client.js 只有这一个来源，禁止第二处生成。
//
// 做法：调用 TypeScript 编译器 API 把源码转成 CommonJS 文本（不落盘），再包进 factory 外壳。
// 使用：npm run build（tsc 产物 + 本脚本），或单独 npm run build:client

const fs = require('fs')
const path = require('path')

const { ROOT } = require('./lib/fs')

const PKG = '@wenaixi/cfbridge'
const ENTRY = path.join(ROOT, 'src', 'client.entry.ts')
const OUT = path.join(ROOT, 'lib', 'client.js')

function compileToCjs(source, fileName) {
  // 惰性 require：本脚本只在构建期跑，不应把 typescript 变成运行时依赖。
  const ts = require('typescript')
  // transpileModule 不做类型检查与模块解析，React 由 factory 的 require 在浏览器里提供。
  // 这里只做语法级转译，因此不会因为缺少 @types/react 而失败。
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      removeComments: false,
    },
    fileName,
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error)
  if (errors.length > 0) {
    const text = errors
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))
      .join('\n')
    throw new Error('client 半侧转译失败:\n' + text)
  }
  return result.outputText
}

function main() {
  if (!fs.existsSync(ENTRY)) throw new Error('缺少客户端入口: ' + ENTRY)
  const source = fs.readFileSync(ENTRY, 'utf8')
  const body = compileToCjs(source, ENTRY)

  // 源码里 import 得到的是 Node 形态的 require 调用；在浏览器里由 __ModuleLoader__ 提供。
  const banner = [
    '// 由 scripts/build-client.js 从 src/client.entry.ts 生成，请勿手改。',
    'window.__ModuleLoader__.load({',
    '  id: ' + JSON.stringify(PKG) + ',',
    '  factory: (require) => {',
    '    var module = { exports: {} };',
    '    var exports = module.exports;',
    '    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
    '',
  ].join('\n')

  const footer = ['', '    return module.exports;', '  },', '});', ''].join('\n')

  const out = banner + body + footer
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, out, 'utf8')
  const kib = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1)
  console.log('[build-client] wrote lib/client.js (' + kib + ' KiB)')
}

main()
