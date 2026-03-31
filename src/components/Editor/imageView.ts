import { imageSchema } from '@milkdown/kit/preset/commonmark';
import type { NodeViewConstructor } from '@milkdown/kit/prose/view';
import { $view } from '@milkdown/kit/utils';

const toFilesystemPath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^file:\/\//i.test(trimmed)) {
    const withoutProtocol = decodeURI(trimmed.replace(/^file:\/\//i, ''));
    return withoutProtocol.replace(/^\/([A-Za-z]:\/)/, '$1');
  }
  return trimmed;
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

class LocalAwareImageView {
  private currentSrc = '';
  private updateVersion = 0;
  readonly dom: HTMLImageElement;

  constructor(node: { attrs: { src?: string; alt?: string; title?: string } }) {
    this.dom = document.createElement('img');
    this.dom.className = 'milkdown-inline-image';
    this.apply(node.attrs);
  }

  private apply(attrs: { src?: string; alt?: string; title?: string }) {
    const src = attrs.src?.trim() || '';
    this.currentSrc = src;
    this.dom.alt = attrs.alt || '';
    this.dom.title = attrs.title || '';

    if (!src) {
      this.dom.removeAttribute('src');
      this.dom.removeAttribute('data-original-src');
      return;
    }

    if (isLikelyLocalPath(src)) {
      const originalSrc = toFilesystemPath(src);
      this.dom.dataset.originalSrc = originalSrc;
      this.dom.removeAttribute('src');
      const version = ++this.updateVersion;
      void window.electronAPI.resolveLocalImage?.(originalSrc).then((result) => {
        if (version !== this.updateVersion || this.currentSrc !== src) return;
        if (!result?.success || !result.dataUrl) return;
        this.dom.src = result.dataUrl;
      });
      return;
    }

    delete this.dom.dataset.originalSrc;
    this.dom.src = src;
  }

  update(node: { type: unknown; attrs: { src?: string; alt?: string; title?: string } }) {
    this.apply(node.attrs);
    return true;
  }
}

export const customImageView = $view(imageSchema.node, (): NodeViewConstructor => {
  return (node) => new LocalAwareImageView(node);
});
