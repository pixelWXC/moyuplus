import { normalizeReadingPosition, type ReadingPosition } from '../domain/locators';
import type { StateMemento } from './memento';
import { READING_PROGRESS_KEY } from './storageKeys';

export class ReadingProgressStore {
  constructor(private readonly state: StateMemento) {}

  list(): ReadingPosition[] {
    const value = this.state.get<unknown>(READING_PROGRESS_KEY);
    if (!Array.isArray(value)) {
      return [];
    }
    return value.flatMap((entry) => {
      const position = normalizeReadingPosition(entry);
      return position ? [position] : [];
    });
  }

  get(bookId: string): ReadingPosition | undefined {
    return this.list().find((position) => position.bookId === bookId);
  }

  async save(position: ReadingPosition): Promise<ReadingPosition> {
    const normalized = normalizeReadingPosition(position);
    if (!normalized) {
      throw new Error('Cannot store an invalid Reader v2 reading position.');
    }
    const positions = this.list();
    const existingIndex = positions.findIndex((existing) => existing.bookId === normalized.bookId);
    if (existingIndex >= 0) {
      positions[existingIndex] = normalized;
    } else {
      positions.push(normalized);
    }
    await this.state.update(READING_PROGRESS_KEY, positions);
    return normalized;
  }

  async remove(bookId: string): Promise<ReadingPosition[]> {
    const positions = this.list().filter((position) => position.bookId !== bookId);
    await this.state.update(READING_PROGRESS_KEY, positions);
    return positions;
  }
}
