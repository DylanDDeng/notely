import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import NotesList from './components/NotesList/NotesList';
import Editor from './components/Editor/Editor';
import NoteModal from './components/NoteModal/NoteModal';
import Settings from './components/Settings/Settings';
import Welcome from './components/Welcome/Welcome';
import CalendarView from './components/Calendar/CalendarView';
import { parseNote, generateNoteContent, generateFilename } from './utils/noteUtils';
import KanbanBoardsList from './components/Kanban/KanbanBoardsList';
import KanbanBoard from './components/Kanban/KanbanBoard';
import { DEFAULT_DONE_COLUMNS, DEFAULT_KANBAN_COLUMNS, createId, serializeKanbanMarkdown } from './utils/kanbanUtils';
import type { Note, RawNote, SaveNoteData, EditorNote } from './types';
import './styles/App.css';

type ViewType = 'welcome' | 'main' | 'settings';
type FilterType = 'all' | 'calendar' | 'favorites' | 'archive' | 'trash' | string;
type NotesView = 'list' | 'grid';
type NotesSortOrder = 'desc' | 'asc';

const STORAGE_PATH_KEY = 'notes:storagePath';
const FONT_FAMILY_KEY = 'notes:fontFamily';
const NOTES_SORT_ORDER_KEY = 'notes:notesSortOrder';
const MIDDLE_PANE_COLLAPSED_KEY = 'notes:middlePaneCollapsed';
const DEFAULT_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const DAILY_NOTE_FILENAME_RE = /^\d{4}-\d{2}-\d{2}\.md$/i;

const toYmd = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isKanbanNote = (note: Note): boolean => note.type === 'kanban';

const isCalendarNote = (note: Note): boolean => {
  return note.type === 'calendar' || DAILY_NOTE_FILENAME_RE.test(note.filename);
};

// 检查是否是首次启动
const hasCompletedWelcome = (): boolean => {
  return localStorage.getItem('notes:hasCompletedWelcome') === 'true';
};

// 标记已完成欢迎页
const markWelcomeCompleted = () => {
  localStorage.setItem('notes:hasCompletedWelcome', 'true');
};

const getSavedStoragePath = (): string => {
  return localStorage.getItem(STORAGE_PATH_KEY) || '';
};

const saveStoragePath = (path: string) => {
  localStorage.setItem(STORAGE_PATH_KEY, path);
};

const getSavedFontFamily = (): string => {
  return localStorage.getItem(FONT_FAMILY_KEY) || '';
};

const saveFontFamily = (fontFamily: string) => {
  const trimmed = fontFamily.trim();
  if (!trimmed) {
    localStorage.removeItem(FONT_FAMILY_KEY);
    return;
  }
  localStorage.setItem(FONT_FAMILY_KEY, trimmed);
};

const getSavedMiddlePaneCollapsed = (): boolean => {
  try {
    return localStorage.getItem(MIDDLE_PANE_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
};

const saveMiddlePaneCollapsed = (collapsed: boolean) => {
  try {
    localStorage.setItem(MIDDLE_PANE_COLLAPSED_KEY, String(collapsed));
  } catch {
    // ignore
  }
};

function App() {
  const [view, setView] = useState<ViewType>('welcome');
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [currentNote, setCurrentNote] = useState<EditorNote | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [storagePath, setStoragePath] = useState<string>('');
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean>(true);
  const [notesView, setNotesView] = useState<NotesView>('list');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isModalFullScreen, setIsModalFullScreen] = useState(false);
  const [appFontFamily, setAppFontFamily] = useState<string>(() => getSavedFontFamily());
  const [selectedKanbanId, setSelectedKanbanId] = useState<string | null>(null);
  const [isMiddlePaneCollapsed, setIsMiddlePaneCollapsed] = useState<boolean>(() => getSavedMiddlePaneCollapsed());
  const [notesSortOrder, setNotesSortOrder] = useState<NotesSortOrder>(() => {
    try {
      return localStorage.getItem(NOTES_SORT_ORDER_KEY) === 'asc' ? 'asc' : 'desc';
    } catch {
      return 'desc';
    }
  });

  const toggleNotesSortOrder = useCallback(() => {
    setNotesSortOrder((prev) => {
      const next: NotesSortOrder = prev === 'desc' ? 'asc' : 'desc';
      try {
        localStorage.setItem(NOTES_SORT_ORDER_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const toggleMiddlePaneCollapsed = useCallback(() => {
    setIsMiddlePaneCollapsed((prev) => {
      const next = !prev;
      saveMiddlePaneCollapsed(next);
      return next;
    });
  }, []);

  const makeUniqueFilename = useCallback((title: string, excludeFilename?: string) => {
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
  }, [notes]);

  useEffect(() => {
    const trimmed = appFontFamily.trim();
    if (!trimmed) {
      document.documentElement.style.removeProperty('--app-font-family');
      return;
    }

    document.documentElement.style.setProperty('--app-font-family', `${trimmed}, ${DEFAULT_FONT_STACK}`);
  }, [appFontFamily]);

  // 初始化：检查是否是首次启动
  useEffect(() => {
    const init = async () => {
      const completed = hasCompletedWelcome();
      setIsFirstLaunch(!completed);
      
      if (completed) {
        // 非首次启动，直接加载主界面
        const savedPath = getSavedStoragePath();
        const result = await window.electronAPI.setStoragePath(savedPath);
        if (result.success) {
          const path = result.path || savedPath;
          setStoragePath(path);
          saveStoragePath(path);
          setView('main');
          loadNotes();
        } else {
          console.error('Failed to restore storage path:', result.error);
          setView('welcome');
          setIsFirstLaunch(true);
        }
      }
      // 首次启动保持 welcome 页面
    };
    init();
  }, []);

  // 加载所有笔记
  const loadNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const rawNotes: RawNote[] = await window.electronAPI.getAllNotes();
      const parsedNotes: Note[] = rawNotes.map(note => {
        const parsed = parseNote(note.content, note.filename);
        return {
          ...note,
          ...parsed,
        };
      });
      setNotes(parsedNotes);
    } catch (err) {
      console.error('Failed to load notes:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 选择笔记
  const handleSelectNote = useCallback((noteId: string) => {
    setSelectedNoteId(noteId);
    const note = notes.find(n => n.id === noteId && !isKanbanNote(n));
    if (note) {
      setCurrentNote({
        id: note.id,
        filename: note.filename,
        title: note.title,
        content: note.contentBody,
        tags: note.tags,
        date: note.date,
        createdAt: note.createdAt,
        modifiedAt: note.modifiedAt,
      });
    }
  }, [notes]);

  const handleOpenNote = useCallback((noteId: string) => {
    const note = notes.find((item) => item.id === noteId);
    if (note && isKanbanNote(note)) {
      setSelectedKanbanId(note.id);
      setActiveFilter('kanban');
      setIsModalOpen(false);
      setSearchQuery('');
      return;
    }

    handleSelectNote(noteId);
    if (notesView === 'grid') {
      setIsModalOpen(true);
    }
  }, [handleSelectNote, notes, notesView]);

  const handleNotesViewChange = useCallback((nextView: NotesView) => {
    setNotesView(nextView);
    if (nextView === 'list') {
      setIsModalOpen(false);
      setIsModalFullScreen(false);
    }
  }, []);

  // 创建新笔记
  const handleCreateNote = useCallback(async () => {
    const now = new Date();
    const frontmatter = {
      title: 'Untitled Note',
      date: now.toISOString(),
      tags: [] as string[],
    };
    const content = generateNoteContent(frontmatter, '');
    const filename = makeUniqueFilename('Untitled Note');
    
    try {
      await window.electronAPI.createNote({ filename, content });
      await loadNotes();
      handleOpenNote(filename.replace('.md', ''));
      if (activeFilter === 'kanban' || activeFilter === 'calendar') {
        setActiveFilter('all');
      }
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  }, [activeFilter, handleOpenNote, loadNotes, makeUniqueFilename]);

  // 保存笔记（用于自动保存）
  const handleSaveNote = useCallback(async (noteData: SaveNoteData) => {
    const now = new Date();
    const preserveModifiedAt = Boolean(noteData.preserveModifiedAt);
    const previousFilename = noteData.filename;
    const previousNoteId =
      noteData.id ||
      (previousFilename ? previousFilename.replace(/\.md$/i, '') : '');
    const existingNote = notes.find((note) => {
      if (previousNoteId && note.id === previousNoteId) return true;
      if (previousFilename && note.filename === previousFilename) return true;
      return false;
    });
    const existingType = existingNote?.type;
    const isCalendarEntry = existingType === 'calendar' || (previousFilename ? DAILY_NOTE_FILENAME_RE.test(previousFilename) : false);

    const frontmatter = {
      title: noteData.title,
      date: noteData.date || now.toISOString(),
      tags: noteData.tags,
      ...(isCalendarEntry ? { type: 'calendar' } : {}),
    };
    const fileContent = generateNoteContent(frontmatter, noteData.content);
    const filename =
      isCalendarEntry && previousFilename
        ? previousFilename
        : makeUniqueFilename(noteData.title, previousFilename);
    const nextNoteId = filename.replace(/\.md$/i, '');
    const isRenamed = Boolean(previousFilename && previousFilename !== filename);

    const result = await window.electronAPI.saveNote({ filename, content: fileContent, preserveModifiedAt });
    if (!result.success) {
      throw new Error(result.error || 'Failed to save note');
    }

    if (isRenamed && previousFilename) {
      const deleteResult = await window.electronAPI.deleteNote(previousFilename);
      if (!deleteResult.success) {
        console.warn('Failed to remove old note filename after rename:', deleteResult.error);
      }
    }

    const parsed = parseNote(fileContent, filename);
    setNotes(prevNotes => {
      const updatedNotes = prevNotes
        .map(note => {
          if (note.id !== previousNoteId) return note;
          const nextModifiedAt = preserveModifiedAt ? note.modifiedAt : now;
          const nextFilepath = note.filepath.replace(/[^/\\]+$/, filename);
          return {
            ...note,
            id: nextNoteId,
            filename,
            filepath: nextFilepath,
            content: fileContent,
            modifiedAt: nextModifiedAt,
            ...parsed,
          };
        })
        .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
      return updatedNotes;
    });

    if (selectedNoteId === previousNoteId) {
      setSelectedNoteId(nextNoteId);
    }

    setCurrentNote(prev => {
      if (!prev || prev.id !== previousNoteId) return prev;
      const nextModifiedAt = preserveModifiedAt ? prev.modifiedAt : now;
      return {
        ...prev,
        id: nextNoteId,
        filename,
        title: noteData.title,
        content: noteData.content,
        tags: noteData.tags,
        date: frontmatter.date,
        modifiedAt: nextModifiedAt,
      };
    });
  }, [makeUniqueFilename, notes, selectedNoteId]);

  // 开始使用 - 使用默认路径
  const handleGetStarted = useCallback(async () => {
    const result = await window.electronAPI.setStoragePath('');
    if (result.success) {
      setStoragePath(result.path || '');
      saveStoragePath(result.path || '');
      markWelcomeCompleted();
      setIsFirstLaunch(false);
      setView('main');
      loadNotes();
    }
  }, [loadNotes]);

  // 打开已有文件夹
  const handleOpenFolder = useCallback(async () => {
    const selectedPath = await window.electronAPI.selectDirectory();
    if (selectedPath) {
      const result = await window.electronAPI.setStoragePath(selectedPath);
      if (result.success) {
        setStoragePath(result.path || selectedPath);
        saveStoragePath(result.path || selectedPath);
        markWelcomeCompleted();
        setIsFirstLaunch(false);
        setView('main');
        loadNotes();
      }
    }
  }, [loadNotes]);

  useEffect(() => {
    if (!isModalOpen) {
      setIsModalFullScreen(false);
    }
  }, [isModalOpen]);

  const handleChangeStoragePath = useCallback(async (newPath: string) => {
    const result = await window.electronAPI.setStoragePath(newPath);
    if (!result.success) {
      console.error('Failed to change storage path:', result.error);
      return;
    }

    const nextPath = result.path || newPath;
    setStoragePath(nextPath);
    saveStoragePath(nextPath);
    setSelectedNoteId(null);
    setCurrentNote(null);
    setActiveFilter('all');
    setSearchQuery('');
    await loadNotes();
  }, [loadNotes]);

  const handleChangeFontFamily = useCallback((nextFontFamily: string) => {
    const trimmed = nextFontFamily.trim();
    setAppFontFamily(trimmed);
    saveFontFamily(trimmed);
  }, []);

  const handleOpenDailyNote = useCallback(async (date: Date) => {
    const ymd = toYmd(date);
    const filename = `${ymd}.md`;
    const existing = notes.find((note) => note.filename.toLowerCase() === filename.toLowerCase());

    try {
      if (!existing) {
        const localNoon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
        const frontmatter = {
          title: ymd,
          date: localNoon.toISOString(),
          tags: [] as string[],
          type: 'calendar' as const,
        };
        const content = generateNoteContent(frontmatter, '');
        const createResult = await window.electronAPI.createNote({ filename, content });
        if (!createResult.success) {
          throw new Error(createResult.error || 'Failed to create daily note');
        }
      } else if (isKanbanNote(existing)) {
        throw new Error(`"${filename}" already exists and is used by a kanban board`);
      }

      const rawNotes = await window.electronAPI.getAllNotes();
      const raw = rawNotes.find((item) => item.filename.toLowerCase() === filename.toLowerCase());
      if (!raw) {
        throw new Error('Daily note was not found after creation');
      }
      const parsed = parseNote(raw.content, raw.filename);
      const createdAt = new Date(raw.createdAt);
      const modifiedAt = new Date(raw.modifiedAt);

      setSelectedNoteId(raw.id);
      setCurrentNote({
        id: raw.id,
        filename: raw.filename,
        title: parsed.title,
        content: parsed.contentBody,
        tags: parsed.tags,
        date: parsed.date,
        createdAt,
        modifiedAt,
      });
      setIsModalOpen(false);
      setIsModalFullScreen(false);
      setNotesView('list');
      await loadNotes();
    } catch (err) {
      console.error('Failed to open daily note:', err);
      window.alert(err instanceof Error ? err.message : 'Failed to open daily note');
    }
  }, [loadNotes, notes]);

  const regularNotes = notes.filter((note) => !isKanbanNote(note) && !isCalendarNote(note));
  const calendarNotes = notes.filter((note) => isCalendarNote(note) && !isKanbanNote(note));
  const kanbanNotes = notes.filter((note) => isKanbanNote(note));
  const selectedKanbanNote = selectedKanbanId ? kanbanNotes.find((n) => n.id === selectedKanbanId) ?? null : null;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const isGlobalSearchMode = normalizedSearch.length > 0;

  const filteredNotes = regularNotes.filter(note => {
    if (isGlobalSearchMode) return true;

    // 标签/分类过滤
    switch (activeFilter) {
      case 'all':
        return true;
      case 'favorites':
        return note.tags?.includes('favorite');
      case 'archive':
        return note.tags?.includes('archive');
      case 'trash':
        return note.tags?.includes('trash');
      default:
        // 标签过滤
        if (activeFilter.startsWith('tag:')) {
          const tag = activeFilter.replace('tag:', '');
          return note.tags?.includes(tag);
        }
        return true;
    }
  });

  const sortedFilteredNotes = [...filteredNotes].sort((a, b) => {
    if (activeFilter === 'all') {
      const aPinned = Boolean(a.tags?.includes('pinned'));
      const bPinned = Boolean(b.tags?.includes('pinned'));
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
    }

    const diff = a.modifiedAt.getTime() - b.modifiedAt.getTime();
    return notesSortOrder === 'asc' ? diff : -diff;
  });

  const globalSearchNotes = notes.filter((note) => {
    if (!isGlobalSearchMode) return false;
    const matchTitle = note.title?.toLowerCase().includes(normalizedSearch);
    const matchContent = note.contentBody?.toLowerCase().includes(normalizedSearch);
    return Boolean(matchTitle || matchContent);
  }).sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());

  const notesListItems = isGlobalSearchMode ? globalSearchNotes : sortedFilteredNotes;
  const currentNoteRecord = currentNote
    ? notes.find((note) => note.id === currentNote.id || note.filename === currentNote.filename) ?? null
    : null;
  const calendarEditorNote =
    currentNote && (currentNoteRecord ? isCalendarNote(currentNoteRecord) : DAILY_NOTE_FILENAME_RE.test(currentNote.filename))
      ? currentNote
      : null;

  // 获取所有标签
  const allTags = [...new Set(regularNotes.flatMap(n => n.tags || []))]
    .filter(tag => !['favorite', 'archive', 'trash', 'pinned'].includes(tag));
  const tagCounts = regularNotes.reduce<Record<string, number>>((acc, note) => {
    (note.tags || []).forEach(tag => {
      if (['favorite', 'archive', 'trash', 'pinned'].includes(tag)) return;
      acc[tag] = (acc[tag] ?? 0) + 1;
    });
    return acc;
  }, {});

  const folderCounts = {
    all: regularNotes.length,
    calendar: calendarNotes.length,
    kanban: kanbanNotes.length,
    favorites: regularNotes.filter((note) => note.tags?.includes('favorite')).length,
    archive: regularNotes.filter((note) => note.tags?.includes('archive')).length,
    trash: regularNotes.filter((note) => note.tags?.includes('trash')).length,
  };

  useEffect(() => {
    if (activeFilter !== 'kanban') return;
    if (selectedKanbanId && kanbanNotes.some((b) => b.id === selectedKanbanId)) return;
    setSelectedKanbanId(kanbanNotes[0]?.id ?? null);
  }, [activeFilter, kanbanNotes, selectedKanbanId]);

  const handleCreateKanbanBoard = useCallback(
    async (title: string) => {
      const now = new Date();
      const filename = makeUniqueFilename(title);
      const frontmatter = {
        title,
        date: now.toISOString(),
        tags: [] as string[],
        type: 'kanban',
        kanban: { doneColumns: [...DEFAULT_DONE_COLUMNS] },
      };
      const body = serializeKanbanMarkdown({
        preamble: '',
        columns: DEFAULT_KANBAN_COLUMNS.map((colTitle) => ({
          id: createId(),
          title: colTitle,
          cards: [],
        })),
      });
      const content = generateNoteContent(frontmatter, body);

      await window.electronAPI.createNote({ filename, content });
      await loadNotes();
      setActiveFilter('kanban');
      setSelectedKanbanId(filename.replace(/\.md$/i, ''));
    },
    [loadNotes, makeUniqueFilename]
  );

  const handleDeleteKanbanBoard = useCallback(
    async (boardId: string) => {
      const board = kanbanNotes.find((b) => b.id === boardId);
      if (!board) return;
      if (!window.confirm(`Delete board "${board.title || 'Untitled'}"?`)) return;

      const result = await window.electronAPI.deleteNote(board.filename);
      if (!result.success) {
        console.error('Failed to delete board:', result.error);
        return;
      }

      setNotes((prev) => prev.filter((n) => n.id !== boardId));
      if (selectedKanbanId === boardId) {
        setSelectedKanbanId(null);
      }
    },
    [kanbanNotes, selectedKanbanId]
  );

  const handleSaveKanbanBoard = useCallback(async (noteId: string, filename: string, content: string) => {
    const now = new Date();
    const parsedFromContent = parseNote(content, filename);
    const nextFilename = makeUniqueFilename(parsedFromContent.title, filename);
    const previousFilename = filename;
    const previousNoteId = noteId || previousFilename.replace(/\.md$/i, '');
    const nextNoteId = nextFilename.replace(/\.md$/i, '');
    const isRenamed = previousFilename !== nextFilename;

    const result = await window.electronAPI.saveNote({ filename: nextFilename, content });
    if (!result.success) {
      throw new Error(result.error || 'Failed to save kanban board');
    }

    if (isRenamed) {
      const deleteResult = await window.electronAPI.deleteNote(previousFilename);
      if (!deleteResult.success) {
        console.warn('Failed to remove old kanban filename after rename:', deleteResult.error);
      }
    }

    const parsed = parseNote(content, nextFilename);
    setNotes((prevNotes) => {
      const updated = prevNotes
        .map((note) => {
          const isTarget =
            note.id === previousNoteId ||
            note.filename === previousFilename ||
            note.id === nextNoteId;
          if (!isTarget) return note;
          const nextFilepath = note.filepath.replace(/[^/\\]+$/, nextFilename);
          return {
            ...note,
            id: nextNoteId,
            filename: nextFilename,
            filepath: nextFilepath,
            content,
            modifiedAt: now,
            ...parsed,
          };
        })
        .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
      return updated;
    });

    if (selectedKanbanId === previousNoteId) {
      setSelectedKanbanId(nextNoteId);
    }
  }, [makeUniqueFilename, selectedKanbanId]);

  // 欢迎页
  if (view === 'welcome' || isFirstLaunch) {
    return (
      <div className="app app-welcome">
        <Welcome 
          onGetStarted={handleGetStarted}
          onOpenFolder={handleOpenFolder}
        />
      </div>
    );
  }

  // 设置页
  if (view === 'settings') {
    return (
      <div className="app app-settings">
        <Settings
          onBack={() => setView('main')}
          storagePath={storagePath}
          onChangeStoragePath={handleChangeStoragePath}
          fontFamily={appFontFamily}
          onChangeFontFamily={handleChangeFontFamily}
        />
      </div>
    );
  }

  // 主界面
  return (
    <div className="app app-main">
      <Sidebar
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onCreateNote={handleCreateNote}
        onOpenSettings={() => setView('settings')}
        storagePath={storagePath}
        tags={allTags}
        tagCounts={tagCounts}
        folderCounts={folderCounts}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      {isGlobalSearchMode ? (
        <>
          <NotesList
            notes={notesListItems}
            selectedNoteId={selectedNoteId}
            onOpenNote={handleOpenNote}
            activeFilter="search"
            isSearchMode
            notesView={notesView}
            onViewChange={handleNotesViewChange}
            sortOrder={notesSortOrder}
            onToggleSort={toggleNotesSortOrder}
            isCollapsed={isMiddlePaneCollapsed}
            onToggleCollapsed={toggleMiddlePaneCollapsed}
          />
          {notesView === 'list' && (
            <Editor
              note={currentNote}
              onSave={handleSaveNote}
              isLoading={isLoading && !currentNote}
            />
          )}
          <NoteModal
            isOpen={notesView === 'grid' && isModalOpen}
            note={currentNote}
            onSave={handleSaveNote}
            isLoading={isLoading && !currentNote}
            isFullScreen={isModalFullScreen}
            onToggleFullScreen={() => setIsModalFullScreen(prev => !prev)}
            onClose={() => setIsModalOpen(false)}
          />
        </>
      ) : activeFilter === 'kanban' ? (
        <>
          <KanbanBoardsList
            boards={kanbanNotes}
            selectedBoardId={selectedKanbanId}
            onSelectBoard={setSelectedKanbanId}
            onCreateBoard={handleCreateKanbanBoard}
            onDeleteBoard={handleDeleteKanbanBoard}
            isCollapsed={isMiddlePaneCollapsed}
            onToggleCollapsed={toggleMiddlePaneCollapsed}
          />
          <KanbanBoard boardNote={selectedKanbanNote} onSaveBoard={handleSaveKanbanBoard} />
        </>
      ) : activeFilter === 'calendar' ? (
        <>
          <CalendarView
            notes={calendarNotes}
            onSelectDate={handleOpenDailyNote}
          />
          <Editor
            note={calendarEditorNote}
            onSave={handleSaveNote}
            isLoading={isLoading && !calendarEditorNote}
          />
        </>
      ) : (
        <>
          <NotesList
            notes={notesListItems}
            selectedNoteId={selectedNoteId}
            onOpenNote={handleOpenNote}
            activeFilter={activeFilter}
            isSearchMode={isGlobalSearchMode}
            notesView={notesView}
            onViewChange={handleNotesViewChange}
            sortOrder={notesSortOrder}
            onToggleSort={toggleNotesSortOrder}
            isCollapsed={isMiddlePaneCollapsed}
            onToggleCollapsed={toggleMiddlePaneCollapsed}
          />
          {notesView === 'list' && (
            <Editor
              note={currentNote}
              onSave={handleSaveNote}
              isLoading={isLoading && !currentNote}
            />
          )}
          <NoteModal
            isOpen={notesView === 'grid' && isModalOpen}
            note={currentNote}
            onSave={handleSaveNote}
            isLoading={isLoading && !currentNote}
            isFullScreen={isModalFullScreen}
            onToggleFullScreen={() => setIsModalFullScreen(prev => !prev)}
            onClose={() => setIsModalOpen(false)}
          />
        </>
      )}
    </div>
  );
}

export default App;
