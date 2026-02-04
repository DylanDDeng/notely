import matter from 'gray-matter';
import type { KanbanFrontmatter, NoteFrontmatter } from '../types';

function filenameToTitle(filename: string): string {
  return filename.replace(/\.md$/i, '').trim();
}

/**
 * 解析笔记内容，提取 frontmatter 和正文
 */
export function parseNote(content: string, filename?: string): ParsedNote {
  const parsed = matter(content);
  const titleFromFilename = filename ? filenameToTitle(filename) : '';
  const titleFromFrontmatter = typeof parsed.data.title === 'string' ? parsed.data.title.trim() : '';
  const title = titleFromFrontmatter || titleFromFilename || 'Untitled';
  const date = (parsed.data.date as string) || new Date().toISOString();
  const tags = (parsed.data.tags as string[]) || [];
  const type = typeof parsed.data.type === 'string' ? parsed.data.type.trim() : undefined;
  const kanban = normalizeKanbanFrontmatter(parsed.data.kanban);
  
  return {
    title,
    date,
    tags,
    contentBody: parsed.content.trim(),
    rawContent: content,
    type,
    kanban,
  };
}

const normalizeKanbanFrontmatter = (value: unknown): KanbanFrontmatter | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const doneColumns = (value as { doneColumns?: unknown }).doneColumns;
  if (!Array.isArray(doneColumns)) return undefined;
  const sanitized = doneColumns
    .map((col) => (typeof col === 'string' ? col.trim() : ''))
    .filter(Boolean);
  return sanitized.length > 0 ? { doneColumns: sanitized } : undefined;
};

/**
 * 解析后的笔记数据
 */
export interface ParsedNote {
  title: string;
  date: string;
  tags: string[];
  contentBody: string;
  rawContent: string;
  type?: string;
  kanban?: KanbanFrontmatter;
}

/**
 * 生成笔记内容（frontmatter + body）
 */
export function generateNoteContent(frontmatter: NoteFrontmatter, body: string): string {
  const fm = matter.stringify(body, frontmatter);
  return fm;
}

/**
 * 生成文件名
 */
export function generateFilename(title: string, date: Date): string {
  const dateStr = date.toISOString().split('T')[0];
  const sanitizedTitle = title
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
  return `${dateStr}-${sanitizedTitle}.md`;
}

/**
 * 格式化日期
 */
export function formatDate(dateStr: Date | string): string {
  if (!dateStr) return '';
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  const now = new Date();
  
  // 今天
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  }
  
  // 昨天
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  
  // 本周
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const diff = now.getTime() - date.getTime();
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return days[date.getDay()];
  }
  
  // 更早
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

/**
 * 获取标签颜色
 */
export function getTagColor(tag: string): string {
  const colors: Record<string, string> = {
    'Work': '#FF6B6B',
    'Personal': '#4ECDC4',
    'Ideas': '#9B59B6',
    'Projects': '#F39C12',
    'favorite': '#FFD93D',
    'archive': '#95A5A6',
    'trash': '#E74C3C',
  };

  const direct = colors[tag];
  if (direct) return direct;

  const trimmed = tag.trim();
  if (!trimmed) return '#6C757D';

  const palette = [
    '#2563EB', // blue
    '#7C3AED', // purple
    '#DB2777', // pink
    '#EA580C', // orange
    '#16A34A', // green
    '#0EA5E9', // sky
    '#F59E0B', // amber
    '#10B981', // emerald
    '#EF4444', // red
    '#6366F1', // indigo
    '#14B8A6', // teal
    '#A855F7', // violet
  ];

  let hash = 0;
  for (let i = 0; i < trimmed.length; i += 1) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % palette.length;
  return palette[index] || '#6C757D';
}
