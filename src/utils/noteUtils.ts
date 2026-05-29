import matter from 'gray-matter';

// Markdown-family extensions the app can open and edit. Note `.mdx` is edited
// as plain Markdown text (JSX shown literally), not rendered as components.
export const MARKDOWN_EXT_RE = /\.(md|markdown|mdx)$/i;
export const DEFAULT_EXT = '.md';

// Returns the file's markdown extension (with leading dot, original case), or
// the default `.md` when the name has no recognized markdown extension.
export function getExtension(filename?: string): string {
  const match = (filename || '').match(MARKDOWN_EXT_RE);
  return match ? match[0] : DEFAULT_EXT;
}

// Strips a recognized markdown extension, leaving the bare base name.
export function stripExtension(filename?: string): string {
  return (filename || '').replace(MARKDOWN_EXT_RE, '');
}

function filenameToTitle(filename: string): string {
  return stripExtension(filename).trim();
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

export function generateFilename(title: string, ext: string = DEFAULT_EXT): string {
  const fallbackTitle = 'Untitled Note';
  const trimmed = title.trim();
  const safeTitle = (trimmed || fallbackTitle)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 80);
  return `${safeTitle || fallbackTitle}${ext}`;
}
