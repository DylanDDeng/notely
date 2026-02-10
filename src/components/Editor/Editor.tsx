import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from 'react';
import { EditorView } from '@codemirror/view';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Copy, FileDown, MoreHorizontal, Pin, Star, X } from 'lucide-react';
import { getTagColor } from '../../utils/noteUtils';
import type { EditorNote, ExportNotePdfRequest, ExportPdfOptions, SaveNoteData } from '../../types';
import MarkdownLiveEditor from './MarkdownLiveEditor';
import './Editor.css';

interface EditorProps {
  note: EditorNote | null;
  onSave: (note: SaveNoteData) => Promise<void>;
  isLoading: boolean;
  wechatAiApiKey: string;
  wechatAiModel: string;
}

type EditorMode = 'live' | 'source' | 'preview';
type WechatLayoutTheme = {
  id: string;
  name: string;
  description: string;
};
type WechatPreviewState = {
  html: string;
  themeId: string;
  sourceContent: string;
};

const VIDEO_SOURCE_PATTERN = /\.(mp4|webm|ogg|mov|m4v)(?:$|[?#])/i;
const WECHAT_LAYOUT_THEMES: WechatLayoutTheme[] = [
  {
    id: 'digital-tools-guide',
    name: 'Digital Tools Guide',
    description: 'Clean white theme with structured section badges and lightweight cards.',
  },
  {
    id: 'minimal-linework-black-red',
    name: 'Minimal Linework (Black/Red)',
    description: 'Minimal black-red layout with thin separators and generous whitespace.',
  },
];
const DEFAULT_WECHAT_LAYOUT_THEME_ID = WECHAT_LAYOUT_THEMES[0]?.id ?? 'digital-tools-guide';
const getWechatLayoutThemeById = (themeId: string): WechatLayoutTheme =>
  WECHAT_LAYOUT_THEMES.find((theme) => theme.id === themeId) ?? WECHAT_LAYOUT_THEMES[0];

const isVideoSource = (url: string): boolean => VIDEO_SOURCE_PATTERN.test(url.trim());

const transformMediaEmbeds = (html: string): string => {
  if (!html || !html.includes('<img')) return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const images = Array.from(doc.querySelectorAll('img'));
  if (images.length === 0) return html;

  let changed = false;
  for (const image of images) {
    const src = image.getAttribute('src')?.trim() ?? '';
    if (!src || !isVideoSource(src)) continue;

    const video = doc.createElement('video');
    video.setAttribute('src', src);
    video.setAttribute('controls', '');
    video.setAttribute('preload', 'metadata');
    video.setAttribute('playsinline', '');
    video.className = 'editor-preview-video';
    const alt = image.getAttribute('alt')?.trim();
    if (alt) video.setAttribute('title', alt);

    image.replaceWith(video);
    changed = true;
  }

  return changed ? doc.body.innerHTML : html;
};

const buildWechatPreviewSrcDoc = (html: string): string => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <base target="_blank" />
    <style>
      :root { color-scheme: light; }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
      }
      body {
        min-height: 100vh;
      }
      img {
        max-width: 100%;
        height: auto;
      }
    </style>
  </head>
  <body>${html}</body>
</html>`;

function Editor({ note, onSave, isLoading, wechatAiApiKey, wechatAiModel }: EditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [htmlContent, setHtmlContent] = useState('');
  const [wechatPreview, setWechatPreview] = useState<WechatPreviewState | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('live');
  const [hasChanges, setHasChanges] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<{ id: string; filename: string } | null>(null);
  const draftChangeTokenRef = useRef(0);
  const draftCacheRef = useRef<
    Record<
      string,
      { title: string; content: string; tags: string[]; date?: string; token: number; filename: string; preserveModifiedAt?: boolean }
    >
  >({});
  const wechatPreviewCacheRef = useRef<Record<string, WechatPreviewState>>({});
  const editorContentRef = useRef<HTMLDivElement>(null);
  const liveEditorRef = useRef<EditorView | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const textOffsetMapRef = useRef<number[]>([]);
  const textOffsetMapSourceRef = useRef<string>('');
  const pendingSelectionRef = useRef<{ index?: number; scrollTop: number } | null>(null);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SAVE_DEBOUNCE_MS = 800;

  const [isWechatPreviewPanelOpen, setIsWechatPreviewPanelOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isThemePickerOpen, setIsThemePickerOpen] = useState(false);
  const [selectedWechatThemeId, setSelectedWechatThemeId] = useState(DEFAULT_WECHAT_LAYOUT_THEME_ID);
  const [isExporting, setIsExporting] = useState(false);
  const [isGeneratingWechatHtml, setIsGeneratingWechatHtml] = useState(false);
  const [exportOptions, setExportOptions] = useState<ExportPdfOptions>({
    pageSize: 'A4',
    orientation: 'portrait',
    includeHeader: false,
    includeTitle: true,
    includeDate: true,
    includePageNumbers: true,
  });
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const isPreviewMode = editorMode === 'preview';
  const isSourceMode = editorMode === 'source';
  const isEditing = editorMode === 'live' || editorMode === 'source';

  // Lightbox keyboard controls
  useEffect(() => {
    if (!lightboxSrc) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxSrc(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [lightboxSrc]);

  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target && moreMenuRef.current?.contains(target)) return;
      setIsMoreMenuOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [isMoreMenuOpen]);

  useEffect(() => {
    setIsMoreMenuOpen(false);
    setIsExportOpen(false);
    setIsThemePickerOpen(false);
  }, [note?.id]);

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 5200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const clearSaveDebounce = useCallback(() => {
    if (!saveDebounceRef.current) return;
    clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = null;
  }, []);

  const flushSaveForNote = useCallback(async (noteId: string, filename: string) => {
    clearSaveDebounce();

    if (saveInFlightRef.current) {
      pendingSaveRef.current = { id: noteId, filename };
      return;
    }

    const entry = draftCacheRef.current[noteId];
    if (!entry) return;

    saveInFlightRef.current = true;
    const token = entry.token;

    try {
      await onSave({
        id: noteId,
        filename,
        title: entry.title,
        content: entry.content,
        tags: entry.tags,
        date: entry.date,
        preserveModifiedAt: entry.preserveModifiedAt,
      });

      const stillSame = draftCacheRef.current[noteId]?.token === token;
      if (stillSame) {
        delete draftCacheRef.current[noteId];
        if (note?.id === noteId) {
          setHasChanges(false);
        }
      }
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      saveInFlightRef.current = false;
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (pending) {
        await flushSaveForNote(pending.id, pending.filename);
      }
    }
  }, [clearSaveDebounce, onSave, note?.id]);

  const scheduleSave = useCallback(() => {
    if (!note) return;
    clearSaveDebounce();
    saveDebounceRef.current = setTimeout(() => {
      void flushSaveForNote(note.id, note.filename);
    }, SAVE_DEBOUNCE_MS);
  }, [clearSaveDebounce, flushSaveForNote, note]);

  // 加载笔记（并在切换时 flush 未保存的草稿）
  useEffect(() => {
    if (note) {
      const cachedWechatPreview = wechatPreviewCacheRef.current[note.id] ?? null;
      setWechatPreview(cachedWechatPreview);
      setIsWechatPreviewPanelOpen(Boolean(cachedWechatPreview));
      const cached = draftCacheRef.current[note.id];
      if (cached) {
        setTitle(cached.title || 'Untitled');
        setContent(cached.content || '');
        setTags(cached.tags || []);
        setHasChanges(true);
        setLightboxSrc(null);
        renderMarkdown(cached.content || '');
      } else {
        setTitle(note.title || 'Untitled');
        setContent(note.content || '');
        setTags(note.tags || []);
        setHasChanges(false);
        setLightboxSrc(null);
        renderMarkdown(note.content || '');
      }
    } else {
      setTitle('');
      setContent('');
      setTags([]);
      setHtmlContent('');
      setWechatPreview(null);
      setIsWechatPreviewPanelOpen(false);
      setHasChanges(false);
      setLightboxSrc(null);
    }

    return () => {
      if (!note) return;
      void flushSaveForNote(note.id, note.filename);
    };
  }, [flushSaveForNote, note?.id]);

  const scrollLiveEditorToPosition = useCallback((index: number) => {
    const view = liveEditorRef.current;
    if (!view) return;

    const pos = Math.max(0, Math.min(index, view.state.doc.length));
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    });
    view.focus();
  }, []);

  const applyPendingSelectionToLiveEditor = useCallback(() => {
    const pending = pendingSelectionRef.current;
    if (!pending) return;
    const view = liveEditorRef.current;
    if (!view) return;

    if (typeof pending.index === 'number') {
      scrollLiveEditorToPosition(pending.index);
    } else {
      view.scrollDOM.scrollTop = pending.scrollTop;
      view.focus();
    }
    pendingSelectionRef.current = null;
  }, [scrollLiveEditorToPosition]);

  // 渲染 Markdown
  const renderMarkdown = useCallback(async (text: string) => {
    try {
      const result = await remark()
        .use(remarkGfm)
        .use(remarkHtml)
        .process(text);
      setHtmlContent(transformMediaEmbeds(String(result.value)));
      return true;
    } catch (err) {
      console.error('Failed to render markdown:', err);
      return false;
    }
  }, []);

  const updateTextOffsetMap = (markdown: string) => {
    try {
      const tree = remark().use(remarkGfm).parse(markdown) as any;
      const offsets: number[] = [];

      const addOffsets = (value: string, startOffset: number | null | undefined) => {
        if (!value || typeof startOffset !== 'number') return;
        for (let i = 0; i < value.length; i += 1) {
          offsets.push(startOffset + i);
        }
      };

      const findValueStart = (node: any) => {
        const start = node?.position?.start?.offset;
        const end = node?.position?.end?.offset;
        if (typeof start !== 'number' || typeof end !== 'number') return null;
        const slice = markdown.slice(start, end);
        const idx = typeof node.value === 'string' ? slice.indexOf(node.value) : -1;
        if (idx >= 0) return start + idx;
        return start;
      };

      const visit = (node: any) => {
        if (!node) return;
        if (node.type === 'text') {
          addOffsets(node.value, node.position?.start?.offset);
          return;
        }
        if (node.type === 'inlineCode' || node.type === 'code') {
          addOffsets(node.value || '', findValueStart(node));
          return;
        }
        if (Array.isArray(node.children)) {
          node.children.forEach(visit);
        }
      };

      visit(tree);
      textOffsetMapRef.current = offsets;
      textOffsetMapSourceRef.current = markdown;
    } catch (err) {
      textOffsetMapRef.current = [];
      textOffsetMapSourceRef.current = markdown;
    }
  };

  const ensureTextOffsetMap = useCallback((markdown: string) => {
    if (textOffsetMapSourceRef.current === markdown) return;
    updateTextOffsetMap(markdown);
  }, []);

  // 自动保存
  // 处理内容变化
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setHasChanges(true);
    if (note) {
      draftChangeTokenRef.current += 1;
      draftCacheRef.current[note.id] = {
        title,
        content: newContent,
        tags,
        date: note.date,
        token: draftChangeTokenRef.current,
        filename: note.filename,
        preserveModifiedAt: false,
      };
      scheduleSave();
    }
  };

  // 处理标题变化
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    setHasChanges(true);
    if (note) {
      draftChangeTokenRef.current += 1;
      draftCacheRef.current[note.id] = {
        title: newTitle,
        content,
        tags,
        date: note.date,
        token: draftChangeTokenRef.current,
        filename: note.filename,
        preserveModifiedAt: false,
      };
      scheduleSave();
    }
  };

  // 处理标签输入
  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
      e.preventDefault();
      const newTag = e.currentTarget.value.trim();
      if (!tags.includes(newTag)) {
        const nextTags = [...tags, newTag];
        setTags(nextTags);
        setHasChanges(true);
        if (note) {
          draftChangeTokenRef.current += 1;
          draftCacheRef.current[note.id] = {
            title,
            content,
            tags: nextTags,
            date: note.date,
            token: draftChangeTokenRef.current,
            filename: note.filename,
            preserveModifiedAt: false,
          };
          scheduleSave();
        }
      }
      e.currentTarget.value = '';
    }
  };

  // 删除标签
  const removeTag = (tagToRemove: string) => {
    const nextTags = tags.filter(tag => tag !== tagToRemove);
    setTags(nextTags);
    setHasChanges(true);
    if (note) {
      draftChangeTokenRef.current += 1;
      draftCacheRef.current[note.id] = {
        title,
        content,
        tags: nextTags,
        date: note.date,
        token: draftChangeTokenRef.current,
        filename: note.filename,
        preserveModifiedAt: false,
      };
      scheduleSave();
    }
  };

  const togglePinned = useCallback(() => {
    if (!note) return;

    const existingDraft = draftCacheRef.current[note.id];
    const preserveModifiedAt = existingDraft ? Boolean(existingDraft.preserveModifiedAt) : true;
    const nextTags = tags.includes('pinned') ? tags.filter((tag) => tag !== 'pinned') : [...tags, 'pinned'];
    setTags(nextTags);
    setHasChanges(true);

    draftChangeTokenRef.current += 1;
    draftCacheRef.current[note.id] = {
      title,
      content,
      tags: nextTags,
      date: note.date,
      token: draftChangeTokenRef.current,
      filename: note.filename,
      preserveModifiedAt,
    };

    void flushSaveForNote(note.id, note.filename);
  }, [content, flushSaveForNote, note, tags, title]);

  const toggleFavorite = useCallback(() => {
    if (!note) return;

    const existingDraft = draftCacheRef.current[note.id];
    const preserveModifiedAt = existingDraft ? Boolean(existingDraft.preserveModifiedAt) : true;
    const nextTags = tags.includes('favorite') ? tags.filter((tag) => tag !== 'favorite') : [...tags, 'favorite'];
    setTags(nextTags);
    setHasChanges(true);

    draftChangeTokenRef.current += 1;
    draftCacheRef.current[note.id] = {
      title,
      content,
      tags: nextTags,
      date: note.date,
      token: draftChangeTokenRef.current,
      filename: note.filename,
      preserveModifiedAt,
    };

    void flushSaveForNote(note.id, note.filename);
  }, [content, flushSaveForNote, note, tags, title]);

  useEffect(() => {
    if (!isEditing) return;
    if (!pendingSelectionRef.current) return;

    requestAnimationFrame(() => {
      applyPendingSelectionToLiveEditor();
    });
  }, [applyPendingSelectionToLiveEditor, content, isEditing]);

  useEffect(() => {
    if (!isPreviewMode) return;
    const pendingScroll = pendingScrollRestoreRef.current;
    if (pendingScroll === null) return;
    const container = editorContentRef.current;
    if (!container) return;

    let cancelled = false;
    let raf1 = 0;
    let raf2 = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const apply = () => {
      if (cancelled) return;
      const maxScrollTop = container.scrollHeight - container.clientHeight;
      const next = Math.min(maxScrollTop, Math.max(0, pendingScroll));
      container.scrollTop = next;
    };

    const stop = () => {
      if (cancelled) return;
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (settleTimer) clearTimeout(settleTimer);
      container.removeEventListener('wheel', onUserIntent);
      container.removeEventListener('touchmove', onUserIntent);
      container.removeEventListener('pointerdown', onUserIntent);
      pendingScrollRestoreRef.current = null;
    };

    const onUserIntent = () => stop();

    container.addEventListener('wheel', onUserIntent, { passive: true });
    container.addEventListener('touchmove', onUserIntent, { passive: true });
    container.addEventListener('pointerdown', onUserIntent, { passive: true });

    raf1 = requestAnimationFrame(() => {
      apply();
      raf2 = requestAnimationFrame(() => apply());
    });

    // Final short settle pass for delayed layout shifts, then release control.
    settleTimer = setTimeout(() => {
      apply();
      stop();
    }, 180);

    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      container.removeEventListener('wheel', onUserIntent);
      container.removeEventListener('touchmove', onUserIntent);
      container.removeEventListener('pointerdown', onUserIntent);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [htmlContent, isPreviewMode]);

  const switchToPreview = useCallback(async () => {
    pendingScrollRestoreRef.current = liveEditorRef.current?.scrollDOM.scrollTop ?? editorContentRef.current?.scrollTop ?? 0;
    await renderMarkdown(content);
    setEditorMode('preview');
  }, [content, renderMarkdown]);

  const switchToEditMode = useCallback((mode: 'live' | 'source') => {
    if (isPreviewMode) {
      pendingSelectionRef.current = { index: undefined, scrollTop: editorContentRef.current?.scrollTop ?? 0 };
    }
    setEditorMode(mode);
  }, [isPreviewMode]);

  useEffect(() => {
    if (!isEditing) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void switchToPreview();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isEditing, switchToPreview]);

  const sanitizePdfFileName = useCallback((value: string): string => {
    const trimmed = value.trim();
    const base = trimmed || 'Untitled';
    return base
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 80)
      .trim();
  }, []);

  const copyTextToClipboard = useCallback(async (text: string): Promise<boolean> => {
    const copyViaNativeClipboard = async (): Promise<boolean> => {
      if (typeof window.electronAPI.writeClipboardText !== 'function') return false;
      try {
        const result = await window.electronAPI.writeClipboardText(text);
        return Boolean(result?.success);
      } catch {
        return false;
      }
    };

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // continue to fallbacks
    }

    if (await copyViaNativeClipboard()) {
      return true;
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (ok) return true;
    } catch {
      // continue to final fallback
    }

    return copyViaNativeClipboard();
  }, []);

  const copyMarkdownSource = useCallback(async () => {
    const ok = await copyTextToClipboard(content);
    if (!ok) {
      showToast('error', 'Failed to copy markdown');
      return;
    }
    showToast('success', 'Markdown copied');
    setIsMoreMenuOpen(false);
  }, [content, copyTextToClipboard, showToast]);

  const generateWechatHtmlWithAi = useCallback(async (themeId: string) => {
    const apiKey = wechatAiApiKey.trim();
    const model = wechatAiModel.trim();
    const theme = getWechatLayoutThemeById(themeId);

    if (!apiKey || !model) {
      showToast('error', 'Set Moonshot API key and model in Settings > Editor > WeChat Layout Themes first');
      return;
    }

    const markdown = content.trim();
    if (!markdown) {
      showToast('error', 'Current note is empty');
      return;
    }

    if (isGeneratingWechatHtml) return;
    setIsGeneratingWechatHtml(true);
    showToast('info', `Generating WeChat layout (${theme.name})...`);

    try {
      if (typeof window.electronAPI.generateWechatHtmlWithAi !== 'function') {
        throw new Error('WeChat layout channel is unavailable. Please restart the app.');
      }

      const result = await window.electronAPI.generateWechatHtmlWithAi({
        markdown,
        title: title.trim() || undefined,
        apiKey,
        model,
        themeId: theme.id,
      });

      if (!result.success || !result.html) {
        throw new Error(result.error || 'Failed to generate WeChat layout');
      }

      const previewState: WechatPreviewState = {
        html: result.html,
        themeId: theme.id,
        sourceContent: content,
      };
      if (note) {
        wechatPreviewCacheRef.current[note.id] = previewState;
      }
      setWechatPreview(previewState);
      setIsWechatPreviewPanelOpen(true);
      setIsMoreMenuOpen(false);
      setIsThemePickerOpen(false);

      const ok = await copyTextToClipboard(result.html);
      if (!ok) {
        showToast('error', `Generated layout (${theme.name}), but failed to copy`);
        return;
      }

      showToast('success', `Generated and copied (${theme.name})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/No handler registered for ['"]wechat:generateHtmlWithAi['"]/i.test(message)) {
        showToast('error', 'Main process is outdated. Restart Notely and try again.');
      } else {
        showToast('error', message || 'Failed to generate WeChat layout');
      }
    } finally {
      setIsGeneratingWechatHtml(false);
    }
  }, [content, copyTextToClipboard, isGeneratingWechatHtml, note, showToast, title, wechatAiApiKey, wechatAiModel]);

  const exportCurrentNoteToPdf = useCallback(async () => {
    if (!note) return;
    if (isExporting) return;

    setIsExporting(true);
    try {
      await flushSaveForNote(note.id, note.filename);

      const result = await remark()
        .use(remarkGfm)
        .use(remarkHtml)
        .process(content);
      const bodyHtml = String(result.value);

      const now = new Date();
      const dateText = note?.modifiedAt
        ? format(new Date(note.modifiedAt), "MMM d, yyyy 'at' h:mm a")
        : format(now, "MMM d, yyyy 'at' h:mm a");
      const fontFamily = window.getComputedStyle(document.documentElement).getPropertyValue('--app-font-family').trim();

      const safeTitle = title.trim() || 'Untitled';
      const fileDate = note?.modifiedAt ? new Date(note.modifiedAt) : now;
      const suggestedFileName = `${sanitizePdfFileName(safeTitle)}-${fileDate.toISOString().slice(0, 10)}.pdf`;

      const request: ExportNotePdfRequest = {
        title: safeTitle,
        html: bodyHtml,
        options: {
          ...exportOptions,
          dateText,
          fontFamily,
        },
        suggestedFileName,
      };

      const exportResult = await window.electronAPI.exportNotePdf(request);
      if (exportResult.canceled) return;

      if (!exportResult.success) {
        throw new Error(exportResult.error || 'Failed to export PDF');
      }

      showToast('success', 'PDF exported');
      setIsExportOpen(false);
      setIsMoreMenuOpen(false);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  }, [content, exportOptions, flushSaveForNote, isExporting, note, sanitizePdfFileName, showToast, title]);

  const getPlainTextOffsetFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const previewEl = previewRef.current;
    if (!previewEl) return null;

    const caretRange =
      (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null })
        .caretRangeFromPoint?.(e.clientX, e.clientY) ?? null;

    if (!caretRange || caretRange.startContainer.nodeType !== Node.TEXT_NODE) return null;

    const targetNode = caretRange.startContainer as Text;
    const targetOffset = caretRange.startOffset;

    const walker = document.createTreeWalker(previewEl, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.textContent) return NodeFilter.FILTER_REJECT;
        if (node.textContent.trim() === '' && node.parentElement === previewEl) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let offset = 0;
    let current = walker.nextNode();
    while (current) {
      if (current === targetNode) {
        return offset + Math.min(targetOffset, current.textContent?.length ?? 0);
      }
      offset += current.textContent?.length ?? 0;
      current = walker.nextNode();
    }
    return offset;
  };

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = editorContentRef.current;
    if (
      container &&
      e.target === e.currentTarget &&
      container.scrollHeight > container.clientHeight
    ) {
      const rect = container.getBoundingClientRect();
      const scrollbarHitWidth = 18;
      if (e.clientX >= rect.right - scrollbarHitWidth) {
        return;
      }
    }

    const target = e.target as HTMLElement | null;
    if (!target) {
      pendingSelectionRef.current = { index: undefined, scrollTop: editorContentRef.current?.scrollTop ?? 0 };
      setEditorMode('live');
      return;
    }

    if (target.closest('video')) {
      return;
    }

    // Images: open lightbox
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement;
      if (img.src) {
        setLightboxSrc(img.src);
        return;
      }
    }

    // Links: open in default browser
    const link = target.closest('a') as HTMLAnchorElement | null;
    if (link?.href) {
      e.preventDefault();
      window.electronAPI.openExternal(link.href);
      return;
    }

    const scrollTop = editorContentRef.current?.scrollTop ?? 0;
    const plainTextOffset = getPlainTextOffsetFromEvent(e);
    ensureTextOffsetMap(content);
    const map = textOffsetMapRef.current;
    let index: number | undefined;
    if (plainTextOffset !== null && map.length > 0) {
      const mappedIndex = map[Math.min(plainTextOffset, map.length - 1)] ?? 0;
      index = Math.max(0, Math.min(mappedIndex, content.length));
    }
    pendingSelectionRef.current = { index, scrollTop };

    // Preview click always returns to live mode.
    setEditorMode('live');
  };

  if (isLoading) {
    return (
      <div className="editor">
        <div className="editor-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="editor">
        <div className="editor-empty">
          <p>Select a note to view</p>
        </div>
      </div>
    );
  }

  const isPinned = tags.includes('pinned');
  const isFavorite = tags.includes('favorite');
  const mainTag = tags.find(tag => !['favorite', 'archive', 'trash', 'pinned'].includes(tag));
  const displayTags = tags.filter(tag => !['favorite', 'archive', 'trash', 'pinned'].includes(tag));
  const wechatTheme = wechatPreview ? getWechatLayoutThemeById(wechatPreview.themeId) : null;
  const isWechatPreviewStale = Boolean(wechatPreview && wechatPreview.sourceContent !== content);
  const wechatPreviewSrcDoc = wechatPreview ? buildWechatPreviewSrcDoc(wechatPreview.html) : '';

  return (
    <div className={`editor ${isEditing ? 'is-editing' : 'is-preview'} ${isSourceMode ? 'is-source' : 'is-live'}`}>
      {/* Header */}
      <div className="editor-header">
        <div className="editor-container editor-header-inner">
          <div className="editor-meta">
            <span className="editor-date">
              {note.modifiedAt && format(new Date(note.modifiedAt), "MMM d, yyyy 'at' h:mm a")}
            </span>
            {mainTag && (
              <span 
                className="editor-tag"
                style={{ 
                  backgroundColor: `${getTagColor(mainTag)}20`,
                  color: getTagColor(mainTag)
                }}
              >
                {mainTag}
              </span>
            )}
          </div>
          <div className="editor-actions">
            <div className="editor-mode-group" role="tablist" aria-label="Editor mode">
              <button
                type="button"
                className={`editor-mode-segment ${editorMode === 'live' ? 'active' : ''}`}
                role="tab"
                aria-selected={editorMode === 'live'}
                onClick={() => switchToEditMode('live')}
              >
                Live
              </button>
              <button
                type="button"
                className={`editor-mode-segment ${editorMode === 'source' ? 'active' : ''}`}
                role="tab"
                aria-selected={editorMode === 'source'}
                onClick={() => switchToEditMode('source')}
              >
                Source
              </button>
              <button
                type="button"
                className={`editor-mode-segment ${editorMode === 'preview' ? 'active' : ''}`}
                role="tab"
                aria-selected={editorMode === 'preview'}
                onClick={() => {
                  if (isPreviewMode) return;
                  void switchToPreview();
                }}
              >
                Preview
              </button>
            </div>
            <button
              type="button"
              className={`editor-action-btn ${isPinned ? 'active' : ''}`}
              onClick={togglePinned}
              aria-pressed={isPinned}
              aria-label={isPinned ? '取消置顶' : '置顶'}
              title={isPinned ? '取消置顶' : '置顶'}
            >
              <Pin size={18} />
            </button>
            <button
              type="button"
              className={`editor-action-btn ${isFavorite ? 'active' : ''}`}
              onClick={toggleFavorite}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? '取消收藏' : '收藏'}
              title={isFavorite ? '取消收藏' : '收藏'}
            >
              <Star size={18} />
            </button>
            <div className="editor-more" ref={moreMenuRef}>
              <button
                type="button"
                className="editor-action-btn"
                onClick={() => setIsMoreMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={isMoreMenuOpen}
                title="More"
              >
                <MoreHorizontal size={18} />
              </button>
              {isMoreMenuOpen && (
                <div className="editor-more-menu" role="menu">
                  <button
                    type="button"
                    className="editor-more-item"
                    role="menuitem"
                    onClick={() => {
                      void copyMarkdownSource();
                    }}
                  >
                    <Copy size={16} />
                    <span>Copy Markdown</span>
                  </button>
                  <button
                    type="button"
                    className="editor-more-item"
                    role="menuitem"
                    onClick={() => {
                      setSelectedWechatThemeId((prev) => getWechatLayoutThemeById(prev).id);
                      setIsThemePickerOpen(true);
                      setIsMoreMenuOpen(false);
                    }}
                  >
                    <Copy size={16} />
                    <span>Generate WeChat Layout...</span>
                  </button>
                  <button
                    type="button"
                    className="editor-more-item"
                    role="menuitem"
                    onClick={() => {
                      setIsExportOpen(true);
                      setIsMoreMenuOpen(false);
                    }}
                  >
                    <FileDown size={16} />
                    <span>Export PDF</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="editor-container">
        {/* Title */}
        <input
          type="text"
          className="editor-title-input"
          value={title}
          onChange={handleTitleChange}
          placeholder="Note title"
        />

        {/* Tags Input */}
        <div className="editor-tags">
          {displayTags.map(tag => (
            <span 
              key={tag} 
              className="editor-tag-chip"
              style={{ 
                backgroundColor: `${getTagColor(tag)}20`,
                color: getTagColor(tag)
              }}
            >
              {tag}
              <button onClick={() => removeTag(tag)}>×</button>
            </span>
          ))}
          <input
            type="text"
            className="editor-tag-input"
            placeholder={displayTags.length === 0 ? "Add tags..." : ""}
            onKeyDown={handleTagKeyDown}
          />
        </div>
      </div>

      {/* Content */}
      <div className={`editor-content-shell ${wechatPreview ? 'has-wechat-panel' : ''}`}>
        <div
          className="editor-content"
          ref={editorContentRef}
          onClick={isPreviewMode ? handlePreviewClick : undefined}
        >
          <div className="editor-container editor-content-inner">
            {isEditing ? (
              <MarkdownLiveEditor
                value={content}
                onChange={handleContentChange}
                mode={isSourceMode ? 'source' : 'live'}
                onEditorReady={(view) => {
                  liveEditorRef.current = view;
                  requestAnimationFrame(() => {
                    applyPendingSelectionToLiveEditor();
                  });
                }}
                onOpenExternal={(url) => {
                  void window.electronAPI.openExternal(url);
                }}
                onOpenImagePreview={(url) => {
                  setLightboxSrc(url);
                }}
              />
            ) : (
              <div
                className="editor-preview"
                ref={previewRef}
                dangerouslySetInnerHTML={{
                  __html: htmlContent || '<p class="editor-placeholder">Click to start editing...</p>',
                }}
              />
            )}
          </div>
        </div>

        {wechatPreview && (
          <aside className={`editor-wechat-panel ${isWechatPreviewPanelOpen ? 'open' : 'collapsed'}`}>
            <button
              type="button"
              className="editor-wechat-panel-toggle"
              onClick={() => setIsWechatPreviewPanelOpen((open) => !open)}
              aria-label={isWechatPreviewPanelOpen ? 'Collapse WeChat preview' : 'Expand WeChat preview'}
              aria-expanded={isWechatPreviewPanelOpen}
              title={isWechatPreviewPanelOpen ? 'Collapse WeChat preview' : 'Expand WeChat preview'}
            >
              {isWechatPreviewPanelOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>

            {isWechatPreviewPanelOpen && (
              <div className="editor-wechat-panel-body">
                <div className="editor-wechat-toolbar">
                  <span className="editor-wechat-device">Mobile Preview · 390px</span>
                  {wechatTheme && <span className="editor-wechat-theme">{wechatTheme.name}</span>}
                </div>

                {isWechatPreviewStale && (
                  <p className="editor-wechat-stale">Markdown changed after generation. Regenerate to refresh the WeChat layout.</p>
                )}

                <div className="editor-wechat-phone">
                  <iframe
                    className="editor-wechat-frame"
                    title="WeChat layout preview"
                    srcDoc={wechatPreviewSrcDoc}
                    sandbox=""
                  />
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {lightboxSrc && (
        <div className="image-lightbox" onClick={() => setLightboxSrc(null)}>
          <button
            type="button"
            className="image-lightbox-close"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxSrc(null);
            }}
            aria-label="Close image preview"
          >
            ×
          </button>
          <img
            className="image-lightbox-img"
            src={lightboxSrc}
            alt=""
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {isThemePickerOpen && (
        <div
          className="editor-theme-overlay"
          onClick={() => {
            if (isGeneratingWechatHtml) return;
            setIsThemePickerOpen(false);
          }}
        >
          <div
            className="editor-theme-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Generate WeChat Layout"
          >
            <div className="editor-theme-header">
              <div className="editor-theme-header-text">
                <h2>Generate WeChat Layout</h2>
                <p>Select a theme before generating and copying HTML</p>
              </div>
              <button
                type="button"
                className="editor-theme-close"
                onClick={() => setIsThemePickerOpen(false)}
                disabled={isGeneratingWechatHtml}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="editor-theme-body">
              <div className="editor-theme-list">
                {WECHAT_LAYOUT_THEMES.map((theme) => {
                  const active = selectedWechatThemeId === theme.id;
                  return (
                    <label key={theme.id} className={`editor-theme-option ${active ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="wechat-theme"
                        value={theme.id}
                        checked={active}
                        onChange={() => setSelectedWechatThemeId(theme.id)}
                        disabled={isGeneratingWechatHtml}
                      />
                      <span className="editor-theme-option-content">
                        <span className="editor-theme-option-name">{theme.name}</span>
                        <span className="editor-theme-option-desc">{theme.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="editor-theme-footer">
              <button
                type="button"
                className="editor-theme-btn secondary"
                onClick={() => setIsThemePickerOpen(false)}
                disabled={isGeneratingWechatHtml}
              >
                Cancel
              </button>
              <button
                type="button"
                className="editor-theme-btn primary"
                onClick={() => {
                  void generateWechatHtmlWithAi(selectedWechatThemeId);
                }}
                disabled={isGeneratingWechatHtml}
              >
                {isGeneratingWechatHtml ? 'Generating…' : 'Generate & Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isExportOpen && (
        <div
          className="editor-export-overlay"
          onClick={() => {
            if (isExporting) return;
            setIsExportOpen(false);
          }}
        >
          <div
            className="editor-export-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Export PDF"
          >
            <div className="editor-export-header">
              <div className="editor-export-header-text">
                <h2>Export PDF</h2>
                <p>Choose your PDF settings</p>
              </div>
              <button
                type="button"
                className="editor-export-close"
                onClick={() => setIsExportOpen(false)}
                disabled={isExporting}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="editor-export-body">
              <div className="editor-export-grid">
                <label className="editor-export-field">
                  <span>Page size</span>
                  <select
                    value={exportOptions.pageSize}
                    onChange={(e) =>
                      setExportOptions((prev) => ({
                        ...prev,
                        pageSize: e.target.value as ExportPdfOptions['pageSize'],
                      }))
                    }
                    disabled={isExporting}
                  >
                    <option value="A4">A4</option>
                    <option value="Letter">Letter</option>
                  </select>
                </label>

                <label className="editor-export-field">
                  <span>Orientation</span>
                  <select
                    value={exportOptions.orientation}
                    onChange={(e) =>
                      setExportOptions((prev) => ({
                        ...prev,
                        orientation: e.target.value as ExportPdfOptions['orientation'],
                      }))
                    }
                    disabled={isExporting}
                  >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </label>
              </div>

              <div className="editor-export-options">
                <label className="editor-export-checkbox">
                  <input
                    type="checkbox"
                    checked={exportOptions.includeHeader}
                    onChange={(e) =>
                      setExportOptions((prev) => ({
                        ...prev,
                        includeHeader: e.target.checked,
                      }))
                    }
                    disabled={isExporting}
                  />
                  <span>Header (repeat each page)</span>
                </label>

                <label className="editor-export-checkbox">
                  <input
                    type="checkbox"
                    checked={exportOptions.includeTitle}
                    onChange={(e) =>
                      setExportOptions((prev) => ({
                        ...prev,
                        includeTitle: e.target.checked,
                      }))
                    }
                    disabled={isExporting}
                  />
                  <span>Title</span>
                </label>

                <label className="editor-export-checkbox">
                  <input
                    type="checkbox"
                    checked={exportOptions.includeDate}
                    onChange={(e) =>
                      setExportOptions((prev) => ({
                        ...prev,
                        includeDate: e.target.checked,
                      }))
                    }
                    disabled={isExporting}
                  />
                  <span>Date</span>
                </label>

                <label className="editor-export-checkbox">
                  <input
                    type="checkbox"
                    checked={exportOptions.includePageNumbers}
                    onChange={(e) =>
                      setExportOptions((prev) => ({
                        ...prev,
                        includePageNumbers: e.target.checked,
                      }))
                    }
                    disabled={isExporting}
                  />
                  <span>Page numbers</span>
                </label>
              </div>
            </div>

            <div className="editor-export-footer">
              <button
                type="button"
                className="editor-export-btn secondary"
                onClick={() => setIsExportOpen(false)}
                disabled={isExporting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="editor-export-btn primary"
                onClick={exportCurrentNoteToPdf}
                disabled={isExporting}
              >
                {isExporting ? 'Exporting…' : 'Export'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`editor-toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default Editor;
