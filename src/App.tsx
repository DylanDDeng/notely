import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import Sidebar from './components/Sidebar/Sidebar';
import Editor from './components/Editor/Editor';
import Settings from './components/Settings/Settings';
import QuickOpen from './components/QuickOpen/QuickOpen';
import { generateFilename, generateNoteContent, parseNote } from './utils/noteUtils';
import type { EditorNote, Note, RawNote, SaveNoteData } from './types';
import './styles/App.css';
type ViewType = 'main' | 'settings';
type Theme = 'light' | 'dark' | 'system';

const STORAGE_PATH_KEY = 'notes:storagePath';
const FONT_FAMILY_KEY = 'notes:fontFamily';
const SIDEBAR_OPEN_KEY = 'notes:sidebarOpen';
const THEME_KEY = 'notes:theme';
const RECENT_NOTE_IDS_KEY = 'notes:recentNoteIds';
const UNSAVED_DRAFT_KEY = 'notes:unsavedDraft';
const DEFAULT_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const getSavedStoragePath = (): string => localStorage.getItem(STORAGE_PATH_KEY) || '';

const saveStoragePath = (path: string) => {
  localStorage.setItem(STORAGE_PATH_KEY, path);
};

const getSavedFontFamily = (): string => localStorage.getItem(FONT_FAMILY_KEY) || '';

const saveFontFamily = (fontFamily: string) => {
  const trimmed = fontFamily.trim();
  if (!trimmed) {
    localStorage.removeItem(FONT_FAMILY_KEY);
    return;
  }
  localStorage.setItem(FONT_FAMILY_KEY, trimmed);
};

const getSavedSidebarOpen = (): boolean => {
  try {
    return localStorage.getItem(SIDEBAR_OPEN_KEY) === 'true';
  } catch {
    return false;
  }
};

const saveSidebarOpen = (open: boolean) => {
  try {
    localStorage.setItem(SIDEBAR_OPEN_KEY, String(open));
  } catch {
    // ignore
  }
};

const getSavedTheme = (): Theme => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // ignore
  }
  return 'system';
};

const saveTheme = (theme: Theme) => {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
};

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

const readUnsavedDraft = (): EditorNote | null => {
  try {
    const raw = localStorage.getItem(UNSAVED_DRAFT_KEY);
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

const writeUnsavedDraft = (draft: EditorNote | null) => {
  try {
    if (!draft || !draft.isDraft) {
      localStorage.removeItem(UNSAVED_DRAFT_KEY);
      return;
    }
    localStorage.setItem(UNSAVED_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore
  }
};

const applyTheme = (theme: Theme) => {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effectiveTheme = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
  document.documentElement.setAttribute('data-theme', effectiveTheme);
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

  const trimmedFilename = filename?.replace(/\.md$/i, '').trim();
  if (trimmedFilename) return trimmedFilename;

  return 'Untitled';
};

const markdownToExportHtml = async (markdown: string): Promise<string> => {
  const result = await remark()
    .use(remarkGfm)
    .use(remarkHtml)
    .process(markdown);

  return String(result);
};

function App() {
  const [view, setView] = useState<ViewType>('main');
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [storagePath, setStoragePath] = useState<string>('');
  const [appFontFamily, setAppFontFamily] = useState<string>(() => getSavedFontFamily());
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => getSavedSidebarOpen());
  const [theme, setTheme] = useState<Theme>(() => getSavedTheme());
  const [recentNoteIds, setRecentNoteIds] = useState<string[]>(() => getSavedRecentNoteIds());
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState('');
  const [outlineToggleKey, setOutlineToggleKey] = useState(0);
  const [manualSaveKey, setManualSaveKey] = useState(0);
  const [draftNote, setDraftNote] = useState<EditorNote | null>(() => readUnsavedDraft() ?? createDraftNote());
  const notesRef = useRef<Note[]>([]);
  const storagePathRef = useRef(storagePath);
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

  useEffect(() => {
    storagePathRef.current = storagePath;
  }, [storagePath]);

  useEffect(() => {
    saveSidebarOpen(isSidebarOpen);
  }, [isSidebarOpen]);

  const makeUniqueFilename = useCallback(
    (title: string, excludeFilename?: string) => {
      const baseFilename = generateFilename(title);
      const baseName = baseFilename.replace(/\.md$/i, '');
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
    const trimmed = appFontFamily.trim();
    if (!trimmed) {
      document.documentElement.style.removeProperty('--app-font-family');
      return;
    }
    document.documentElement.style.setProperty('--app-font-family', `${trimmed}, ${DEFAULT_FONT_STACK}`);
  }, [appFontFamily]);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyTheme('system');
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const loadNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const rawNotes: RawNote[] = await window.electronAPI.getAllNotes();
      const parsedNotes: Note[] = rawNotes.map((note) => {
        const parsed = parseNote(note.content, note.filename);
        return {
          ...note,
          ...parsed,
          modifiedAt: new Date(note.modifiedAt),
          createdAt: new Date(note.createdAt),
        };
      });
      setNotes(parsedNotes);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const savedPath = getSavedStoragePath();
      const result = await window.electronAPI.setStoragePath(savedPath);
      if (!result.success) {
        console.error('Failed to restore storage path:', result.error);
        return;
      }

      const nextPath = result.path || savedPath;
      setStoragePath(nextPath);
      saveStoragePath(nextPath);
      setView('main');
      await loadNotes();
    };

    void init();
  }, [loadNotes]);

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
    setIsSidebarOpen(false);
  }, []);

  useEffect(() => {
    if (view !== 'main') return;
    if (selectedNoteId) return;
    if (draftNote) return;
    setDraftNote(createDraftNote());
  }, [draftNote, selectedNoteId, view]);

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
    setSearchQuery('');
    setDraftNote(createDraftNote());
  }, []);

  const handleSaveNote = useCallback(
    async (noteData: SaveNoteData) => {
      const now = new Date();
      const isDraft = Boolean(noteData.isDraft || !noteData.filename);
      const nextTitle = noteData.title.trim() || 'Untitled';

      if (isDraft) {
        if (!noteData.interactive) {
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
          return;
        }

        const suggestedFilename = makeUniqueFilename(nextTitle);
        const draftContent = generateNoteContent(
          {
            title: nextTitle,
            date: noteData.date || now.toISOString(),
            tags: [],
          },
          noteData.content
        );

        const saveAsResult = await window.electronAPI.saveNoteAs?.({
          suggestedFilename,
          content: draftContent,
        });

        if (!saveAsResult || saveAsResult.canceled) {
          return;
        }

        if (!saveAsResult.success || !saveAsResult.filename || !saveAsResult.filepath) {
          throw new Error(saveAsResult.error || 'Failed to save document');
        }

        const parsed = parseNote(draftContent, saveAsResult.filename);
        const savedNote: Note = {
          id: saveAsResult.filename.replace(/\.md$/i, ''),
          filename: saveAsResult.filename,
          filepath: saveAsResult.filepath,
          content: draftContent,
          title: parsed.title,
          date: parsed.date,
          tags: [],
          contentBody: parsed.contentBody,
          rawContent: parsed.rawContent,
          type: parsed.type,
          kanban: parsed.kanban,
          modifiedAt: now,
          createdAt: now,
        };

        if (saveAsResult.directory) {
          setStoragePath(saveAsResult.directory);
          saveStoragePath(saveAsResult.directory);
        }

        writeUnsavedDraft(null);
        setNotes((prev) => [...prev.filter((note) => note.filepath !== savedNote.filepath), savedNote].sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime()));
        setDraftNote(null);
        setSelectedNoteId(savedNote.id);
        return;
      }

      const previousFilename = noteData.filename?.trim();
      const forcedFilename = noteData.forceFilename?.trim();
      const filename = forcedFilename || previousFilename || generateFilename(noteData.title);
      const noteId = (filename || '').replace(/\.md$/i, '');
      const existingNote = notesRef.current.find((note) => note.id === noteData.id || note.filename === previousFilename);
      const nextDate = noteData.date || existingNote?.date || now.toISOString();
      const fileContent = generateNoteContent(
        {
          title: nextTitle,
          date: nextDate,
          tags: [],
        },
        noteData.content
      );

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
        filepath: existingNote?.filepath?.replace(/[^/\\]+$/, filename) || `${storagePathRef.current}/${filename}`,
        content: fileContent,
        title: parsed.title,
        date: parsed.date,
        tags: [],
        contentBody: parsed.contentBody,
        rawContent: parsed.rawContent,
        type: parsed.type,
        kanban: parsed.kanban,
        modifiedAt: noteData.preserveModifiedAt ? existingNote?.modifiedAt || now : now,
        createdAt: existingNote?.createdAt || now,
      };

      setNotes((prev) => {
        const withoutCurrent = prev.filter((note) => note.id !== existingNote?.id && note.filename !== previousFilename);
        return [...withoutCurrent, nextNote].sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
      });

      setSelectedNoteId(noteId);
    },
    [makeUniqueFilename]
  );

  const saveCurrentDocument = useCallback(async (interactive = true): Promise<boolean> => {
    const current = currentNoteRef.current;
    if (!current) return false;

    try {
      await handleSaveNote({
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
      lastSavedContentRef.current = latestContentRef.current;
      if (current.isDraft) writeUnsavedDraft(null);
      return true;
    } catch (error) {
      console.error('Failed to save current document:', error);
      return false;
    }
  }, [handleSaveNote]);

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

      writeUnsavedDraft(nextDraft);
    }

    window.__notelyUnsavedState = {
      dirty: Boolean(current) && nextContent !== lastSavedContentRef.current,
      title: current?.title || 'Untitled',
      isDraft: Boolean(current?.isDraft || !current?.filename),
    };
  }, []);

  const exportCurrentDocument = useCallback(async (): Promise<boolean> => {
    const current = currentNoteRef.current;
    if (!current) return false;

    try {
      const markdown = latestContentRef.current;
      const documentTitle = deriveDocumentTitle(markdown, current.title, current.filename);
      const renderedHtml = exportHtmlGetterRef.current?.() || '';
      const html = renderedHtml || await markdownToExportHtml(markdown);
      const suggestedBaseName = current.filename
        ? current.filename.replace(/\.md$/i, '')
        : generateFilename(documentTitle).replace(/\.md$/i, '');

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
          fontFamily: appFontFamily.trim(),
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
  }, [appFontFamily]);

  const handleOpenFolder = useCallback(async () => {
    const selectedPath = await window.electronAPI.selectDirectory();
    if (!selectedPath) return;

    const result = await window.electronAPI.setStoragePath(selectedPath);
    if (!result.success) return;

    const nextPath = result.path || selectedPath;
    setStoragePath(nextPath);
    saveStoragePath(nextPath);
    setView('main');
    setDraftNote(null);
    await loadNotes();
  }, [loadNotes]);

  const handleChangeStoragePath = useCallback(
    async (newPath: string) => {
      const result = await window.electronAPI.setStoragePath(newPath);
      if (!result.success) {
        console.error('Failed to change storage path:', result.error);
        return;
      }

      const nextPath = result.path || newPath;
      setStoragePath(nextPath);
      saveStoragePath(nextPath);
      setSelectedNoteId(null);
      setSearchQuery('');
      await loadNotes();
    },
    [loadNotes]
  );

  const handleChangeFontFamily = useCallback((nextFontFamily: string) => {
    const trimmed = nextFontFamily.trim();
    setAppFontFamily(trimmed);
    saveFontFamily(trimmed);
  }, []);

  const handleChangeTheme = useCallback((nextTheme: Theme) => {
    setTheme(nextTheme);
    saveTheme(nextTheme);
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onMenuAction((action) => {
      switch (action) {
        case 'new-note':
          setView('main');
          void handleCreateNote();
          break;
        case 'save-note':
          setView('main');
          setManualSaveKey((prev) => prev + 1);
          break;
        case 'export-pdf':
          setView('main');
          void exportCurrentDocument();
          break;
        case 'open-folder':
          void handleOpenFolder();
          break;
        case 'open-settings':
          setView('settings');
          break;
        case 'toggle-sidebar':
          setView('main');
          setIsSidebarOpen((prev) => !prev);
          break;
        case 'toggle-outline':
          setView('main');
          setOutlineToggleKey((prev) => prev + 1);
          break;
        default:
          break;
      }
    });

    return unsubscribe;
  }, [exportCurrentDocument, handleCreateNote, handleOpenFolder]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleNotes = useMemo(() => {
    const filtered = notes.filter((note) => {
      if (!normalizedSearch) return true;
      return (
        note.title.toLowerCase().includes(normalizedSearch) ||
        note.contentBody.toLowerCase().includes(normalizedSearch) ||
        note.filename.toLowerCase().includes(normalizedSearch)
      );
    });

    return filtered.sort((a, b) => {
      return b.modifiedAt.getTime() - a.modifiedAt.getTime();
    });
  }, [normalizedSearch, notes]);
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
    };

    return () => {
      delete window.__notelySaveCurrent;
      delete window.__notelyUnsavedState;
    };
  }, [currentNote, saveCurrentDocument]);

  if (view === 'settings') {
    return (
      <div className="app app-settings">
        <Settings
          onBack={() => setView('main')}
          storagePath={storagePath}
          onChangeStoragePath={handleChangeStoragePath}
          fontFamily={appFontFamily}
          onChangeFontFamily={handleChangeFontFamily}
          theme={theme}
          onChangeTheme={handleChangeTheme}
        />
      </div>
    );
  }

  return (
    <div className="app app-main">
      {isSidebarOpen && (
        <div className="app-sidebar-layer">
          <button
            type="button"
            className="app-sidebar-backdrop"
            aria-label="Close file browser"
            onClick={() => setIsSidebarOpen(false)}
          />
          <Sidebar
            documentCount={notes.length}
            notes={visibleNotes}
            recentNotes={recentNotes}
            selectedNoteId={selectedNoteId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onOpenNote={handleSelectNote}
            onOpenQuickOpen={() => {
              setQuickOpenQuery('');
              setIsQuickOpenOpen(true);
            }}
            onCreateNote={handleCreateNote}
            onOpenFolder={handleOpenFolder}
            storagePath={storagePath}
            onClose={() => setIsSidebarOpen(false)}
          />
        </div>
      )}
      <Editor
        note={currentNote}
        onSave={handleSaveNote}
        onContentChange={handleEditorContentChange}
        onRegisterExportHtmlGetter={handleRegisterExportHtmlGetter}
        isLoading={isLoading && !currentNote}
        outlineToggleKey={outlineToggleKey}
        saveRequestKey={manualSaveKey}
      />
      <QuickOpen
        isOpen={isQuickOpenOpen}
        notes={quickOpenNotes}
        selectedNoteId={selectedNoteId}
        query={quickOpenQuery}
        onQueryChange={setQuickOpenQuery}
        onSelectNote={handleSelectNote}
        onClose={() => setIsQuickOpenOpen(false)}
      />
    </div>
  );
}

export default App;
