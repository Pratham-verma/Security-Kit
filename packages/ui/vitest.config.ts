import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@seckit/core/engine': src('../core/src/engine.ts'),
      '@seckit/core/browser': src('../core/src/browser.ts'),
      '@seckit/core': src('../core/src/index.ts'),
      '@seckit/cli/lib': src('../cli/src/lib.ts'),
    },
  },
  test: { testTimeout: 120_000 },
});
