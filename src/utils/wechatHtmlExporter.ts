import { remark } from 'remark';
import remarkGfm from 'remark-gfm';

type TableAlign = 'left' | 'center' | 'right' | null;
type CalloutTone = 'tip' | 'info' | 'warn' | 'neutral';

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

export interface WechatHtmlExportOptions {
  styleType?: number;
  issueLabel?: string;
  articleTitle?: string;
  articleSubtitle?: string;
  footerCtaTitle?: string;
  footerCtaBody?: string;
}

interface RenderContext {
  sectionIndex: number;
}

const DEFAULT_STYLE_TYPE = 3;
const DEFAULT_ISSUE_LABEL = 'BUBBLE 2026 · ISSUE #15';
const ROOT_STYLE = "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; background: #ffffff; color: #1f1f1f; line-height: 1.8; max-width: 700px; margin: 0 auto; padding: 20px; font-size: 15px;";

const STYLES = {
  heroWrap: 'margin-bottom: 30px;',
  issueTag: 'display: inline-block; background: #e8f5e9; color: #2e7d32; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 12px;',
  heroTitle: 'margin: 0; font-size: 24px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.5px;',
  heroSubtitle: 'margin: 8px 0 0; color: #666; font-size: 15px;',

  paragraph: 'margin: 16px 0; color: #333; font-size: 15px; line-height: 1.8;',
  strong: 'font-weight: 700; color: #1a1a1a;',
  em: 'font-style: italic;',
  del: 'text-decoration: line-through; color: #777;',
  inlineCode: 'background: #f3e5f5; color: #7b1fa2; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 14px;',
  link: 'color: #0f6adf; text-decoration: underline;',

  sectionHeader: 'margin: 40px 0 24px; display: flex; align-items: center; gap: 12px;',
  sectionBadge: 'background: #1b5e20; color: white; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600;',
  sectionBadgeNeutral: 'background: #424242; color: white; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600;',
  sectionTitle: 'font-size: 18px; font-weight: 700; color: #1a1a1a;',

  imageCard: 'margin: 20px auto; width: 80%; border: 1px solid #f0f0f0; border-radius: 12px; overflow: hidden; background: #fff;',
  image: 'width: 100%; display: block;',
  imageCaptionWrap: 'padding: 12px 16px; border-top: 1px solid #f0f0f0; background: #fafafa;',
  imageCaption: 'margin: 0; color: #666; font-size: 14px;',

  tipCard: 'margin: 24px 0; padding: 16px; background: #f1f8e9; border-radius: 12px; border-left: 4px solid #689f38;',
  tipText: 'margin: 0; color: #33691e; font-size: 15px; line-height: 1.7;',
  infoCard: 'margin: 24px 0; padding: 16px; background: #e3f2fd; border-radius: 12px; border-left: 4px solid #1e88e5;',
  infoText: 'margin: 0; color: #0d47a1; font-size: 15px; line-height: 1.7;',
  warnCard: 'margin: 24px 0; padding: 16px; background: #fff3e0; border-radius: 12px; border-left: 4px solid #ef6c00;',
  warnText: 'margin: 0; color: #8d3c00; font-size: 15px; line-height: 1.7;',
  neutralCard: 'margin: 24px 0; padding: 16px; background: #f5f5f5; border-radius: 12px; border-left: 4px solid #9e9e9e;',
  neutralText: 'margin: 0; color: #424242; font-size: 15px; line-height: 1.7;',

  list: 'margin: 16px 0; padding-left: 1.3em; color: #333; font-size: 15px; line-height: 1.8;',
  orderedList: 'margin: 16px 0; padding-left: 1.6em; color: #333; font-size: 15px; line-height: 1.8;',
  listItem: 'margin: 8px 0;',

  tableWrap: 'margin: 20px 0; overflow-x: auto; border: 1px solid #f0f0f0; border-radius: 12px; background: #fff;',
  table: 'width: 100%; border-collapse: collapse;',
  tableTh: 'border: 1px solid #f0f0f0; background: #fafafa; padding: 10px 12px; color: #1f2937; font-size: 14px; font-weight: 700; text-align: left;',
  tableTd: 'border: 1px solid #f0f0f0; padding: 10px 12px; color: #333; font-size: 14px; line-height: 1.7; text-align: left;',

  hr: 'margin: 24px 0; border: none; border-top: 1px solid #eceff3;',

  codeBlock: "margin: 20px 0; padding: 14px 16px; background: #0f172a; color: #e2e8f0; border-radius: 10px; font-size: 13px; line-height: 1.7; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; white-space: pre-wrap; word-break: break-word;",

  videoCard: 'margin: 24px 0; background: #1a1a1a; border-radius: 12px; padding: 24px; text-align: center;',
  videoLabel: "margin: 0; color: #69f0ae; font-family: 'Courier New', monospace; font-size: 13px; letter-spacing: 2px;",
  videoTitle: 'margin: 8px 0 0; color: #fff; font-size: 15px;',

  footerCta: 'margin: 60px 0 40px; padding: 32px 24px; background: #f5f5f5; border-radius: 16px; text-align: center;',
  footerCtaTitle: 'margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #1a1a1a;',
  footerCtaBody: 'margin: 0; color: #666; font-size: 14px; line-height: 1.8;',
} as const;

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
  return normalized > 0 ? normalized : DEFAULT_STYLE_TYPE;
};

const safeImageSrc = (value: string | undefined): string => {
  const raw = (value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return '';
};

const safeLinkHref = (value: string | undefined): string => {
  const raw = (value || '').trim();
  if (!raw) return '#';
  if (/^(https?:\/\/|mailto:|tel:|#)/i.test(raw)) return raw;
  return `https://${raw}`;
};

const collectText = (node: MdNode | undefined): string => {
  if (!node) return '';
  if (node.type === 'text' || node.type === 'inlineCode') return node.value || '';
  const children = node.children || [];
  return children.map((child) => collectText(child)).join('');
};

const collectTextFromChildren = (children: MdNode[] | undefined): string => {
  if (!Array.isArray(children)) return '';
  return children.map((child) => collectText(child)).join('').replace(/\s+/g, ' ').trim();
};

const isConclusionHeading = (title: string): boolean => /^(结语|总结|尾声|结尾|最后)$/i.test(title.trim());

const parseCalloutTone = (text: string): { tone: CalloutTone; content: string } => {
  const match = text.match(/^\[!(TIP|INFO|WARN|NOTE|QUOTE)\]\s*/i);
  if (!match) return { tone: 'tip', content: text };

  const key = match[1].toUpperCase();
  const content = text.replace(match[0], '').trim();
  if (key === 'INFO') return { tone: 'info', content };
  if (key === 'WARN') return { tone: 'warn', content };
  if (key === 'NOTE' || key === 'QUOTE') return { tone: 'neutral', content };
  return { tone: 'tip', content };
};

const renderInlineChildren = (children: MdNode[] | undefined, ctx: RenderContext): string => {
  if (!Array.isArray(children) || children.length === 0) return '';
  return children.map((node) => renderInlineNode(node, ctx)).join('');
};

const renderInlineNode = (node: MdNode, ctx: RenderContext): string => {
  switch (node.type) {
    case 'text':
      return escapeHtml(node.value || '');
    case 'strong':
      return `<strong style="${STYLES.strong}">${renderInlineChildren(node.children, ctx)}</strong>`;
    case 'emphasis':
      return `<em style="${STYLES.em}">${renderInlineChildren(node.children, ctx)}</em>`;
    case 'delete':
      return `<span style="${STYLES.del}">${renderInlineChildren(node.children, ctx)}</span>`;
    case 'inlineCode':
      return `<span style="${STYLES.inlineCode}">${escapeHtml(node.value || '')}</span>`;
    case 'link': {
      const href = safeLinkHref(node.url);
      const text = renderInlineChildren(node.children, ctx) || escapeHtml(href);
      return `<a href="${escapeAttr(href)}" style="${STYLES.link}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    }
    case 'break':
      return '<br />';
    default:
      return renderInlineChildren(node.children, ctx);
  }
};

const renderHero = (title: string, options: WechatHtmlExportOptions): string => {
  const issueLabel = (options.issueLabel || DEFAULT_ISSUE_LABEL).trim() || DEFAULT_ISSUE_LABEL;
  const subtitle = (options.articleSubtitle || '').trim();
  const subtitleHtml = subtitle ? `<p style="${STYLES.heroSubtitle}">${escapeHtml(subtitle)}</p>` : '';

  return `<div style="${STYLES.heroWrap}">` +
    `<span style="${STYLES.issueTag}">${escapeHtml(issueLabel)}</span>` +
    `<h1 style="${STYLES.heroTitle}">${escapeHtml(title)}</h1>` +
    subtitleHtml +
    `</div>`;
};

const renderImageCard = (node: MdNode): string | null => {
  const src = safeImageSrc(node.url);
  if (!src) return null;
  const altText = escapeHtml((node.alt || '').trim());
  const titleText = escapeHtml((node.title || '').trim());
  const caption = titleText || altText;
  const captionHtml = caption
    ? `<div style="${STYLES.imageCaptionWrap}"><p style="${STYLES.imageCaption}">${caption}</p></div>`
    : '';

  return `<div style="${STYLES.imageCard}">` +
    `<img src="${escapeAttr(src)}" style="${STYLES.image}" alt="${altText}" />` +
    captionHtml +
    `</div>`;
};

const renderSectionHeader = (title: string, ctx: RenderContext): string => {
  if (isConclusionHeading(title)) {
    return `<div style="${STYLES.sectionHeader}">` +
      `<span style="${STYLES.sectionBadgeNeutral}">${escapeHtml(title)}</span>` +
      `</div>`;
  }

  ctx.sectionIndex += 1;
  const indexText = String(ctx.sectionIndex).padStart(2, '0');
  return `<div style="${STYLES.sectionHeader}">` +
    `<span style="${STYLES.sectionBadge}">${indexText}</span>` +
    `<span style="${STYLES.sectionTitle}">${escapeHtml(title)}</span>` +
    `</div>`;
};

const renderList = (node: MdNode, ctx: RenderContext, nested: boolean): string => {
  const ordered = Boolean(node.ordered);
  const tag = ordered ? 'ol' : 'ul';
  const listStyle = ordered ? STYLES.orderedList : STYLES.list;
  const startAttr = ordered && typeof node.start === 'number' && node.start > 1 ? ` start="${Math.trunc(node.start)}"` : '';

  const items = (node.children || [])
    .filter((item) => item.type === 'listItem')
    .map((item) => {
      const prefix = typeof item.checked === 'boolean' ? (item.checked ? '☑ ' : '☐ ') : '';
      const body = (item.children || [])
        .map((child) => {
          if (child.type === 'paragraph') return renderInlineChildren(child.children, ctx);
          if (child.type === 'list') return renderList(child, ctx, true);
          return renderInlineChildren(child.children, ctx);
        })
        .join('');

      return `<li style="${STYLES.listItem}">${escapeHtml(prefix)}${body}</li>`;
    })
    .join('');

  const html = `<${tag}${startAttr} style="${listStyle}">${items}</${tag}>`;
  if (nested) return html;
  return html;
};

const renderTable = (node: MdNode, ctx: RenderContext): string => {
  const rows = (node.children || []).filter((child) => child.type === 'tableRow');
  if (rows.length === 0) return '';

  const aligns = node.align || [];
  const rowHtml = rows
    .map((row, rowIndex) => {
      const cells = (row.children || [])
        .filter((cell) => cell.type === 'tableCell')
        .map((cell, cellIndex) => {
          const align = aligns[cellIndex];
          const alignStyle = align ? `text-align: ${align};` : '';
          if (rowIndex === 0) {
            return `<th style="${STYLES.tableTh}${alignStyle}">${renderInlineChildren(cell.children, ctx)}</th>`;
          }
          return `<td style="${STYLES.tableTd}${alignStyle}">${renderInlineChildren(cell.children, ctx)}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<div style="${STYLES.tableWrap}"><table style="${STYLES.table}">${rowHtml}</table></div>`;
};

const renderCallout = (node: MdNode): string => {
  const text = collectTextFromChildren(node.children);
  const parsed = parseCalloutTone(text);
  const content = escapeHtml(parsed.content);

  if (parsed.tone === 'info') {
    return `<div style="${STYLES.infoCard}"><p style="${STYLES.infoText}">${content}</p></div>`;
  }
  if (parsed.tone === 'warn') {
    return `<div style="${STYLES.warnCard}"><p style="${STYLES.warnText}">${content}</p></div>`;
  }
  if (parsed.tone === 'neutral') {
    return `<div style="${STYLES.neutralCard}"><p style="${STYLES.neutralText}">${content}</p></div>`;
  }

  return `<div style="${STYLES.tipCard}"><p style="${STYLES.tipText}">${content}</p></div>`;
};

const renderVideoCard = (raw: string): string => {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let label = 'VIDEO';
  let title = '视频片段';

  if (lines.length >= 2) {
    label = lines[0] || label;
    title = lines[1] || title;
  } else if (lines.length === 1) {
    const parts = lines[0].split('|').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      label = parts[0] || label;
      title = parts[1] || title;
    } else {
      title = lines[0] || title;
    }
  }

  return `<div style="${STYLES.videoCard}">` +
    `<p style="${STYLES.videoLabel}">${escapeHtml(label)}</p>` +
    `<p style="${STYLES.videoTitle}">${escapeHtml(title)}</p>` +
    `</div>`;
};

const renderFooterCta = (options: WechatHtmlExportOptions): string | null => {
  const title = (options.footerCtaTitle || '').trim();
  const body = (options.footerCtaBody || '').trim();
  if (!title && !body) return null;

  const safeTitle = escapeHtml(title || '马上周末了，去创造点什么吧。');
  const safeBody = escapeHtml(body || '若觉得内容有帮助，欢迎点赞、推荐、关注。');
  return `<div style="${STYLES.footerCta}">` +
    `<p style="${STYLES.footerCtaTitle}">${safeTitle}</p>` +
    `<p style="${STYLES.footerCtaBody}">${safeBody}</p>` +
    `</div>`;
};

const renderBlock = (node: MdNode, ctx: RenderContext): string | null => {
  switch (node.type) {
    case 'heading': {
      const depth = Math.max(1, Math.min(6, node.depth || 1));
      const title = collectTextFromChildren(node.children);
      if (depth === 2) return renderSectionHeader(title, ctx);
      if (depth >= 3) return `<p style="${STYLES.paragraph}"><strong style="${STYLES.strong}">${escapeHtml(title)}</strong></p>`;
      if (depth === 1) return `<h1 style="${STYLES.heroTitle}">${escapeHtml(title)}</h1>`;
      return null;
    }
    case 'paragraph': {
      const children = node.children || [];
      if (children.length === 1 && children[0]?.type === 'image') {
        return renderImageCard(children[0]);
      }
      return `<p style="${STYLES.paragraph}">${renderInlineChildren(children, ctx)}</p>`;
    }
    case 'image':
      return renderImageCard(node);
    case 'list':
      return renderList(node, ctx, false);
    case 'blockquote':
      return renderCallout(node);
    case 'table':
      return renderTable(node, ctx);
    case 'thematicBreak':
      return `<hr style="${STYLES.hr}" />`;
    case 'code': {
      const lang = (node.lang || '').trim().toLowerCase();
      if (lang === 'video') return renderVideoCard(node.value || '');
      if (lang === 'cta') {
        const lines = (node.value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const title = lines[0] || '马上周末了，去创造点什么吧。';
        const body = lines.slice(1).map((line) => escapeHtml(line)).join('<br>') || '若觉得内容有帮助，欢迎点赞、推荐、关注。';
        return `<div style="${STYLES.footerCta}">` +
          `<p style="${STYLES.footerCtaTitle}">${escapeHtml(title)}</p>` +
          `<p style="${STYLES.footerCtaBody}">${body}</p>` +
          `</div>`;
      }
      return `<pre style="${STYLES.codeBlock}">${escapeHtml(node.value || '')}</pre>`;
    }
    default:
      return null;
  }
};

const takeHeroTitle = (nodes: MdNode[], options: WechatHtmlExportOptions): { title: string; remaining: MdNode[] } => {
  const remaining = [...nodes];
  let title = (options.articleTitle || '').trim();

  if (!title && remaining[0]?.type === 'heading' && (remaining[0].depth || 1) === 1) {
    title = collectTextFromChildren(remaining[0].children);
    remaining.shift();
  }

  return { title, remaining };
};

export function convertMarkdownToWechatHtml(markdown: string, options: WechatHtmlExportOptions = {}): string {
  const tree = remark().use(remarkGfm).parse(markdown || '') as MdNode;
  const rootChildren = Array.isArray(tree.children) ? tree.children : [];
  const styleType = safeStyleType(options.styleType);

  const ctx: RenderContext = {
    sectionIndex: 0,
  };

  const { title, remaining } = takeHeroTitle(rootChildren, options);
  const bodyBlocks: string[] = [];

  for (const node of remaining) {
    const html = renderBlock(node, ctx);
    if (!html) continue;
    bodyBlocks.push(html);
  }

  const cta = renderFooterCta(options);
  if (cta) {
    bodyBlocks.push(cta);
  }

  const heroHtml = title ? renderHero(title, options) : '';
  const bodyHtml = bodyBlocks.join('\n\n');
  const rootHtml = `<section style="${ROOT_STYLE}">\n${heroHtml}${heroHtml && bodyHtml ? '\n\n' : ''}${bodyHtml}\n</section>`;

  const finalStyleMark = `<p style="display: none;">\n  <mp-style-type data-value="${styleType}"></mp-style-type>\n</p>`;

  return `${rootHtml}\n\n${finalStyleMark}`;
}
