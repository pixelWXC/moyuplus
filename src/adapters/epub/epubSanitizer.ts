import path from 'node:path';
import * as parse5 from 'parse5';
import type { LocalResourceRef } from '../bookAdapter';
import type { ImmersiveTextProjection, ProjectionSegment, ProjectionSegmentKind } from '../../domain/immersiveProjection';
import { normalizeArchivePath } from './epubArchive';

export interface SanitizerImageResource { id: string; mimeType: string }
export interface EpubSanitizerOptions {
  basePath: string;
  readableSections: ReadonlyMap<string, string>;
  imageResources: ReadonlyMap<string, SanitizerImageResource>;
  allowedResources?: ReadonlySet<string>;
}

const BLOCKED = new Set(['script', 'iframe', 'object', 'embed', 'form']);
const SAFE_ATTRIBUTES = new Set([
  'id', 'name', 'lang', 'xml:lang', 'dir', 'title', 'role',
  'colspan', 'rowspan', 'scope', 'headers',
  'start', 'value', 'reversed'
]);

export function sanitizeEpubSection(source: string, options: EpubSanitizerOptions): { html: string; resources: LocalResourceRef[]; immersiveProjection: ImmersiveTextProjection } {
  const document: any = parse5.parse(source);
  const resources: LocalResourceRef[] = [];
  sanitizeChildren(document, options, resources);
  const body = find(document, 'body');
  const content = body ? (body.childNodes ?? []).map((node: any) => parse5.serializeOuter(node)).join('') : '';
  return { html: `<div class="moyuplus-book-content">${content}</div>`, resources: uniqueResources(resources), immersiveProjection: createImmersiveProjection(body) };
}

const BLOCKS = new Set(['article', 'section', 'header', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'tr']);

function createImmersiveProjection(body: any): ImmersiveTextProjection {
  const builder = new ProjectionBuilder();
  for (const child of body?.childNodes ?? []) projectNode(child, builder, false);
  return { text: builder.text, segments: builder.segments, projectionRevision: 'immersive-projection-v1' };
}

function projectNode(node: any, builder: ProjectionBuilder, inPre: boolean): void {
  if (node?.nodeName === '#text') {
    builder.appendSourceText(String(node.value ?? ''), inPre);
    return;
  }
  const tag = String(node?.tagName ?? '').toLowerCase();
  if (!tag) {
    for (const child of node?.childNodes ?? []) projectNode(child, builder, inPre);
    return;
  }
  if (tag === 'button' && (attr(node, 'class') ?? '').split(/\s+/).includes('moyuplus-image-link')) {
    builder.skipSourceText(nodeText(node));
    return;
  }
  if (tag === 'nav' || (tag === 'a' && /^[↩↪←↑#\s]+$/u.test(nodeText(node)))) {
    builder.skipSourceText(nodeText(node));
    return;
  }
  if (BLOCKS.has(tag)) builder.ensureLineBreak();
  if (tag === 'li') builder.appendSynthetic('• ');
  if ((tag === 'td' || tag === 'th') && builder.hasTextOnCurrentLine()) builder.appendSynthetic(' | ');
  for (const child of node.childNodes ?? []) projectNode(child, builder, inPre || tag === 'pre');
  if (BLOCKS.has(tag)) builder.ensureLineBreak();
}

class ProjectionBuilder {
  readonly segments: ProjectionSegment[] = [];
  private chunks: string[] = [];
  private sourceOffset = 0;
  private immersiveOffset = 0;

  get text(): string { return this.chunks.join(''); }

  hasTextOnCurrentLine(): boolean {
    const value = this.chunks.at(-1) ?? '';
    return this.immersiveOffset > 0 && !value.endsWith('\n');
  }

  ensureLineBreak(): void {
    if (this.immersiveOffset === 0 || this.text.endsWith('\n')) return;
    this.appendSynthetic('\n');
  }

  appendSynthetic(value: string): void {
    if (!value) return;
    this.push('synthetic', this.sourceOffset, this.sourceOffset, value, this.sourceOffset, this.immersiveOffset);
  }

  skipSourceText(value: string): void {
    if (!value) return;
    const start = this.sourceOffset;
    this.sourceOffset += value.length;
    this.pushEmpty('hole', start, this.sourceOffset, start, this.immersiveOffset);
  }

  appendSourceText(value: string, preserveWhitespace: boolean): void {
    if (!value) return;
    if (preserveWhitespace) {
      const start = this.sourceOffset;
      this.sourceOffset += value.length;
      this.push('identity', start, this.sourceOffset, value, start, this.immersiveOffset);
      return;
    }
    for (const match of value.matchAll(/\s+|[^\s]+/gu)) {
      const token = match[0];
      const start = this.sourceOffset;
      this.sourceOffset += token.length;
      if (/^\s+$/u.test(token)) {
        if (this.immersiveOffset === 0 || /\s$/u.test(this.text)) {
          this.pushEmpty('hole', start, this.sourceOffset, this.sourceOffset, this.immersiveOffset);
        } else {
          this.push(token === ' ' ? 'identity' : 'collapsed', start, this.sourceOffset, ' ', start, this.immersiveOffset);
        }
      } else {
        this.push('identity', start, this.sourceOffset, token, start, this.immersiveOffset);
      }
    }
  }

  private push(kind: ProjectionSegmentKind, sourceStart: number, sourceEnd: number, value: string, safeSourceFloor: number, safeImmersiveFloor: number): void {
    const immersiveStart = this.immersiveOffset;
    this.chunks.push(value);
    this.immersiveOffset += value.length;
    this.segments.push({ kind, sourceStart, sourceEnd, immersiveStart, immersiveEnd: this.immersiveOffset, safeSourceFloor, safeImmersiveFloor });
  }

  private pushEmpty(kind: ProjectionSegmentKind, sourceStart: number, sourceEnd: number, safeSourceFloor: number, safeImmersiveFloor: number): void {
    this.segments.push({ kind, sourceStart, sourceEnd, immersiveStart: this.immersiveOffset, immersiveEnd: this.immersiveOffset, safeSourceFloor, safeImmersiveFloor });
  }
}

function sanitizeChildren(parent: any, options: EpubSanitizerOptions, resources: LocalResourceRef[]): void {
  const safeChildren: any[] = [];
  for (const node of parent.childNodes ?? []) {
    if (BLOCKED.has(node.tagName) || node.tagName === 'style') continue;
    if (node.tagName === 'link' && (attr(node, 'rel') ?? '').toLowerCase().split(/\s+/).includes('stylesheet')) continue;
    if (node.tagName === 'meta' && (attr(node, 'http-equiv') ?? '').toLowerCase() === 'refresh') continue;
    if (node.tagName === 'img' || node.tagName === 'image') {
      safeChildren.push(imageReplacement(node, parent, options, resources));
      continue;
    }
    if (node.attrs) {
      node.attrs = node.attrs.filter((item: any) => isSafeSourceAttribute(node.tagName, item.name));
      if (node.tagName === 'a') sanitizeAnchor(node, options);
    }
    sanitizeChildren(node, options, resources);
    node.parentNode = parent;
    safeChildren.push(node);
  }
  parent.childNodes = safeChildren;
}

function imageReplacement(node: any, parent: any, options: EpubSanitizerOptions, resources: LocalResourceRef[]): any {
  const source = attr(node, 'src') ?? attr(node, 'href') ?? attr(node, 'xlink:href');
  const archivePath = source ? resolveArchiveTarget(source, options.basePath)?.path : undefined;
  const declaration = archivePath ? options.imageResources.get(archivePath) : undefined;
  if (!declaration) return textNode('图片不可用', parent);
  const label = imageLabel(node);
  resources.push({ id: declaration.id, mimeType: declaration.mimeType, label });
  const visibleLabel = label === '查看图片' ? label : `查看图片：${label}`;
  return elementNode('button', [
    ['type', 'button'],
    ['class', 'moyuplus-image-link'],
    ['data-moyuplus-resource-id', declaration.id],
    ['data-moyuplus-mime-type', declaration.mimeType],
    ['aria-label', visibleLabel]
  ], visibleLabel, parent);
}

function sanitizeAnchor(node: any, options: EpubSanitizerOptions): void {
  const href = attr(node, 'href');
  clearTargetAttributes(node);
  if (!href) return;
  const target = resolveArchiveTarget(href, options.basePath);
  const sectionId = target && options.readableSections.get(target.path);
  if (!target || !sectionId) { removeAttr(node, 'href'); return; }
  setAttr(node, 'href', '#');
  setAttr(node, 'data-moyuplus-section-id', sectionId);
  if (target.fragment) setAttr(node, 'data-moyuplus-fragment', target.fragment);
}

function resolveArchiveTarget(value: string, basePath: string): { path: string; fragment?: string } | undefined {
  const trimmed = value.trim();
  if (!trimmed || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed)) return undefined;
  const hashIndex = trimmed.indexOf('#');
  const file = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const encodedFragment = hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : '';
  try {
    const decodedFile = decodeURIComponent(file);
    const resolved = decodedFile
      ? normalizeArchivePath(path.posix.normalize(path.posix.join(path.posix.dirname(basePath), decodedFile)))
      : basePath;
    const fragment = encodedFragment ? decodeURIComponent(encodedFragment) : undefined;
    return { path: resolved, ...(fragment ? { fragment } : {}) };
  } catch { return undefined; }
}

function imageLabel(node: any): string {
  const alt = attr(node, 'alt')?.trim();
  if (alt) return alt;
  let parent = node.parentNode;
  while (parent) {
    if (parent.tagName === 'figure') {
      const caption = find(parent, 'figcaption');
      const value = caption ? nodeText(caption).trim() : '';
      if (value) return value;
      break;
    }
    parent = parent.parentNode;
  }
  return '查看图片';
}

function isSafeSourceAttribute(tagName: string | undefined, name: string): boolean {
  const normalized = name.toLowerCase();
  return SAFE_ATTRIBUTES.has(normalized)
    || normalized.startsWith('aria-')
    || (tagName === 'a' && normalized === 'href');
}
function find(node: any, tag: string): any { if (node.tagName === tag) return node; for (const child of node.childNodes ?? []) { const result = find(child, tag); if (result) return result; } }
function attr(node: any, name: string): string | undefined { return node.attrs?.find((item: any) => item.name === name)?.value; }
function setAttr(node: any, name: string, value: string): void { removeAttr(node, name); node.attrs ??= []; node.attrs.push({ name, value }); }
function removeAttr(node: any, name: string): void { if (node.attrs) node.attrs = node.attrs.filter((item: any) => item.name !== name); }
function clearTargetAttributes(node: any): void { for (const name of ['data-moyuplus-section-id', 'data-moyuplus-fragment']) removeAttr(node, name); }
function nodeText(node: any): string { return node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(nodeText).join(''); }
function textNode(value: string, parentNode: any): any { return { nodeName: '#text', value, parentNode }; }
function elementNode(tagName: string, attrs: Array<[string, string]>, text: string, parentNode: any): any { const node: any = { nodeName: tagName, tagName, attrs: attrs.map(([name, value]) => ({ name, value })), namespaceURI: 'http://www.w3.org/1999/xhtml', childNodes: [], parentNode }; node.childNodes.push(textNode(text, node)); return node; }
function uniqueResources(values: LocalResourceRef[]): LocalResourceRef[] { return [...new Map(values.map(value => [value.id, value])).values()]; }
