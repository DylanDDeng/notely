import matter from 'gray-matter';

/**
 * 解析笔记内容，提取 frontmatter 和正文
 */
export function parseNote(content) {
  const parsed = matter(content);
  const title = parsed.data.title || 'Untitled';
  const date = parsed.data.date || new Date().toISOString();
  const tags = parsed.data.tags || [];
  
  return {
    title,
    date,
    tags,
    contentBody: parsed.content.trim(),
    rawContent: content,
  };
}

/**
 * 生成笔记内容（frontmatter + body）
 */
export function generateNoteContent(frontmatter, body) {
  const fm = matter.stringify(body, frontmatter);
  return fm;
}

/**
 * 生成文件名
 */
export function generateFilename(title, date) {
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
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
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
export function getTagColor(tag) {
  const colors = {
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
