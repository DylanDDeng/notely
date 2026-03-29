import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import MarkdownLiveEditor from './MarkdownLiveEditor';
import type { EditorNote, SaveNoteData } from '../../types';
import './Editor.css';

interface EditorProps {
  note: EditorNote | null;
  onSave: (note: SaveNoteData) => Promise<void>;
  isLoading: boolean;
  outlineToggleKey?: number;
}

interface OutlineItem {
  id: string;
  level: number;
  text: string;
  offset: number;
}

const SAVE_DEBOUNCE_MS = 800;
const OUTLINE_OPEN_KEY = 'notes:editor:outlineOpen';

const readBooleanSetting = (key: string, fallback = false): boolean => {
  try {
    const saved = localStorage.getItem(key);
    if (saved === null) return fallback;
    return saved === 'true';
  } catch {
    return fallback;
  }
};

const writeBooleanSetting = (key: string, value: boolean) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // ignore
  }
};

const parseOutline = (markdown: string): OutlineItem[] => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const items: OutlineItem[] = [];
  let offset = 0;

  lines.forEach((line, index) => {
    const match = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*$/);
    if (match) {
      items.push({
        id: `${index}-${offset}`,
        level: match[1].length,
        text: match[2].trim(),
        offset,
      });
    }
    offset += line.length + 1;
  });

  return items;
};

const fallbackTitleFromFilename = (filename?: string): string => {
  if (!filename) return 'Untitled';
  return filename.replace(/\.md$/i, '').trim() || 'Untitled';
};

function Editor({ note, onSave, isLoading, outlineToggleKey = 0 }: EditorProps) {
  const [content, setContent] = useState('');
  const [isOutlineOpen, setIsOutlineOpen] = useState(() => readBooleanSetting(OUTLINE_OPEN_KEY, false));
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutoSaveRef = useRef(true);
  const draftContentRef = useRef('');
  const documentTitleRef = useRef('');
  const onSaveRef = useRef(onSave);
  const editorViewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    draftContentRef.current = content;
  }, [content]);

  useEffect(() => {
    writeBooleanSetting(OUTLINE_OPEN_KEY, isOutlineOpen);
  }, [isOutlineOpen]);

  useEffect(() => {
    if (outlineToggleKey === 0) return;
    setIsOutlineOpen((prev) => !prev);
  }, [outlineToggleKey]);

  const outlineItems = useMemo(() => parseOutline(content), [content]);

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

  const flushSave = useCallback(
    async (noteSnapshot: EditorNote | null | undefined) => {
      if (!noteSnapshot) return;
      clearPendingSave();
      await onSaveRef.current({
        id: noteSnapshot.id,
        filename: noteSnapshot.filename,
        title: documentTitleRef.current,
        content: draftContentRef.current,
        tags: [],
        date: noteSnapshot.date,
      });
    },
    [clearPendingSave]
  );

  useEffect(() => {
    const activeNote = note;
    setContent(activeNote?.content || '');
    skipNextAutoSaveRef.current = true;

    return () => {
      if (activeNote) {
        void flushSave(activeNote);
      }
    };
  }, [flushSave, note?.id]);

  useEffect(() => {
    if (!note) return;
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }

    const activeNote = note;
    clearPendingSave();
    saveTimerRef.current = setTimeout(() => {
      void flushSave(activeNote);
    }, SAVE_DEBOUNCE_MS);

    return clearPendingSave;
  }, [clearPendingSave, content, documentTitle, flushSave, note?.date, note?.filename, note?.id]);

  useEffect(() => {
    return () => {
      clearPendingSave();
    };
  }, [clearPendingSave]);

  useEffect(() => {
    if (!lightboxSrc) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxSrc(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxSrc]);

  const handleOpenImagePreview = useCallback((src: string) => {
    setLightboxSrc(src);
  }, []);

  const handleOpenExternal = useCallback((url: string) => {
    void window.electronAPI.openExternal(url);
  }, []);

  const handleEditorReady = useCallback((view: EditorView) => {
    editorViewRef.current = view;
  }, []);

  const jumpToOutlineItem = useCallback((item: OutlineItem) => {
    requestAnimationFrame(() => {
      const view = editorViewRef.current;
      if (!view) return;
      const position = Math.max(0, Math.min(item.offset, view.state.doc.length));
      view.dispatch({
        selection: { anchor: position },
        effects: EditorView.scrollIntoView(position, { y: 'center' }),
      });
      view.focus();
    });
  }, []);

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
        <div className="editor-content">
          <div className="editor-content-inner">
            <div className="editor-container editor-writing-surface">
              <MarkdownLiveEditor
                value={content}
                onChange={setContent}
                onOpenImagePreview={handleOpenImagePreview}
                onOpenExternal={handleOpenExternal}
                onEditorReady={handleEditorReady}
                mode="live"
              />
            </div>
          </div>
        </div>

        {isOutlineOpen && (
          <aside className="editor-outline-panel">
            <div className="editor-outline-header">Outline</div>
            {outlineItems.length === 0 ? (
              <div className="editor-outline-empty">Add headings to see the document outline.</div>
            ) : (
              <div className="editor-outline-list">
                {outlineItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`editor-outline-item level-${item.level}`}
                    onClick={() => jumpToOutlineItem(item)}
                    title={item.text}
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            )}
          </aside>
        )}
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
