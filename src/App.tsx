import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from './components/Editor/Editor';
import { generateFilename, generateNoteContent, parseNote } from './utils/noteUtils';
import type { EditorNote, Note, SaveNoteData } from './types';
import './styles/App.css';

const QuickOpen = lazy(() => import('./components/QuickOpen/QuickOpen'));
const Settings = lazy(() => import('./components/Settings/Settings'));
const RECENT_NOTE_IDS_KEY = 'notes:recentNoteIds';
const UNSAVED_DRAFT_KEY = 'notes:unsavedDraft';

const getWindowParams = () => {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
};

const isSettingsWindow = (): boolean => getWindowParams().get('settings') === '1';

const getWindowDraftStorageKey = (): string => {
  const draftKey = getWindowParams().get('draftKey')?.trim();
  return draftKey ? `${UNSAVED_DRAFT_KEY}:${draftKey}` : UNSAVED_DRAFT_KEY;
};

const isNewDocumentWindow = (): boolean => getWindowParams().get('newDocument') === '1';

const getSavedRecentNoteIds = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENT_NOTE_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
};

const saveRecentNoteIds = (noteIds: string[]) => {
  try {
    localStorage.setItem(RECENT_NOTE_IDS_KEY, JSON.stringify(noteIds));
  } catch {
    // ignore
  }
};

const readUnsavedDraft = (storageKey: string): EditorNote | null => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EditorNote> | null;
    if (!parsed || typeof parsed.content !== 'string') return null;
    const createdAt = parsed.createdAt ? new Date(parsed.createdAt) : new Date();
    const modifiedAt = parsed.modifiedAt ? new Date(parsed.modifiedAt) : createdAt;
    return {
      id: parsed.id || `draft-${modifiedAt.getTime()}`,
      title: typeof parsed.title === 'string' ? parsed.title : 'Untitled',
      content: parsed.content,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      date: typeof parsed.date === 'string' ? parsed.date : modifiedAt.toISOString(),
      createdAt,
      modifiedAt,
      isDraft: true,
    };
  } catch {
    return null;
  }
};

const writeUnsavedDraft = (storageKey: string, draft: EditorNote | null) => {
  try {
    if (!draft || !draft.isDraft) {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(draft));
  } catch {
    // ignore
  }
};

const toEditorNote = (note: Note): EditorNote => ({
  id: note.id,
  filename: note.filename,
  filepath: note.filepath,
  title: note.title,
  content: note.contentBody,
  tags: [],
  date: note.date,
  createdAt: note.createdAt,
  modifiedAt: note.modifiedAt,
});

const createDraftNote = (): EditorNote => {
  const now = new Date();
  return {
    id: `draft-${now.getTime()}`,
    title: 'Untitled',
    content: '',
    tags: [],
    date: now.toISOString(),
    createdAt: now,
    modifiedAt: now,
    isDraft: true,
  };
};

const deriveDocumentTitle = (markdown: string, fallbackTitle?: string, filename?: string): string => {
  const headingMatch = String(markdown || '')
    .replace(/\r\n/g, '\n')
    .match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/m);

  const headingTitle = headingMatch?.[1]?.trim();
  if (headingTitle) return headingTitle;

  const trimmedFallback = fallbackTitle?.trim();
  if (trimmedFallback && trimmedFallback !== 'Untitled') return trimmedFallback;

  const trimmedFilename = filename?.replace(/\.(md|markdown)$/i, '').trim();
  if (trimmedFilename) return trimmedFilename;

  return 'Untitled';
};

const markdownToExportHtml = async (markdown: string): Promise<string> => {
  const [{ remark }, { default: remarkGfm }, { default: remarkHtml }] = await Promise.all([
    import('remark'),
    import('remark-gfm'),
    import('remark-html'),
  ]);

  const result = await remark()
    .use(remarkGfm)
    .use(remarkHtml)
    .process(markdown);

  return String(result);
};

function App() {
  const draftStorageKey = useMemo(() => getWindowDraftStorageKey(), []);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isLoading] = useState(false);
  const [recentNoteIds, setRecentNoteIds] = useState<string[]>(() => getSavedRecentNoteIds());
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState('');
  const [outlineToggleKey, setOutlineToggleKey] = useState(0);
  const [draftNote, setDraftNote] = useState<EditorNote | null>(() => {
    if (isNewDocumentWindow()) return createDraftNote();
    return readUnsavedDraft(getWindowDraftStorageKey()) ?? createDraftNote();
  });
  const notesRef = useRef<Note[]>([]);
  const activeDirectoryRef = useRef('');
  const currentNoteRef = useRef<EditorNote | null>(draftNote);
  const latestContentRef = useRef('');
  const lastSavedContentRef = useRef('');
  const exportHtmlGetterRef = useRef<(() => string) | null>(null);

  const handleRegisterExportHtmlGetter = useCallback((getter: (() => string) | null) => {
    exportHtmlGetterRef.current = getter;
  }, []);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const makeUniqueFilename = useCallback(
    (title: string, excludeFilename?: string) => {
      const baseFilename = generateFilename(title);
      const baseName = baseFilename.replace(/\.(md|markdown)$/i, '');
      const excluded = excludeFilename?.toLowerCase();
      const existingFilenames = new Set(
        notes
          .map((note) => note.filename.toLowerCase())
          .filter((filename) => !excluded || filename !== excluded)
      );

      if (!existingFilenames.has(baseFilename.toLowerCase())) {
        return baseFilename;
      }

      let suffix = 2;
      let candidate = `${baseName}-${suffix}.md`;
      while (existingFilenames.has(candidate.toLowerCase())) {
        suffix += 1;
        candidate = `${baseName}-${suffix}.md`;
      }
      return candidate;
    },
    [notes]
  );

  useEffect(() => {
    if (notes.length === 0) {
      setSelectedNoteId(null);
      return;
    }

    if (draftNote) return;

    if (selectedNoteId) {
      if (notes.some((note) => note.id === selectedNoteId)) return;
    }

    setSelectedNoteId(notes[0].id);
  }, [draftNote, notes, selectedNoteId]);

  const handleSelectNote = useCallback((noteId: string) => {
    setDraftNote(null);
    setSelectedNoteId(noteId);
  }, []);

  useEffect(() => {
    if (selectedNoteId) return;
    if (draftNote) return;
    setDraftNote(createDraftNote());
  }, [draftNote, selectedNoteId]);

  useEffect(() => {
    if (!selectedNoteId) return;
    setRecentNoteIds((prev) => {
      const next = [selectedNoteId, ...prev.filter((id) => id !== selectedNoteId)].slice(0, 12);
      saveRecentNoteIds(next);
      return next;
    });
  }, [selectedNoteId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setIsQuickOpenOpen(true);
        setQuickOpenQuery('');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleCreateNote = useCallback(async () => {
    setSelectedNoteId(null);
    setDraftNote(createDraftNote());
  }, []);

  const handleSaveNote = useCallback(
    async (noteData: SaveNoteData): Promise<boolean> => {
      const now = new Date();
      const shouldSaveAs = Boolean(noteData.saveAs);
      const isDraft = Boolean(noteData.isDraft || !noteData.filename);
      const nextTitle = noteData.title.trim() || 'Untitled';

      const markPersisted = (title: string) => {
        lastSavedContentRef.current = noteData.content;
        window.__notelyUnsavedState = {
          dirty: false,
          title,
          isDraft: false,
          draftStorageKey,
        };
      };

      const previousDirectory = activeDirectoryRef.current;

      if (isDraft || shouldSaveAs) {
        if (isDraft && !noteData.interactive && !shouldSaveAs) {
          setDraftNote((prev) => ({
            ...(prev ?? createDraftNote()),
            id: noteData.id || prev?.id || `draft-${Date.now()}`,
            title: nextTitle,
            content: noteData.content,
            tags: noteData.tags,
            date: noteData.date || prev?.date || now.toISOString(),
            createdAt: prev?.createdAt || now,
            modifiedAt: now,
            isDraft: true,
          }));
          return false;
        }

        const suggestedFilename = shouldSaveAs
          ? makeUniqueFilename(nextTitle, noteData.filename)
          : makeUniqueFilename(nextTitle);
        const fileContent = generateNoteContent(noteData.content);

        const saveAsResult = await window.electronAPI.saveNoteAs?.({
          suggestedFilename,
          content: fileContent,
        });

        if (!saveAsResult || saveAsResult.canceled) {
          return false;
        }

        if (!saveAsResult.success || !saveAsResult.filename || !saveAsResult.filepath) {
          throw new Error(saveAsResult.error || 'Failed to save document');
        }

        const existingNote = shouldSaveAs
          ? notesRef.current.find((note) => note.id === noteData.id || note.filename === noteData.filename)
          : undefined;
        const parsed = parseNote(fileContent, saveAsResult.filename);
        const savedNote: Note = {
          id: saveAsResult.filename.replace(/\.(md|markdown)$/i, ''),
          filename: saveAsResult.filename,
          filepath: saveAsResult.filepath,
          content: fileContent,
          title: parsed.title,
          date: parsed.date,
          tags: [],
          contentBody: parsed.contentBody,
          rawContent: parsed.rawContent,
          modifiedAt: now,
          createdAt: shouldSaveAs ? existingNote?.createdAt || now : now,
        };

        if (saveAsResult.directory) {
          activeDirectoryRef.current = saveAsResult.directory;
        }

        if (isDraft) {
          writeUnsavedDraft(draftStorageKey, null);
          setDraftNote(null);
        }
        const nextNotes = previousDirectory && saveAsResult.directory && previousDirectory !== saveAsResult.directory
          ? [savedNote]
          : [...notesRef.current.filter((note) => note.filepath !== savedNote.filepath), savedNote];
        setNotes(nextNotes.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime()));
        setSelectedNoteId(savedNote.id);
        markPersisted(savedNote.title);
        return true;
      }

      const previousFilename = noteData.filename?.trim();
      const forcedFilename = noteData.forceFilename?.trim();
      const filename = forcedFilename || previousFilename || generateFilename(noteData.title);
      const noteId = (filename || '').replace(/\.(md|markdown)$/i, '');
      const existingNote = notesRef.current.find((note) => note.id === noteData.id || note.filename === previousFilename);
      const fileContent = generateNoteContent(noteData.content);

      const saveResult = await window.electronAPI.saveNote({
        filename,
        content: fileContent,
        preserveModifiedAt: noteData.preserveModifiedAt,
      });

      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Failed to save document');
      }

      if (previousFilename && forcedFilename && forcedFilename !== previousFilename) {
        const deleteResult = await window.electronAPI.deleteNote(previousFilename);
        if (!deleteResult.success) {
          console.warn('Failed to remove old filename after rename:', deleteResult.error);
        }
      }

      const parsed = parseNote(fileContent, filename);
      const nextNote: Note = {
        id: noteId,
        filename,
        filepath: existingNote?.filepath?.replace(/[^/\\]+$/, filename) || `${activeDirectoryRef.current}/${filename}`,
        content: fileContent,
        title: parsed.title,
        date: parsed.date,
        tags: [],
        contentBody: parsed.contentBody,
        rawContent: parsed.rawContent,
        modifiedAt: noteData.preserveModifiedAt ? existingNote?.modifiedAt || now : now,
        createdAt: existingNote?.createdAt || now,
      };

      setNotes((prev) => {
        const withoutCurrent = prev.filter((note) => note.id !== existingNote?.id && note.filename !== previousFilename);
        return [...withoutCurrent, nextNote].sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
      });

      setSelectedNoteId(noteId);
      markPersisted(nextNote.title);
      return true;
    },
    [draftStorageKey, makeUniqueFilename]
  );

  const saveCurrentDocument = useCallback(async (interactive = true): Promise<boolean> => {
    const current = currentNoteRef.current;
    if (!current) return false;

    try {
      const saved = await handleSaveNote({
        id: current.id,
        filename: current.filename,
        filepath: current.filepath,
        title: current.title,
        content: latestContentRef.current,
        tags: current.tags,
        date: current.date,
        interactive,
        isDraft: current.isDraft,
      });
      if (!saved) return false;
      if (current.isDraft) writeUnsavedDraft(draftStorageKey, null);
      return true;
    } catch (error) {
      console.error('Failed to save current document:', error);
      return false;
    }
  }, [handleSaveNote]);

  const saveCurrentDocumentAs = useCallback(async (): Promise<boolean> => {
    const current = currentNoteRef.current;
    if (!current) return false;

    try {
      const saved = await handleSaveNote({
        id: current.id,
        filename: current.filename,
        filepath: current.filepath,
        title: current.title,
        content: latestContentRef.current,
        tags: current.tags,
        date: current.date,
        interactive: true,
        isDraft: current.isDraft,
        saveAs: true,
      });
      return saved;
    } catch (error) {
      console.error('Failed to save current document as:', error);
      return false;
    }
  }, [draftStorageKey, handleSaveNote]);

  const handleEditorContentChange = useCallback((nextContent: string) => {
    latestContentRef.current = nextContent;
    const current = currentNoteRef.current;

    if (current?.isDraft) {
      const nextModifiedAt = new Date();
      const nextDraft = {
        ...(current ?? createDraftNote()),
        content: nextContent,
        modifiedAt: nextModifiedAt,
        isDraft: true,
      };

      setDraftNote((prev) => {
        if (!prev || prev.id !== nextDraft.id) return prev;
        if (prev.content === nextContent) return prev;
        return {
          ...prev,
          content: nextDraft.content,
          modifiedAt: nextDraft.modifiedAt,
          isDraft: true,
        };
      });

      writeUnsavedDraft(draftStorageKey, nextDraft);
    }

    window.__notelyUnsavedState = {
      dirty: Boolean(current) && nextContent !== lastSavedContentRef.current,
      title: current?.title || 'Untitled',
      isDraft: Boolean(current?.isDraft || !current?.filename),
      draftStorageKey,
    };
  }, [draftStorageKey]);

  const exportCurrentDocument = useCallback(async (): Promise<boolean> => {
    const current = currentNoteRef.current;
    if (!current) return false;

    try {
      const markdown = latestContentRef.current;
      const documentTitle = deriveDocumentTitle(markdown, current.title, current.filename);
      const renderedHtml = exportHtmlGetterRef.current?.() || '';
      const html = renderedHtml || await markdownToExportHtml(markdown);
      const suggestedBaseName = current.filename
        ? current.filename.replace(/\.(md|markdown)$/i, '')
        : generateFilename(documentTitle).replace(/\.(md|markdown)$/i, '');

      const result = await window.electronAPI.exportNotePdf({
        title: documentTitle,
        html,
        suggestedFileName: `${suggestedBaseName || 'note'}.pdf`,
        options: {
          pageSize: 'A4',
          orientation: 'portrait',
          includeHeader: false,
          includeTitle: false,
          includeDate: false,
          includePageNumbers: true,
        },
      });

      if (!result.success && !result.canceled) {
        console.error('Failed to export PDF:', result.error);
      }

      return Boolean(result.success);
    } catch (error) {
      console.error('Failed to export current document:', error);
      return false;
    }
  }, []);

  const exportCurrentDocumentAsImage = useCallback(async (): Promise<boolean> => {
    const current = currentNoteRef.current;
    if (!current) return false;

    try {
      const markdown = latestContentRef.current;
      const documentTitle = deriveDocumentTitle(markdown, current.title, current.filename);
      const renderedHtml = exportHtmlGetterRef.current?.() || '';
      const html = renderedHtml || await markdownToExportHtml(markdown);
      const suggestedBaseName = current.filename
        ? current.filename.replace(/\.(md|markdown)$/i, '')
        : generateFilename(documentTitle).replace(/\.(md|markdown)$/i, '');

      const result = await window.electronAPI.exportNoteImage({
        title: documentTitle,
        html,
        suggestedFileName: `${suggestedBaseName || 'note'}.png`,
        options: {
          includeTitle: false,
          includeDate: false,
        },
      });

      if (!result.success && !result.canceled) {
        console.error('Failed to export image:', result.error);
      }

      return Boolean(result.success);
    } catch (error) {
      console.error('Failed to export current document as image:', error);
      return false;
    }
  }, []);

  const handleOpenMarkdownFile = useCallback(async () => {
    const result = await window.electronAPI.openMarkdownFile?.();
    if (!result || result.canceled) return;

    if (!result.success || !result.note) {
      console.error('Failed to open markdown file:', result.error);
      return;
    }

    const nextRawNote = result.note;
    const parsed = parseNote(nextRawNote.content, nextRawNote.filename);
    const openedNote: Note = {
      ...nextRawNote,
      ...parsed,
      modifiedAt: new Date(nextRawNote.modifiedAt),
      createdAt: new Date(nextRawNote.createdAt),
    };

    if (result.directory) {
      activeDirectoryRef.current = result.directory;
    }

    setDraftNote(null);
    setNotes([openedNote]);
    setSelectedNoteId(openedNote.id);
    setIsQuickOpenOpen(false);
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onMenuAction((action) => {
      switch (action) {
        case 'new-note':
          void handleCreateNote();
          break;
        case 'save-note':
          void saveCurrentDocument(true);
          break;
        case 'save-note-as':
          void saveCurrentDocumentAs();
          break;
        case 'export-pdf':
          void exportCurrentDocument();
          break;
        case 'export-image':
          void exportCurrentDocumentAsImage();
          break;
        case 'open-file':
          void handleOpenMarkdownFile();
          break;
        case 'toggle-outline':
          setOutlineToggleKey((prev) => prev + 1);
          break;
        default:
          break;
      }
    });

    return unsubscribe;
  }, [exportCurrentDocument, exportCurrentDocumentAsImage, handleCreateNote, handleOpenMarkdownFile, saveCurrentDocument, saveCurrentDocumentAs]);

  const recentNotes = useMemo(
    () =>
      recentNoteIds
        .map((id) => notes.find((note) => note.id === id) ?? null)
        .filter((note): note is Note => Boolean(note)),
    [notes, recentNoteIds]
  );
  const quickOpenNotes = useMemo(() => {
    const normalized = quickOpenQuery.trim().toLowerCase();
    const base = normalized
      ? notes.filter((note) => (
          note.title.toLowerCase().includes(normalized) ||
          note.filename.toLowerCase().includes(normalized) ||
          note.contentBody.toLowerCase().includes(normalized)
        ))
      : recentNotes.length > 0 ? recentNotes : notes;

    return base
      .slice()
      .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
      .slice(0, 40);
  }, [notes, quickOpenQuery, recentNotes]);
  const currentNote = useMemo<EditorNote | null>(() => {
    if (selectedNoteId) {
      const selected = notes.find((note) => note.id === selectedNoteId);
      if (selected) return toEditorNote(selected);
    }
    if (draftNote) return draftNote;
    return null;
  }, [draftNote, notes, selectedNoteId]);

  useEffect(() => {
    const current = currentNote;
    currentNoteRef.current = current;
    latestContentRef.current = current?.content || '';
    lastSavedContentRef.current = current?.content || '';
  }, [currentNote?.id]);

  useEffect(() => {
    const current = currentNote;
    window.__notelySaveCurrent = saveCurrentDocument;
    window.__notelyUnsavedState = {
      dirty: Boolean(current) && latestContentRef.current !== lastSavedContentRef.current,
      title: current?.title || 'Untitled',
      isDraft: Boolean(current?.isDraft || !current?.filename),
      draftStorageKey,
    };

    return () => {
      delete window.__notelySaveCurrent;
      delete window.__notelyUnsavedState;
    };
  }, [currentNote, draftStorageKey, saveCurrentDocument]);

  return (
    <div className="app app-main">
      <Editor
        note={currentNote}
        onSave={handleSaveNote}
        onContentChange={handleEditorContentChange}
        onRegisterExportHtmlGetter={handleRegisterExportHtmlGetter}
        isLoading={isLoading && !currentNote}
        outlineToggleKey={outlineToggleKey}
      />
      {isQuickOpenOpen && (
        <Suspense fallback={null}>
          <QuickOpen
            isOpen={isQuickOpenOpen}
            notes={quickOpenNotes}
            selectedNoteId={selectedNoteId}
            query={quickOpenQuery}
            onQueryChange={setQuickOpenQuery}
            onSelectNote={handleSelectNote}
            onClose={() => setIsQuickOpenOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

// Settings window app
function SettingsApp() {
  const [storagePath, setStoragePath] = useState('');
  const [fontFamily, setFontFamily] = useState('');

  const handleChangeStoragePath = useCallback(async (path: string) => {
    setStoragePath(path);
    const result = await window.electronAPI.setStoragePath(path);
    if (result.success && result.path) {
      // Storage path updated
      console.log('Storage path updated:', result.path);
    }
  }, []);

  const handleChangeFontFamily = useCallback((family: string) => {
    setFontFamily(family);
    if (family) {
      document.documentElement.style.setProperty('--app-font-family', family);
    } else {
      document.documentElement.style.removeProperty('--app-font-family');
    }
  }, []);

  // Close window when clicking back
  const handleBack = useCallback(() => {
    window.close();
  }, []);

  return (
    <Suspense fallback={null}>
      <Settings
        onBack={handleBack}
        storagePath={storagePath}
        onChangeStoragePath={handleChangeStoragePath}
        fontFamily={fontFamily}
        onChangeFontFamily={handleChangeFontFamily}
      />
    </Suspense>
  );
}

// Export appropriate component based on window type
export default isSettingsWindow() ? SettingsApp : App;
