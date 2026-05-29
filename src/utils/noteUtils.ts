import matter from 'gray-matter';

function filenameToTitle(filename: string): string {
  return filename.replace(/\.md$/i, '').trim();
}

export function parseNote(content: string, filename?: string): ParsedNote {
  const parsed = matter(content);
  const titleFromFilename = filename ? filenameToTitle(filename) : '';
  const titleFromFrontmatter = typeof parsed.data.title === 'string' ? parsed.data.title.trim() : '';
  const title = titleFromFrontmatter || titleFromFilename || 'Untitled';
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

export interface ParsedNote {
  title: string;
  date: string;
  tags: string[];
  contentBody: string;
  rawContent: string;
}

export function normalizeSavedMarkdown(markdown: string): string {
  return String(markdown || '')
    .replace(/^\s*<br\s*\/?>\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n');
}

export function generateNoteContent(body: string): string {
  return normalizeSavedMarkdown(body);
}

// Returns the text of the first Markdown heading (any level), or '' when none.
export function getFirstHeading(markdown: string): string {
  const lines = String(markdown || '').split('\n');
  for (const line of lines) {
    const match = line.match(/^\s{0,3}#{1,6}\s+(.*\S)\s*$/);
    if (match) return match[1].trim();
  }
  return '';
}

export function generateFilename(title: string): string {
  const fallbackTitle = 'Untitled Note';
  const trimmed = title.trim();
  const safeTitle = (trimmed || fallbackTitle)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 80);
  return `${safeTitle || fallbackTitle}.md`;
}
