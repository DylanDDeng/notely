import { Command, FileText, FolderOpen, Plus, Search, X } from 'lucide-react';
import type { Note } from '../../types';
import './Sidebar.css';

interface SidebarProps {
  documentCount: number;
  notes: Note[];
  recentNotes: Note[];
  selectedNoteId: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenNote: (noteId: string) => void;
  onOpenQuickOpen: () => void;
  onCreateNote: () => void;
  onOpenFolder: () => void;
  storagePath: string;
  onClose: () => void;
}

function Sidebar({
  documentCount,
  notes,
  recentNotes,
  selectedNoteId,
  searchQuery,
  onSearchChange,
  onOpenNote,
  onOpenQuickOpen,
  onCreateNote,
  onOpenFolder,
  storagePath,
  onClose,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <span className="logo-text">Library</span>
          <span className="logo-count">{documentCount} docs</span>
        </div>
        <div className="sidebar-header-actions">
          <button className="icon-btn" onClick={onClose} title="Close library" aria-label="Close library">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="search-container">
        <Search size={16} className="search-icon" />
        <input
          type="text"
          placeholder="Search documents..."
          className="search-input"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <nav className="sidebar-section">
        <h3 className="section-title">Actions</h3>
        <ul className="nav-list">
          <li>
            <button className="nav-item" type="button" onClick={onOpenQuickOpen}>
              <Command size={18} />
              <span className="nav-label">Open Quickly</span>
              <span className="nav-shortcut">⌘P</span>
            </button>
          </li>
          <li>
            <button className="nav-item" type="button" onClick={onCreateNote}>
              <Plus size={18} />
              <span className="nav-label">New Document</span>
            </button>
          </li>
          <li>
            <button className="nav-item" type="button" onClick={onOpenFolder}>
              <FolderOpen size={18} />
              <span className="nav-label">Open Folder</span>
            </button>
          </li>
        </ul>
      </nav>

      <nav className="sidebar-section sidebar-files-section">
        <h3 className="section-title">Files</h3>
        {notes.length === 0 ? (
          <div className="sidebar-empty-hint">No documents in this folder yet.</div>
        ) : (
          <ul className="nav-list sidebar-file-list">
            {notes.map((note) => (
              <li key={note.id}>
                <button
                  className={`nav-item sidebar-file-item ${selectedNoteId === note.id ? 'active' : ''}`}
                  type="button"
                  onClick={() => onOpenNote(note.id)}
                  title={note.filename}
                >
                  <FileText size={16} />
                  <span className="nav-label">{note.title || note.filename}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      {recentNotes.length > 0 && (
        <nav className="sidebar-section">
          <h3 className="section-title">Recent</h3>
          <ul className="nav-list sidebar-recent-list">
            {recentNotes.map((note) => (
              <li key={note.id}>
                <button
                  className={`nav-item sidebar-recent-item ${selectedNoteId === note.id ? 'active' : ''}`}
                  type="button"
                  onClick={() => onOpenNote(note.id)}
                  title={note.filename}
                >
                  <span className="nav-label">{note.title || note.filename}</span>
                  <span className="sidebar-recent-file">{note.filename}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="sidebar-footer">
        <span className="sidebar-footer-label">Library</span>
        <span className="sidebar-footer-path" title={storagePath}>
          {storagePath || 'Default Documents folder'}
        </span>
      </div>
    </aside>
  );
}

export default Sidebar;
