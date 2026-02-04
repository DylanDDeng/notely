export interface KanbanCard {
  id: string;
  title: string;
  done: boolean;
  tags: string[];
  created?: string; // YYYY-MM-DD
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
}

export interface KanbanBoardData {
  preamble: string;
  columns: KanbanColumn[];
}

export const DEFAULT_KANBAN_COLUMNS = ['To Do', 'In Progress', 'Done'] as const;
export const DEFAULT_DONE_COLUMNS = ['Done'] as const;

const CARD_ID_RE = /<!--\s*id:([a-zA-Z0-9_-]+)\s*-->/;
const HEADING_RE = /^##\s+(.+?)\s*$/;
const TASK_RE = /^\s*-\s*\[( |x|X)\]\s+(.*)$/;

export const isTaskLine = (line: string): boolean => TASK_RE.test(line);

export const createId = (): string => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const uniq = (items: string[]): string[] => [...new Set(items)];

const normalizeTag = (tag: string): string => tag.trim().replace(/^#/, '').trim();

export const parseCardLine = (line: string): KanbanCard | null => {
  const match = line.match(TASK_RE);
  if (!match) return null;

  const done = match[1].toLowerCase() === 'x';
  let rest = match[2] ?? '';

  const idMatch = rest.match(CARD_ID_RE);
  const id = idMatch?.[1] || createId();
  rest = rest.replace(CARD_ID_RE, '').trim();

  const createdMatch = rest.match(/@(\d{4}-\d{2}-\d{2})/);
  const created = createdMatch?.[1];
  rest = rest.replace(/@(\d{4}-\d{2}-\d{2})/g, '').trim();

  const tags: string[] = [];
  rest = rest.replace(/(^|\s)#([^\s#@]+)/g, (_full, leading: string, tag: string) => {
    const normalized = normalizeTag(tag);
    if (normalized) tags.push(normalized);
    return leading;
  });

  const title = rest.trim();
  return {
    id,
    title,
    done,
    tags: uniq(tags),
    created,
  };
};

export const serializeCardLine = (card: KanbanCard): string => {
  const box = card.done ? 'x' : ' ';
  const tagsPart = card.tags.length > 0 ? ` ${card.tags.map((t) => `#${normalizeTag(t)}`).join(' ')}` : '';
  const createdPart = card.created ? ` @${card.created}` : '';
  const title = card.title.trim() || 'Untitled';
  return `- [${box}] ${title}${tagsPart}${createdPart} <!--id:${card.id}-->`;
};

export const parseKanbanMarkdown = (markdown: string): KanbanBoardData => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let preambleLines: string[] = [];
  const columns: KanbanColumn[] = [];

  let currentColumn: KanbanColumn | null = null;
  let sawHeading = false;

  const pushColumn = () => {
    if (!currentColumn) return;
    columns.push(currentColumn);
    currentColumn = null;
  };

  for (const line of lines) {
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      sawHeading = true;
      pushColumn();
      const title = headingMatch[1]?.trim() || 'Untitled';
      currentColumn = { id: createId(), title, cards: [] };
      continue;
    }

    if (!sawHeading) {
      preambleLines.push(line);
      continue;
    }

    if (!currentColumn) continue;
    const card = parseCardLine(line);
    if (card) {
      currentColumn.cards.push(card);
    }
  }

  pushColumn();

  return {
    preamble: preambleLines.join('\n').trimEnd(),
    columns,
  };
};

export const serializeKanbanMarkdown = (data: KanbanBoardData): string => {
  const parts: string[] = [];
  const preamble = data.preamble.trimEnd();
  if (preamble) {
    parts.push(preamble);
    parts.push('');
  }

  data.columns.forEach((column, idx) => {
    if (idx > 0) parts.push('');
    parts.push(`## ${column.title.trim() || 'Untitled'}`);
    column.cards.forEach((card) => {
      parts.push(serializeCardLine(card));
    });
  });

  return parts.join('\n').trimEnd() + '\n';
};

export const getAllCardTags = (data: KanbanBoardData): string[] => {
  const tags = data.columns.flatMap((col) => col.cards.flatMap((card) => card.tags));
  return uniq(tags).sort((a, b) => a.localeCompare(b));
};

