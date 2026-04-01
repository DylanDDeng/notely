import { useEffect, useRef } from 'react';
import { Editor, rootCtx, defaultValueCtx, remarkPluginsCtx, editorViewCtx, commandsCtx } from '@milkdown/kit/core';
import type { EditorView } from '@milkdown/kit/prose/view';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { commonmark, insertImageCommand } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { trailing } from '@milkdown/kit/plugin/trailing';
import { replaceAll } from '@milkdown/kit/utils';
import { DOMSerializer } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/utils';
import { htmlView } from './htmlView';
import { customImageView } from './imageView';
import { customCodeBlockView } from './codeBlockView';
import '@milkdown/kit/prose/view/style/prosemirror.css';

interface MarkdownLiveEditorProps {
  value: string;
  onChange: (value: string) => void;
  onOpenExternal?: (url: string) => void;
  onOpenImagePreview?: (url: string) => void;
  onEditorDomReady?: (root: HTMLDivElement | null) => void;
  onOutlineChange?: (items: Array<{ id: string; level: number; text: string; pos: number }>) => void;
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

const syncRenderableMediaSources = (root: HTMLElement) => {
  root.querySelectorAll('a[href]').forEach((node) => {
    if (node instanceof HTMLAnchorElement) {
      const raw = node.dataset.originalHref || node.getAttribute('href')?.trim() || '';
      if (!raw) return;
      const normalized = normalizeUrl(raw);
      if (!node.dataset.originalHref) {
        node.dataset.originalHref = raw;
      }
      if (node.getAttribute('href') !== normalized) {
        node.setAttribute('href', normalized);
      }
    }
  });
};

const isLikelyLocalPath = (value: string): boolean => {
  const trimmed = value.trim();
  return (
    trimmed.startsWith('/Users/') ||
    trimmed.startsWith('/Volumes/') ||
    trimmed.startsWith('/private/') ||
    trimmed.startsWith('/tmp/') ||
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    /^file:\/\//i.test(trimmed)
  );
};

const toFilesystemPath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^file:\/\//i.test(trimmed)) {
    const withoutProtocol = decodeURI(trimmed.replace(/^file:\/\//i, ''));
    return withoutProtocol.replace(/^\/([A-Za-z]:\/)/, '$1');
  }
  return trimmed;
};

const isLikelyLocalImagePath = (value: string): boolean => {
  const normalized = toFilesystemPath(value);
  return isLikelyLocalPath(normalized) && /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(normalized);
};

const extractLocalImagePathFromPaste = (event: ClipboardEvent): string | null => {
  const data = event.clipboardData;
  if (!data) return null;

  const imageFile = Array.from(data.files || []).find((file) => file.type.startsWith('image/')) as (File & { path?: string }) | undefined;
  if (imageFile?.path && isLikelyLocalImagePath(imageFile.path)) {
    return toFilesystemPath(imageFile.path);
  }

  const uriList = data
    .getData('text/uri-list')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item && !item.startsWith('#'));

  if (uriList && isLikelyLocalImagePath(uriList)) {
    return toFilesystemPath(uriList);
  }

  const plainText = data.getData('text/plain').trim();
  if (plainText && isLikelyLocalImagePath(plainText)) {
    return toFilesystemPath(plainText);
  }

  return null;
};

const getImageFileFromPaste = (event: ClipboardEvent): File | null => {
  const data = event.clipboardData;
  if (!data) return null;
  const imageFile = Array.from(data.files || []).find((file) => file.type.startsWith('image/'));
  return imageFile || null;
};

const stripNullChars = (value: string): string => value.replace(/\0/g, '').trim();

const extractLocalImagePathFromNativePayload = (
  payload?: {
    success: boolean;
    formats?: Array<{
      format: string;
      kind: 'text' | 'buffer' | 'error';
      value?: string;
      utf8?: string;
    }>;
  } | null
): string | null => {
  if (!payload?.success || !payload.formats?.length) return null;

  const candidates = payload.formats.flatMap((entry) => {
    const values = [entry.value, entry.utf8]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map(stripNullChars)
      .filter(Boolean);
    return values.map((value) => ({ format: entry.format, value }));
  });

  for (const candidate of candidates) {
    const fileUrlMatch = candidate.value.match(/file:\/\/[^\s]+/i);
    if (fileUrlMatch && isLikelyLocalImagePath(fileUrlMatch[0])) {
      return toFilesystemPath(fileUrlMatch[0]);
    }

    const absolutePathMatch = candidate.value.match(/(?:\/Users\/|\/Volumes\/|\/private\/|\/tmp\/)[^\s]+/);
    if (absolutePathMatch && isLikelyLocalImagePath(absolutePathMatch[0])) {
      return toFilesystemPath(absolutePathMatch[0]);
    }

    const windowsPathMatch = candidate.value.match(/[A-Za-z]:[\\/][^\s]+/);
    if (windowsPathMatch && isLikelyLocalImagePath(windowsPathMatch[0])) {
      return toFilesystemPath(windowsPathMatch[0]);
    }
  }

  return null;
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to read image data'));
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read image data'));
    reader.readAsDataURL(file);
  });

function MarkdownLiveEditor({
  value,
  onChange,
  onOpenExternal,
  onOpenImagePreview,
  onEditorDomReady,
  onOutlineChange,
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
  const copyResetTimerRef = useRef<number | null>(null);
  const headingHighlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    latestOnOutlineChangeRef.current = onOutlineChange;
  }, [onOutlineChange]);

  useEffect(() => {
    latestOnChangeRef.current = onChange;
  }, [onChange]);

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
          ctx.set(remarkPluginsCtx, []);
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            currentMarkdownRef.current = markdown;
            latestOnChangeRef.current(markdown);
            const view = _ctx.get(editorViewCtx);
            const nextOutlineItems = collectOutlineItems(view);
            outlineItemsRef.current = nextOutlineItems;
            latestOnOutlineChangeRef.current?.(nextOutlineItems);
          });
        })
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(clipboard)
        .use(trailing)
        .use(outlineHeadingFlashPlugin)
        .use(customCodeBlockView)
        .use(customImageView)
        .use(htmlView)
        .create();

      if (disposed) {
        await editor.destroy();
        return;
      }

      editorRef.current = editor;
      currentMarkdownRef.current = initialValue;
      onEditorDomReady?.(root);
      const initialOutlineItems = editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        return collectOutlineItems(view);
      });
      outlineItemsRef.current = initialOutlineItems;
      latestOnOutlineChangeRef.current?.(initialOutlineItems);
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
              innerView.dispatch(
                innerView.state.tr.setMeta(OUTLINE_FLASH_META, { type: 'clear' })
              );
            });
            headingHighlightTimerRef.current = null;
          }, 1200);
        });
      });
      syncRenderableMediaSources(root);
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

    const observer = new MutationObserver(() => {
      syncRenderableMediaSources(root);
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
    });

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (target === root) {
        const editor = editorRef.current;
        if (!editor) return;

        event.preventDefault();
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const end = view.state.doc.content.size;
          view.focus();
          view.dispatch(
            view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(end)))
          );
        });
        return;
      }

      const copyButton = target.closest('.copy-button');
      if (copyButton) {
        const block = copyButton.closest('.milkdown-code-block');
        const codeContent = block?.querySelector('.cm-content') as HTMLElement | null;
        const text = codeContent?.innerText?.trim() || '';
        if (!text) return;

        event.preventDefault();
        event.stopPropagation();

        const setCopiedState = () => {
          if (!(copyButton instanceof HTMLElement)) return;
          copyButton.dataset.copied = 'true';
          if (copyResetTimerRef.current) {
            window.clearTimeout(copyResetTimerRef.current);
          }
          copyResetTimerRef.current = window.setTimeout(() => {
            copyButton.removeAttribute('data-copied');
            copyResetTimerRef.current = null;
          }, 1200);
        };

        void (async () => {
          const result = await window.electronAPI.writeClipboardText(text);
          if (result.success) {
            setCopiedState();
          }
        })();
        return;
      }

      const image = target.closest('img');
      if (image) {
        const src = image.getAttribute('data-original-src')?.trim() || image.getAttribute('src')?.trim() || '';
        if (!src) return;
        event.preventDefault();
        onOpenImagePreview?.(normalizeUrl(src));
        return;
      }

      if (!(event.metaKey || event.ctrlKey)) return;
      const link = target.closest('a');
      if (!link) return;

      const href = link.getAttribute('href')?.trim() || '';
      const normalized = normalizeUrl(href);
      if (!normalized) return;

      event.preventDefault();
      onOpenExternal?.(normalized);
    };

    const handlePaste = (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      const imageFile = getImageFileFromPaste(event);
      if (clipboardData) {
        const files = Array.from(clipboardData.files || []).map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          path: (file as File & { path?: string }).path || null,
        }));
        console.log('[notely][paste] clipboard payload', {
          types: Array.from(clipboardData.types || []),
          files,
          textPlain: clipboardData.getData('text/plain'),
          textUriList: clipboardData.getData('text/uri-list'),
          textHtml: clipboardData.getData('text/html'),
        });
      }

      const editor = editorRef.current;
      if (!editor) return;

      event.preventDefault();
      void (async () => {
        const nativePathResult = await window.electronAPI.getClipboardLocalImagePath?.();
        const nativePayload = await window.electronAPI.getClipboardDebugPayload?.();
        console.log('[notely][paste] native clipboard payload', nativePayload);
        console.log('[notely][paste] native clipboard local image path', nativePathResult);

        const filePath =
          extractLocalImagePathFromPaste(event) ||
          nativePathResult?.filePath ||
          extractLocalImagePathFromNativePayload(nativePayload);

        console.log('[notely][paste] resolved local image path', filePath);

      if (filePath) {
        editor.action((ctx) => {
          const commands = ctx.get(commandsCtx);
            console.log('[notely][paste] inserting image node', { src: filePath, mode: 'path' });
            commands.call(insertImageCommand.key, {
              src: filePath,
              alt: '',
              title: '',
            });
        });
        return;
      }

        if (!imageFile) return;

        const dataUrl = await readFileAsDataUrl(imageFile);
        const savedAsset = await window.electronAPI.saveClipboardImageAsset?.({
          dataUrl,
          suggestedName: imageFile.name || 'pasted-image',
        });

        const src = savedAsset?.success && savedAsset.filePath ? savedAsset.filePath : dataUrl;
        editor.action((ctx) => {
          const commands = ctx.get(commandsCtx);
          console.log('[notely][paste] inserting image node', {
            mode: savedAsset?.success && savedAsset.filePath ? 'saved-asset-path' : 'data-url',
            type: imageFile.type,
            size: imageFile.size,
            src,
          });
          commands.call(insertImageCommand.key, {
            src,
            alt: '',
            title: '',
          });
        });
      })().catch((error) => {
        console.error('[notely][paste] failed to handle clipboard image paste', error);
      });

      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };

    root.addEventListener('click', handleClick);
    root.addEventListener('paste', handlePaste, true);

    return () => {
      disposed = true;
      observer.disconnect();
      root.removeEventListener('click', handleClick);
      root.removeEventListener('paste', handlePaste, true);
      onEditorDomReady?.(null);
      latestOnOutlineChangeRef.current?.([]);
      onRegisterOutlineNavigator?.(null);
      onRegisterExportHtmlGetter?.(null);
      const editor = editorRef.current;
      editorRef.current = null;
      if (editor) {
        void editor.destroy();
      }
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current);
        copyResetTimerRef.current = null;
      }
      if (headingHighlightTimerRef.current) {
        window.clearTimeout(headingHighlightTimerRef.current);
        headingHighlightTimerRef.current = null;
      }
      root.innerHTML = '';
    };
  }, [
    documentKey,
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
    const nextOutlineItems = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      return collectOutlineItems(view);
    });
    outlineItemsRef.current = nextOutlineItems;
    latestOnOutlineChangeRef.current?.(nextOutlineItems);
    const root = hostRef.current;
    if (root) {
      requestAnimationFrame(() => {
        syncRenderableMediaSources(root);
      });
    }
  }, [value]);

  return <div ref={hostRef} className="editor-milkdown-root" />;
}

export default MarkdownLiveEditor;
