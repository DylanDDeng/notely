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

export interface RawNote {
  id: string;
  filename: string;
  filepath: string;
  content: string;
  modifiedAt: string;
  createdAt: string;
}

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

export interface AppSettings {
  launchAtStartup: boolean;
  showInMenuBar: boolean;
  autoSaveInterval: number;
  saveLocation: string;
}

export type GitSyncStatus = 'idle' | 'running' | 'success' | 'error' | 'conflict' | 'disabled' | 'skipped';

export interface GitSyncConfig {
  enabled: boolean;
  remoteUrl: string;
  branch: string;
  autoSyncEnabled: boolean;
  intervalMinutes: number;
  tokenConfigured: boolean;
  lastStatus?: GitSyncStatus;
  lastMessage?: string;
  lastSyncAt?: string | null;
  lastConflictFiles?: string[];
}

export interface GitSyncSetupRequest {
  remoteUrl: string;
  branch: string;
  token?: string;
  autoSyncEnabled?: boolean;
  intervalMinutes?: number;
}

export interface GitSyncRunRequest {
  reason?: 'manual' | 'startup' | 'interval';
}

export interface GitSyncUpdateSettingsRequest {
  remoteUrl?: string;
  branch?: string;
  autoSyncEnabled?: boolean;
  intervalMinutes?: number;
}

export interface GitSyncSetupResult {
  success: boolean;
  message?: string;
  config?: GitSyncConfig | null;
  error?: string;
}

export interface GitSyncRunResult {
  success: boolean;
  message?: string;
  conflictFiles?: string[];
  error?: string;
}

export interface GitSyncCredentialClearResult {
  success: boolean;
  message?: string;
  error?: string;
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

export interface WriteClipboardTextResult {
  success: boolean;
  error?: string;
}

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

export interface SaveNoteData {
  id?: string;
  filename?: string;
  forceFilename?: string;
  title: string;
  content: string;
  tags: string[];
  date?: string;
  preserveModifiedAt?: boolean;
}

export interface SettingsMenuItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

export interface ElectronAPI {
  getStoragePath: () => Promise<string>;
  setStoragePath: (path: string) => Promise<{ success: boolean; path?: string; error?: string }>;

  getAllNotes: () => Promise<RawNote[]>;
  readNote: (filename: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  saveNote: (data: { filename: string; content: string; preserveModifiedAt?: boolean }) => Promise<{ success: boolean; error?: string }>;
  createNote: (data: { filename: string; content: string }) => Promise<{ success: boolean; error?: string }>;
  deleteNote: (filename: string) => Promise<{ success: boolean; error?: string }>;

  selectDirectory: () => Promise<string | null>;

  openExternal: (url: string) => Promise<void>;
  writeClipboardText: (text: string) => Promise<WriteClipboardTextResult>;
  exportNotePdf: (data: ExportNotePdfRequest) => Promise<ExportNotePdfResult>;
  exportNotePDF?: (data: ExportNotePdfRequest) => Promise<ExportNotePdfResult>;
  generateWechatHtmlWithAi?: (data: unknown) => Promise<unknown>;
  getGitSyncConfig?: () => Promise<GitSyncConfig | null>;
  setupGitSync?: (data: GitSyncSetupRequest) => Promise<GitSyncSetupResult>;
  runGitSync?: (data: GitSyncRunRequest) => Promise<GitSyncRunResult>;
  updateGitSyncSettings?: (data: GitSyncUpdateSettingsRequest) => Promise<GitSyncSetupResult>;
  clearGitSyncCredential?: () => Promise<GitSyncCredentialClearResult>;
  onMenuAction: (callback: (action: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    queryLocalFonts?: () => Promise<Array<{ family?: string }>>;
  }
}
