import { randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  rename,
  unlink
} from 'node:fs/promises';
import path from 'node:path';

export interface AtomicFileWriterPort {
  write(file: string, data: string | Uint8Array): Promise<void>;
}

export class AtomicFileWriter implements AtomicFileWriterPort {
  async write(file: string, data: string | Uint8Array): Promise<void> {
    const target = path.resolve(file);
    const directory = path.dirname(target);
    await mkdir(directory, { recursive: true });
    const temporary = path.join(
      directory,
      `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`
    );
    const handle = await open(temporary, 'wx');
    try {
      await handle.writeFile(data);
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    await handle.close();
    try {
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
}
