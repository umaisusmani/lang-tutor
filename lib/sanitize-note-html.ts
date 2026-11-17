import { createElement, type ReactNode } from 'react';

export type TreeNode =
  | { text: string }
  | { tag: string; children: TreeNode[]; attrs?: Record<string, string> };

/** Plain-text length cap (what the learner sees) and stored-HTML cap for a note. */
export const NOTE_PLAIN_MAX = 5000;
export const NOTE_HTML_MAX = 30000;

const ALIASES: Record<string, string> = {
  b: 'strong', i: 'em', strike: 's', del: 's',
  h1: 'h2', h4: 'h3', h5: 'h3', h6: 'h3', tfoot: 'tbody',
};
const MARKS = new Set(['strong', 'em', 'u', 's', 'code', 'mark', 'a']);
const BLOCKS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'pre', 'hr', 'table']);
// Elements whose content is never wanted, not even as text.
const DROPPED = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed',
  'svg', 'math', 'head', 'title', 'textarea', 'select', 'colgroup', 'col']);
// Parents that may hold block-level children.
const CONTAINERS = new Set(['', 'li', 'td', 'th', 'blockquote']);
const STRUCTURAL = new Set(['ul', 'ol', 'table', 'thead', 'tbody', 'tr']);
const MAX_DEPTH = 8;

function isBlock(node: TreeNode | undefined): boolean {
  return Boolean(node && 'tag' in node && (BLOCKS.has(node.tag) || node.tag === 'thead' || node.tag === 'tbody' || node.tag === 'tr'));
}

function isBlank(node: TreeNode): boolean {
  return 'text' in node && !node.text.trim();
}

/** Only http(s) and mailto links survive; anything else loses its link but keeps its text. */
function safeHref(raw: string | undefined): string | null {
  if (!raw) return null;
  const href = raw.replace(/[\u0000- \u007f-\u009f​-‍﻿]/g, '');
  if (!href || href.length > 2000) return null;
  return /^(https?:|mailto:)/i.test(href) ? href : null;
}

function span(value: string | undefined): string | undefined {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 1 ? String(Math.min(parsed, 20)) : undefined;
}

function textOf(nodes: TreeNode[]): string {
  return nodes.map((node) => {
    if ('text' in node) return node.text;
    if (DROPPED.has(node.tag.toLowerCase())) return '';
    if (node.tag.toLowerCase() === 'br') return '\n';
    return textOf(node.children);
  }).join('');
}

/** Trim edges and drop blank text between blocks so pasted source whitespace doesn't leak in. */
function tidy(children: TreeNode[], parent: string): TreeNode[] {
  if (STRUCTURAL.has(parent)) return children.filter((child) => !isBlank(child));
  const out: TreeNode[] = [];
  const blockParent = CONTAINERS.has(parent) || parent === 'p' || parent === 'h2' || parent === 'h3';
  children.forEach((child, index) => {
    if (!('text' in child) || !blockParent) { out.push(child); return; }
    let { text } = child;
    const prev = children[index - 1];
    const next = children[index + 1];
    if (!prev || isBlock(prev)) text = text.replace(/^\s+/, '');
    if (!next || isBlock(next)) text = text.replace(/\s+$/, '');
    if (text) out.push({ text });
  });
  if (parent === 'p' || parent === 'h2' || parent === 'h3' || parent === 'li' || parent === 'td' || parent === 'th') {
    while (out.length && 'tag' in out[out.length - 1] && (out[out.length - 1] as { tag: string }).tag === 'br') out.pop();
  }
  return out;
}

function clean(nodes: TreeNode[], parent: string, depth: number, inTable = false): TreeNode[] {
  const output: TreeNode[] = [];
  for (const node of nodes) {
    if ('text' in node) {
      const text = node.text.replace(/\s+/g, ' ');
      if (text) output.push({ text });
      continue;
    }
    // HTML tag names are locale-invariant; Turkish casing would break the allow-list.
    const raw = node.tag.toLowerCase();
    if (DROPPED.has(raw)) continue;
    const tag = ALIASES[raw] ?? raw;
    if (tag === 'br' || tag === 'hr') {
      if (tag === 'br' || CONTAINERS.has(parent)) output.push({ tag, children: [] });
      continue;
    }
    const unwrap = () => output.push(...clean(node.children, parent, depth + 1, inTable));
    if (depth >= MAX_DEPTH) { unwrap(); continue; }

    if (tag === 'div') {
      // A div is just a wrapper: keep any blocks inside it, and make inline-only content a paragraph.
      const inner = clean(node.children, parent, depth + 1, inTable);
      if (inner.some(isBlock) || !CONTAINERS.has(parent)) output.push(...inner);
      else if (inner.length) {
        const children = tidy(inner, 'p');
        if (children.length) output.push({ tag: 'p', children });
      }
      continue;
    }

    if (tag === 'pre') {
      const code = textOf(node.children).replace(/^\n+|\n+$/g, '');
      if (code.trim() && CONTAINERS.has(parent)) output.push({ tag: 'pre', children: [{ tag: 'code', children: [{ text: code }] }] });
      else if (code.trim()) output.push({ text: code });
      continue;
    }

    if (tag === 'li') {
      if (parent !== 'ul' && parent !== 'ol') { unwrap(); continue; }
    } else if (tag === 'tr') {
      if (parent !== 'table' && parent !== 'thead' && parent !== 'tbody') { unwrap(); continue; }
    } else if (tag === 'thead' || tag === 'tbody') {
      if (parent !== 'table') { unwrap(); continue; }
    } else if (tag === 'th' || tag === 'td') {
      if (parent !== 'tr') { unwrap(); continue; }
    } else if (tag === 'table' && inTable) {
      unwrap();
      continue;
    } else if (tag === 'table' || tag === 'ul' || tag === 'ol' || tag === 'blockquote' || tag === 'p' || tag === 'h2' || tag === 'h3') {
      if (!CONTAINERS.has(parent)) { unwrap(); continue; }
    } else if (!MARKS.has(tag)) {
      unwrap();
      continue;
    }

    const children = tidy(clean(node.children, tag, depth + 1, inTable || tag === 'table'), tag);

    if (MARKS.has(tag)) {
      if (!children.length) continue;
      if (tag === 'a') {
        const href = safeHref(node.attrs?.href);
        if (href) output.push({ tag, attrs: { href }, children });
        else output.push(...children);
      } else output.push({ tag, children });
    } else if (tag === 'table') {
      const rows = children.flatMap((child) => 'tag' in child && child.tag === 'tr' ? [child]
        : 'tag' in child ? child.children.filter((row) => 'tag' in row && row.tag === 'tr') : []);
      if (!rows.some((row) => 'tag' in row && row.children.length)) output.push(...children.flatMap((child) => 'tag' in child ? child.children : [child]));
      else output.push({ tag, children });
    } else if (tag === 'tr') {
      if (children.length) output.push({ tag, children });
    } else if (tag === 'td' || tag === 'th') {
      const attrs: Record<string, string> = {};
      const colspan = span(node.attrs?.colspan);
      const rowspan = span(node.attrs?.rowspan);
      if (colspan) attrs.colspan = colspan;
      if (rowspan) attrs.rowspan = rowspan;
      output.push(Object.keys(attrs).length ? { tag, attrs, children } : { tag, children });
    } else if (tag === 'thead' || tag === 'tbody') {
      if (children.length) output.push({ tag, children });
    } else if (children.length) {
      output.push({ tag, children });
    }
  }
  return output;
}

/** Keep only the note allow-list: no attributes except safe link/cell ones, valid nesting only. */
export function sanitizeTree(nodes: TreeNode[]): TreeNode[] {
  return tidy(clean(nodes, '', 0), '');
}

function parse(html: string): TreeNode[] {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const walk = (node: Node): TreeNode | null => {
    if (node.nodeType === Node.TEXT_NODE) return { text: node.textContent ?? '' };
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const element = node as Element;
    const attrs: Record<string, string> = {};
    for (const attribute of element.attributes) attrs[attribute.name.toLowerCase()] = attribute.value;
    return {
      tag: element.tagName.toLowerCase(), attrs,
      children: [...element.childNodes].map(walk).filter((child): child is TreeNode => child !== null),
    };
  };
  return [...document.body.childNodes].map(walk).filter((child): child is TreeNode => child !== null);
}

export function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Plain text to editor HTML. Line breaks become <br>, so no stored note needs raw newlines. */
export function noteTextToHtml(text: string): string {
  return escapeText(text).replace(/\r?\n/g, '<br>');
}

/**
 * Notes saved before block formatting existed (and a few saved from chat) hold raw "\n" in
 * plain text. Turn those into <br> before parsing, unless the note already uses real blocks.
 */
export function normalizeLegacyNoteHtml(html: string): string {
  return /<(p|div|h[1-6]|ul|ol|li|blockquote|pre|hr|table)[\s>/]/i.test(html) ? html : html.replace(/\r?\n/g, '<br>');
}

/** A plain-text preview and length/emptiness check for stored, restricted HTML. */
export function noteHtmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>|<hr\s*\/?\s*>|<\/(p|li|tr|h[1-6]|blockquote|pre|div)\s*>/gi, '\n')
    .replace(/<\/(td|th)\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export function isNoteWithinLimits(html: string): boolean {
  return html.length <= NOTE_HTML_MAX && noteHtmlToPlainText(html).length <= NOTE_PLAIN_MAX;
}

export function serializeTree(nodes: TreeNode[]): string {
  return nodes.map((node) => {
    if ('text' in node) return escapeText(node.text);
    if (node.tag === 'br' || node.tag === 'hr') return `<${node.tag}>`;
    let attributes = '';
    if (node.tag === 'a') attributes = ` href="${escapeText(node.attrs?.href ?? '')}" target="_blank" rel="noopener noreferrer"`;
    else if (node.attrs) attributes = Object.entries(node.attrs).map(([name, value]) => ` ${name}="${escapeText(value)}"`).join('');
    return `<${node.tag}${attributes}>${serializeTree(node.children)}</${node.tag}>`;
  }).join('');
}

export function sanitizeNoteHtml(html: string): string {
  return serializeTree(sanitizeTree(parse(html)));
}

/** Sanitize HTML that was stored before blocks existed (see normalizeLegacyNoteHtml). */
export function loadNoteHtml(html: string): string {
  return sanitizeNoteHtml(normalizeLegacyNoteHtml(html));
}

export function renderNoteHtml(html: string): ReactNode {
  const render = (nodes: TreeNode[]): ReactNode => nodes.map((node, key) => {
    if ('text' in node) return node.text;
    const props: Record<string, unknown> = { key };
    if (node.tag === 'a') Object.assign(props, { href: node.attrs?.href, target: '_blank', rel: 'noopener noreferrer' });
    if (node.attrs?.colspan) props.colSpan = Number(node.attrs.colspan);
    if (node.attrs?.rowspan) props.rowSpan = Number(node.attrs.rowspan);
    const element = createElement(node.tag, props, node.tag === 'br' || node.tag === 'hr' ? undefined : render(node.children));
    return node.tag === 'table' ? createElement('div', { key, className: 'note-table-wrap' }, element) : element;
  });
  return render(sanitizeTree(parse(normalizeLegacyNoteHtml(html))));
}
