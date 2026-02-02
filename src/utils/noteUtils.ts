import matter from 'gray-matter';
import type { NoteFrontmatter } from '../types';

/**
 * 解析笔记内容，提取 frontmatter 和正文
 */
export function parseNote(content: string): ParsedNote {
  const parsed = matter(content);
  const title = (parsed.data.title as string) || 'Untitled';
  const date = (parsed.data.date as string) || new Date().toISOString();
  const tags = (parsed.data.tags as string[]) || [];
  
  return {
    title,
    date,
    tags,
    contentBody: parsed.content.trim(),
    rawContent: content,
  };
}

/**
 * 解析后的笔记数据
 */
export interface ParsedNote {
  title: string;
  date: string;
  tags: string[];
  contentBody: string;
  rawContent: string;
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
  return colors[tag] || '#6C757D';
}
