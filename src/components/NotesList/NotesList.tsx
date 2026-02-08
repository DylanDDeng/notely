import { ArrowUpDown, ChevronsLeft, ChevronsRight, LayoutGrid, LayoutList, Pin, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDate, getTagColor } from '../../utils/noteUtils';
import type { Note } from '../../types';
import './NotesList.css';

const FILTER_TITLES: Record<string, string> = {
  'all': 'All Notes',
  'search': 'Search Results',
  'favorites': 'Favorites',
  'archive': 'Archive',
  'trash': 'Trash',
};

interface NotesListProps {
  notes: Note[];
  selectedNoteId: string | null;
  onOpenNote: (noteId: string) => void;
  onMoveToTrash: (noteId: string) => Promise<void>;
  onRestoreFromTrash: (noteId: string) => Promise<void>;
  onDeletePermanently: (noteId: string) => Promise<void>;
  activeFilter: string;
  isSearchMode: boolean;
  notesView: 'list' | 'grid';
  onViewChange: (view: 'list' | 'grid') => void;
  sortOrder: 'desc' | 'asc';
  onToggleSort: () => void;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}

const extractPreviewSummary = (contentBody: string): string => {
  const firstMeaningfulLine = contentBody
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstMeaningfulLine) return '';

  const plainText = firstMeaningfulLine
    .replace(/!\[[^\]]*]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s+/g, '')
    .replace(/^>\s*/g, '')
    .replace(/^\s*[-+*]\s+\[(?: |x|X)\]\s+/g, '')
    .replace(/^\s*[-+*]\s+/g, '')
    .replace(/^\s*\d+[.)]\s+/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!plainText) return '';
  return plainText.slice(0, 120);
};

function NotesList({
  notes,
  selectedNoteId,
  onOpenNote,
  activeFilter,
  isSearchMode,
  notesView,
  onViewChange,
  sortOrder,
  onToggleSort,
  isCollapsed,
  onToggleCollapsed,
  onMoveToTrash,
  onRestoreFromTrash,
  onDeletePermanently,
}: NotesListProps) {
  const title = FILTER_TITLES[activeFilter] || 
    (activeFilter.startsWith('tag:') ? activeFilter.replace('tag:', '') : 'Notes');
  const [contextMenu, setContextMenu] = useState<{ note: Note; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  return (
    <div className={`notes-list ${notesView === 'grid' ? 'grid-view' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Header */}
      <div className="notes-list-header">
        <h2 className="notes-list-title">{title}</h2>
        <div className="notes-list-actions">
          <button
            type="button"
            className="action-btn panel-toggle-btn"
            title={isCollapsed ? 'Expand notes panel' : 'Collapse notes panel'}
            aria-label={isCollapsed ? 'Expand notes panel' : 'Collapse notes panel'}
            onClick={onToggleCollapsed}
          >
            {isCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
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
	            const isPinned = Boolean(note.tags?.includes('pinned'));
	            const isFavorite = Boolean(note.tags?.includes('favorite'));
              const isTrashed = Boolean(note.tags?.includes('trash'));
              const hasContextActions = note.type !== 'kanban';
	            const previewText = extractPreviewSummary(note.contentBody || '');
	            const shouldShowPreview = isSearchMode || isSelected;
	            const mainTag = note.tags?.find(tag => 
	              !['favorite', 'archive', 'trash', 'pinned'].includes(tag)
	            );
            
            return (
	              <div
	                key={note.id}
	                className={`note-card ${isSelected ? 'selected' : ''} ${shouldShowPreview ? 'show-preview' : ''}`}
	                onClick={() => onOpenNote(note.id)}
                  onContextMenu={(event) => {
                    if (!hasContextActions) return;
                    event.preventDefault();
                    onOpenNote(note.id);
                    const menuWidth = 198;
                    const menuHeight = isTrashed ? 106 : 58;
                    const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
                    const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
                    setContextMenu({ note, x, y });
                  }}
	              >
		                <div className="note-card-title-row">
		                  <h3 className="note-card-title">{note.title || 'Untitled'}</h3>
	                  {isPinned && (
	                    <span className="note-card-pin" title="置顶" aria-label="置顶">
	                      <Pin size={14} />
	                    </span>
	                  )}
	                  {isFavorite && (
	                    <span className="note-card-star" title="收藏" aria-label="收藏">
	                      <Star size={14} />
	                    </span>
	                  )}
	                </div>
                <p className="note-card-preview">{previewText || 'No content'}</p>
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
        {contextMenu &&
          createPortal(
            <div
              className="notes-context-menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              {contextMenu.note.tags?.includes('trash') ? (
                <>
                  <button
                    type="button"
                    className="notes-context-item"
                    onClick={() => {
                      setContextMenu(null);
                      void onRestoreFromTrash(contextMenu.note.id);
                    }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="notes-context-item danger"
                    onClick={() => {
                      setContextMenu(null);
                      void onDeletePermanently(contextMenu.note.id);
                    }}
                  >
                    Delete Permanently
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="notes-context-item"
                  onClick={() => {
                    setContextMenu(null);
                    void onMoveToTrash(contextMenu.note.id);
                  }}
                >
                  Move to Trash
                </button>
              )}
            </div>,
            document.body
          )}
	    </div>
	  );
}

export default NotesList;
