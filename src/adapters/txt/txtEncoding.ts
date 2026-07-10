import { TextDecoder } from 'node:util';
import iconv from 'iconv-lite';
import type { TxtEncoding } from '../../domain/books';
export class TxtDecodeError extends Error { constructor(readonly encoding: TxtEncoding, cause?: unknown) { super(`Failed to decode TXT as ${encoding}.`, { cause }); this.name = 'TxtDecodeError'; } }
export function decodeTxt(buffer: Buffer, encoding: TxtEncoding): string { let text: string; try { text = encoding === 'utf8' ? new TextDecoder('utf-8', { fatal: true }).decode(buffer) : iconv.decode(buffer, 'gbk'); } catch (error) { throw new TxtDecodeError(encoding, error); } return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; }
export function splitPhysicalLines(text: string): string[] { return text.split(/\r\n|\n|\r/); }
