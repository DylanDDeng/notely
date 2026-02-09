/**
 * 笔记数据类型
 */
export interface Note {
  id: string;
  filename: string;
  filepath: string;
  content: string;
  title: string;
  date: string;
  tags: string[];
  contentBody: string;
  rawContent: string;
  type?: string;
  kanban?: KanbanFrontmatter;
  modifiedAt: Date;
  createdAt: Date;
}

/**
 * 原始笔记数据（从 Electron 主进程返回）
 */
export interface RawNote {
  id: string;
  filename: string;
  filepath: string;
  content: string;
  modifiedAt: Date;
  createdAt: Date;
}

/**
 * 笔记 Frontmatter
 */
export interface NoteFrontmatter {
  title: string;
  date: string;
  tags: string[];
  type?: string;
  kanban?: KanbanFrontmatter;
}

export interface KanbanFrontmatter {
  doneColumns?: string[];
}

export interface ExportPdfOptions {
  pageSize: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  includeHeader: boolean;
  includeTitle: boolean;
  includeDate: boolean;
  includePageNumbers: boolean;
  dateText?: string;
  fontFamily?: string;
}

export interface ExportNotePdfRequest {
  title: string;
  html: string;
  options: ExportPdfOptions;
  suggestedFileName: string;
}

export interface ExportNotePdfResult {
  success: boolean;
  canceled?: boolean;
  filePath?: string;
  error?: string;
}

export interface GenerateWechatHtmlWithAiRequest {
  markdown: string;
  title?: string;
  apiKey: string;
  model: string;
}

export interface GenerateWechatHtmlWithAiResult {
  success: boolean;
  html?: string;
  error?: string;
}

export interface WriteClipboardTextResult {
  success: boolean;
  error?: string;
}

export interface WechatAiConfig {
  apiKey: string;
  model: string;
}

/**
 * 编辑器中的笔记数据
 */
export interface EditorNote {
  id: string;
  filename: string;
  title: string;
  content: string;
  tags: string[];
  date?: string;
  createdAt: Date;
  modifiedAt: Date;
}

/**
 * 保存笔记的请求数据
 */
export interface SaveNoteData {
  id?: string;
  filename?: string;
  title: string;
  content: string;
  tags: string[];
  date?: string;
  preserveModifiedAt?: boolean;
}

/**
 * 文件夹项
 */
export interface FolderItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  count?: number | null;
}

/**
 * 设置项
 */
export interface SettingsMenuItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

/**
 * Electron API 接口
 */
export interface ElectronAPI {
  // 存储路径相关
  getStoragePath: () => Promise<string>;
  setStoragePath: (path: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  
  // 笔记相关
  getAllNotes: () => Promise<RawNote[]>;
  readNote: (filename: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  saveNote: (data: { filename: string; content: string; preserveModifiedAt?: boolean }) => Promise<{ success: boolean; error?: string }>;
  createNote: (data: { filename: string; content: string }) => Promise<{ success: boolean; error?: string }>;
  deleteNote: (filename: string) => Promise<{ success: boolean; error?: string }>;
  
  // 设置相关
  selectDirectory: () => Promise<string | null>;
  
  // Shell
  openExternal: (url: string) => Promise<void>;
  writeClipboardText: (text: string) => Promise<WriteClipboardTextResult>;

  // Export
  exportNotePdf: (data: ExportNotePdfRequest) => Promise<ExportNotePdfResult>;

  // AI
  generateWechatHtmlWithAi: (data: GenerateWechatHtmlWithAiRequest) => Promise<GenerateWechatHtmlWithAiResult>;
}

/**
 * 应用设置
 */
export interface AppSettings {
  launchAtStartup: boolean;
  showInMenuBar: boolean;
  autoSaveInterval: number;
  saveLocation: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
