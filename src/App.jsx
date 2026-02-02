import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import NotesList from './components/NotesList/NotesList';
import Editor from './components/Editor/Editor';
import Settings from './components/Settings/Settings';
import { parseNote, generateNoteContent, generateFilename } from './utils/noteUtils';
import './styles/App.css';

function App() {
  const [notes, setNotes] = useState([]);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [currentNote, setCurrentNote] = useState(null);
  const [view, setView] = useState('main'); // 'main' | 'settings'
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'favorites' | 'archive' | 'trash' | tag
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // 加载所有笔记
  const loadNotes = useCallback(async () => {
    try {
      const rawNotes = await window.electronAPI.getAllNotes();
      const parsedNotes = rawNotes.map(note => ({
        ...note,
        ...parseNote(note.content),
      }));
      setNotes(parsedNotes);
    } catch (err) {
      console.error('Failed to load notes:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // 选择笔记
  const handleSelectNote = useCallback((noteId) => {
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
      tags: [],
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
  const handleSaveNote = useCallback(async (noteData) => {
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

  if (view === 'settings') {
    return (
      <div className="app">
        <Settings onBack={() => setView('main')} />
      </div>
    );
  }

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
