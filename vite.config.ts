import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const manualChunks = (id: string) => {
  const normalizedId = id.replace(/\\/g, '/')
  if (!normalizedId.includes('/node_modules/')) return

  if (
    normalizedId.includes('/node_modules/react/') ||
    normalizedId.includes('/node_modules/react-dom/')
  ) {
    return 'react-vendor'
  }

  if (
    normalizedId.includes('/node_modules/@milkdown/kit/core/')
  ) {
    return 'milkdown-core'
  }

  if (normalizedId.includes('/node_modules/@milkdown/kit/preset/')) {
    return 'milkdown-preset'
  }

  if (normalizedId.includes('/node_modules/@milkdown/kit/plugin/')) {
    return 'milkdown-plugin'
  }

  if (
    normalizedId.includes('/node_modules/@milkdown/kit/prose/') ||
    normalizedId.includes('/node_modules/prosemirror-')
  ) {
    return 'milkdown-prose'
  }

  if (
    normalizedId.includes('/node_modules/@milkdown/utils/') ||
    normalizedId.includes('/node_modules/@milkdown/') ||
    normalizedId.includes('/node_modules/crelt/')
  ) {
    return 'milkdown-utils'
  }

  if (
    normalizedId.includes('/node_modules/@codemirror/state/') ||
    normalizedId.includes('/node_modules/@codemirror/view/')
  ) {
    return 'codemirror-core'
  }

  if (
    normalizedId.includes('/node_modules/@codemirror/language-data/')
  ) {
    return 'codemirror-language-data'
  }

  if (normalizedId.includes('/node_modules/@codemirror/lang-markdown/')) {
    return 'codemirror-markdown'
  }

  if (normalizedId.includes('/node_modules/@codemirror/language/')) {
    return 'codemirror-language'
  }

  if (normalizedId.includes('/node_modules/@lezer/')) {
    const lezerMatch = normalizedId.match(/\/node_modules\/@lezer\/([^/]+)\//)
    return lezerMatch ? `lezer-${lezerMatch[1]}` : 'lezer-vendor'
  }

  if (normalizedId.includes('/node_modules/@uiw/')) {
    return 'codemirror-ui'
  }

  if (
    normalizedId.includes('/node_modules/remark') ||
    normalizedId.includes('/node_modules/unified') ||
    normalizedId.includes('/node_modules/gray-matter') ||
    normalizedId.includes('/node_modules/js-yaml') ||
    normalizedId.includes('/node_modules/micromark') ||
    normalizedId.includes('/node_modules/mdast') ||
    normalizedId.includes('/node_modules/hast') ||
    normalizedId.includes('/node_modules/unist') ||
    normalizedId.includes('/node_modules/vfile')
  ) {
    return 'markdown-vendor'
  }

  if (normalizedId.includes('/node_modules/lucide-react/')) {
    return 'icons-vendor'
  }

  if (normalizedId.includes('/node_modules/buffer/')) {
    return 'buffer-vendor'
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer',
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
})
