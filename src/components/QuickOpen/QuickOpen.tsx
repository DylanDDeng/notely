import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Note } from '../../types';
import './QuickOpen.css';

interface QuickOpenProps {
  isOpen: boolean;
  notes: Note[];
  selectedNoteId: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  onSelectNote: (noteId: string) => void;
  onClose: () => void;
}

function QuickOpen({
  isOpen,
  notes,
  selectedNoteId,
  query,
  onQueryChange,
  onSelectNote,
  onClose,
}: QuickOpenProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(0);
  }, [isOpen, query, notes]);

  const activeNote = useMemo(() => notes[activeIndex] ?? null, [activeIndex, notes]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((prev) => (notes.length === 0 ? 0 : Math.min(prev + 1, notes.length - 1)));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        return;
      }

      if (event.key === 'Enter' && activeNote) {
        event.preventDefault();
        onSelectNote(activeNote.id);
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeNote, isOpen, notes.length, onClose, onSelectNote]);

  if (!isOpen) return null;

  return (
    <div className="quick-open-overlay" onClick={onClose}>
      <div className="quick-open-modal" onClick={(event) => event.stopPropagation()}>
        <div className="quick-open-input-row">
          <Search size={18} className="quick-open-icon" />
          <input
            autoFocus
            type="text"
            className="quick-open-input"
            placeholder="Open quickly..."
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>

        <div className="quick-open-results">
          {notes.length === 0 ? (
            <div className="quick-open-empty">No matching documents.</div>
          ) : (
            notes.map((note, index) => (
              <button
                key={note.id}
                type="button"
                className={[
                  'quick-open-item',
                  index === activeIndex ? 'active' : '',
                  note.id === selectedNoteId ? 'selected' : '',
                ].filter(Boolean).join(' ')}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  onSelectNote(note.id);
                  onClose();
                }}
              >
                <div className="quick-open-item-main">
                  <div className="quick-open-item-title">{note.title || note.filename}</div>
                  <div className="quick-open-item-subtitle">{note.filename}</div>
                </div>
                <div className="quick-open-item-meta">
                  {note.modifiedAt.toLocaleDateString()}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default QuickOpen;
