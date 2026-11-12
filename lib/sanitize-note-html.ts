import { createElement, type ReactNode } from 'react';

export type TreeNode = { text: string } | { tag: string; children: TreeNode[] };

const marks = new Set(['b', 'strong', 'i', 'em', 'u']);

/** Strip attributes and flatten blocks into inline content with line breaks. */
export function sanitizeTree(nodes: TreeNode[]): TreeNode[] {
  const output: TreeNode[] = [];
  let afterBlock = false;
  const addBreak = () => {
    const last = output[output.length - 1];
    if (last && !('tag' in last && last.tag === 'br')) {
      output.push({ tag: 'br', children: [] });
    }
  };
  for (const node of nodes) {
    if ('text' in node) {
      if (!node.text) continue;
      if (afterBlock) addBreak();
      output.push({ text: node.text });
      afterBlock = false;
      continue;
    }
    // HTML tag names are locale-invariant; Turkish casing would break the allow-list.
    const tag = node.tag.toLowerCase();
    if (tag === 'br') {
      output.push({ tag: 'br', children: [] });
      afterBlock = false;
      continue;
    }
    const children = sanitizeTree(node.children);
    if (tag === 'div' || tag === 'p') {
      if (children.length) {
        if (!('tag' in children[0] && children[0].tag === 'br')) addBreak();
        output.push(...children);
        afterBlock = true;
      }
    } else if (marks.has(tag)) {
      if (children.length) {
        if (afterBlock) addBreak();
        output.push({ tag, children });
        afterBlock = false;
      }
    } else {
      if (children.length) {
        if (afterBlock) addBreak();
        output.push(...children);
        afterBlock = false;
      }
    }
  }
  return output;
}

function parse(html: string): TreeNode[] {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const walk = (node: Node): TreeNode | null => {
    if (node.nodeType === Node.TEXT_NODE) return { text: node.textContent ?? '' };
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const element = node as Element;
    // HTML tag names are locale-invariant; Turkish casing would break the allow-list.
    return { tag: element.tagName.toLowerCase(), children: [...element.childNodes].map(walk).filter((child): child is TreeNode => child !== null) };
  };
  return [...document.body.childNodes].map(walk).filter((child): child is TreeNode => child !== null);
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function noteTextToHtml(text: string): string {
  return escapeText(text);
}

/** A safe plain-text preview and length check for stored, restricted HTML. */
export function noteHtmlToPlainText(html: string): string {
  return html.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function serialize(nodes: TreeNode[]): string {
  return nodes.map((node) => {
    if ('text' in node) return escapeText(node.text);
    if (node.tag === 'br') return '<br>';
    return `<${node.tag}>${serialize(node.children)}</${node.tag}>`;
  }).join('');
}

export function sanitizeNoteHtml(html: string): string {
  return serialize(sanitizeTree(parse(html)));
}

export function renderNoteHtml(html: string): ReactNode {
  const render = (nodes: TreeNode[]): ReactNode => nodes.map((node, key) => {
    if ('text' in node) return node.text;
    const tag = node.tag === 'b' ? 'strong' : node.tag === 'i' ? 'em' : node.tag;
    return createElement(tag, { key }, tag === 'br' ? undefined : render(node.children));
  });
  return render(sanitizeTree(parse(html)));
}
