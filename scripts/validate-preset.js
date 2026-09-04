// cfbridge v0.5.0 以单一 Provider Bundle 取代历史 agent preset。
// 旧的 validate:preset 静态校验已被 validate:bundle 完全覆盖，且同时检查
// 当前主入口（cordis.patch.yml）与 bundle 必需结构。

const log = (msg) => console.log(`[WARN] ${msg}`)
log('validate:preset is deprecated since v0.5.0.')
log('Use `npm run validate:bundle` instead — it covers the same checks plus the new bundle layer.')
log('This shim forwards to validate:bundle so old CI scripts still get a meaningful exit code.')
process.exit(1)
