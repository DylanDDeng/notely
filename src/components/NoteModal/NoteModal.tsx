import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import Editor from '../Editor/Editor';
import type { EditorNote, SaveNoteData } from '../../types';
import './NoteModal.css';

interface NoteModalProps {
  isOpen: boolean;
  note: EditorNote | null;
  onSave: (note: SaveNoteData) => Promise<void>;
  isLoading: boolean;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  onClose: () => void;
}

function NoteModal({
  isOpen,
  note,
  onSave,
  isLoading,
  isFullScreen,
  onToggleFullScreen,
  onClose,
}: NoteModalProps) {
  if (!isOpen || !note) return null;

  return (
    <div className="note-modal-overlay" onClick={onClose}>
      <div
        className={`note-modal ${isFullScreen ? 'fullscreen' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="note-modal-header">
          <button className="note-modal-back" onClick={onClose}>
            <ArrowLeft size={18} />
            <span>Back</span>
          </button>
          <div className="note-modal-header-actions">
            <button
              className="note-modal-icon-btn"
              onClick={onToggleFullScreen}
              title={isFullScreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </div>
        <div className="note-modal-body">
          <Editor note={note} onSave={onSave} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}

export default NoteModal;
