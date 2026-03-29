import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import Editor from './components/Editor/Editor';
import Settings from './components/Settings/Settings';
import QuickOpen from './components/QuickOpen/QuickOpen';
import Welcome from './components/Welcome/Welcome';
import { generateFilename, generateNoteContent, parseNote } from './utils/noteUtils';
import type { EditorNote, Note, RawNote, SaveNoteData } from './types';
import './styles/App.css';
type ViewType = 'welcome' | 'main' | 'settings';
type Theme = 'light' | 'dark' | 'system';

const STORAGE_PATH_KEY = 'notes:storagePath';
const FONT_FAMILY_KEY = 'notes:fontFamily';
const SIDEBAR_OPEN_KEY = 'notes:sidebarOpen';
const THEME_KEY = 'notes:theme';
const RECENT_NOTE_IDS_KEY = 'notes:recentNoteIds';
const DEFAULT_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const hasCompletedWelcome = (): boolean => localStorage.getItem('notes:hasCompletedWelcome') === 'true';

const markWelcomeCompleted = () => {
  localStorage.setItem('notes:hasCompletedWelcome', 'true');
};

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

const applyTheme = (theme: Theme) => {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effectiveTheme = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
  document.documentElement.setAttribute('data-theme', effectiveTheme);
};

const toEditorNote = (note: Note): EditorNote => ({
  id: note.id,
  filename: note.filename,
  title: note.title,
  content: note.contentBody,
  tags: [],
  date: note.date,
  createdAt: note.createdAt,
  modifiedAt: note.modifiedAt,
});

function App() {
  const [view, setView] = useState<ViewType>('welcome');
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [storagePath, setStoragePath] = useState<string>('');
  const [isFirstLaunch, setIsFirstLaunch] = useState(true);
  const [appFontFamily, setAppFontFamily] = useState<string>(() => getSavedFontFamily());
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => getSavedSidebarOpen());
  const [theme, setTheme] = useState<Theme>(() => getSavedTheme());
  const [recentNoteIds, setRecentNoteIds] = useState<string[]>(() => getSavedRecentNoteIds());
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState('');
  const [outlineToggleKey, setOutlineToggleKey] = useState(0);
  const notesRef = useRef<Note[]>([]);
  const storagePathRef = useRef(storagePath);
  const emptyVaultBootstrapPathRef = useRef<string | null>(null);

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
      const completed = hasCompletedWelcome();
      setIsFirstLaunch(!completed);

      if (!completed) return;

      const savedPath = getSavedStoragePath();
      const result = await window.electronAPI.setStoragePath(savedPath);
      if (!result.success) {
        console.error('Failed to restore storage path:', result.error);
        setView('welcome');
        setIsFirstLaunch(true);
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

    if (selectedNoteId) {
      if (notes.some((note) => note.id === selectedNoteId)) return;
    }

    setSelectedNoteId(notes[0].id);
  }, [notes, selectedNoteId]);

  const handleSelectNote = useCallback((noteId: string) => {
    setSelectedNoteId(noteId);
    setIsSidebarOpen(false);
  }, []);

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
    const now = new Date();
    const title = 'Untitled';
    const filename = makeUniqueFilename(title);
    const content = generateNoteContent(
      {
        title,
        date: now.toISOString(),
        tags: [],
      },
      ''
    );

    try {
      const result = await window.electronAPI.createNote({ filename, content });
      if (!result.success) {
        throw new Error(result.error || 'Failed to create document');
      }
      setSearchQuery('');
      await loadNotes();
      handleSelectNote(filename.replace(/\.md$/i, ''));
    } catch (err) {
      console.error('Failed to create document:', err);
    }
  }, [handleSelectNote, loadNotes, makeUniqueFilename]);

  const handleSaveNote = useCallback(
    async (noteData: SaveNoteData) => {
      const now = new Date();
      const previousFilename = noteData.filename?.trim();
      const forcedFilename = noteData.forceFilename?.trim();
      const filename = forcedFilename || previousFilename || generateFilename(noteData.title);
      const noteId = (filename || '').replace(/\.md$/i, '');
      const existingNote = notesRef.current.find((note) => note.id === noteData.id || note.filename === previousFilename);
      const nextTitle = noteData.title.trim() || 'Untitled';
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
    []
  );

  const handleGetStarted = useCallback(async () => {
    const result = await window.electronAPI.setStoragePath('');
    if (!result.success) return;

    const nextPath = result.path || '';
    setStoragePath(nextPath);
    saveStoragePath(nextPath);
    markWelcomeCompleted();
    setIsFirstLaunch(false);
    setView('main');
    await loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    if (view !== 'main') return;
    if (isLoading) return;
    if (notes.length > 0) {
      emptyVaultBootstrapPathRef.current = null;
      return;
    }

    const bootstrapKey = storagePath || '__default__';
    if (emptyVaultBootstrapPathRef.current === bootstrapKey) return;
    emptyVaultBootstrapPathRef.current = bootstrapKey;
    void handleCreateNote();
  }, [handleCreateNote, isLoading, notes.length, storagePath, view]);

  const handleOpenFolder = useCallback(async () => {
    const selectedPath = await window.electronAPI.selectDirectory();
    if (!selectedPath) return;

    const result = await window.electronAPI.setStoragePath(selectedPath);
    if (!result.success) return;

    const nextPath = result.path || selectedPath;
    setStoragePath(nextPath);
    saveStoragePath(nextPath);
    markWelcomeCompleted();
    setIsFirstLaunch(false);
    setView('main');
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
  }, [handleCreateNote, handleOpenFolder]);

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
    if (!selectedNoteId) return null;
    const selected = notes.find((note) => note.id === selectedNoteId);
    return selected ? toEditorNote(selected) : null;
  }, [notes, selectedNoteId]);

  if (view === 'welcome' || isFirstLaunch) {
    return (
      <div className="app app-welcome">
        <Welcome onGetStarted={handleGetStarted} onOpenFolder={handleOpenFolder} />
      </div>
    );
  }

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
        isLoading={isLoading && !currentNote}
        outlineToggleKey={outlineToggleKey}
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
