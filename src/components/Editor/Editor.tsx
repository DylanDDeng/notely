import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MarkdownLiveEditor from './MarkdownLiveEditor';
import type { EditorNote, SaveNoteData } from '../../types';
import { generateFilename, getFirstHeading, stripExtension } from '../../utils/noteUtils';
import './Editor.css';

const filenameBase = (filename?: string): string => stripExtension(filename);

// Slug of a heading, extension stripped — only used for base-name comparison.
const headingSlugBase = (heading: string): string => stripExtension(generateFilename(heading));

interface EditorProps {
  note: EditorNote | null;
  onSave: (note: SaveNoteData) => Promise<boolean>;
  onContentChange?: (content: string) => void;
  onRegisterExportHtmlGetter?: (getter: (() => string) | null) => void;
  isLoading: boolean;
  outlineToggleKey?: number;
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
  return stripExtension(filename).trim() || 'Untitled';
};

function Editor({
  note,
  onSave,
  onContentChange,
  onRegisterExportHtmlGetter,
  isLoading,
  outlineToggleKey = 0,
}: EditorProps) {
  const [content, setContent] = useState('');
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
  const [isOutlineOpen, setIsOutlineOpen] = useState(true);
  const [activeOutlineItemId, setActiveOutlineItemId] = useState<string | null>(null);
  const [isOutlineHovered, setIsOutlineHovered] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outlineHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outlineItemRefs = useRef(new Map<string, HTMLButtonElement>());
  const outlineNavigatorRef = useRef<((itemId: string) => void) | null>(null);
  const skipNextAutoSaveRef = useRef(true);
  const draftContentRef = useRef('');
  const documentTitleRef = useRef('');
  const onSaveRef = useRef(onSave);
  const nameInputRef = useRef<HTMLInputElement>(null);
  // Whether the filename should keep tracking the first heading. Locked once
  // the user renames the file by hand; re-inferred whenever a note loads.
  const nameFollowsHeadingRef = useRef(true);
  const lastSyncedHeadingRef = useRef('');

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

      // While the filename still follows the heading, rename the file to match
      // the first heading whenever it changes. Skipped for drafts (no file yet)
      // and when the heading is empty (don't rename to "Untitled").
      let forceFilename: string | undefined;
      const heading = getFirstHeading(draftContentRef.current);
      if (
        nameFollowsHeadingRef.current &&
        noteSnapshot.filename &&
        heading &&
        heading !== lastSyncedHeadingRef.current &&
        headingSlugBase(heading) !== filenameBase(noteSnapshot.filename)
      ) {
        forceFilename = heading;
      }

      await onSaveRef.current({
        id: noteSnapshot.id,
        filename: noteSnapshot.filename,
        filepath: noteSnapshot.filepath,
        forceFilename,
        title: documentTitleRef.current,
        content: draftContentRef.current,
        tags: [],
        date: noteSnapshot.date,
        interactive,
        isDraft: noteSnapshot.isDraft,
      });

      if (heading) lastSyncedHeadingRef.current = heading;
    },
    [clearPendingSave]
  );

  useEffect(() => {
    const activeNote = note;
    setContent(activeNote?.content || '');
    skipNextAutoSaveRef.current = true;
    setIsEditingName(false);

    // Re-infer whether the filename is still tracking the heading. A draft (no
    // file yet) always follows; a saved file follows only when its name still
    // matches the slug of its current first heading.
    const heading = getFirstHeading(activeNote?.content || '');
    lastSyncedHeadingRef.current = heading;
    nameFollowsHeadingRef.current = !activeNote?.filename
      ? true
      : Boolean(heading) && headingSlugBase(heading) === filenameBase(activeNote.filename);

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

  // The filename shown in the header rail. Saved notes show the real filename;
  // an unsaved draft previews the name it will take (heading slug or Untitled).
  const headingName = useMemo(() => getFirstHeading(content), [content]);
  const displayName = note?.filename
    ? filenameBase(note.filename)
    : headingName || 'Untitled';
  const canRename = Boolean(note?.filename);

  // A stable key for the underlying document so that renaming the file (which
  // changes note.id) does not remount the editor and lose the caret.
  const documentKey = useMemo(() => {
    if (!note) return '';
    const created = note.createdAt instanceof Date ? note.createdAt.getTime() : NaN;
    return Number.isNaN(created) ? note.id : `doc-${created}`;
  }, [note?.id, note?.createdAt]);

  const startNameEdit = useCallback(() => {
    if (!note?.filename) return;
    setNameDraft(filenameBase(note.filename));
    setIsEditingName(true);
  }, [note?.filename]);

  const commitNameEdit = useCallback(() => {
    setIsEditingName(false);
    const activeNote = note;
    if (!activeNote?.filename) return;
    const value = nameDraft.trim();
    if (!value || value === filenameBase(activeNote.filename)) return;

    clearPendingSave();
    nameFollowsHeadingRef.current = false;
    void onSaveRef.current({
      id: activeNote.id,
      filename: activeNote.filename,
      filepath: activeNote.filepath,
      forceFilename: value,
      title: value,
      content: draftContentRef.current,
      tags: [],
      date: activeNote.date,
      interactive: false,
      isDraft: activeNote.isDraft,
    });
  }, [clearPendingSave, nameDraft, note]);

  useEffect(() => {
    if (!isEditingName) return;
    const input = nameInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [isEditingName]);

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

        <div className="editor-title-rail">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              className="editor-title-input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitNameEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitNameEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsEditingName(false);
                }
              }}
              spellCheck={false}
              aria-label="File name"
            />
          ) : (
            <button
              type="button"
              className="editor-title-button"
              onClick={startNameEdit}
              disabled={!canRename}
              title={canRename ? 'Click to rename file' : undefined}
            >
              {displayName}
            </button>
          )}
        </div>

        <div className="editor-header-side editor-header-right">
          <span className="editor-word-count">{wordCountLabel}</span>
        </div>
      </header>

      <div className="editor-content-shell">
        {isOutlineOpen && outlineItems.length > 0 && (
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
                documentKey={documentKey}
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
