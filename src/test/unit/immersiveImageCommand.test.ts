import { describe, expect, it } from 'vitest';
import { isImmersiveImageOpenRequest } from '../../reader/immersiveImageCommand';

describe('immersive image command', () => {
  it('accepts only a correlated request with an opaque resource id', () => {
    expect(isImmersiveImageOpenRequest({
      bookId: 'book-1', sectionId: 'chapter-1', resourceId: 'image_001'
    })).toBe(true);
    expect(isImmersiveImageOpenRequest({
      bookId: 'book-1', sectionId: 'chapter-1', resourceId: '../OPS/cover.png'
    })).toBe(false);
    expect(isImmersiveImageOpenRequest({
      bookId: 'book-1', sectionId: 'chapter-1', resourceId: 'image_001', path: 'OPS/cover.png'
    })).toBe(false);
  });
});
