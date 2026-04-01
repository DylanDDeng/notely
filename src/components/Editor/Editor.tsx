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

  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outlineHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outlineItemRefs = useRef(new Map<string, HTMLButtonElement>());
  const outlineNavigatorRef = useRef<((itemId: string) => void) | null>(null);
  const skipNextAutoSaveRef = useRef(true);
  const draftContentRef = useRef('');
  const documentTitleRef = useRef('');
  const onSaveRef = useRef(onSave);
  const editorRootRef = useRef<HTMLDivElement | null>(null);

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

  const handleEditorDomReady = useCallback((root: HTMLDivElement | null) => {
    editorRootRef.current = root;
  }, []);

  const handleRegisterOutlineNavigator = useCallback((navigator: ((itemId: string) => void) | null) => {
    outlineNavigatorRef.current = navigator;
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
    target.scrollIntoView({ block: 'nearest' });
  }, [activeOutlineItemId]);

  useEffect(() => {
    if (!isOutlineOpen) return;

    const root = editorRootRef.current;
    const scrollContainer = editorScrollRef.current;
    if (!root || !scrollContainer) return;

    let frame = 0;
    const updateActiveHeading = () => {
      frame = 0;
      const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      if (headings.length === 0 || outlineItems.length === 0) {
        setActiveOutlineItemId(null);
        return;
      }

      const scrollerTop = scrollContainer.getBoundingClientRect().top;
      const threshold = scrollerTop + 120;
      let activeIndex = 0;

      headings.forEach((heading, index) => {
        if (!(heading instanceof HTMLElement)) return;
        if (heading.getBoundingClientRect().top <= threshold) {
          activeIndex = index;
        }
      });

      const activeItem = outlineItems[Math.min(activeIndex, outlineItems.length - 1)] || null;
      setActiveOutlineItemId((prev) => (prev === activeItem?.id ? prev : activeItem?.id || null));
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActiveHeading);
    };

    scheduleUpdate();
    scrollContainer.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      scrollContainer.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      observer.disconnect();
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [isOutlineOpen, outlineItems]);

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
        <div className="editor-content" ref={editorScrollRef}>
          <div className="editor-content-inner">
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
                    <span className="editor-outline-rail-line active" />
                    <span className="editor-outline-rail-line" />
                    <span className="editor-outline-rail-line" />
                    <span className="editor-outline-rail-line" />
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
            <div className="editor-container editor-writing-surface">
              <MarkdownLiveEditor
                value={content}
                onChange={setContent}
                onOpenImagePreview={handleOpenImagePreview}
                onOpenExternal={handleOpenExternal}
                onEditorDomReady={handleEditorDomReady}
                onOutlineChange={setOutlineItems}
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
