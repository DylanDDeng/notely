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
  provider: WechatAiProvider;
  apiKey: string;
  model: string;
  themeId: string;
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

export type WechatAiProvider = 'moonshot' | 'openrouter';
export type NoteHistorySource = 'save' | 'create' | 'rollback';

export interface NoteHistoryVersion {
  id: string;
  createdAt: string;
  source: NoteHistorySource;
  size: number;
  preview: string;
  label: string;
  pinned: boolean;
  fromVersionId?: string;
}

export interface ListNoteHistoryResult {
  success: boolean;
  versions?: NoteHistoryVersion[];
  error?: string;
}

export interface ReadNoteHistoryVersionResult {
  success: boolean;
  content?: string;
  error?: string;
}

export interface UpdateNoteHistoryVersionResult {
  success: boolean;
  version?: NoteHistoryVersion;
  error?: string;
}

export interface WechatAiConfig {
  provider: WechatAiProvider;
  apiKey: string;
  model: string;
}

export type GitSyncStatus = 'idle' | 'running' | 'success' | 'error' | 'conflict' | 'disabled' | 'skipped';
export type GitSyncReason = 'manual' | 'auto';

export interface GitSyncConfig {
  enabled: boolean;
  remoteUrl: string;
  branch: string;
  autoSyncEnabled: boolean;
  intervalMinutes: number;
  tokenConfigured: boolean;
  lastSyncAt: string | null;
  lastStatus: GitSyncStatus;
  lastMessage: string;
  lastConflictFiles?: string[];
}

export interface GitSyncSetupRequest {
  remoteUrl: string;
  branch?: string;
  token?: string;
  autoSyncEnabled?: boolean;
  intervalMinutes?: number;
}

export interface GitSyncSetupResult {
  success: boolean;
  status: GitSyncStatus;
  message: string;
  repoInitialized?: boolean;
  remoteConnected?: boolean;
  error?: string;
}

export interface GitSyncRunRequest {
  reason: GitSyncReason;
}

export interface GitSyncRunResult {
  success: boolean;
  status: GitSyncStatus;
  message: string;
  commitsCreated: number;
  pushed: boolean;
  pulled: boolean;
  conflictFiles: string[];
  error?: string;
}

export interface GitSyncUpdateSettingsRequest {
  enabled?: boolean;
  remoteUrl?: string;
  branch?: string;
  autoSyncEnabled?: boolean;
  intervalMinutes?: number;
}

export interface GitSyncConfigResult {
  success: boolean;
  config?: GitSyncConfig;
  error?: string;
}

export interface GitSyncCredentialClearResult {
  success: boolean;
  status: GitSyncStatus;
  message: string;
  error?: string;
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
  forceFilename?: string;
  title: string;
  content: string;
  tags: string[];
  date?: string;
  preserveModifiedAt?: boolean;
  historySource?: NoteHistorySource;
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
  saveNote: (data: { filename: string; content: string; preserveModifiedAt?: boolean; historySource?: NoteHistorySource }) => Promise<{ success: boolean; error?: string }>;
  createNote: (data: { filename: string; content: string }) => Promise<{ success: boolean; error?: string }>;
  deleteNote: (filename: string) => Promise<{ success: boolean; error?: string }>;
  listNoteHistory: (data: { filename: string; limit?: number }) => Promise<ListNoteHistoryResult>;
  readNoteHistoryVersion: (data: { filename: string; versionId: string }) => Promise<ReadNoteHistoryVersionResult>;
  updateNoteHistoryVersion: (data: { filename: string; versionId: string; label?: string; pinned?: boolean }) => Promise<UpdateNoteHistoryVersionResult>;
  
  // 设置相关
  selectDirectory: () => Promise<string | null>;
  
  // Shell
  openExternal: (url: string) => Promise<void>;
  writeClipboardText: (text: string) => Promise<WriteClipboardTextResult>;

  // Export
  exportNotePdf: (data: ExportNotePdfRequest) => Promise<ExportNotePdfResult>;

  // AI
  generateWechatHtmlWithAi: (data: GenerateWechatHtmlWithAiRequest) => Promise<GenerateWechatHtmlWithAiResult>;

  // Git Sync
  getGitSyncConfig: () => Promise<GitSyncConfigResult>;
  setupGitSync: (data: GitSyncSetupRequest) => Promise<GitSyncSetupResult>;
  runGitSync: (data: GitSyncRunRequest) => Promise<GitSyncRunResult>;
  updateGitSyncSettings: (data: GitSyncUpdateSettingsRequest) => Promise<GitSyncSetupResult>;
  clearGitSyncCredential: () => Promise<GitSyncCredentialClearResult>;
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
