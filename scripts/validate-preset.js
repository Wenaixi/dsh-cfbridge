// cfbridge v0.5.0 以单一 Provider Bundle 取代历史 agent preset。
// 旧的 validate:preset 静态校验已被 validate:bundle 完全覆盖，且同时检查
// 当前主入口（cordis.patch.yml）与 bundle 必需结构。

const log = (msg) => console.log(`[WARN] ${msg}`)
log('validate:preset is deprecated since v0.5.0.')
log('Use `npm run validate:bundle` instead — it covers the same checks plus the new bundle layer.')
// 本 shim 不转发到 validate:bundle：仅打印指引并以非零码退出，
// 让仍在调用旧命令的 CI 明确失败，而不是误以为校验已通过。
log('This shim does not forward to validate:bundle; it exits non-zero on purpose.')
process.exit(1)
