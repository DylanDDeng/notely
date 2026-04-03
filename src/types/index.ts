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

export interface RawNote {
  id: string;
  filename: string;
  filepath: string;
  content: string;
  modifiedAt: string;
  createdAt: string;
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

export interface ExportImageOptions {
  includeTitle?: boolean;
  includeDate?: boolean;
  dateText?: string;
  fontFamily?: string;
  width?: number;
}

export interface ExportNoteImageRequest {
  title: string;
  html: string;
  options: ExportImageOptions;
  suggestedFileName: string;
}

export interface ExportNoteImageResult {
  success: boolean;
  canceled?: boolean;
  filePath?: string;
  error?: string;
}

export interface WriteClipboardTextResult {
  success: boolean;
  error?: string;
}

export interface ResolveLocalImageResult {
  success: boolean;
  dataUrl?: string;
  error?: string;
}

export interface EditorNote {
  id: string;
  filename?: string;
  filepath?: string;
  title: string;
  content: string;
  tags: string[];
  date?: string;
  createdAt: Date;
  modifiedAt: Date;
  isDraft?: boolean;
}

export interface SaveNoteData {
  id?: string;
  filename?: string;
  filepath?: string;
  forceFilename?: string;
  saveAs?: boolean;
  title: string;
  content: string;
  tags: string[];
  date?: string;
  preserveModifiedAt?: boolean;
  interactive?: boolean;
  isDraft?: boolean;
}

export interface SettingsMenuItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

export interface ElectronAPI {
  setStoragePath: (path: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  getAllNotes: () => Promise<RawNote[]>;
  saveNote: (data: { filename: string; content: string; preserveModifiedAt?: boolean }) => Promise<{ success: boolean; error?: string }>;
  saveNoteAs?: (data: { suggestedFilename: string; content: string }) => Promise<{ success: boolean; canceled?: boolean; filepath?: string; filename?: string; directory?: string; error?: string }>;
  deleteNote: (filename: string) => Promise<{ success: boolean; error?: string }>;
  selectDirectory: () => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
  writeClipboardText: (text: string) => Promise<WriteClipboardTextResult>;
  resolveLocalImage?: (filePath: string) => Promise<ResolveLocalImageResult>;
  exportNotePdf: (data: ExportNotePdfRequest) => Promise<ExportNotePdfResult>;
  exportNoteImage: (data: ExportNoteImageRequest) => Promise<ExportNoteImageResult>;
  onMenuAction: (callback: (action: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    queryLocalFonts?: () => Promise<Array<{ family?: string }>>;
    __notelyUnsavedState?: {
      dirty: boolean;
      title: string;
      isDraft: boolean;
      draftStorageKey?: string;
    };
    __notelySaveCurrent?: (interactive?: boolean) => Promise<boolean>;
  }
}
