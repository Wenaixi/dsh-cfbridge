// 浏览器半侧的外部类型桩（仅供 tsc 类型检查，不参与运行、不进包）。
//
// 为什么需要它：src/client.entry.ts 里 import 的 react 与
// @deepseek-ai/dsh-client-ui-primitives 都由 DSH 客户端的 __ModuleLoader__
// 在运行时注入，本地 node_modules 里并没有这两个包（这是刻意的运行时契约）。
// 为了让 tsc 能检查这个 404 行文件自身的逻辑，又不引入 React 等真实依赖，
// 这里按"实际用到的面"声明最小类型。
//
// 边界：本文件只保证 client.entry.ts 内部逻辑类型正确；
// 它不去验证真实 React 的完整 API 形状。如果哪天用到了这里没声明的成员，
// tsc 会报错 —— 那是提示需要同步扩充本文件，而不是应当关掉检查。

declare module 'react' {
  export type ReactElement = unknown
  export type ReactNode = unknown

  export function createElement(
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ): ReactElement

  export function useState<S>(initial: S | (() => S)): [S, (next: S | ((prev: S) => S)) => void]

  export const Fragment: unique symbol
}

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  export const Switch: (props: Record<string, unknown>) => unknown
  export const StateDot: (props: Record<string, unknown>) => unknown
}
