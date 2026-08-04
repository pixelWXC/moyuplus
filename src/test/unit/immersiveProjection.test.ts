import { describe, expect, it } from 'vitest';
import {
  mapImmersiveOffsetToSource,
  mapSourceOffsetToImmersive,
  stripImmersiveResourceAnchors,
  type ImmersiveTextProjection
} from '../../domain/immersiveProjection';

describe('immersive projection mapping', () => {
  const projection: ImmersiveTextProjection = {
    text: 'Hello\n• World',
    projectionRevision: 'projection-v1',
    resourceAnchors: [],
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
      resourceAnchors: [],
      segments: [{ kind: 'identity', sourceStart: 0, sourceEnd: 3, immersiveStart: 0, immersiveEnd: 3, safeSourceFloor: 0, safeImmersiveFloor: 0 }]
    };
    expect(mapSourceOffsetToImmersive(emojiProjection, 1, '😀a')).toBe(0);
    expect(mapSourceOffsetToImmersive(emojiProjection, 1)).toBe(0);
    expect(mapImmersiveOffsetToSource(emojiProjection, 1)).toBe(0);
  });

  it('removes resource labels only for text-only consumers', () => {
    expect(stripImmersiveResourceAnchors({
      text: '正文 查看图片：Cover 继续', projectionRevision: 'resources', segments: [],
      resourceAnchors: [{ resourceId: 'image-id', label: '查看图片：Cover', startOffset: 3, endOffset: 13 }]
    })).toBe('正文  继续');
  });
});
