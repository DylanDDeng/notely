import { useEffect, useRef } from 'react';
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/nord.css';

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
  const editorRef = useRef<Crepe | null>(null);
  const latestOnChangeRef = useRef(onChange);

  useEffect(() => {
    latestOnChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    const editor = new Crepe({
      root: host,
      defaultValue: value,
      features: {
        [Crepe.Feature.TopBar]: false,
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.Toolbar]: false,
        [Crepe.Feature.LinkTooltip]: false,
        [Crepe.Feature.Cursor]: false,
        [Crepe.Feature.ListItem]: false,
        [Crepe.Feature.ImageBlock]: false,
        [Crepe.Feature.Latex]: false,
      },
    });

    editor.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (disposed) return;
        latestOnChangeRef.current(markdown);
      });
    });

    void editor.create().then(() => {
      if (disposed) {
        void editor.destroy();
        return;
      }
      editorRef.current = editor;
      onEditorDomReady?.(host);
    });

    return () => {
      disposed = true;
      onEditorDomReady?.(null);
      editorRef.current = null;
      void editor.destroy();
      host.innerHTML = '';
    };
  }, [documentKey, onEditorDomReady]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const image = target.closest('img');
      if (image) {
        const src = image.getAttribute('src')?.trim() || '';
        if (!src) return;
        event.preventDefault();
        onOpenImagePreview?.(normalizeUrl(src));
        return;
      }

      const link = target.closest('a');
      if (!link) return;

      const href = link.getAttribute('href')?.trim() || '';
      const normalized = normalizeUrl(href);
      if (!normalized) return;

      event.preventDefault();
      onOpenExternal?.(normalized);
    };

    host.addEventListener('click', handleClick);
    return () => host.removeEventListener('click', handleClick);
  }, [onOpenExternal, onOpenImagePreview]);

  return (
    <div className="editor-live-surface">
      <div ref={hostRef} className="editor-milkdown-host" />
    </div>
  );
}

export default MarkdownLiveEditor;
