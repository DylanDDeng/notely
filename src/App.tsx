import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import NotesList from './components/NotesList/NotesList';
import Editor from './components/Editor/Editor';
import Settings from './components/Settings/Settings';
import Welcome from './components/Welcome/Welcome';
import { parseNote, generateNoteContent, generateFilename } from './utils/noteUtils';
import type { Note, RawNote, SaveNoteData, EditorNote } from './types';
import './styles/App.css';

type ViewType = 'welcome' | 'main' | 'settings';
type FilterType = 'all' | 'favorites' | 'archive' | 'trash' | string;

function App() {
  const [view, setView] = useState<ViewType>('welcome');
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [currentNote, setCurrentNote] = useState<EditorNote | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [, setStoragePath] = useState<string>('');

  // 检查是否有存储路径
  useEffect(() => {
    const checkStorage = async () => {
      const path = await window.electronAPI.getStoragePath();
      setStoragePath(path);
      if (path) {
        setView('main');
        loadNotes();
      }
    };
    checkStorage();
  }, []);

  // 加载所有笔记
  const loadNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const rawNotes: RawNote[] = await window.electronAPI.getAllNotes();
      const parsedNotes: Note[] = rawNotes.map(note => {
        const parsed = parseNote(note.content);
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
      handleSelectNote(filename.replace('.md', ''));
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  }, [loadNotes, handleSelectNote]);

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
        setView('main');
        loadNotes();
      }
    }
  }, [loadNotes]);

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

  // 欢迎页
  if (view === 'welcome') {
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
        <Settings onBack={() => setView('main')} />
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
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <NotesList
        notes={filteredNotes}
        selectedNoteId={selectedNoteId}
        onSelectNote={handleSelectNote}
        activeFilter={activeFilter}
      />
      <Editor
        note={currentNote}
        onSave={handleSaveNote}
        isLoading={isLoading && !currentNote}
      />
    </div>
  );
}

export default App;
