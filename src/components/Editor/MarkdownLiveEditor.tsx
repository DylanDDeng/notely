import { useEffect, useRef } from 'react';
import { Editor, rootCtx, defaultValueCtx, remarkPluginsCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { trailing } from '@milkdown/kit/plugin/trailing';
import { replaceAll } from '@milkdown/kit/utils';
import remarkBreaks from 'remark-breaks';
import { htmlView } from './htmlView';
import { customCodeBlockView } from './codeBlockView';
import '@milkdown/kit/prose/view/style/prosemirror.css';

interface MarkdownLiveEditorProps {
  value: string;
  onChange: (value: string) => void;
  onOpenExternal?: (url: string) => void;
  onOpenImagePreview?: (url: string) => void;
  onEditorDomReady?: (root: HTMLDivElement | null) => void;
  documentKey?: string;
}

const normalizeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^(https?:\/\/|mailto:|file:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return `https://${trimmed}`;
};

function MarkdownLiveEditor({
  value,
  onChange,
  onOpenExternal,
  onOpenImagePreview,
  onEditorDomReady,
  documentKey,
}: MarkdownLiveEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const currentMarkdownRef = useRef(value);
  const latestOnChangeRef = useRef(onChange);
  const copyResetTimerRef = useRef<number | null>(null);

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
          ctx.set(remarkPluginsCtx, [{ plugin: remarkBreaks, options: {} }]);
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            currentMarkdownRef.current = markdown;
            latestOnChangeRef.current(markdown);
          });
        })
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(clipboard)
        .use(trailing)
        .use(customCodeBlockView)
        .use(htmlView)
        .create();

      if (disposed) {
        await editor.destroy();
        return;
      }

      editorRef.current = editor;
      currentMarkdownRef.current = initialValue;
      onEditorDomReady?.(root);
    };

    void setup();

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

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
        const src = image.getAttribute('src')?.trim() || '';
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

    root.addEventListener('click', handleClick);

    return () => {
      disposed = true;
      root.removeEventListener('click', handleClick);
      onEditorDomReady?.(null);
      const editor = editorRef.current;
      editorRef.current = null;
      if (editor) {
        void editor.destroy();
      }
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current);
        copyResetTimerRef.current = null;
      }
      root.innerHTML = '';
    };
  }, [documentKey, onEditorDomReady, onOpenExternal, onOpenImagePreview]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (value === currentMarkdownRef.current) return;

    currentMarkdownRef.current = value;
    editor.action(replaceAll(value));
  }, [value]);

  return <div ref={hostRef} className="editor-milkdown-root" />;
}

export default MarkdownLiveEditor;
