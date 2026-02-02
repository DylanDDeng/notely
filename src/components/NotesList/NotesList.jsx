import { formatDate, getTagColor } from '../../utils/noteUtils';
import { ArrowUpDown, LayoutGrid, LayoutList } from 'lucide-react';
import './NotesList.css';

const FILTER_TITLES = {
  'all': 'All Notes',
  'favorites': 'Favorites',
  'archive': 'Archive',
  'trash': 'Trash',
};

function NotesList({ notes, selectedNoteId, onSelectNote, activeFilter }) {
  const title = FILTER_TITLES[activeFilter] || 
    (activeFilter.startsWith('tag:') ? activeFilter.replace('tag:', '') : 'Notes');

  return (
    <div className="notes-list">
      {/* Header */}
      <div className="notes-list-header">
        <h2 className="notes-list-title">{title}</h2>
        <div className="notes-list-actions">
          <button className="action-btn" title="Sort">
            <ArrowUpDown size={16} />
          </button>
          <button className="action-btn" title="Grid view">
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>

      {/* Notes */}
      <div className="notes-container">
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
                onClick={() => onSelectNote(note.id)}
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
