import { ArrowUpDown, LayoutGrid, LayoutList } from 'lucide-react';
import { formatDate, getTagColor } from '../../utils/noteUtils';
import type { Note } from '../../types';
import './NotesList.css';

const FILTER_TITLES: Record<string, string> = {
  'all': 'All Notes',
  'favorites': 'Favorites',
  'archive': 'Archive',
  'trash': 'Trash',
};

interface NotesListProps {
  notes: Note[];
  selectedNoteId: string | null;
  onOpenNote: (noteId: string) => void;
  activeFilter: string;
  notesView: 'list' | 'grid';
  onViewChange: (view: 'list' | 'grid') => void;
  sortOrder: 'desc' | 'asc';
  onToggleSort: () => void;
}

function NotesList({
  notes,
  selectedNoteId,
  onOpenNote,
  activeFilter,
  notesView,
  onViewChange,
  sortOrder,
  onToggleSort,
}: NotesListProps) {
  const title = FILTER_TITLES[activeFilter] || 
    (activeFilter.startsWith('tag:') ? activeFilter.replace('tag:', '') : 'Notes');

  return (
    <div className={`notes-list ${notesView === 'grid' ? 'grid-view' : ''}`}>
      {/* Header */}
      <div className="notes-list-header">
        <h2 className="notes-list-title">{title}</h2>
        <div className="notes-list-actions">
          <button
            type="button"
            className={`action-btn ${sortOrder === 'asc' ? 'active' : ''}`}
            title={sortOrder === 'desc' ? 'Sorted: newest first (click for oldest first)' : 'Sorted: oldest first (click for newest first)'}
            aria-label={sortOrder === 'desc' ? 'Sort by modified date: newest first' : 'Sort by modified date: oldest first'}
            onClick={onToggleSort}
          >
            <ArrowUpDown size={16} />
          </button>
          <button
            className={`action-btn ${notesView === 'list' ? 'active' : ''}`}
            title="List view"
            onClick={() => onViewChange('list')}
          >
            <LayoutList size={16} />
          </button>
          <button
            className={`action-btn ${notesView === 'grid' ? 'active' : ''}`}
            title="Grid view"
            onClick={() => onViewChange('grid')}
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>

      {/* Notes */}
      <div className={`notes-container ${notesView === 'grid' ? 'grid' : ''}`}>
        {notes.length === 0 ? (
          <div className="empty-state">
            <p>No notes found</p>
            <p className="empty-hint">Create a new note to get started</p>
          </div>
        ) : (
          notes.map((note) => {
            const isSelected = note.id === selectedNoteId;
            const mainTag = note.tags?.find(tag => 
              !['favorite', 'archive', 'trash'].includes(tag)
            );
            
            return (
              <div
                key={note.id}
                className={`note-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onOpenNote(note.id)}
              >
                <h3 className="note-card-title">{note.title || 'Untitled'}</h3>
                <p className="note-card-preview">
                  {note.contentBody?.substring(0, 120).replace(/#/g, '').trim() || 'No content'}
                </p>
                <div className="note-card-meta">
                  <span className="note-card-date">
                    {formatDate(note.modifiedAt)}
                  </span>
                  {mainTag && (
                    <span 
                      className="note-card-tag"
                      style={{ 
                        backgroundColor: `${getTagColor(mainTag)}20`,
                        color: getTagColor(mainTag)
                      }}
                    >
                      {mainTag}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default NotesList;
