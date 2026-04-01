import { useEffect, useRef } from 'react';
import remarkBreaks from 'remark-breaks';
import { Editor, rootCtx, defaultValueCtx, remarkPluginsCtx, editorViewCtx } from '@milkdown/kit/core';
import type { EditorView } from '@milkdown/kit/prose/view';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { replaceAll } from '@milkdown/kit/utils';
import { DOMSerializer } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/utils';
import { htmlView } from './htmlView';
import '@milkdown/kit/prose/view/style/prosemirror.css';

interface MarkdownLiveEditorProps {
  value: string;
  onChange: (value: string) => void;
  onOpenExternal?: (url: string) => void;
  onOpenImagePreview?: (url: string) => void;
  onEditorDomReady?: (root: HTMLDivElement | null) => void;
  onOutlineChange?: (items: Array<{ id: string; level: number; text: string; pos: number }>) => void;
  onActiveOutlineItemChange?: (itemId: string | null) => void;
  onRegisterOutlineNavigator?: (navigator: ((itemId: string) => void) | null) => void;
  onRegisterExportHtmlGetter?: (getter: (() => string) | null) => void;
  documentKey?: string;
}

interface EditorOutlineItem {
  id: string;
  level: number;
  text: string;
  pos: number;
}

const outlineHeadingFlashKey = new PluginKey<DecorationSet>('NOTELY_OUTLINE_HEADING_FLASH');
const OUTLINE_FLASH_META = 'notely-outline-heading-flash';

const outlineHeadingFlashPlugin = $prose(() => {
  return new Plugin<DecorationSet>({
    key: outlineHeadingFlashKey,
    state: {
      init: () => DecorationSet.empty,
      apply: (tr, value) => {
        const meta = tr.getMeta(OUTLINE_FLASH_META) as
          | { type: 'flash'; pos: number }
          | { type: 'clear' }
          | undefined;

        if (meta?.type === 'clear') {
          return DecorationSet.empty;
        }

        if (meta?.type === 'flash') {
          const node = tr.doc.nodeAt(meta.pos);
          if (!node || node.type.name !== 'heading') {
            return DecorationSet.empty;
          }

          return DecorationSet.create(tr.doc, [
            Decoration.node(meta.pos, meta.pos + node.nodeSize, {
              class: 'outline-heading-highlight',
            }),
          ]);
        }

        if (!tr.docChanged) return value;
        return value.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations: (state) => outlineHeadingFlashKey.getState(state),
    },
  });
});

const collectOutlineItems = (view: EditorView): EditorOutlineItem[] => {
  const items: EditorOutlineItem[] = [];

  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return;
    items.push({
      id: `heading-${pos}`,
      level: typeof node.attrs.level === 'number' ? node.attrs.level : 1,
      text: node.textContent.trim() || 'Untitled',
      pos,
    });
  });

  return items;
};

const normalizeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (
    trimmed.startsWith('/Users/') ||
    trimmed.startsWith('/Volumes/') ||
    trimmed.startsWith('/private/') ||
    trimmed.startsWith('/tmp/') ||
    /^[A-Za-z]:[\\/]/.test(trimmed)
  ) {
    const normalizedPath = trimmed.replace(/\\/g, '/');
    const prefixed = /^[A-Za-z]:\//.test(normalizedPath)
      ? `file:///${normalizedPath}`
      : `file://${normalizedPath}`;
    return encodeURI(prefixed);
  }
  if (/^(https?:\/\/|mailto:|file:|data:|blob:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return `https://${trimmed}`;
};

function MarkdownLiveEditor({
  value,
  onChange,
  onOpenExternal,
  onOpenImagePreview,
  onEditorDomReady,
  onOutlineChange,
  onActiveOutlineItemChange,
  onRegisterOutlineNavigator,
  onRegisterExportHtmlGetter,
  documentKey,
}: MarkdownLiveEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const currentMarkdownRef = useRef(value);
  const latestOnChangeRef = useRef(onChange);
  const latestOnOutlineChangeRef = useRef(onOutlineChange);
  const outlineItemsRef = useRef<EditorOutlineItem[]>([]);
  const headingHighlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    latestOnChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    latestOnOutlineChangeRef.current = onOutlineChange;
  }, [onOutlineChange]);

  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;

    let disposed = false;
    const initialValue = value;

    const setup = async () => {
      const editor = await Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, initialValue);
          ctx.set(remarkPluginsCtx, [{ plugin: remarkBreaks, options: {} }]);
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            currentMarkdownRef.current = markdown;
            latestOnChangeRef.current(markdown);

            const view = _ctx.get(editorViewCtx);
            const nextOutlineItems = collectOutlineItems(view);
            outlineItemsRef.current = nextOutlineItems;
            latestOnOutlineChangeRef.current?.(nextOutlineItems);

            const activeCandidates = nextOutlineItems.filter((item) => item.pos <= view.state.selection.from);
            const activeItem = activeCandidates[activeCandidates.length - 1];
            onActiveOutlineItemChange?.(activeItem?.id || nextOutlineItems[0]?.id || null);
          });
        })
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(clipboard)
        .use(outlineHeadingFlashPlugin)
        .use(htmlView)
        .create();

      if (disposed) {
        await editor.destroy();
        return;
      }

      editorRef.current = editor;
      currentMarkdownRef.current = initialValue;
      onEditorDomReady?.(root);

      const initialOutlineItems = editor.action((ctx) => collectOutlineItems(ctx.get(editorViewCtx)));
      outlineItemsRef.current = initialOutlineItems;
      latestOnOutlineChangeRef.current?.(initialOutlineItems);
      onActiveOutlineItemChange?.(initialOutlineItems[0]?.id || null);

      onRegisterOutlineNavigator?.((itemId) => {
        const activeEditor = editorRef.current;
        if (!activeEditor) return;

        activeEditor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const target = outlineItemsRef.current.find((item) => item.id === itemId);
          if (!target) return;

          const maxPos = view.state.doc.content.size;
          const resolvedPos = Math.min(target.pos + 1, maxPos);
          const selection = TextSelection.near(view.state.doc.resolve(resolvedPos));

          view.focus();
          view.dispatch(
            view.state.tr
              .setSelection(selection)
              .scrollIntoView()
              .setMeta(OUTLINE_FLASH_META, { type: 'flash', pos: target.pos })
          );

          if (headingHighlightTimerRef.current) {
            window.clearTimeout(headingHighlightTimerRef.current);
            headingHighlightTimerRef.current = null;
          }

          headingHighlightTimerRef.current = window.setTimeout(() => {
            const currentEditor = editorRef.current;
            if (!currentEditor) return;

            currentEditor.action((innerCtx) => {
              const innerView = innerCtx.get(editorViewCtx);
              innerView.dispatch(innerView.state.tr.setMeta(OUTLINE_FLASH_META, { type: 'clear' }));
            });

            headingHighlightTimerRef.current = null;
          }, 1200);
        });
      });

      onRegisterExportHtmlGetter?.(() => {
        return editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const serializer = DOMSerializer.fromSchema(view.state.schema);
          const container = document.createElement('div');
          container.appendChild(serializer.serializeFragment(view.state.doc.content));
          return container.innerHTML.trim();
        });
      });
    };

    void setup();

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (target === root) {
        const activeEditor = editorRef.current;
        if (!activeEditor) return;

        event.preventDefault();
        activeEditor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const end = view.state.doc.content.size;
          view.focus();
          view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(end))));
        });
        return;
      }

      const image = target.closest('img');
      if (image instanceof HTMLImageElement) {
        const src = image.getAttribute('src')?.trim() || '';
        if (!src) return;
        event.preventDefault();
        onOpenImagePreview?.(normalizeUrl(src));
        return;
      }

      if (!(event.metaKey || event.ctrlKey)) return;
      const link = target.closest('a');
      if (!(link instanceof HTMLAnchorElement)) return;

      const href = link.getAttribute('href')?.trim() || '';
      if (!href) return;

      event.preventDefault();
      onOpenExternal?.(normalizeUrl(href));
    };

    root.addEventListener('click', handleClick);

    return () => {
      disposed = true;
      root.removeEventListener('click', handleClick);
      onEditorDomReady?.(null);
      latestOnOutlineChangeRef.current?.([]);
      onRegisterOutlineNavigator?.(null);
      onRegisterExportHtmlGetter?.(null);

      const editor = editorRef.current;
      editorRef.current = null;
      if (editor) {
        void editor.destroy();
      }

      if (headingHighlightTimerRef.current) {
        window.clearTimeout(headingHighlightTimerRef.current);
        headingHighlightTimerRef.current = null;
      }

      root.innerHTML = '';
    };
  }, [
    documentKey,
    onActiveOutlineItemChange,
    onEditorDomReady,
    onOpenExternal,
    onOpenImagePreview,
    onRegisterExportHtmlGetter,
    onRegisterOutlineNavigator,
  ]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (value === currentMarkdownRef.current) return;

    currentMarkdownRef.current = value;
    editor.action(replaceAll(value));

    const nextOutlineItems = editor.action((ctx) => collectOutlineItems(ctx.get(editorViewCtx)));
    outlineItemsRef.current = nextOutlineItems;
    latestOnOutlineChangeRef.current?.(nextOutlineItems);
    onActiveOutlineItemChange?.(nextOutlineItems[0]?.id || null);
  }, [value, onActiveOutlineItemChange]);

  return <div ref={hostRef} className="editor-milkdown-root" />;
}

export default MarkdownLiveEditor;
