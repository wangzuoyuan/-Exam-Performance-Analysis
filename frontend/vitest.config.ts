import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// 最小配置：给 vitest 提供 tsconfig 的 `@/* -> ./src/*` 路径别名
// （jsdom 用例在文件头用 `// @vitest-environment jsdom` 声明，默认 node）。
export default defineConfig({
  esbuild: {
    // Next 源码不显式 import React（automatic JSX runtime），vitest 转换需对齐
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
