import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Note } from '../../types';
import { formatDate } from '../../utils/noteUtils';
import './KanbanBoardsList.css';

interface KanbanBoardsListProps {
  boards: Note[];
  selectedBoardId: string | null;
  onSelectBoard: (boardId: string) => void;
  onCreateBoard: (title: string) => Promise<void>;
  onDeleteBoard: (boardId: string) => Promise<void>;
}

const countCards = (markdownBody: string): number => {
  return (markdownBody.match(/^\s*-\s*\[( |x|X)\]\s+/gm) || []).length;
};

function KanbanBoardsList({
  boards,
  selectedBoardId,
  onSelectBoard,
  onCreateBoard,
  onDeleteBoard,
}: KanbanBoardsListProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [query, setQuery] = useState('');

  const filteredBoards = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter((b) => b.title.toLowerCase().includes(q));
  }, [boards, query]);

  return (
    <div className="kanban-boards">
      <div className="kanban-boards-header">
        <h2 className="kanban-boards-title">Kanban Boards</h2>
        <button
          className="kanban-boards-icon-btn"
          title="New board"
          onClick={() => {
            setIsCreating(true);
            setDraftTitle('');
          }}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="kanban-boards-search">
        <input
          className="kanban-boards-search-input"
          type="text"
          placeholder="Search boards..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isCreating && (
        <form
          className="kanban-boards-create"
          onSubmit={(e) => {
            e.preventDefault();
            const title = draftTitle.trim();
            if (!title) return;
            void onCreateBoard(title).then(() => {
              setIsCreating(false);
              setDraftTitle('');
            });
          }}
        >
          <input
            className="kanban-boards-create-input"
            type="text"
            autoFocus
            placeholder="Board title..."
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
          />
          <div className="kanban-boards-create-actions">
            <button type="button" className="kanban-boards-btn secondary" onClick={() => setIsCreating(false)}>
              Cancel
            </button>
            <button type="submit" className="kanban-boards-btn primary">
              Create
            </button>
          </div>
        </form>
      )}

      <div className="kanban-boards-list">
        {filteredBoards.length === 0 ? (
          <div className="kanban-boards-empty">
            <p>No boards</p>
            <p className="kanban-boards-empty-hint">Create a board to get started</p>
          </div>
        ) : (
          filteredBoards.map((board) => {
            const isActive = board.id === selectedBoardId;
            const cardCount = countCards(board.contentBody || '');
            return (
              <div
                key={board.id}
                className={`kanban-board-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectBoard(board.id)}
              >
                <div className="kanban-board-item-main">
                  <div className="kanban-board-item-title">{board.title || 'Untitled'}</div>
                  <div className="kanban-board-item-meta">
                    <span>{formatDate(board.modifiedAt)}</span>
                    <span className="kanban-board-item-dot">•</span>
                    <span>{cardCount} cards</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="kanban-board-item-delete"
                  title="Delete board"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onDeleteBoard(board.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default KanbanBoardsList;

