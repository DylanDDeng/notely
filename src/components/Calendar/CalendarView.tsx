import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Note } from '../../types';
import './CalendarView.css';

interface CalendarViewProps {
  notes: Note[];
  onOpenDailyNote: (date: Date) => Promise<void>;
}

const DAILY_NOTE_FILENAME_RE = /^(\d{4}-\d{2}-\d{2})\.md$/i;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toYmd = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isSameDate = (a: Date, b: Date): boolean => {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

const toMonthStart = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);

const addMonths = (date: Date, amount: number): Date => new Date(date.getFullYear(), date.getMonth() + amount, 1);

const getMonthGrid = (monthStart: Date): Date[] => {
  const firstCell = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 - monthStart.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    return new Date(firstCell.getFullYear(), firstCell.getMonth(), firstCell.getDate() + index);
  });
};

const toNoteDate = (note: Note): Date | null => {
  const fromFilename = note.filename.match(DAILY_NOTE_FILENAME_RE)?.[1];
  if (fromFilename) {
    const [year, month, day] = fromFilename.split('-').map(Number);
    if (year && month && day) {
      return new Date(year, month - 1, day);
    }
  }

  const parsed = new Date(note.date);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const formatTodayLine = (date: Date): string => {
  const weekday = date.toLocaleDateString('zh-CN', { weekday: 'long' });
  return `今天是 ${weekday} · ${toYmd(date)}`;
};

const formatMonthTitle = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const formatSelectedDayTitle = (date: Date): string => {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  return `${weekday}, ${toYmd(date)}`;
};

const formatNoteTime = (note: Note): string => {
  const parsed = new Date(note.date);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

function CalendarView({ notes, onOpenDailyNote }: CalendarViewProps) {
  const today = useMemo(() => new Date(), []);
  const [displayMonth, setDisplayMonth] = useState<Date>(() => toMonthStart(today));
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [isOpeningNote, setIsOpeningNote] = useState(false);

  const monthCells = useMemo(() => getMonthGrid(displayMonth), [displayMonth]);

  const notesByDate = useMemo(() => {
    const grouped = new Map<string, Note[]>();
    notes.forEach((note) => {
      const date = toNoteDate(note);
      if (!date) return;
      const ymd = toYmd(date);
      const list = grouped.get(ymd) ?? [];
      list.push(note);
      grouped.set(ymd, list);
    });

    grouped.forEach((list) => {
      list.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
    });

    return grouped;
  }, [notes]);

  const selectedYmd = toYmd(selectedDate);
  const selectedNotes = notesByDate.get(selectedYmd) ?? [];
  const hasDailyNote = notes.some((note) => note.type !== 'kanban' && note.filename.toLowerCase() === `${selectedYmd}.md`);

  const handleOpenDaily = async () => {
    setIsOpeningNote(true);
    try {
      await onOpenDailyNote(selectedDate);
    } finally {
      setIsOpeningNote(false);
    }
  };

  return (
    <section className="calendar-view">
      <div className="calendar-month-panel">
        <header className="calendar-today-line">
          <CalendarDays size={18} />
          <span>{formatTodayLine(today)}</span>
        </header>

        <div className="calendar-month-header">
          <button
            type="button"
            className="calendar-nav-btn"
            title="Previous month"
            onClick={() => setDisplayMonth((prev) => addMonths(prev, -1))}
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="calendar-month-title">{formatMonthTitle(displayMonth)}</h2>
          <button
            type="button"
            className="calendar-nav-btn"
            title="Next month"
            onClick={() => setDisplayMonth((prev) => addMonths(prev, 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="calendar-weekdays" role="row">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="calendar-weekday">
              {label}
            </span>
          ))}
        </div>

        <div className="calendar-grid">
          {monthCells.map((cellDate) => {
            const ymd = toYmd(cellDate);
            const inMonth = cellDate.getMonth() === displayMonth.getMonth();
            const isToday = isSameDate(cellDate, today);
            const isSelected = isSameDate(cellDate, selectedDate);
            const noteCount = notesByDate.get(ymd)?.length ?? 0;

            return (
              <button
                key={ymd}
                type="button"
                className={`calendar-cell${inMonth ? '' : ' outside'}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                onClick={() => {
                  setSelectedDate(cellDate);
                  if (cellDate.getMonth() !== displayMonth.getMonth()) {
                    setDisplayMonth(toMonthStart(cellDate));
                  }
                }}
              >
                <span className="calendar-cell-date">{cellDate.getDate()}</span>
                {noteCount > 0 && (
                  <span className="calendar-cell-count">{noteCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="calendar-day-panel">
        <div className="calendar-day-head">
          <h3>{formatSelectedDayTitle(selectedDate)}</h3>
          <button
            type="button"
            className="calendar-open-note-btn"
            onClick={() => {
              void handleOpenDaily();
            }}
            disabled={isOpeningNote}
          >
            {isOpeningNote ? 'Opening...' : hasDailyNote ? 'Open Daily Note' : 'Create Daily Note'}
          </button>
        </div>

        <div className="calendar-day-note-tip">
          文件名会使用 <code>{selectedYmd}.md</code>，只在你点击按钮时创建。
        </div>

        <div className="calendar-day-list">
          {selectedNotes.length === 0 ? (
            <div className="calendar-day-empty">
              <p>No notes on this date.</p>
              <p>Create a daily note when you need to write something.</p>
            </div>
          ) : (
            selectedNotes.map((note) => (
              <div key={note.id} className="calendar-day-item">
                <div className="calendar-day-item-title">{note.title || 'Untitled'}</div>
                <div className="calendar-day-item-meta">
                  <span>{formatNoteTime(note)}</span>
                  <span>·</span>
                  <span>{note.filename}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </section>
  );
}

export default CalendarView;
