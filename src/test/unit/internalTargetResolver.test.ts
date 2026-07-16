import { describe, expect, it } from 'vitest';
import { InternalTargetResolver } from '../../webview/internalTargetResolver';

interface FakeNode {
  nodeType: number;
  childNodes: FakeNode[];
  id?: string;
  data?: string;
}

function text(data: string): FakeNode {
  return { nodeType: 3, data, childNodes: [] };
}

function element(id: string | undefined, ...childNodes: FakeNode[]): FakeNode {
  return { nodeType: 1, id, childNodes };
}

describe('InternalTargetResolver', () => {
  it('indexes sanitized text in UTF-16 code units and resolves normal or empty anchors', () => {
    const firstText = text('A😀');
    const finalText = text('后');
    const root = element(undefined,
      element('intro', firstText),
      element('note'),
      element(undefined, finalText),
      element('end')
    );
    const resolver = new InternalTargetResolver(root);

    expect(resolver.totalLength).toBe(4);
    expect(resolver.resolveFragment('intro')).toBe(0);
    expect(resolver.resolveFragment('note')).toBe(3);
    expect(resolver.resolveFragment('end')).toBe(4);
    expect(resolver.resolveFragment('missing')).toBeUndefined();
  });

  it('clamps offsets and maps boundaries to the following text node when possible', () => {
    const firstText = text('abc');
    const finalText = text('后');
    const resolver = new InternalTargetResolver(element(undefined, firstText, finalText));

    expect(resolver.pointForOffset(-5)).toEqual({ node: firstText, offset: 0 });
    expect(resolver.pointForOffset(3)).toEqual({ node: finalText, offset: 0 });
    expect(resolver.pointForOffset(99)).toEqual({ node: finalText, offset: 1 });
  });
});
