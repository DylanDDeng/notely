import { htmlSchema } from '@milkdown/kit/preset/commonmark';
import type { NodeViewConstructor } from '@milkdown/kit/prose/view';
import { $view } from '@milkdown/kit/utils';

export const htmlView = $view(htmlSchema.node, (): NodeViewConstructor => {
  return (node) => {
    const dom = document.createElement('span');
    dom.classList.add('milkdown-html-inline');
    dom.innerHTML = String(node.attrs.value ?? '');
    return {
      dom,
      stopEvent: () => true,
    };
  };
});
