import * as parse5 from 'parse5';

export interface ValidatedEpubImage {
  bytes: Uint8Array;
  mimeType: string;
}

export function validateEpubImage(bytes: Uint8Array, declaredMimeType: string): ValidatedEpubImage {
  const mimeType = declaredMimeType.toLowerCase();
  if (mimeType === 'image/svg+xml') {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { bytes: new TextEncoder().encode(sanitizeSvg(source)), mimeType };
  }
  const detected = detectRasterMime(bytes);
  if (!detected || detected !== mimeType) {
    throw new Error('EPUB image content MIME does not match its manifest declaration.');
  }
  return { bytes: Uint8Array.from(bytes), mimeType };
}

function detectRasterMime(bytes: Uint8Array): string | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  const ascii = Buffer.from(bytes).toString('ascii');
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return 'image/gif';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 12 && ascii.slice(4, 8) === 'ftyp' && /^(?:avif|avis)$/.test(ascii.slice(8, 12))) return 'image/avif';
  return undefined;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

const SVG_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'clippath', 'mask', 'lineargradient', 'radialgradient', 'stop', 'title', 'desc', 'use'
]);
const SVG_ATTRIBUTES = new Set([
  'id', 'class', 'xmlns', 'viewbox', 'width', 'height', 'x', 'y', 'rx', 'ry', 'cx', 'cy', 'r',
  'fx', 'fy', 'x1', 'y1', 'x2', 'y2', 'points', 'd', 'fill', 'fill-opacity', 'fill-rule', 'stroke',
  'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity', 'transform',
  'preserveaspectratio', 'offset', 'stop-color', 'stop-opacity', 'clip-path', 'mask', 'href', 'xlink:href'
]);

function sanitizeSvg(source: string): string {
  const fragment: any = parse5.parseFragment(source);
  const svg = findElement(fragment, 'svg');
  if (!svg) throw new Error('EPUB SVG content is not a valid SVG document.');
  if (!sanitizeSvgNode(svg)) throw new Error('EPUB SVG content is not safe to render.');
  return parse5.serializeOuter(svg);
}

function sanitizeSvgNode(node: any): boolean {
  if (node.nodeName === '#text') return true;
  const tag = String(node.tagName ?? '').toLowerCase();
  if (!SVG_ELEMENTS.has(tag)) return false;
  node.attrs = (node.attrs ?? []).filter((attribute: any) => {
    const name = String(attribute.name ?? '').toLowerCase();
    const value = String(attribute.value ?? '').trim();
    if (/^on/.test(name) || !SVG_ATTRIBUTES.has(name)) return false;
    if (/url\s*\(|(?:javascript|data|file|https?):|\/\//i.test(value)) return false;
    if ((name === 'href' || name === 'xlink:href') && !value.startsWith('#')) return false;
    return true;
  });
  const children: any[] = [];
  for (const child of node.childNodes ?? []) {
    if (child.nodeName === '#comment') continue;
    if (sanitizeSvgNode(child)) { child.parentNode = node; children.push(child); }
  }
  node.childNodes = children;
  return true;
}

function findElement(node: any, tagName: string): any {
  if (String(node.tagName ?? '').toLowerCase() === tagName) return node;
  for (const child of node.childNodes ?? []) {
    const found = findElement(child, tagName);
    if (found) return found;
  }
  return undefined;
}
