import { describe, expect, it } from 'vitest';
import {
  mapImmersiveOffsetToSource,
  mapSourceOffsetToImmersive,
  type ImmersiveTextProjection
} from '../../domain/immersiveProjection';

describe('immersive projection mapping', () => {
  const projection: ImmersiveTextProjection = {
    text: 'Hello\n• World',
    projectionRevision: 'projection-v1',
    segments: [
      { kind: 'identity', sourceStart: 0, sourceEnd: 5, immersiveStart: 0, immersiveEnd: 5, safeSourceFloor: 0, safeImmersiveFloor: 0 },
      { kind: 'collapsed', sourceStart: 5, sourceEnd: 8, immersiveStart: 5, immersiveEnd: 6, safeSourceFloor: 5, safeImmersiveFloor: 5 },
      { kind: 'synthetic', sourceStart: 8, sourceEnd: 8, immersiveStart: 6, immersiveEnd: 8, safeSourceFloor: 8, safeImmersiveFloor: 6 },
      { kind: 'identity', sourceStart: 8, sourceEnd: 13, immersiveStart: 8, immersiveEnd: 13, safeSourceFloor: 8, safeImmersiveFloor: 8 }
    ]
  };

  it('maps equal identity regions exactly', () => {
    expect(mapSourceOffsetToImmersive(projection, 3)).toBe(3);
    expect(mapImmersiveOffsetToSource(projection, 11)).toBe(11);
  });

  it('uses explicit safe floors for collapsed and synthetic regions', () => {
    expect(mapSourceOffsetToImmersive(projection, 7)).toBe(5);
    expect(mapImmersiveOffsetToSource(projection, 7)).toBe(8);
  });

  it('clamps offsets backward before mapping a grapheme', () => {
    const emojiProjection: ImmersiveTextProjection = {
      text: '😀a', projectionRevision: 'emoji',
      segments: [{ kind: 'identity', sourceStart: 0, sourceEnd: 3, immersiveStart: 0, immersiveEnd: 3, safeSourceFloor: 0, safeImmersiveFloor: 0 }]
    };
    expect(mapSourceOffsetToImmersive(emojiProjection, 1, '😀a')).toBe(0);
    expect(mapSourceOffsetToImmersive(emojiProjection, 1)).toBe(0);
    expect(mapImmersiveOffsetToSource(emojiProjection, 1)).toBe(0);
  });
});
