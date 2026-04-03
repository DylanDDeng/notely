# Notely

A clean, focused Markdown writing app for macOS. Built with Electron + React, stored as local files — your notes stay yours.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey.svg)
![Electron](https://img.shields.io/badge/Electron-40.x-9fe2bf.svg)
![React](https://img.shields.io/badge/React-19.x-61dafb.svg)

## Features

### Live Markdown Editor
- WYSIWYG editing powered by [Milkdown](https://milkdown.dev/) (ProseMirror-based)
- Code blocks with syntax highlighting via CodeMirror 6
- GFM support: tables, task lists, strikethrough
- Auto-save with 800ms debounce

### Document Outline
- Floating outline rail on the right side, always visible while scrolling
- Hover to expand the full heading tree
- Click to navigate; active heading indicator follows your scroll position

### Quick Open
- `Cmd+P` to fuzzy-search notes by title, filename, or content
- Recent documents shown by default

### Export
- **PDF** — `Cmd+Shift+E`, with configurable page size, headers, and page numbers
- **PNG Image** — full-page screenshot export via menu bar

### Local-first Storage
- Notes stored as standard `.md` files wherever you choose to save them
- Existing YAML frontmatter is preserved and read when present
- Portable — move, sync, or version-control your notes however you like

### Appearance
- macOS-native vibrancy and hidden title bar
- Window opens only after content renders (no blank flash)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 40 + React 19 |
| Build | Vite 7 + TypeScript 5.9 |
| Editor | Milkdown 7 (ProseMirror) + CodeMirror 6 |
| Markdown | remark + remark-gfm + remark-html |
| Frontmatter | gray-matter |
| Icons | Lucide React |

## Getting Started

### Requirements
- Node.js >= 18
- npm >= 9
- macOS 10.15+

### Development

```bash
git clone https://github.com/DylanDDeng/notely.git
cd notes-app

npm install

# Start dev server + Electron
npm run electron:dev
```

### Build & Package

```bash
# Type-check, build, and package as dmg
npm run dist
```

Output goes to `release/`.

## Project Structure

```
notes-app/
├── electron/
│   ├── main.cjs              # Main process, IPC handlers, menu, export
│   └── preload.cjs            # Context bridge for renderer
├── src/
│   ├── components/
│   │   ├── Editor/            # Milkdown editor, code block view, outline
│   │   ├── QuickOpen/         # Cmd+P note search
│   ├── utils/                 # Note parsing, path helpers
│   ├── types/                 # TypeScript interfaces
│   ├── styles/                # Global CSS
│   ├── App.tsx                # Root component, state management
│   └── main.tsx               # Renderer entry
├── package.json
└── vite.config.ts
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+N` | New document (new window) |
| `Cmd+S` | Save |
| `Cmd+Shift+S` | Save As |
| `Cmd+P` | Quick Open |
| `Cmd+Shift+E` | Export PDF |
| `Cmd+Shift+L` | Toggle outline |
| `Cmd+O` | Open Markdown File |

## License

[MIT](./LICENSE)
