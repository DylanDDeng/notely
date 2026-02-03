import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import NotesList from './components/NotesList/NotesList';
import Editor from './components/Editor/Editor';
import NoteModal from './components/NoteModal/NoteModal';
import Settings from './components/Settings/Settings';
import Welcome from './components/Welcome/Welcome';
import { parseNote, generateNoteContent, generateFilename } from './utils/noteUtils';
import type { Note, RawNote, SaveNoteData, EditorNote } from './types';
import './styles/App.css';

type ViewType = 'welcome' | 'main' | 'settings';
type FilterType = 'all' | 'favorites' | 'archive' | 'trash' | string;
type NotesView = 'list' | 'grid';

const STORAGE_PATH_KEY = 'notes:storagePath';
const FONT_FAMILY_KEY = 'notes:fontFamily';
const DEFAULT_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

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
    const note = notes.find(n => n.id === noteId);
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
    handleSelectNote(noteId);
    if (notesView === 'grid') {
      setIsModalOpen(true);
    }
  }, [handleSelectNote, notesView]);

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
    const filename = generateFilename('Untitled Note', now);
    
    try {
      await window.electronAPI.createNote({ filename, content });
      await loadNotes();
      handleOpenNote(filename.replace('.md', ''));
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  }, [loadNotes, handleOpenNote]);

  // 保存笔记（用于自动保存）
  const handleSaveNote = useCallback(async (noteData: SaveNoteData) => {
    try {
      const frontmatter = {
        title: noteData.title,
        date: noteData.date || new Date().toISOString(),
        tags: noteData.tags,
      };
      const content = generateNoteContent(frontmatter, noteData.content);
      const filename = noteData.filename || generateFilename(noteData.title, new Date());
      
      await window.electronAPI.saveNote({ filename, content });
      await loadNotes();
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  }, [loadNotes]);

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

  // 过滤笔记
  const filteredNotes = notes.filter(note => {
    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchTitle = note.title?.toLowerCase().includes(query);
      const matchContent = note.contentBody?.toLowerCase().includes(query);
      if (!matchTitle && !matchContent) return false;
    }

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

  // 获取所有标签
  const allTags = [...new Set(notes.flatMap(n => n.tags || []))]
    .filter(tag => !['favorite', 'archive', 'trash'].includes(tag));
  const tagCounts = notes.reduce<Record<string, number>>((acc, note) => {
    (note.tags || []).forEach(tag => {
      if (['favorite', 'archive', 'trash'].includes(tag)) return;
      acc[tag] = (acc[tag] ?? 0) + 1;
    });
    return acc;
  }, {});

  // 欢迎页
  if (view === 'welcome' || isFirstLaunch) {
    return (
      <div className="app">
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
      <div className="app">
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
    <div className="app">
      <Sidebar
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onCreateNote={handleCreateNote}
        onOpenSettings={() => setView('settings')}
        tags={allTags}
        tagCounts={tagCounts}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <NotesList
        notes={filteredNotes}
        selectedNoteId={selectedNoteId}
        onOpenNote={handleOpenNote}
        activeFilter={activeFilter}
        notesView={notesView}
        onViewChange={handleNotesViewChange}
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
    </div>
  );
}

export default App;
