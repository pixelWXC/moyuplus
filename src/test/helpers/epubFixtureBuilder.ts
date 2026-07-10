import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import yazl from 'yazl';
export async function buildEpubFixture(entries: Record<string, string | Buffer>): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'moyu-epub-')); const target = path.join(directory, 'fixture.epub'); const zip = new yazl.ZipFile();
  const rewrites: Array<[string, string]> = [];
  for (const [name, content] of Object.entries(entries)) { const safeName = name.includes('..') ? name.replace(/\.\./g, 'xx') : name; if (safeName !== name) rewrites.push([safeName, name]); zip.addBuffer(Buffer.from(content), safeName); }
  zip.end(); await new Promise<void>((resolve, reject) => zip.outputStream.pipe(createWriteStream(target)).on('close', resolve).on('error', reject));
  if (rewrites.length) { let buffer = await readFile(target); for (const [safe, unsafe] of rewrites) { let offset = 0; while ((offset = buffer.indexOf(safe, offset, 'utf8')) >= 0) { buffer.write(unsafe, offset, 'utf8'); offset += unsafe.length; } } await writeFile(target, buffer); }
  return target;
}
