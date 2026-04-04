/**
 * Notely Theme System
 * 
 * Supports:
 * - Built-in themes: Light, Dark, Solarized, Nord, Dracula, GitHub, One Dark
 * - Custom themes: User-defined themes with full color customization
 * - Theme persistence: Saved to localStorage
 * - Import/Export: Share themes as JSON
 */

export type ThemeId = 
  | 'light' 
  | 'dark' 
  | 'system'
  | 'solarized-light'
  | 'solarized-dark'
  | 'nord'
  | 'dracula'
  | 'github-light'
  | 'github-dark'
  | 'one-dark';

export interface ThemeColors {
  // Canvas & Background
  '--surface-canvas': string;
  '--surface-paper': string;
  '--surface-paper-strong': string;
  '--surface-content': string;
  '--surface-content-strong': string;
  
  // Text
  '--text-primary': string;
  '--text-secondary': string;
  '--text-tertiary': string;
  '--surface-ink': string;
  
  // Accents
  '--accent-primary': string;
  '--accent-primary-strong': string;
  '--tag-accent-primary': string;
  '--tag-accent-strong': string;
  '--ui-gradient-start': string;
  '--ui-gradient-end': string;
  
  // Borders & Lines
  '--surface-line': string;
  '--glass-border': string;
  '--glass-border-strong': string;
  
  // Glass effects
  '--glass-bg': string;
  '--glass-bg-strong': string;
  '--glass-bg-soft': string;
  '--glass-shadow': string;
  
  // Editor specific
  '--editor-bg': string;
  '--editor-surface': string;
  '--editor-surface-subtle': string;
  '--editor-text': string;
  '--editor-text-muted': string;
  '--editor-border': string;
  '--editor-border-subtle': string;
  '--editor-accent': string;
  '--editor-selection': string;
  '--editor-code-surface': string;
  '--editor-code-border': string;
  '--editor-code-label': string;
  '--editor-strong-color': string;
  '--editor-link-color': string;
  '--editor-inline-code-bg': string;
  '--editor-inline-code-color': string;
  '--editor-blockquote-border': string;
  '--editor-table-border': string;
  '--editor-outline-bg': string;
  '--editor-outline-text': string;
  '--editor-outline-border': string;
  '--editor-outline-active-bg': string;
  '--editor-outline-active-text': string;
  
  // Scrollbar
  '--scrollbar-thumb': string;
  '--scrollbar-thumb-hover': string;
}

export interface Theme {
  id: ThemeId | string;
  name: string;
  description?: string;
  isBuiltIn: boolean;
  isDark: boolean;
  colors: Partial<ThemeColors>;
  font?: {
    family?: string;
    size?: number;
    lineHeight?: number;
  };
}

// Built-in Themes
export const builtInThemes: Theme[] = [
  {
    id: 'light',
    name: 'Light',
    description: 'Clean and crisp light theme',
    isBuiltIn: true,
    isDark: false,
    colors: {
      '--surface-canvas': '#f6f2ea',
      '--surface-paper': 'rgba(255, 252, 247, 0.94)',
      '--surface-paper-strong': '#fffdf9',
      '--surface-content': '#ffffff',
      '--surface-content-strong': '#ffffff',
      '--text-primary': '#111827',
      '--text-secondary': '#4b5563',
      '--text-tertiary': '#6b7280',
      '--surface-ink': '#2d3644',
      '--accent-primary': '#111827',
      '--accent-primary-strong': '#000000',
      '--tag-accent-primary': '#111827',
      '--tag-accent-strong': '#000000',
      '--ui-gradient-start': '#111827',
      '--ui-gradient-end': '#111827',
      '--surface-line': 'rgba(120, 102, 76, 0.12)',
      '--glass-border': '#e5e7eb',
      '--glass-border-strong': '#d1d5db',
      '--glass-bg': '#ffffff',
      '--glass-bg-strong': '#ffffff',
      '--glass-bg-soft': '#ffffff',
      '--glass-shadow': '0 1px 2px rgba(15, 23, 42, 0.04)',
      '--editor-bg': '#f5f4ef',
      '--editor-surface': '#fbf8f2',
      '--editor-surface-subtle': '#f1ece3',
      '--editor-text': '#141413',
      '--editor-text-muted': '#87867f',
      '--editor-border': '#ddd5c7',
      '--editor-border-subtle': '#e8e1d4',
      '--editor-accent': '#d97757',
      '--editor-selection': 'rgba(217, 119, 87, 0.22)',
      '--editor-code-surface': '#fcfbf8',
      '--editor-code-border': '#ddd7cc',
      '--editor-code-label': '#6b5c4c',
      '--editor-strong-color': 'rgb(193, 95, 60)',
      '--editor-link-color': '#8b5e3c',
      '--editor-inline-code-bg': '#f4efe8',
      '--editor-inline-code-color': '#a34832',
      '--editor-blockquote-border': 'rgba(217, 119, 87, 0.45)',
      '--editor-table-border': '#ddd5c7',
      '--editor-outline-bg': '#f0eee6',
      '--editor-outline-text': 'rgba(67, 73, 79, 0.86)',
      '--editor-outline-border': 'rgba(120, 102, 76, 0.12)',
      '--editor-outline-active-bg': 'rgba(255, 252, 247, 0.92)',
      '--editor-outline-active-text': '#1f2732',
      '--scrollbar-thumb': 'rgba(148, 136, 121, 0.38)',
      '--scrollbar-thumb-hover': 'rgba(112, 102, 89, 0.48)',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Easy on the eyes dark theme',
    isBuiltIn: true,
    isDark: true,
    colors: {
      '--surface-canvas': '#0f0f0f',
      '--surface-paper': 'rgba(28, 28, 30, 0.94)',
      '--surface-paper-strong': '#1c1c1e',
      '--surface-content': '#1c1c1e',
      '--surface-content-strong': '#2c2c2e',
      '--text-primary': '#f5f5f7',
      '--text-secondary': '#a1a1a6',
      '--text-tertiary': '#8e8e93',
      '--surface-ink': '#e5e5e7',
      '--accent-primary': '#0a84ff',
      '--accent-primary-strong': '#409cff',
      '--tag-accent-primary': '#0a84ff',
      '--tag-accent-strong': '#409cff',
      '--ui-gradient-start': '#0a84ff',
      '--ui-gradient-end': '#409cff',
      '--surface-line': 'rgba(120, 120, 128, 0.24)',
      '--glass-border': 'rgba(120, 120, 128, 0.32)',
      '--glass-border-strong': 'rgba(120, 120, 128, 0.48)',
      '--glass-bg': 'rgba(28, 28, 30, 0.85)',
      '--glass-bg-strong': '#1c1c1e',
      '--glass-bg-soft': 'rgba(44, 44, 46, 0.9)',
      '--glass-shadow': '0 1px 2px rgba(0, 0, 0, 0.3)',
      '--editor-bg': '#121212',
      '--editor-surface': '#1e1e1e',
      '--editor-surface-subtle': '#2a2a2a',
      '--editor-text': '#e8e8e8',
      '--editor-text-muted': '#8e8e93',
      '--editor-border': '#3a3a3c',
      '--editor-border-subtle': '#2c2c2e',
      '--editor-accent': '#0a84ff',
      '--editor-selection': 'rgba(10, 132, 255, 0.3)',
      '--editor-code-surface': '#1e1e1e',
      '--editor-code-border': '#3a3a3c',
      '--editor-code-label': '#a1a1a6',
      '--editor-strong-color': '#ff9f0a',
      '--editor-link-color': '#64d2ff',
      '--editor-inline-code-bg': '#2c2c2e',
      '--editor-inline-code-color': '#ff9f0a',
      '--editor-blockquote-border': 'rgba(10, 132, 255, 0.5)',
      '--editor-table-border': '#3a3a3c',
      '--editor-outline-bg': '#1c1c1e',
      '--editor-outline-text': 'rgba(235, 235, 245, 0.6)',
      '--editor-outline-border': 'rgba(120, 120, 128, 0.24)',
      '--editor-outline-active-bg': 'rgba(10, 132, 255, 0.15)',
      '--editor-outline-active-text': '#f5f5f7',
      '--scrollbar-thumb': 'rgba(120, 120, 128, 0.4)',
      '--scrollbar-thumb-hover': 'rgba(120, 120, 128, 0.6)',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    description: 'Low-contrast light theme by Ethan Schoonover',
    isBuiltIn: true,
    isDark: false,
    colors: {
      '--surface-canvas': '#fdf6e3',
      '--surface-paper': 'rgba(253, 246, 227, 0.95)',
      '--surface-paper-strong': '#eee8d5',
      '--surface-content': '#fdf6e3',
      '--surface-content-strong': '#eee8d5',
      '--text-primary': '#073642',
      '--text-secondary': '#586e75',
      '--text-tertiary': '#657b83',
      '--surface-ink': '#002b36',
      '--accent-primary': '#268bd2',
      '--accent-primary-strong': '#2aa198',
      '--tag-accent-primary': '#268bd2',
      '--tag-accent-strong': '#2aa198',
      '--ui-gradient-start': '#268bd2',
      '--ui-gradient-end': '#2aa198',
      '--surface-line': 'rgba(88, 110, 117, 0.2)',
      '--glass-border': '#93a1a1',
      '--glass-border-strong': '#839496',
      '--glass-bg': '#fdf6e3',
      '--glass-bg-strong': '#eee8d5',
      '--glass-bg-soft': '#fdf6e3',
      '--glass-shadow': '0 1px 2px rgba(0, 43, 54, 0.1)',
      '--editor-bg': '#fdf6e3',
      '--editor-surface': '#f7f1e3',
      '--editor-surface-subtle': '#eee8d5',
      '--editor-text': '#073642',
      '--editor-text-muted': '#657b83',
      '--editor-border': '#93a1a1',
      '--editor-border-subtle': '#eee8d5',
      '--editor-accent': '#268bd2',
      '--editor-selection': 'rgba(38, 139, 210, 0.25)',
      '--editor-code-surface': '#f7f1e3',
      '--editor-code-border': '#93a1a1',
      '--editor-code-label': '#586e75',
      '--editor-strong-color': '#cb4b16',
      '--editor-link-color': '#268bd2',
      '--editor-inline-code-bg': '#eee8d5',
      '--editor-inline-code-color': '#dc322f',
      '--editor-blockquote-border': 'rgba(38, 139, 210, 0.5)',
      '--editor-table-border': '#93a1a1',
      '--editor-outline-bg': '#eee8d5',
      '--editor-outline-text': '#586e75',
      '--editor-outline-border': '#93a1a1',
      '--editor-outline-active-bg': '#fdf6e3',
      '--editor-outline-active-text': '#073642',
      '--scrollbar-thumb': 'rgba(88, 110, 117, 0.4)',
      '--scrollbar-thumb-hover': 'rgba(88, 110, 117, 0.6)',
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    description: 'Low-contrast dark theme by Ethan Schoonover',
    isBuiltIn: true,
    isDark: true,
    colors: {
      '--surface-canvas': '#002b36',
      '--surface-paper': 'rgba(7, 54, 66, 0.95)',
      '--surface-paper-strong': '#073642',
      '--surface-content': '#073642',
      '--surface-content-strong': '#002b36',
      '--text-primary': '#eee8d5',
      '--text-secondary': '#93a1a1',
      '--text-tertiary': '#839496',
      '--surface-ink': '#fdf6e3',
      '--accent-primary': '#268bd2',
      '--accent-primary-strong': '#2aa198',
      '--tag-accent-primary': '#268bd2',
      '--tag-accent-strong': '#2aa198',
      '--ui-gradient-start': '#268bd2',
      '--ui-gradient-end': '#2aa198',
      '--surface-line': 'rgba(147, 161, 161, 0.2)',
      '--glass-border': '#586e75',
      '--glass-border-strong': '#657b83',
      '--glass-bg': '#073642',
      '--glass-bg-strong': '#002b36',
      '--glass-bg-soft': '#073642',
      '--glass-shadow': '0 1px 2px rgba(0, 0, 0, 0.3)',
      '--editor-bg': '#002b36',
      '--editor-surface': '#073642',
      '--editor-surface-subtle': '#0a4a5c',
      '--editor-text': '#eee8d5',
      '--editor-text-muted': '#839496',
      '--editor-border': '#586e75',
      '--editor-border-subtle': '#073642',
      '--editor-accent': '#268bd2',
      '--editor-selection': 'rgba(38, 139, 210, 0.3)',
      '--editor-code-surface': '#073642',
      '--editor-code-border': '#586e75',
      '--editor-code-label': '#93a1a1',
      '--editor-strong-color': '#cb4b16',
      '--editor-link-color': '#268bd2',
      '--editor-inline-code-bg': '#073642',
      '--editor-inline-code-color': '#dc322f',
      '--editor-blockquote-border': 'rgba(38, 139, 210, 0.5)',
      '--editor-table-border': '#586e75',
      '--editor-outline-bg': '#073642',
      '--editor-outline-text': '#93a1a1',
      '--editor-outline-border': '#586e75',
      '--editor-outline-active-bg': '#002b36',
      '--editor-outline-active-text': '#eee8d5',
      '--scrollbar-thumb': 'rgba(147, 161, 161, 0.4)',
      '--scrollbar-thumb-hover': 'rgba(147, 161, 161, 0.6)',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    description: 'Arctic-inspired color palette',
    isBuiltIn: true,
    isDark: true,
    colors: {
      '--surface-canvas': '#2e3440',
      '--surface-paper': 'rgba(59, 66, 82, 0.95)',
      '--surface-paper-strong': '#3b4252',
      '--surface-content': '#3b4252',
      '--surface-content-strong': '#2e3440',
      '--text-primary': '#eceff4',
      '--text-secondary': '#d8dee9',
      '--text-tertiary': '#81a1c1',
      '--surface-ink': '#e5e9f0',
      '--accent-primary': '#88c0d0',
      '--accent-primary-strong': '#81a1c1',
      '--tag-accent-primary': '#88c0d0',
      '--tag-accent-strong': '#81a1c1',
      '--ui-gradient-start': '#88c0d0',
      '--ui-gradient-end': '#81a1c1',
      '--surface-line': 'rgba(129, 161, 193, 0.2)',
      '--glass-border': '#4c566a',
      '--glass-border-strong': '#434c5e',
      '--glass-bg': '#3b4252',
      '--glass-bg-strong': '#2e3440',
      '--glass-bg-soft': '#434c5e',
      '--glass-shadow': '0 1px 2px rgba(0, 0, 0, 0.3)',
      '--editor-bg': '#2e3440',
      '--editor-surface': '#3b4252',
      '--editor-surface-subtle': '#434c5e',
      '--editor-text': '#eceff4',
      '--editor-text-muted': '#81a1c1',
      '--editor-border': '#4c566a',
      '--editor-border-subtle': '#434c5e',
      '--editor-accent': '#88c0d0',
      '--editor-selection': 'rgba(136, 192, 208, 0.3)',
      '--editor-code-surface': '#3b4252',
      '--editor-code-border': '#4c566a',
      '--editor-code-label': '#81a1c1',
      '--editor-strong-color': '#bf616a',
      '--editor-link-color': '#88c0d0',
      '--editor-inline-code-bg': '#434c5e',
      '--editor-inline-code-color': '#ebcb8b',
      '--editor-blockquote-border': 'rgba(136, 192, 208, 0.5)',
      '--editor-table-border': '#4c566a',
      '--editor-outline-bg': '#3b4252',
      '--editor-outline-text': '#81a1c1',
      '--editor-outline-border': '#4c566a',
      '--editor-outline-active-bg': '#434c5e',
      '--editor-outline-active-text': '#eceff4',
      '--scrollbar-thumb': 'rgba(129, 161, 193, 0.4)',
      '--scrollbar-thumb-hover': 'rgba(129, 161, 193, 0.6)',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    description: 'A dark theme for dark mode lovers',
    isBuiltIn: true,
    isDark: true,
    colors: {
      '--surface-canvas': '#282a36',
      '--surface-paper': 'rgba(68, 71, 90, 0.95)',
      '--surface-paper-strong': '#44475a',
      '--surface-content': '#44475a',
      '--surface-content-strong': '#282a36',
      '--text-primary': '#f8f8f2',
      '--text-secondary': '#f8f8f2',
      '--text-tertiary': '#6272a4',
      '--surface-ink': '#f8f8f2',
      '--accent-primary': '#bd93f9',
      '--accent-primary-strong': '#ff79c6',
      '--tag-accent-primary': '#bd93f9',
      '--tag-accent-strong': '#ff79c6',
      '--ui-gradient-start': '#bd93f9',
      '--ui-gradient-end': '#ff79c6',
      '--surface-line': 'rgba(98, 114, 164, 0.3)',
      '--glass-border': '#6272a4',
      '--glass-border-strong': '#44475a',
      '--glass-bg': '#44475a',
      '--glass-bg-strong': '#282a36',
      '--glass-bg-soft': '#6272a4',
      '--glass-shadow': '0 1px 2px rgba(0, 0, 0, 0.4)',
      '--editor-bg': '#282a36',
      '--editor-surface': '#44475a',
      '--editor-surface-subtle': '#6272a4',
      '--editor-text': '#f8f8f2',
      '--editor-text-muted': '#6272a4',
      '--editor-border': '#6272a4',
      '--editor-border-subtle': '#44475a',
      '--editor-accent': '#bd93f9',
      '--editor-selection': 'rgba(189, 147, 249, 0.3)',
      '--editor-code-surface': '#44475a',
      '--editor-code-border': '#6272a4',
      '--editor-code-label': '#6272a4',
      '--editor-strong-color': '#ff79c6',
      '--editor-link-color': '#8be9fd',
      '--editor-inline-code-bg': '#44475a',
      '--editor-inline-code-color': '#f1fa8c',
      '--editor-blockquote-border': 'rgba(189, 147, 249, 0.5)',
      '--editor-table-border': '#6272a4',
      '--editor-outline-bg': '#44475a',
      '--editor-outline-text': '#6272a4',
      '--editor-outline-border': '#6272a4',
      '--editor-outline-active-bg': '#6272a4',
      '--editor-outline-active-text': '#f8f8f2',
      '--scrollbar-thumb': 'rgba(98, 114, 164, 0.5)',
      '--scrollbar-thumb-hover': 'rgba(98, 114, 164, 0.7)',
    },
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    description: 'GitHub-inspired light theme',
    isBuiltIn: true,
    isDark: false,
    colors: {
      '--surface-canvas': '#ffffff',
      '--surface-paper': 'rgba(255, 255, 255, 0.95)',
      '--surface-paper-strong': '#f6f8fa',
      '--surface-content': '#ffffff',
      '--surface-content-strong': '#f6f8fa',
      '--text-primary': '#1f2328',
      '--text-secondary': '#656d76',
      '--text-tertiary': '#8c959f',
      '--surface-ink': '#1f2328',
      '--accent-primary': '#0969da',
      '--accent-primary-strong': '#8250df',
      '--tag-accent-primary': '#0969da',
      '--tag-accent-strong': '#8250df',
      '--ui-gradient-start': '#0969da',
      '--ui-gradient-end': '#8250df',
      '--surface-line': 'rgba(208, 215, 222, 0.5)',
      '--glass-border': '#d0d7de',
      '--glass-border-strong': '#b7bdc4',
      '--glass-bg': '#ffffff',
      '--glass-bg-strong': '#f6f8fa',
      '--glass-bg-soft': '#ffffff',
      '--glass-shadow': '0 1px 2px rgba(31, 35, 40, 0.04)',
      '--editor-bg': '#ffffff',
      '--editor-surface': '#f6f8fa',
      '--editor-surface-subtle': '#eaeef2',
      '--editor-text': '#1f2328',
      '--editor-text-muted': '#656d76',
      '--editor-border': '#d0d7de',
      '--editor-border-subtle': '#eaeef2',
      '--editor-accent': '#0969da',
      '--editor-selection': 'rgba(9, 105, 218, 0.2)',
      '--editor-code-surface': '#f6f8fa',
      '--editor-code-border': '#d0d7de',
      '--editor-code-label': '#656d76',
      '--editor-strong-color': '#cf222e',
      '--editor-link-color': '#0969da',
      '--editor-inline-code-bg': '#f6f8fa',
      '--editor-inline-code-color': '#cf222e',
      '--editor-blockquote-border': 'rgba(9, 105, 218, 0.4)',
      '--editor-table-border': '#d0d7de',
      '--editor-outline-bg': '#f6f8fa',
      '--editor-outline-text': '#656d76',
      '--editor-outline-border': '#d0d7de',
      '--editor-outline-active-bg': '#eaeef2',
      '--editor-outline-active-text': '#1f2328',
      '--scrollbar-thumb': 'rgba(101, 109, 118, 0.4)',
      '--scrollbar-thumb-hover': 'rgba(101, 109, 118, 0.6)',
    },
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    description: 'GitHub-inspired dark theme',
    isBuiltIn: true,
    isDark: true,
    colors: {
      '--surface-canvas': '#0d1117',
      '--surface-paper': 'rgba(22, 27, 34, 0.95)',
      '--surface-paper-strong': '#161b22',
      '--surface-content': '#161b22',
      '--surface-content-strong': '#0d1117',
      '--text-primary': '#e6edf3',
      '--text-secondary': '#7d8590',
      '--text-tertiary': '#6e7681',
      '--surface-ink': '#e6edf3',
      '--accent-primary': '#2f81f7',
      '--accent-primary-strong': '#a371f7',
      '--tag-accent-primary': '#2f81f7',
      '--tag-accent-strong': '#a371f7',
      '--ui-gradient-start': '#2f81f7',
      '--ui-gradient-end': '#a371f7',
      '--surface-line': 'rgba(48, 54, 61, 0.5)',
      '--glass-border': '#30363d',
      '--glass-border-strong': '#3d444d',
      '--glass-bg': '#161b22',
      '--glass-bg-strong': '#0d1117',
      '--glass-bg-soft': '#21262d',
      '--glass-shadow': '0 1px 2px rgba(0, 0, 0, 0.4)',
      '--editor-bg': '#0d1117',
      '--editor-surface': '#161b22',
      '--editor-surface-subtle': '#21262d',
      '--editor-text': '#e6edf3',
      '--editor-text-muted': '#7d8590',
      '--editor-border': '#30363d',
      '--editor-border-subtle': '#21262d',
      '--editor-accent': '#2f81f7',
      '--editor-selection': 'rgba(47, 129, 247, 0.3)',
      '--editor-code-surface': '#161b22',
      '--editor-code-border': '#30363d',
      '--editor-code-label': '#7d8590',
      '--editor-strong-color': '#ff7b72',
      '--editor-link-color': '#2f81f7',
      '--editor-inline-code-bg': '#161b22',
      '--editor-inline-code-color': '#ff7b72',
      '--editor-blockquote-border': 'rgba(47, 129, 247, 0.5)',
      '--editor-table-border': '#30363d',
      '--editor-outline-bg': '#161b22',
      '--editor-outline-text': '#7d8590',
      '--editor-outline-border': '#30363d',
      '--editor-outline-active-bg': '#21262d',
      '--editor-outline-active-text': '#e6edf3',
      '--scrollbar-thumb': 'rgba(110, 118, 129, 0.4)',
      '--scrollbar-thumb-hover': 'rgba(110, 118, 129, 0.6)',
    },
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    description: 'Atom One Dark theme',
    isBuiltIn: true,
    isDark: true,
    colors: {
      '--surface-canvas': '#282c34',
      '--surface-paper': 'rgba(40, 44, 52, 0.95)',
      '--surface-paper-strong': '#21252b',
      '--surface-content': '#282c34',
      '--surface-content-strong': '#21252b',
      '--text-primary': '#abb2bf',
      '--text-secondary': '#828997',
      '--text-tertiary': '#5c6370',
      '--surface-ink': '#abb2bf',
      '--accent-primary': '#61afef',
      '--accent-primary-strong': '#c678dd',
      '--tag-accent-primary': '#61afef',
      '--tag-accent-strong': '#c678dd',
      '--ui-gradient-start': '#61afef',
      '--ui-gradient-end': '#c678dd',
      '--surface-line': 'rgba(92, 99, 112, 0.3)',
      '--glass-border': '#3e4451',
      '--glass-border-strong': '#4b5263',
      '--glass-bg': '#282c34',
      '--glass-bg-strong': '#21252b',
      '--glass-bg-soft': '#3e4451',
      '--glass-shadow': '0 1px 2px rgba(0, 0, 0, 0.4)',
      '--editor-bg': '#282c34',
      '--editor-surface': '#21252b',
      '--editor-surface-subtle': '#2c313a',
      '--editor-text': '#abb2bf',
      '--editor-text-muted': '#5c6370',
      '--editor-border': '#3e4451',
      '--editor-border-subtle': '#2c313a',
      '--editor-accent': '#61afef',
      '--editor-selection': 'rgba(97, 175, 239, 0.3)',
      '--editor-code-surface': '#21252b',
      '--editor-code-border': '#3e4451',
      '--editor-code-label': '#5c6370',
      '--editor-strong-color': '#e06c75',
      '--editor-link-color': '#61afef',
      '--editor-inline-code-bg': '#21252b',
      '--editor-inline-code-color': '#e5c07b',
      '--editor-blockquote-border': 'rgba(97, 175, 239, 0.5)',
      '--editor-table-border': '#3e4451',
      '--editor-outline-bg': '#21252b',
      '--editor-outline-text': '#5c6370',
      '--editor-outline-border': '#3e4451',
      '--editor-outline-active-bg': '#2c313a',
      '--editor-outline-active-text': '#abb2bf',
      '--scrollbar-thumb': 'rgba(92, 99, 112, 0.5)',
      '--scrollbar-thumb-hover': 'rgba(92, 99, 112, 0.7)',
    },
  },
];

// Storage keys
const CUSTOM_THEMES_KEY = 'notely:customThemes';
const ACTIVE_THEME_KEY = 'notely:activeTheme';

// Get all available themes (built-in + custom)
export function getAllThemes(): Theme[] {
  const customThemes = getCustomThemes();
  return [...builtInThemes, ...customThemes];
}

// Get custom themes from localStorage
export function getCustomThemes(): Theme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Theme[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Save custom themes to localStorage
export function saveCustomThemes(themes: Theme[]): void {
  try {
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
  } catch {
    // ignore
  }
}

// Add a custom theme
export function addCustomTheme(theme: Theme): boolean {
  const customThemes = getCustomThemes();
  if (customThemes.some((t) => t.id === theme.id)) {
    return false;
  }
  customThemes.push({ ...theme, isBuiltIn: false });
  saveCustomThemes(customThemes);
  return true;
}

// Update a custom theme
export function updateCustomTheme(themeId: string, updates: Partial<Theme>): boolean {
  const customThemes = getCustomThemes();
  const index = customThemes.findIndex((t) => t.id === themeId);
  if (index === -1) return false;
  customThemes[index] = { ...customThemes[index], ...updates };
  saveCustomThemes(customThemes);
  return true;
}

// Delete a custom theme
export function deleteCustomTheme(themeId: string): boolean {
  const customThemes = getCustomThemes();
  const filtered = customThemes.filter((t) => t.id !== themeId);
  if (filtered.length === customThemes.length) return false;
  saveCustomThemes(filtered);
  return true;
}

// Get the active theme ID
export function getActiveThemeId(): string {
  try {
    const raw = localStorage.getItem(ACTIVE_THEME_KEY);
    return raw || 'light';
  } catch {
    return 'light';
  }
}

// Set the active theme ID
export function setActiveThemeId(themeId: string): void {
  try {
    localStorage.setItem(ACTIVE_THEME_KEY, themeId);
  } catch {
    // ignore
  }
}

// Get a theme by ID
export function getThemeById(themeId: string): Theme | undefined {
  return getAllThemes().find((t) => t.id === themeId);
}

// Apply theme to document
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  
  // Apply all color variables
  Object.entries(theme.colors).forEach(([key, value]) => {
    if (value) {
      root.style.setProperty(key, value);
    }
  });
  
  // Apply font if specified
  if (theme.font?.family) {
    root.style.setProperty('--app-font-family', theme.font.family);
  }
  
  // Set data attribute for dark mode detection
  root.setAttribute('data-theme', theme.id);
  root.setAttribute('data-theme-dark', String(theme.isDark));
  
  // Store active theme
  setActiveThemeId(theme.id);
}

// Apply system theme preference
export function applySystemTheme(): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = prefersDark 
    ? builtInThemes.find((t) => t.id === 'dark')! 
    : builtInThemes.find((t) => t.id === 'light')!;
  applyTheme(theme);
}

// Initialize theme on app start
export function initializeTheme(): void {
  const activeThemeId = getActiveThemeId();
  
  if (activeThemeId === 'system') {
    applySystemTheme();
    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      applySystemTheme();
    });
  } else {
    const theme = getThemeById(activeThemeId);
    if (theme) {
      applyTheme(theme);
    } else {
      // Fallback to light theme
      applyTheme(builtInThemes[0]);
    }
  }
}

// Export theme to JSON
export function exportThemeToJson(theme: Theme): string {
  return JSON.stringify(theme, null, 2);
}

// Import theme from JSON
export function importThemeFromJson(json: string): Theme | null {
  try {
    const parsed = JSON.parse(json) as Theme;
    // Validate required fields
    if (!parsed.id || !parsed.name || !parsed.colors) {
      return null;
    }
    return {
      ...parsed,
      isBuiltIn: false,
    };
  } catch {
    return null;
  }
}

// Create a custom theme template
export function createCustomThemeTemplate(name: string, baseThemeId: string = 'light'): Theme {
  const baseTheme = getThemeById(baseThemeId) || builtInThemes[0];
  return {
    id: `custom-${Date.now()}`,
    name,
    description: 'Custom theme',
    isBuiltIn: false,
    isDark: baseTheme.isDark,
    colors: { ...baseTheme.colors },
  };
}

// Duplicate an existing theme
export function duplicateTheme(themeId: string, newName: string): Theme | null {
  const sourceTheme = getThemeById(themeId);
  if (!sourceTheme) return null;
  
  return {
    ...sourceTheme,
    id: `custom-${Date.now()}`,
    name: newName,
    description: `Customized from ${sourceTheme.name}`,
    isBuiltIn: false,
  };
}
