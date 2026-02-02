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
  getAllNotes: () => Promise<RawNote[]>;
  readNote: (filename: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  saveNote: (data: { filename: string; content: string }) => Promise<{ success: boolean; error?: string }>;
  createNote: (data: { filename: string; content: string }) => Promise<{ success: boolean; error?: string }>;
  deleteNote: (filename: string) => Promise<{ success: boolean; error?: string }>;
  selectDirectory: () => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
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
