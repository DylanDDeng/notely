import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView, Decoration, ViewPlugin, WidgetType, placeholder, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { Range } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import type { Extension } from '@codemirror/state';

interface MarkdownLiveEditorProps {
  value: string;
  onChange: (value: string) => void;
  onEditorReady?: (view: EditorView) => void;
  onOpenExternal?: (url: string) => void;
  onOpenImagePreview?: (url: string) => void;
}

const hiddenMarker = Decoration.mark({ class: 'cm-md-hidden-marker' });
const strongMark = Decoration.mark({ class: 'cm-md-strong' });
const emMark = Decoration.mark({ class: 'cm-md-em' });
const strikeMark = Decoration.mark({ class: 'cm-md-strike' });
const inlineCodeMark = Decoration.mark({ class: 'cm-md-inline-code' });
const linkTextMark = Decoration.mark({ class: 'cm-md-link-text' });
const quoteLineDecorations = [
  Decoration.line({ attributes: { class: 'cm-md-quote-line cm-md-quote-depth-1' } }),
  Decoration.line({ attributes: { class: 'cm-md-quote-line cm-md-quote-depth-2' } }),
  Decoration.line({ attributes: { class: 'cm-md-quote-line cm-md-quote-depth-3' } }),
] as const;

const headingTextDecorations = [
  null,
  Decoration.mark({ class: 'cm-md-heading cm-md-heading-1' }),
  Decoration.mark({ class: 'cm-md-heading cm-md-heading-2' }),
  Decoration.mark({ class: 'cm-md-heading cm-md-heading-3' }),
  Decoration.mark({ class: 'cm-md-heading cm-md-heading-4' }),
  Decoration.mark({ class: 'cm-md-heading cm-md-heading-5' }),
  Decoration.mark({ class: 'cm-md-heading cm-md-heading-6' }),
] as const;

const normalizeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^(https?:\/\/|mailto:|file:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return `https://${trimmed}`;
};

const addRange = (ranges: ReturnType<typeof hiddenMarker.range>[], from: number, to: number) => {
  if (to <= from) return;
  ranges.push(hiddenMarker.range(from, to));
};

class MarkdownImageWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
    private readonly onOpenImagePreview?: (url: string) => void
  ) {
    super();
  }

  eq(other: MarkdownImageWidget) {
    return this.src === other.src && this.alt === other.alt && this.onOpenImagePreview === other.onOpenImagePreview;
  }

  toDOM() {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-md-image-widget';

    const img = document.createElement('img');
    img.className = 'cm-md-image-widget-img';
    img.src = this.src;
    img.alt = this.alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';

    img.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onOpenImagePreview?.(this.src);
    });

    img.addEventListener('error', () => {
      wrapper.classList.add('is-broken');
      const fallback = document.createElement('span');
      fallback.className = 'cm-md-image-widget-fallback';
      fallback.textContent = this.alt ? `Image failed: ${this.alt}` : 'Image failed to load';
      wrapper.replaceChildren(fallback);
    });

    wrapper.appendChild(img);
    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

const buildLivePreviewDecorations = (
  view: EditorView,
  onOpenImagePreview?: (url: string) => void
): DecorationSet => {
  const doc = view.state.doc;
  const activeLineNo = doc.lineAt(view.state.selection.main.head).number;
  const ranges: Range<Decoration>[] = [];

  let inFence = false;

  for (let lineNo = 1; lineNo <= doc.lines; lineNo += 1) {
    const line = doc.line(lineNo);
    const text = line.text;
    const isActiveLine = lineNo === activeLineNo;
    const trimmed = text.trimStart();
    const isFenceLine = /^(```|~~~)/.test(trimmed);

    if (!isActiveLine && !inFence && text.length > 0) {
      const heading = text.match(/^(\s{0,3})(#{1,6})(\s+)/);
      if (heading) {
        const level = heading[2].length;
        const headingText = headingTextDecorations[level];
        const headingTextFrom = line.from + heading[0].length;
        if (headingText && line.to > headingTextFrom) {
          ranges.push(headingText.range(headingTextFrom, line.to));
        }
        addRange(ranges, line.from + heading[1].length, line.from + heading[1].length + heading[2].length + heading[3].length);
      }

      const quotePrefix = text.match(/^(\s*>+\s*)+/);
      if (quotePrefix) {
        const quoteDepth = (quotePrefix[0].match(/>/g) || []).length;
        const normalizedDepth = Math.max(1, Math.min(quoteDepth, quoteLineDecorations.length));
        ranges.push(quoteLineDecorations[normalizedDepth - 1].range(line.from));
        addRange(ranges, line.from, line.from + quotePrefix[0].length);
      }

      const taskPrefix = text.match(/^(\s*[-+*]\s+\[(?: |x|X)\]\s+)/);
      if (taskPrefix) {
        addRange(ranges, line.from, line.from + taskPrefix[0].length);
      } else {
        const listPrefix = text.match(/^(\s*)([-+*]|\d+[.)])(\s+)/);
        if (listPrefix) {
          addRange(ranges, line.from + listPrefix[1].length, line.from + listPrefix[1].length + listPrefix[2].length + listPrefix[3].length);
        }
      }

      const addPairStyles = (regex: RegExp, markerLen: number, innerDecoration: typeof strongMark) => {
        let match = regex.exec(text);
        while (match) {
          const start = line.from + match.index;
          const end = start + match[0].length;
          if (end - start <= markerLen * 2) {
            match = regex.exec(text);
            continue;
          }
          addRange(ranges, start, start + markerLen);
          addRange(ranges, end - markerLen, end);
          ranges.push(innerDecoration.range(start + markerLen, end - markerLen));
          match = regex.exec(text);
        }
      };

      addPairStyles(/\*\*([^\n]+?)\*\*/g, 2, strongMark);
      addPairStyles(/__([^\n]+?)__/g, 2, strongMark);
      addPairStyles(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, 1, emMark);
      addPairStyles(/(?<!_)_(?!_)([^_\n]+?)(?<!_)_(?!_)/g, 1, emMark);
      addPairStyles(/~~([^\n]+?)~~/g, 2, strikeMark);

      const inlineCodeRegex = /`([^`\n]+)`/g;
      let inlineCode = inlineCodeRegex.exec(text);
      while (inlineCode) {
        const start = line.from + inlineCode.index;
        const end = start + inlineCode[0].length;
        addRange(ranges, start, start + 1);
        addRange(ranges, end - 1, end);
        ranges.push(inlineCodeMark.range(start + 1, end - 1));
        inlineCode = inlineCodeRegex.exec(text);
      }

      const linkRegex = /!?\[([^\]\n]*)\]\(([^)\n]+)\)/g;
      let linkMatch = linkRegex.exec(text);
      while (linkMatch) {
        const full = linkMatch[0];
        const isImage = full.startsWith('!');
        const contentOffset = isImage ? 2 : 1;
        const textValue = linkMatch[1];
        const textStart = line.from + linkMatch.index + contentOffset;
        const textEnd = textStart + textValue.length;
        const fullStart = line.from + linkMatch.index;
        const fullEnd = fullStart + full.length;

        if (isImage) {
          const rawUrl = linkMatch[2]?.trim() ?? '';
          const url = normalizeUrl(rawUrl);
          if (url) {
            addRange(ranges, fullStart, fullEnd);
            ranges.push(
              Decoration.widget({
                side: 1,
                widget: new MarkdownImageWidget(url, textValue, onOpenImagePreview),
              }).range(fullEnd)
            );
          }
        } else {
          addRange(ranges, fullStart, textStart);
          addRange(ranges, textEnd, fullEnd);
          ranges.push(linkTextMark.range(textStart, textEnd));
        }

        linkMatch = linkRegex.exec(text);
      }
    }

    if (isFenceLine) {
      inFence = !inFence;
    }
  }

  return Decoration.set(ranges, true);
};

const createLivePreviewPlugin = (onOpenImagePreview?: (url: string) => void) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildLivePreviewDecorations(view, onOpenImagePreview);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildLivePreviewDecorations(update.view, onOpenImagePreview);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    }
  );

function MarkdownLiveEditor({
  value,
  onChange,
  onEditorReady,
  onOpenExternal,
  onOpenImagePreview,
}: MarkdownLiveEditorProps) {
  const extensions = useMemo<Extension[]>(() => {
    const livePreviewPlugin = createLivePreviewPlugin(onOpenImagePreview);
    const domHandlers = EditorView.domEventHandlers({
      mousedown: (event, view) => {
        if (!(event.metaKey || event.ctrlKey) || !onOpenExternal) return false;
        const target = event.target as HTMLElement | null;
        const linkNode = target?.closest('.cm-md-link-text');
        if (!linkNode) return false;

        const pos = view.posAtDOM(linkNode, 0);
        const line = view.state.doc.lineAt(pos);
        const relPos = pos - line.from;
        const source = line.text;

        const linkRegex = /!?\[([^\]\n]*)\]\(([^)\n]+)\)/g;
        let match = linkRegex.exec(source);
        while (match) {
          const full = match[0];
          if (full.startsWith('!')) {
            match = linkRegex.exec(source);
            continue;
          }

          const labelStart = match.index + 1;
          const labelEnd = labelStart + match[1].length;
          if (relPos >= labelStart && relPos <= labelEnd) {
            const href = normalizeUrl(match[2]);
            if (!href) return false;
            event.preventDefault();
            onOpenExternal(href);
            return true;
          }
          match = linkRegex.exec(source);
        }
        return false;
      },
    });

    return [markdown(), EditorView.lineWrapping, placeholder('Start writing...'), livePreviewPlugin, domHandlers];
  }, [onOpenExternal, onOpenImagePreview]);

  return (
    <CodeMirror
      className="editor-live-cm"
      value={value}
      onChange={onChange}
      extensions={extensions}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLineGutter: false,
        drawSelection: true,
        dropCursor: false,
        allowMultipleSelections: false,
        indentOnInput: true,
      }}
      autoFocus
      onCreateEditor={(view) => onEditorReady?.(view)}
    />
  );
}

export default MarkdownLiveEditor;
