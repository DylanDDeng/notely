import { Filter, Plus, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KanbanFrontmatter, Note, NoteFrontmatter } from '../../types';
import { generateNoteContent } from '../../utils/noteUtils';
import { getTagColor } from '../../utils/noteUtils';
import {
  createId,
  DEFAULT_DONE_COLUMNS,
  DEFAULT_KANBAN_COLUMNS,
  getAllCardTags,
  parseKanbanMarkdown,
  serializeKanbanMarkdown,
  type KanbanBoardData,
  type KanbanCard,
  type KanbanColumn,
} from '../../utils/kanbanUtils';
import './KanbanBoard.css';

interface KanbanBoardProps {
  boardNote: Note | null;
  onSaveBoard: (noteId: string, filename: string, content: string) => Promise<void>;
}

type DragPayload =
  | { type: 'card'; cardId: string; fromColumnId: string }
  | { type: 'column'; columnId: string };

const DND_MIME = 'application/x-kanban';

const todayYmd = (): string => new Date().toISOString().slice(0, 10);

const parseDragPayload = (raw: string | null): DragPayload | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DragPayload;
    if (parsed && typeof parsed === 'object' && 'type' in parsed) return parsed;
  } catch {
    // ignore
  }
  return null;
};

const ensureDoneColumns = (kanban?: KanbanFrontmatter): string[] => {
  const cols = kanban?.doneColumns?.map((c) => c.trim()).filter(Boolean) ?? [];
  return cols.length > 0 ? cols : [...DEFAULT_DONE_COLUMNS];
};

const isInDateRange = (created: string | undefined, from: string, to: string): boolean => {
  if (!from && !to) return true;
  if (!created) return false;
  if (from && created < from) return false;
  if (to && created > to) return false;
  return true;
};

const formatCardDate = (created?: string): string => {
  if (!created) return '';
  const d = new Date(created);
  if (Number.isNaN(d.getTime())) return created;
  return format(d, 'MMM d');
};

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number): T[] => {
  if (fromIndex === toIndex) return items;
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  if (item === undefined) return items;
  next.splice(toIndex, 0, item);
  return next;
};

function KanbanBoard({ boardNote, onSaveBoard }: KanbanBoardProps) {
  const [boardTitle, setBoardTitle] = useState('');
  const [doneColumns, setDoneColumns] = useState<string[]>([...DEFAULT_DONE_COLUMNS]);
  const [data, setData] = useState<KanbanBoardData>({ preamble: '', columns: [] });

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskTags, setNewTaskTags] = useState('');
  const [newTaskColumnId, setNewTaskColumnId] = useState<string>('');

  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [dragOverCard, setDragOverCard] = useState<{ cardId: string; columnId: string; before: boolean } | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const dragPayloadRef = useRef<DragPayload | null>(null);
  const dataRef = useRef<KanbanBoardData>(data);
  const titleRef = useRef(boardTitle);
  const doneColumnsRef = useRef(doneColumns);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    titleRef.current = boardTitle;
  }, [boardTitle]);
  useEffect(() => {
    doneColumnsRef.current = doneColumns;
  }, [doneColumns]);

  const isDoneColumnTitle = useCallback((title: string) => {
    const done = doneColumnsRef.current;
    return done.includes(title);
  }, []);

  const firstDoneColumnTitle = useCallback((): string | null => {
    const done = doneColumnsRef.current;
    return done[0] ?? null;
  }, []);

  const firstTodoColumnId = useCallback((columns: KanbanColumn[]): string => {
    const done = doneColumnsRef.current;
    const col = columns.find((c) => !done.includes(c.title)) ?? columns[0];
    return col?.id ?? '';
  }, []);

  const scheduleSave = useCallback(() => {
    if (!boardNote) return;
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      void flushSave();
    }, 500);
  }, [boardNote]);

  const flushSave = useCallback(async () => {
    if (!boardNote) return;
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
    }

    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    const now = new Date().toISOString();
    const frontmatter: NoteFrontmatter = {
      title: titleRef.current.trim() || 'Untitled',
      date: boardNote.date || now,
      tags: boardNote.tags || [],
      type: 'kanban',
      kanban: { doneColumns: doneColumnsRef.current },
    };

    const body = serializeKanbanMarkdown(dataRef.current);
    const content = generateNoteContent(frontmatter, body);

    saveInFlightRef.current = true;
    try {
      await onSaveBoard(boardNote.id, boardNote.filename, content);
    } finally {
      saveInFlightRef.current = false;
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        await flushSave();
      }
    }
  }, [boardNote, onSaveBoard]);

  // Load board note
  useEffect(() => {
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
    }
    pendingSaveRef.current = false;
    saveInFlightRef.current = false;

    if (!boardNote) {
      setBoardTitle('');
      setDoneColumns([...DEFAULT_DONE_COLUMNS]);
      setData({ preamble: '', columns: [] });
      setFilterTags([]);
      setFilterFrom('');
      setFilterTo('');
      setIsFilterOpen(false);
      setIsAddTaskOpen(false);
      setEditingCardId(null);
      setEditingColumnId(null);
      setDragOverCard(null);
      setDragOverColumnId(null);
      return;
    }

    setBoardTitle(boardNote.title || 'Untitled');
    setDoneColumns(ensureDoneColumns(boardNote.kanban));
    const parsed = parseKanbanMarkdown(boardNote.contentBody || '');
    setData(parsed.columns.length > 0 ? parsed : {
      preamble: parsed.preamble,
      columns: DEFAULT_KANBAN_COLUMNS.map((title) => ({ id: createId(), title, cards: [] })),
    });
    setFilterTags([]);
    setFilterFrom('');
    setFilterTo('');
    setIsFilterOpen(false);
    setIsAddTaskOpen(false);
    setEditingCardId(null);
    setEditingColumnId(null);
    setDragOverCard(null);
    setDragOverColumnId(null);
  }, [boardNote]);

  const availableTags = useMemo(() => getAllCardTags(data), [data]);

  const openAddTask = useCallback((preselectColumnId?: string) => {
    const columns = dataRef.current.columns;
    const defaultColumnId = preselectColumnId || firstTodoColumnId(columns);
    setNewTaskTitle('');
    setNewTaskTags('');
    setNewTaskColumnId(defaultColumnId);
    setIsAddTaskOpen(true);
  }, [firstTodoColumnId]);

  const addColumn = useCallback(() => {
    setData((prev) => {
      const next: KanbanBoardData = {
        ...prev,
        columns: [...prev.columns, { id: createId(), title: 'New Column', cards: [] }],
      };
      return next;
    });
    scheduleSave();
  }, [scheduleSave]);

  const renameColumn = useCallback((columnId: string, nextTitle: string) => {
    const trimmed = nextTitle.trim() || 'Untitled';
    setData((prev) => {
      const column = prev.columns.find((c) => c.id === columnId);
      if (!column) return prev;
      const wasDone = doneColumnsRef.current.includes(column.title);
      const nextColumns = prev.columns.map((c) => (c.id === columnId ? { ...c, title: trimmed } : c));
      if (wasDone) {
        setDoneColumns((prevDone) => prevDone.map((t) => (t === column.title ? trimmed : t)));
      }
      return { ...prev, columns: nextColumns };
    });
    scheduleSave();
  }, [scheduleSave]);

  const deleteColumn = useCallback((columnId: string) => {
    const col = dataRef.current.columns.find((c) => c.id === columnId);
    if (!col) return;
    if (col.cards.length > 0) {
      window.alert('This column is not empty. Move or delete cards before deleting the column.');
      return;
    }

    if (!window.confirm(`Delete column "${col.title}"?`)) return;

    setData((prev) => {
      const nextColumns = prev.columns.filter((c) => c.id !== columnId);
      return { ...prev, columns: nextColumns };
    });
    setDoneColumns((prevDone) => prevDone.filter((t) => t !== col.title));
    scheduleSave();
  }, [scheduleSave]);

  const addCard = useCallback((columnId: string, title: string, tags: string[]) => {
    const columns = dataRef.current.columns;
    const target = columns.find((c) => c.id === columnId) ?? columns[0];
    if (!target) return;
    const done = isDoneColumnTitle(target.title);
    const created = todayYmd();
    const card: KanbanCard = {
      id: createId(),
      title: title.trim() || 'Untitled',
      tags,
      created,
      done,
    };

    setData((prev) => ({
      ...prev,
      columns: prev.columns.map((c) => (c.id === target.id ? { ...c, cards: [...c.cards, card] } : c)),
    }));
    scheduleSave();
  }, [isDoneColumnTitle, scheduleSave]);

  const deleteCard = useCallback((columnId: string, cardId: string) => {
    setData((prev) => ({
      ...prev,
      columns: prev.columns.map((c) => {
        if (c.id !== columnId) return c;
        return { ...c, cards: c.cards.filter((card) => card.id !== cardId) };
      }),
    }));
    scheduleSave();
  }, [scheduleSave]);

  const updateCardTitle = useCallback((columnId: string, cardId: string, nextTitle: string) => {
    const trimmed = nextTitle.trim();
    setData((prev) => ({
      ...prev,
      columns: prev.columns.map((c) => {
        if (c.id !== columnId) return c;
        return {
          ...c,
          cards: c.cards.map((card) => (card.id === cardId ? { ...card, title: trimmed || 'Untitled' } : card)),
        };
      }),
    }));
    scheduleSave();
  }, [scheduleSave]);

  const moveCard = useCallback(
    (payload: { cardId: string; fromColumnId: string }, to: { columnId: string; index: number }) => {
      setData((prev) => {
        const fromColumn = prev.columns.find((c) => c.id === payload.fromColumnId);
        const toColumn = prev.columns.find((c) => c.id === to.columnId);
        if (!fromColumn || !toColumn) return prev;

        const fromIndex = fromColumn.cards.findIndex((c) => c.id === payload.cardId);
        if (fromIndex < 0) return prev;

        const card = fromColumn.cards[fromIndex];
        if (!card) return prev;

        const isDoneTarget = isDoneColumnTitle(toColumn.title);
        const nextCard: KanbanCard = { ...card, done: isDoneTarget };

        const nextColumns = prev.columns.map((col) => {
          if (col.id === fromColumn.id && col.id === toColumn.id) {
            const without = col.cards.filter((c) => c.id !== payload.cardId);
            let targetIndex = to.index;
            if (fromIndex < targetIndex) targetIndex -= 1;
            const clamped = Math.max(0, Math.min(targetIndex, without.length));
            const next = without.slice();
            next.splice(clamped, 0, nextCard);
            return { ...col, cards: next };
          }

          if (col.id === fromColumn.id) {
            return { ...col, cards: col.cards.filter((c) => c.id !== payload.cardId) };
          }

          if (col.id === toColumn.id) {
            const clamped = Math.max(0, Math.min(to.index, col.cards.length));
            const next = col.cards.slice();
            next.splice(clamped, 0, nextCard);
            return { ...col, cards: next };
          }

          return col;
        });

        return { ...prev, columns: nextColumns };
      });
      scheduleSave();
    },
    [isDoneColumnTitle, scheduleSave]
  );

  const toggleCardDone = useCallback(
    (columnId: string, cardId: string) => {
      setData((prev) => {
        const fromColumn = prev.columns.find((c) => c.id === columnId);
        if (!fromColumn) return prev;
        const card = fromColumn.cards.find((c) => c.id === cardId);
        if (!card) return prev;

        const nextDone = !card.done;
        const doneTitle = firstDoneColumnTitle();
        const targetColumn =
          nextDone && doneTitle
            ? prev.columns.find((c) => c.title === doneTitle) ?? fromColumn
            : prev.columns.find((c) => !isDoneColumnTitle(c.title)) ?? prev.columns[0] ?? fromColumn;

        const nextCard: KanbanCard = { ...card, done: nextDone };

        const nextColumns = prev.columns.map((col) => {
          if (col.id === fromColumn.id) {
            return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
          }
          if (col.id === targetColumn.id) {
            return { ...col, cards: [...col.cards, nextCard] };
          }
          return col;
        });

        if (fromColumn.id === targetColumn.id) {
          const nextCards = fromColumn.cards.map((c) => (c.id === cardId ? nextCard : c));
          return { ...prev, columns: prev.columns.map((c) => (c.id === fromColumn.id ? { ...c, cards: nextCards } : c)) };
        }

        return { ...prev, columns: nextColumns };
      });
      scheduleSave();
    },
    [firstDoneColumnTitle, isDoneColumnTitle, scheduleSave]
  );

  const moveColumnById = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setData((prev) => {
      const fromIndex = prev.columns.findIndex((c) => c.id === fromId);
      const toIndex = prev.columns.findIndex((c) => c.id === toId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      return { ...prev, columns: moveItem(prev.columns, fromIndex, toIndex) };
    });
    scheduleSave();
  }, [scheduleSave]);

  const hasActiveFilters = filterTags.length > 0 || Boolean(filterFrom) || Boolean(filterTo);

  if (!boardNote) {
    return (
      <div className="kanban-board">
        <div className="kanban-board-empty">
          <p>Select a board to view</p>
        </div>
      </div>
    );
  }

  return (
    <div className="kanban-board">
      <div className="kanban-board-header">
        <div className="kanban-board-title-wrap">
          <input
            className="kanban-board-title"
            value={boardTitle}
            onChange={(e) => {
              setBoardTitle(e.target.value);
              scheduleSave();
            }}
            placeholder="Board title"
          />
          <div className="kanban-board-subtitle">Track and manage your tasks visually</div>
        </div>

        <div className="kanban-board-actions">
          <button
            className={`kanban-board-btn ${hasActiveFilters ? 'active' : ''}`}
            type="button"
            onClick={() => setIsFilterOpen((v) => !v)}
            title="Filter"
          >
            <Filter size={16} />
            <span>Filter</span>
          </button>
          <button
            className="kanban-board-btn primary"
            type="button"
            onClick={() => openAddTask()}
            title="Add task"
          >
            <Plus size={16} />
            <span>Add Task</span>
          </button>
        </div>
      </div>

      {isFilterOpen && (
        <div className="kanban-filter">
          <div className="kanban-filter-row">
            <div className="kanban-filter-field">
              <label>Tags</label>
              <div className="kanban-filter-tags">
                {availableTags.length === 0 ? (
                  <span className="kanban-filter-muted">No tags yet</span>
                ) : (
                  availableTags.map((tag) => {
                    const active = filterTags.includes(tag);
                    const color = getTagColor(tag);
                    return (
                      <button
                        type="button"
                        key={tag}
                        className={`kanban-tag-chip ${active ? 'active' : ''}`}
                        onClick={() => {
                          setFilterTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
                        }}
                        style={{
                          backgroundColor: active ? `${color}18` : '#F3F4F6',
                          color: active ? color : '#374151',
                          borderColor: active ? `${color}40` : 'transparent',
                        }}
                      >
                        #{tag}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <div className="kanban-filter-row">
            <div className="kanban-filter-field">
              <label>From</label>
              <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
            </div>
            <div className="kanban-filter-field">
              <label>To</label>
              <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
            </div>
            <div className="kanban-filter-field kanban-filter-actions">
              <button
                type="button"
                className="kanban-filter-clear"
                onClick={() => {
                  setFilterTags([]);
                  setFilterFrom('');
                  setFilterTo('');
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="kanban-canvas"
        onDragOver={(e) => {
          const payload =
            dragPayloadRef.current ??
            parseDragPayload(e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain'));
          if (payload?.type === 'column') {
            e.preventDefault();
          }
        }}
        onDrop={(e) => {
          const payload =
            dragPayloadRef.current ??
            parseDragPayload(e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain'));
          if (payload?.type !== 'column') return;
          e.preventDefault();
          setDragOverColumnId(null);
          dragPayloadRef.current = null;
        }}
      >
        {data.columns.map((column) => {
          const isDoneColumn = isDoneColumnTitle(column.title);
          const dotColor = isDoneColumn ? '#16A34A' : getTagColor(column.title);
          const filteredCards = column.cards.filter((card) => {
            if (hasActiveFilters) {
              if (filterTags.length > 0 && !card.tags.some((t) => filterTags.includes(t))) return false;
              if (!isInDateRange(card.created, filterFrom, filterTo)) return false;
            }
            return true;
          });

          return (
            <div
              key={column.id}
              className={`kanban-column ${dragOverColumnId === column.id ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                const payload =
                  dragPayloadRef.current ??
                  parseDragPayload(e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain'));
                if (payload?.type === 'column') {
                  e.preventDefault();
                  setDragOverColumnId(column.id);
                }
              }}
              onDrop={(e) => {
                const payload =
                  dragPayloadRef.current ??
                  parseDragPayload(e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain'));
                if (payload?.type !== 'column') return;
                e.preventDefault();
                moveColumnById(payload.columnId, column.id);
                setDragOverColumnId(null);
                dragPayloadRef.current = null;
              }}
            >
              <div
                className="kanban-column-header"
                draggable={editingColumnId !== column.id}
                onDragStart={(e) => {
                  const payload: DragPayload = { type: 'column', columnId: column.id };
                  dragPayloadRef.current = payload;
                  e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
                  e.dataTransfer.setData('text/plain', JSON.stringify(payload));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  dragPayloadRef.current = null;
                  setDragOverColumnId(null);
                }}
              >
                <div className="kanban-column-title-wrap">
                  <span className="kanban-column-dot" style={{ backgroundColor: dotColor }} />
                  {editingColumnId === column.id ? (
                    <input
                      className="kanban-column-title-input"
                      autoFocus
                      defaultValue={column.title}
                      onBlur={(e) => {
                        renameColumn(column.id, e.target.value);
                        setEditingColumnId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          renameColumn(column.id, (e.target as HTMLInputElement).value);
                          setEditingColumnId(null);
                        }
                        if (e.key === 'Escape') setEditingColumnId(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="kanban-column-title-btn"
                      onClick={() => setEditingColumnId(column.id)}
                      title="Rename column"
                    >
                      {column.title}
                    </button>
                  )}
                  <span className="kanban-column-count">{column.cards.length}</span>
                </div>

                <div className="kanban-column-actions">
                  <button
                    type="button"
                    className="kanban-icon-btn"
                    title="Add card"
                    onClick={() => openAddTask(column.id)}
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    type="button"
                    className="kanban-icon-btn danger"
                    title="Delete column"
                    onClick={() => deleteColumn(column.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div
                className="kanban-cards"
                onDragOver={(e) => {
                  const payload =
                    dragPayloadRef.current ??
                    parseDragPayload(e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain'));
                  if (payload?.type !== 'card') return;
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  const payload =
                    dragPayloadRef.current ??
                    parseDragPayload(e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain'));
                  if (payload?.type !== 'card') return;
                  e.preventDefault();
                  const toIndex = column.cards.length;
                  moveCard({ cardId: payload.cardId, fromColumnId: payload.fromColumnId }, { columnId: column.id, index: toIndex });
                  setDragOverCard(null);
                  dragPayloadRef.current = null;
                }}
              >
                {filteredCards.map((card) => {
                  const created = formatCardDate(card.created);
                  const isEditing = editingCardId === card.id;
                  return (
                    <div
                      key={card.id}
                      className={`kanban-card ${card.done ? 'done' : ''} ${
                        dragOverCard?.cardId === card.id && dragOverCard.columnId === column.id ? 'drop-target' : ''
                      }`}
                      draggable={!isEditing}
                      onDragStart={(e) => {
                        const payload: DragPayload = { type: 'card', cardId: card.id, fromColumnId: column.id };
                        dragPayloadRef.current = payload;
                        e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
                        e.dataTransfer.setData('text/plain', JSON.stringify(payload));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => {
                        dragPayloadRef.current = null;
                        setDragOverCard(null);
                      }}
                      onDragOver={(e) => {
                        const payload =
                          dragPayloadRef.current ??
                          parseDragPayload(e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain'));
                        if (payload?.type !== 'card') return;
                        e.preventDefault();
                        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        const before = e.clientY < rect.top + rect.height / 2;
                        setDragOverCard({ cardId: card.id, columnId: column.id, before });
                      }}
                      onDrop={(e) => {
                        const payload =
                          dragPayloadRef.current ??
                          parseDragPayload(e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain'));
                        if (payload?.type !== 'card') return;
                        e.preventDefault();
                        const index = column.cards.findIndex((c) => c.id === card.id);
                        if (index < 0) return;
                        const insertIndex = dragOverCard?.before ? index : index + 1;
                        moveCard({ cardId: payload.cardId, fromColumnId: payload.fromColumnId }, { columnId: column.id, index: insertIndex });
                        setDragOverCard(null);
                        dragPayloadRef.current = null;
                      }}
                    >
                      <label className="kanban-card-checkbox">
                        <input
                          type="checkbox"
                          checked={card.done}
                          onChange={() => toggleCardDone(column.id, card.id)}
                        />
                        <span />
                      </label>

                      <div className="kanban-card-body">
                        {isEditing ? (
                          <input
                            className="kanban-card-title-input"
                            autoFocus
                            defaultValue={card.title}
                            onBlur={(e) => {
                              updateCardTitle(column.id, card.id, e.target.value);
                              setEditingCardId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                updateCardTitle(column.id, card.id, (e.target as HTMLInputElement).value);
                                setEditingCardId(null);
                              }
                              if (e.key === 'Escape') setEditingCardId(null);
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="kanban-card-title-btn"
                            draggable={!isEditing}
                            onClick={() => setEditingCardId(card.id)}
                          >
                            {card.title}
                          </button>
                        )}

                        {(card.tags.length > 0 || created) && (
                          <div className="kanban-card-meta">
                            {card.tags.map((tag) => {
                              const color = getTagColor(tag);
                              return (
                                <span
                                  key={tag}
                                  className="kanban-card-tag"
                                  style={{ backgroundColor: `${color}18`, color }}
                                >
                                  {tag}
                                </span>
                              );
                            })}
                            {created && <span className="kanban-card-date">{created}</span>}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        className="kanban-card-delete"
                        title="Delete card"
                        onClick={() => {
                          if (!window.confirm('Delete this card?')) return;
                          deleteCard(column.id, card.id);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}

                <button type="button" className="kanban-add-card" onClick={() => openAddTask(column.id)}>
                  <Plus size={16} />
                  <span>Add a card</span>
                </button>
              </div>
            </div>
          );
        })}

        <button type="button" className="kanban-add-column" onClick={addColumn}>
          <Plus size={20} />
          <span>Add Column</span>
        </button>
      </div>

      {isAddTaskOpen && (
        <div
          className="kanban-modal-overlay"
          onClick={() => setIsAddTaskOpen(false)}
        >
          <div className="kanban-modal" onClick={(e) => e.stopPropagation()}>
            <div className="kanban-modal-header">
              <div className="kanban-modal-title">Add Task</div>
              <button type="button" className="kanban-icon-btn" onClick={() => setIsAddTaskOpen(false)} title="Close">
                <X size={16} />
              </button>
            </div>

            <div className="kanban-modal-body">
              <div className="kanban-modal-field">
                <label>Title</label>
                <input
                  type="text"
                  autoFocus
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Task title..."
                />
              </div>

              <div className="kanban-modal-field">
                <label>Column</label>
                <select value={newTaskColumnId} onChange={(e) => setNewTaskColumnId(e.target.value)}>
                  {data.columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="kanban-modal-field">
                <label>Tags (optional)</label>
                <input
                  type="text"
                  value={newTaskTags}
                  onChange={(e) => setNewTaskTags(e.target.value)}
                  placeholder="#design #backend"
                />
              </div>
            </div>

            <div className="kanban-modal-actions">
              <button
                type="button"
                className="kanban-modal-btn secondary"
                onClick={() => setIsAddTaskOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="kanban-modal-btn primary"
                onClick={() => {
                  const title = newTaskTitle.trim();
                  if (!title) return;
                  const tags = newTaskTags
                    .split(/[\s,]+/)
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((t) => t.replace(/^#/, ''))
                    .filter(Boolean);
                  addCard(newTaskColumnId, title, Array.from(new Set(tags)));
                  setIsAddTaskOpen(false);
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default KanbanBoard;
