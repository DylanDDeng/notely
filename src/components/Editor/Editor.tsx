import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MarkdownLiveEditor from './MarkdownLiveEditor';
import type { EditorNote, SaveNoteData } from '../../types';
import './Editor.css';

interface EditorProps {
  note: EditorNote | null;
  onSave: (note: SaveNoteData) => Promise<void>;
  onContentChange?: (content: string) => void;
  onRegisterExportHtmlGetter?: (getter: (() => string) | null) => void;
  isLoading: boolean;
  outlineToggleKey?: number;
  saveRequestKey?: number;
}

interface OutlineItem {
  id: string;
  level: number;
  text: string;
  pos: number;
}

const SAVE_DEBOUNCE_MS = 800;

const fallbackTitleFromFilename = (filename?: string): string => {
  if (!filename) return 'Untitled';
  return filename.replace(/\.md$/i, '').trim() || 'Untitled';
};

function Editor({
  note,
  onSave,
  onContentChange,
  onRegisterExportHtmlGetter,
  isLoading,
  outlineToggleKey = 0,
  saveRequestKey = 0,
}: EditorProps) {
  const [content, setContent] = useState('');
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
  const [isOutlineOpen, setIsOutlineOpen] = useState(true);
  const [activeOutlineItemId, setActiveOutlineItemId] = useState<string | null>(null);
  const [isOutlineHovered, setIsOutlineHovered] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outlineHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outlineItemRefs = useRef(new Map<string, HTMLButtonElement>());
  const outlineNavigatorRef = useRef<((itemId: string) => void) | null>(null);
  const skipNextAutoSaveRef = useRef(true);
  const draftContentRef = useRef('');
  const documentTitleRef = useRef('');
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    draftContentRef.current = content;
    onContentChange?.(content);
  }, [content, onContentChange]);

  useEffect(() => {
    if (outlineToggleKey === 0) return;
    setIsOutlineOpen((prev) => !prev);
  }, [outlineToggleKey]);

  const documentTitle = useMemo(() => {
    const firstHeading = outlineItems[0]?.text?.trim();
    if (firstHeading) return firstHeading;
    const noteTitle = note?.title?.trim();
    if (noteTitle) return noteTitle;
    return fallbackTitleFromFilename(note?.filename);
  }, [note?.filename, note?.title, outlineItems]);

  useEffect(() => {
    documentTitleRef.current = documentTitle;
  }, [documentTitle]);

  const wordCount = useMemo(() => {
    const trimmed = content.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  }, [content]);
  const wordCountLabel = wordCount === 1 ? '1 Word' : `${wordCount} Words`;

  const outlineRailActiveIndex = useMemo(() => {
    const railLineCount = 4;
    if (outlineItems.length === 0) return -1;
    if (outlineItems.length === 1) return 0;

    const activeIndex = outlineItems.findIndex((item) => item.id === activeOutlineItemId);
    if (activeIndex <= 0) return 0;

    return Math.min(
      railLineCount - 1,
      Math.round((activeIndex / (outlineItems.length - 1)) * (railLineCount - 1))
    );
  }, [activeOutlineItemId, outlineItems]);

  const clearPendingSave = useCallback(() => {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }, []);

  const clearOutlineHoverTimer = useCallback(() => {
    if (!outlineHoverTimerRef.current) return;
    clearTimeout(outlineHoverTimerRef.current);
    outlineHoverTimerRef.current = null;
  }, []);

  const flushSave = useCallback(
    async (noteSnapshot: EditorNote | null | undefined, interactive = false) => {
      if (!noteSnapshot) return;
      clearPendingSave();
      await onSaveRef.current({
        id: noteSnapshot.id,
        filename: noteSnapshot.filename,
        filepath: noteSnapshot.filepath,
        title: documentTitleRef.current,
        content: draftContentRef.current,
        tags: [],
        date: noteSnapshot.date,
        interactive,
        isDraft: noteSnapshot.isDraft,
      });
    },
    [clearPendingSave]
  );

  useEffect(() => {
    const activeNote = note;
    setContent(activeNote?.content || '');
    skipNextAutoSaveRef.current = true;

    return () => {
      clearPendingSave();
    };
  }, [clearPendingSave, note?.id]);

  useEffect(() => {
    if (!note) return;
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }

    const activeNote = note;
    clearPendingSave();
    saveTimerRef.current = setTimeout(() => {
      void flushSave(activeNote, false);
    }, SAVE_DEBOUNCE_MS);

    return clearPendingSave;
  }, [clearPendingSave, content, documentTitle, flushSave, note?.date, note?.filename, note?.id]);

  useEffect(() => {
    return () => {
      clearPendingSave();
    };
  }, [clearPendingSave]);

  useEffect(() => {
    return () => {
      clearOutlineHoverTimer();
    };
  }, [clearOutlineHoverTimer]);

  useEffect(() => {
    if (!lightboxSrc) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxSrc(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxSrc]);

  useEffect(() => {
    if (saveRequestKey === 0) return;
    void flushSave(note, true);
  }, [flushSave, note, saveRequestKey]);

  const handleOpenImagePreview = useCallback((src: string) => {
    setLightboxSrc(src);
  }, []);

  const handleOpenExternal = useCallback((url: string) => {
    void window.electronAPI.openExternal(url);
  }, []);

  const handleRegisterOutlineNavigator = useCallback((navigator: ((itemId: string) => void) | null) => {
    outlineNavigatorRef.current = navigator;
  }, []);

  const handleActiveOutlineItemChange = useCallback((itemId: string | null) => {
    setActiveOutlineItemId((prev) => (prev === itemId ? prev : itemId));
  }, []);

  useEffect(() => {
    return () => {
      onRegisterExportHtmlGetter?.(null);
    };
  }, [onRegisterExportHtmlGetter]);

  const jumpToOutlineItem = useCallback((item: OutlineItem) => {
    setActiveOutlineItemId(item.id);
    outlineNavigatorRef.current?.(item.id);
  }, []);

  const handleOutlineMouseEnter = useCallback(() => {
    clearOutlineHoverTimer();
    setIsOutlineHovered(true);
  }, [clearOutlineHoverTimer]);

  const handleOutlineMouseLeave = useCallback(() => {
    clearOutlineHoverTimer();
    outlineHoverTimerRef.current = setTimeout(() => {
      setIsOutlineHovered(false);
      outlineHoverTimerRef.current = null;
    }, 140);
  }, [clearOutlineHoverTimer]);

  useEffect(() => {
    if (!activeOutlineItemId) return;
    const target = outlineItemRefs.current.get(activeOutlineItemId);
    if (!target) return;
    const scrollContainer = target.closest('.editor-outline-card-list');
    if (!scrollContainer) return;
    const containerRect = scrollContainer.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (targetRect.top < containerRect.top) {
      scrollContainer.scrollTop += targetRect.top - containerRect.top;
    } else if (targetRect.bottom > containerRect.bottom) {
      scrollContainer.scrollTop += targetRect.bottom - containerRect.bottom;
    }
  }, [activeOutlineItemId]);

  useEffect(() => {
    if (!activeOutlineItemId) return;
    if (outlineItems.some((item) => item.id === activeOutlineItemId)) return;
    setActiveOutlineItemId(outlineItems[0]?.id || null);
  }, [activeOutlineItemId, outlineItems]);

  if (isLoading) {
    return (
      <section className="editor">
        <div className="editor-loading">
          <div className="loading-spinner" />
        </div>
      </section>
    );
  }

  if (!note) {
    return (
      <section className="editor">
        <div className="editor-empty">
          <p>Select a Markdown document to start editing.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="editor">
      <header className="editor-header editor-header-minimal">
        <div className="editor-header-side editor-header-left" aria-hidden="true" />

        <div className="editor-title-rail">{documentTitle}</div>

        <div className="editor-header-side editor-header-right">
          <span className="editor-word-count">{wordCountLabel}</span>
        </div>
      </header>

      <div className="editor-content-shell">
        {isOutlineOpen && (
          <div className="editor-outline-floating">
            <div
              className={`editor-outline-dock${isOutlineHovered ? ' expanded' : ''}`}
              onMouseEnter={handleOutlineMouseEnter}
              onMouseLeave={handleOutlineMouseLeave}
            >
              <button
                type="button"
                className="editor-outline-rail"
                aria-label="Show document outline"
                title="Show document outline"
              >
                {Array.from({ length: 4 }, (_, index) => (
                  <span
                    key={index}
                    className={`editor-outline-rail-line${index === outlineRailActiveIndex ? ' active' : ''}`}
                  />
                ))}
              </button>
              <div className="editor-outline-card">
                <div className="editor-outline-card-header">Outline</div>
                {outlineItems.length === 0 ? (
                  <div className="editor-outline-empty">Add headings to see the document outline.</div>
                ) : (
                  <div className="editor-outline-card-list">
                    {outlineItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        ref={(node) => {
                          if (node) {
                            outlineItemRefs.current.set(item.id, node);
                          } else {
                            outlineItemRefs.current.delete(item.id);
                          }
                        }}
                        className={`editor-outline-item level-${item.level}${activeOutlineItemId === item.id ? ' active' : ''}`}
                        onClick={() => jumpToOutlineItem(item)}
                        title={item.text}
                      >
                        {item.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="editor-content">
          <div className="editor-content-inner">
            <div className="editor-container editor-writing-surface">
              <MarkdownLiveEditor
                value={content}
                onChange={setContent}
                onOpenImagePreview={handleOpenImagePreview}
                onOpenExternal={handleOpenExternal}
                onOutlineChange={setOutlineItems}
                onActiveOutlineItemChange={handleActiveOutlineItemChange}
                onRegisterOutlineNavigator={handleRegisterOutlineNavigator}
                onRegisterExportHtmlGetter={onRegisterExportHtmlGetter}
                documentKey={note.id}
              />
            </div>
          </div>
        </div>

      </div>

      {lightboxSrc && (
        <div className="image-lightbox" onClick={() => setLightboxSrc(null)}>
          <button className="image-lightbox-close" type="button" onClick={() => setLightboxSrc(null)}>
            Close
          </button>
          <img className="image-lightbox-img" src={lightboxSrc} alt="" />
        </div>
      )}
    </section>
  );
}

export default Editor;
