import { parseFragment } from 'parse5';

import { normalizeLegacyNoteHtml, sanitizeTree, serializeTree, type TreeNode } from './sanitize-note-html';

type Parse5Node = {
  nodeName: string;
  value?: string;
  tagName?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: Parse5Node[];
};

function walk(node: Parse5Node): TreeNode | null {
  if (node.nodeName === '#text') return { text: node.value ?? '' };
  if (!node.tagName) return null;
  const attrs: Record<string, string> = {};
  for (const attribute of node.attrs ?? []) attrs[attribute.name.toLowerCase()] = attribute.value;
  return {
    tag: node.tagName.toLowerCase(), attrs,
    children: (node.childNodes ?? []).map(walk).filter((child): child is TreeNode => child !== null),
  };
}

/** Same allow-list as the browser sanitizer, parsed with parse5 so it can run on the server. */
export function sanitizeNoteHtmlServer(html: string): string {
  const fragment = parseFragment(normalizeLegacyNoteHtml(html)) as unknown as Parse5Node;
  const nodes = (fragment.childNodes ?? []).map(walk).filter((child): child is TreeNode => child !== null);
  return serializeTree(sanitizeTree(nodes));
}
