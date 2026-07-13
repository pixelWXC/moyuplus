import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { EpubFormatError, EpubSecurityError } from './epubErrors';
import { DEFAULT_EPUB_SECURITY_POLICY, type EpubSecurityPolicy } from './epubSecurityPolicy';
export class EpubArchive {
  private disposed = false;
  private constructor(private readonly zip: ZipFile, private readonly index: Map<string, Entry>, private readonly policy: EpubSecurityPolicy) {}
  static async open(file: string, overrides: Partial<EpubSecurityPolicy> = {}): Promise<EpubArchive> {
    const policy = { ...DEFAULT_EPUB_SECURITY_POLICY, ...overrides }; const zip = await openZip(file); const index = new Map<string, Entry>(); let count = 0; let total = 0;
    try { await new Promise<void>((resolve, reject) => { zip.on('error', reject); zip.on('end', resolve); zip.on('entry', (entry) => { try { count++; validateEntry(entry, count, total, policy); total += entry.uncompressedSize; if (!entry.fileName.endsWith('/')) index.set(normalizeArchivePath(entry.fileName), entry); zip.readEntry(); } catch (error) { reject(error); zip.close(); } }); zip.readEntry(); }); } catch (error) { zip.close(); throw error; }
    return new EpubArchive(zip, index, policy);
  }
  entries(): string[] { this.assertOpen(); return [...this.index.keys()]; }
  has(name: string): boolean { this.assertOpen(); return this.index.has(normalizeArchivePath(name)); }
  async read(name: string, markup = false): Promise<Buffer> { this.assertOpen(); const entry = this.index.get(normalizeArchivePath(name)); if (!entry) throw new EpubFormatError(`Missing EPUB entry: ${name}`); if (markup && entry.uncompressedSize > this.policy.maxMarkupBytes) throw new EpubSecurityError('EPUB markup entry exceeds size limit.'); const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => this.zip.openReadStream(entry, (error, value) => error ? reject(error) : resolve(value))); const chunks: Buffer[] = []; let size = 0; for await (const chunk of stream) { size += chunk.length; if (size > entry.uncompressedSize || size > this.policy.maxEntryUncompressedBytes || (markup && size > this.policy.maxMarkupBytes)) throw new EpubSecurityError('EPUB stream exceeds declared or configured size.'); chunks.push(Buffer.from(chunk)); } return Buffer.concat(chunks); }
  async readText(name: string): Promise<string> { return (await this.read(name, true)).toString('utf8'); }
  dispose(): void { if (!this.disposed) { this.disposed = true; this.zip.close(); } }
  private assertOpen() { if (this.disposed) throw new Error('EPUB archive is disposed.'); }
}
function openZip(file: string): Promise<ZipFile> { return new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true, autoClose: false }, (error, zip) => error || !zip ? reject(error ?? new Error('Unable to open EPUB.')) : resolve(zip))); }
function validateEntry(entry: Entry, count: number, total: number, p: EpubSecurityPolicy) { if (count > p.maxEntries) throw new EpubSecurityError('EPUB has too many entries.'); normalizeArchivePath(entry.fileName); if ((entry.generalPurposeBitFlag & 1) !== 0) throw new EpubSecurityError('Encrypted EPUB entries are not supported.'); if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) throw new EpubSecurityError('Unsupported EPUB compression method.'); if (entry.uncompressedSize > p.maxEntryUncompressedBytes || total + entry.uncompressedSize > p.maxTotalUncompressedBytes) throw new EpubSecurityError('EPUB uncompressed size limit exceeded.'); const ratio = entry.uncompressedSize / Math.max(1, entry.compressedSize); if (ratio > p.maxCompressionRatio) throw new EpubSecurityError('EPUB compression ratio limit exceeded.'); }
export function normalizeArchivePath(value: string): string { const decoded = value.replace(/\\/g, '/'); const candidate = decoded.endsWith('/') ? decoded.slice(0, -1) : decoded; if (!candidate || candidate.startsWith('/') || /^[a-z]:/i.test(candidate) || candidate.split('/').some((x) => x === '..' || x === '')) throw new EpubSecurityError(`Unsafe EPUB path: ${value}`); return candidate.replace(/^\.\//, ''); }
