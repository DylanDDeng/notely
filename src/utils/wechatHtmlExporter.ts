import { remark } from 'remark';
import remarkGfm from 'remark-gfm';

type TableAlign = 'left' | 'center' | 'right' | null;

interface MdNode {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
  lang?: string | null;
  url?: string;
  alt?: string;
  title?: string | null;
  align?: TableAlign[];
  children?: MdNode[];
}

interface RenderContext {
  styleType: number;
  paragraphCount: number;
}

export interface WechatHtmlExportOptions {
  styleType?: number;
}

const FONT_SERIF = "'Noto Serif SC','Source Han Serif SC','Songti SC','STSong','Times New Roman',serif";
const FONT_SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";

const STYLES = {
  section: 'margin:0;padding:0;',
  paragraphFirst:
    `margin:0;color:#202124;font-size:17px;line-height:1.95;font-family:${FONT_SERIF};letter-spacing:0.01em;text-align:justify;`,
  paragraph:
    `margin:0;color:#202124;font-size:17px;line-height:1.95;font-family:${FONT_SERIF};letter-spacing:0.01em;text-align:justify;text-indent:2em;`,
  heading1:
    `margin:10px 0 8px;color:#111111;font-size:34px;line-height:1.32;font-weight:700;text-align:center;font-family:${FONT_SERIF};letter-spacing:0.04em;`,
  heading2:
    `margin:8px 0;color:#111111;font-size:27px;line-height:1.45;font-weight:700;font-family:${FONT_SERIF};padding-left:12px;border-left:4px solid #101828;`,
  heading3:
    `margin:8px 0;color:#1f2937;font-size:22px;line-height:1.5;font-weight:700;font-family:${FONT_SERIF};`,
  heading4:
    `margin:8px 0;color:#1f2937;font-size:19px;line-height:1.55;font-weight:700;font-family:${FONT_SANS};`,
  heading5:
    `margin:8px 0;color:#334155;font-size:17px;line-height:1.6;font-weight:700;font-family:${FONT_SANS};`,
  heading6:
    `margin:8px 0;color:#475569;font-size:16px;line-height:1.65;font-weight:700;font-family:${FONT_SANS};`,
  separator: 'border:none;border-top:1px solid #d7dce1;margin:0;',
  quote:
    `margin:0;padding:12px 14px;border-left:4px solid #cbd5e1;background:#f8fafc;color:#334155;font-size:15px;line-height:1.9;font-family:${FONT_SERIF};`,
  codeBlock:
    `margin:0;padding:14px 16px;background:#0f172a;color:#e2e8f0;border-radius:10px;font-size:13px;line-height:1.7;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;white-space:pre-wrap;word-break:break-word;`,
  inlineCode:
    `background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0;border-radius:4px;padding:1px 5px;font-size:0.92em;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;`,
  link: 'color:#0f6adf;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px;',
  image:
    'display:block;width:100%;max-width:100%;height:auto;border-radius:14px;border:1px solid #e5e7eb;box-shadow:0 12px 34px rgba(15,23,42,0.10);background:#f8fafc;',
  imageCaption:
    `margin:10px 0 0;text-align:center;color:#64748b;font-size:12px;line-height:1.6;font-family:${FONT_SANS};`,
  ul: `margin:0;padding-left:1.4em;color:#202124;font-family:${FONT_SERIF};font-size:16px;line-height:1.9;`,
  ol: `margin:0;padding-left:1.6em;color:#202124;font-family:${FONT_SERIF};font-size:16px;line-height:1.9;`,
  li: 'margin:6px 0;',
  liParagraph: 'margin:0;',
  taskBox: `display:inline-block;width:1.2em;color:#64748b;font-family:${FONT_SANS};`,
  tableWrap: 'margin:0;overflow-x:auto;',
  table: `width:100%;border-collapse:collapse;border:1px solid #dbe3eb;background:#ffffff;font-family:${FONT_SANS};`,
  th:
    'border:1px solid #dbe3eb;padding:10px 12px;background:#f8fafc;color:#0f172a;font-size:14px;line-height:1.5;text-align:left;font-weight:700;',
  td:
    'border:1px solid #dbe3eb;padding:10px 12px;color:#1f2937;font-size:14px;line-height:1.65;text-align:left;',
  hrSection: 'margin:20px 0;padding:0;',
  mediaSection: 'margin:20px 0 16px;padding:0;',
  blockSection: 'margin:16px 0;padding:0;',
  h1Section: 'margin:26px 0 18px;padding:0;',
  h2Section: 'margin:24px 0 16px;padding:0;',
  h3Section: 'margin:20px 0 12px;padding:0;',
} as const;

const DEFAULT_STYLE_TYPE = 3;
const SEPARATOR_AND_STYLE_MARK = (styleType: number): string =>
  `<section><span leaf=""><br></span></section>\n<p style="display:none;"><mp-style-type data-value="${styleType}"></mp-style-type></p>`;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeAttr = (value: string): string => escapeHtml(value).replace(/`/g, '&#96;');

const safeStyleType = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_STYLE_TYPE;
  const normalized = Math.trunc(value);
  if (normalized < 0) return DEFAULT_STYLE_TYPE;
  return normalized;
};

const safeLinkHref = (value: string | undefined): string => {
  const raw = (value || '').trim();
  if (!raw) return '#';
  if (/^(https?:\/\/|mailto:|tel:|#)/i.test(raw)) return raw;
  return `https://${raw}`;
};

const safeImageSrc = (value: string | undefined): string => {
  const raw = (value || '').trim();
  if (!raw) return '';
  if (/^(https?:\/\/|data:image\/)/i.test(raw)) return raw;
  return '';
};

const renderInlineChildren = (children: MdNode[] | undefined, ctx: RenderContext): string => {
  if (!Array.isArray(children) || children.length === 0) return '';
  return children.map((child) => renderInlineNode(child, ctx)).join('');
};

const renderInlineImage = (node: MdNode, _ctx: RenderContext): string => {
  const src = safeImageSrc(node.url);
  if (!src) return '';
  const altText = escapeHtml((node.alt || '').trim());
  const titleText = escapeHtml((node.title || '').trim());
  const caption = titleText || altText;
  const captionHtml = caption ? `<p style="${STYLES.imageCaption}">${caption}</p>` : '';
  return `<span style="display:block;margin:12px 0;">` +
    `<img src="${escapeAttr(src)}" alt="${altText}" style="${STYLES.image}" />${captionHtml}</span>`;
};

const renderInlineNode = (node: MdNode, ctx: RenderContext): string => {
  switch (node.type) {
    case 'text':
      return escapeHtml(node.value || '');
    case 'strong':
      return `<strong style="font-weight:700;color:#0f172a;">${renderInlineChildren(node.children, ctx)}</strong>`;
    case 'emphasis':
      return `<em style="font-style:italic;">${renderInlineChildren(node.children, ctx)}</em>`;
    case 'delete':
      return `<span style="text-decoration:line-through;color:#64748b;">${renderInlineChildren(node.children, ctx)}</span>`;
    case 'inlineCode':
      return `<code style="${STYLES.inlineCode}">${escapeHtml(node.value || '')}</code>`;
    case 'link': {
      const href = safeLinkHref(node.url);
      const text = renderInlineChildren(node.children, ctx) || escapeHtml(href);
      return `<a href="${escapeAttr(href)}" style="${STYLES.link}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    }
    case 'break':
      return '<br />';
    case 'image':
      return renderInlineImage(node, ctx);
    default:
      return renderInlineChildren(node.children, ctx);
  }
};

const withSection = (content: string, sectionStyle: string): string =>
  `<section style="${sectionStyle}">${content}</section>`;

const withStyleMark = (blockHtml: string, styleType: number): string =>
  `${blockHtml}\n${SEPARATOR_AND_STYLE_MARK(styleType)}`;

const headingStyleByDepth = (depth: number): string => {
  switch (depth) {
    case 1:
      return STYLES.heading1;
    case 2:
      return STYLES.heading2;
    case 3:
      return STYLES.heading3;
    case 4:
      return STYLES.heading4;
    case 5:
      return STYLES.heading5;
    default:
      return STYLES.heading6;
  }
};

const headingSectionByDepth = (depth: number): string => {
  switch (depth) {
    case 1:
      return STYLES.h1Section;
    case 2:
      return STYLES.h2Section;
    case 3:
      return STYLES.h3Section;
    default:
      return STYLES.blockSection;
  }
};

const renderImageBlock = (node: MdNode): string | null => {
  const src = safeImageSrc(node.url);
  if (!src) return null;
  const altText = escapeHtml((node.alt || '').trim());
  const titleText = escapeHtml((node.title || '').trim());
  const caption = titleText || altText;
  const captionHtml = caption ? `<p style="${STYLES.imageCaption}">${caption}</p>` : '';
  return withSection(
    `<img src="${escapeAttr(src)}" alt="${altText}" style="${STYLES.image}" />${captionHtml}`,
    STYLES.mediaSection
  );
};

const renderList = (node: MdNode, ctx: RenderContext, nested: boolean): string => {
  const isOrdered = Boolean(node.ordered);
  const listTag = isOrdered ? 'ol' : 'ul';
  const listStyle = isOrdered ? STYLES.ol : STYLES.ul;
  const startAttr =
    isOrdered && typeof node.start === 'number' && node.start > 1 ? ` start="${Math.trunc(node.start)}"` : '';
  const items = (node.children || [])
    .filter((item) => item.type === 'listItem')
    .map((item) => {
      const parts: string[] = [];
      const itemChildren = item.children || [];
      const taskPrefix =
        typeof item.checked === 'boolean'
          ? `<span style="${STYLES.taskBox}">${item.checked ? '☑' : '☐'}</span>`
          : '';

      for (const child of itemChildren) {
        if (child.type === 'paragraph') {
          parts.push(`<p style="${STYLES.liParagraph}">${renderInlineChildren(child.children, ctx)}</p>`);
          continue;
        }
        if (child.type === 'list') {
          parts.push(renderList(child, ctx, true));
          continue;
        }
        if (child.type === 'code') {
          parts.push(`<pre style="${STYLES.codeBlock}">${escapeHtml(child.value || '')}</pre>`);
          continue;
        }
        parts.push(renderInlineChildren(child.children, ctx));
      }

      return `<li style="${STYLES.li}">${taskPrefix}${parts.join('')}</li>`;
    })
    .join('');

  const listHtml = `<${listTag}${startAttr} style="${listStyle}">${items}</${listTag}>`;
  if (nested) return listHtml;
  return withSection(listHtml, STYLES.blockSection);
};

const renderTable = (node: MdNode, ctx: RenderContext): string => {
  const rows = (node.children || []).filter((child) => child.type === 'tableRow');
  if (rows.length === 0) return '';

  const alignments = node.align || [];
  const tableRows = rows
    .map((row, rowIndex) => {
      const cells = (row.children || [])
        .filter((cell) => cell.type === 'tableCell')
        .map((cell, cellIndex) => {
          const align = alignments[cellIndex];
          const alignStyle = align ? `text-align:${align};` : '';
          const tag = rowIndex === 0 ? 'th' : 'td';
          const baseStyle = rowIndex === 0 ? STYLES.th : STYLES.td;
          return `<${tag} style="${baseStyle}${alignStyle}">${renderInlineChildren(cell.children, ctx)}</${tag}>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return withSection(
    `<div style="${STYLES.tableWrap}"><table style="${STYLES.table}">${tableRows}</table></div>`,
    STYLES.blockSection
  );
};

const renderQuote = (node: MdNode, ctx: RenderContext): string => {
  const children = node.children || [];
  const body = children
    .map((child) => {
      if (child.type === 'paragraph') {
        return `<p style="margin:0 0 8px;">${renderInlineChildren(child.children, ctx)}</p>`;
      }
      if (child.type === 'list') {
        return renderList(child, ctx, true);
      }
      return renderInlineChildren(child.children, ctx);
    })
    .join('');

  return withSection(`<blockquote style="${STYLES.quote}">${body}</blockquote>`, STYLES.blockSection);
};

const renderBlock = (node: MdNode, ctx: RenderContext): string | null => {
  switch (node.type) {
    case 'heading': {
      const level = Math.max(1, Math.min(6, node.depth || 1));
      const tag = `h${level}`;
      const heading = `<${tag} style="${headingStyleByDepth(level)}">${renderInlineChildren(node.children, ctx)}</${tag}>`;
      return withSection(heading, headingSectionByDepth(level));
    }
    case 'paragraph': {
      const onlyChild = (node.children || [])[0];
      if ((node.children || []).length === 1 && onlyChild?.type === 'image') {
        return renderImageBlock(onlyChild);
      }
      const paragraphStyle = ctx.paragraphCount === 0 ? STYLES.paragraphFirst : STYLES.paragraph;
      ctx.paragraphCount += 1;
      return withSection(`<p style="${paragraphStyle}">${renderInlineChildren(node.children, ctx)}</p>`, STYLES.blockSection);
    }
    case 'image':
      return renderImageBlock(node);
    case 'list':
      return renderList(node, ctx, false);
    case 'blockquote':
      return renderQuote(node, ctx);
    case 'thematicBreak':
      return withSection(`<hr style="${STYLES.separator}" />`, STYLES.hrSection);
    case 'code':
      return withSection(`<pre style="${STYLES.codeBlock}">${escapeHtml(node.value || '')}</pre>`, STYLES.blockSection);
    case 'table':
      return renderTable(node, ctx);
    case 'html':
      return withSection(
        `<p style="${ctx.paragraphCount === 0 ? STYLES.paragraphFirst : STYLES.paragraph}">${escapeHtml(node.value || '')}</p>`,
        STYLES.blockSection
      );
    default:
      return null;
  }
};

export function convertMarkdownToWechatHtml(markdown: string, options: WechatHtmlExportOptions = {}): string {
  const tree = remark().use(remarkGfm).parse(markdown || '') as MdNode;
  const rootChildren = Array.isArray(tree.children) ? tree.children : [];
  const ctx: RenderContext = {
    styleType: safeStyleType(options.styleType),
    paragraphCount: 0,
  };

  const blocks: string[] = [];
  for (const child of rootChildren) {
    const block = renderBlock(child, ctx);
    if (!block) continue;
    blocks.push(withStyleMark(block, ctx.styleType));
  }

  if (blocks.length === 0) {
    const empty = withSection(`<p style="${STYLES.paragraphFirst}"> </p>`, STYLES.blockSection);
    return withStyleMark(empty, ctx.styleType);
  }

  return blocks.join('\n');
}
