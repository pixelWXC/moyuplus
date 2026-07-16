import { InternalTargetResolver, type TextTreeNode } from './internalTargetResolver';

export interface LayoutState {
  sectionId: string;
  pageIndex: number;
  pageCount: number;
  progression: number;
  startOffset: number;
  endOffset: number;
  canPreviousPage: boolean;
  canNextPage: boolean;
  isSectionStart: boolean;
  isSectionEnd: boolean;
}

interface PageBoundary { start: number; end: number }
interface TextSpan { node: Text; start: number; end: number }
interface LayoutSurface {
  scrollHeight: number;
  clientHeight: number;
  scrollWidth: number;
  clientWidth: number;
}

export function fitsWithinSurface(surface: LayoutSurface): boolean {
  return surface.scrollHeight <= surface.clientHeight + 1
    && surface.scrollWidth <= surface.clientWidth + 1;
}

export class LayoutEngine {
  private readonly source: HTMLDivElement;
  private readonly measure: HTMLDivElement;
  private sectionId = '';
  private pages: PageBoundary[] = [{ start: 0, end: 0 }];
  private spans: TextSpan[] = [];
  private totalLength = 0;
  private sourceText = '';
  private pageIndex = 0;
  private scheduledFrame?: number;
  private reflowPasses = 0;
  private readonly scheduleFromEnvironment = (): void => this.requestReflow();

  public constructor(
    private viewport: HTMLElement,
    private onReflow?: (state: LayoutState) => void
  ) {
    this.source = document.createElement('div');
    this.measure = document.createElement('div');
    Object.assign(this.source.style, { position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden' });
    Object.assign(this.measure.style, { position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden', overflow: 'hidden' });
    document.body.append(this.source, this.measure);
    window.addEventListener('resize', this.scheduleFromEnvironment);
    document.fonts?.addEventListener('loadingdone', this.scheduleFromEnvironment);
  }

  public setContent(sectionId: string, sanitizedHtml: string, progression = 0): void {
    this.loadSource(sectionId, sanitizedHtml);
    this.paginate(Math.max(0, Math.min(1, progression)) * this.totalLength);
  }

  public setContentAtOffset(sectionId: string, sanitizedHtml: string, textOffset: number): void {
    this.loadSource(sectionId, sanitizedHtml);
    this.paginate(Math.max(0, Math.min(this.totalLength, Number.isFinite(textOffset) ? Math.trunc(textOffset) : 0)));
  }

  public getTextLength(): number { return this.totalLength; }

  public attachTo(viewport: HTMLElement, onReflow?: (state: LayoutState) => void): void {
    const staging = this.viewport;
    if (staging === viewport) {
      this.onReflow = onReflow;
      return;
    }
    viewport.replaceChildren(...Array.from(staging.childNodes));
    this.viewport = viewport;
    this.onReflow = onReflow;
    this.syncMeasureStyle();
    staging.remove();
  }

  private loadSource(sectionId: string, sanitizedHtml: string): void {
    this.sectionId = sectionId;
    this.source.innerHTML = sanitizedHtml;
    this.indexText();
  }

  public reflow(): void {
    const anchor = this.pages[this.pageIndex]?.start ?? 0;
    this.paginate(anchor);
    this.onReflow?.(this.getState());
  }

  public requestReflow(): void {
    if (this.scheduledFrame !== undefined) return;
    this.scheduledFrame = requestAnimationFrame(() => {
      this.scheduledFrame = undefined;
      this.reflow();
    });
  }

  public getReflowPasses(): number { return this.reflowPasses; }

  public nextPage(): boolean {
    if (this.pageIndex >= this.pages.length - 1) return false;
    this.pageIndex += 1;
    this.render();
    return true;
  }

  public previousPage(): boolean {
    if (this.pageIndex <= 0) return false;
    this.pageIndex -= 1;
    this.render();
    return true;
  }

  public goToOffset(offset: number): boolean {
    const clamped = Math.max(0, Math.min(this.totalLength, Number.isFinite(offset) ? Math.trunc(offset) : 0));
    let target = this.pages.findIndex(page => clamped >= page.start && clamped < page.end);
    if (target < 0) target = this.pages.length - 1;
    if (target === this.pageIndex) return false;
    this.pageIndex = target;
    this.render();
    return true;
  }

  public resolveFragmentOffset(fragment: string): number | undefined {
    return new InternalTargetResolver(this.source as unknown as TextTreeNode).resolveFragment(fragment);
  }

  public goToFragment(fragment: string): boolean {
    const offset = this.resolveFragmentOffset(fragment);
    return offset === undefined ? false : this.goToOffset(offset);
  }

  public getState(): LayoutState {
    const page = this.pages[this.pageIndex] ?? { start: 0, end: 0 };
    return {
      sectionId: this.sectionId,
      pageIndex: this.pageIndex,
      pageCount: this.pages.length,
      progression: this.totalLength === 0 ? 0 : page.start / this.totalLength,
      startOffset: page.start,
      endOffset: page.end,
      canPreviousPage: this.pageIndex > 0,
      canNextPage: this.pageIndex < this.pages.length - 1,
      isSectionStart: this.pageIndex === 0,
      isSectionEnd: this.pageIndex === this.pages.length - 1
    };
  }

  public dispose(): void {
    if (this.scheduledFrame !== undefined) cancelAnimationFrame(this.scheduledFrame);
    window.removeEventListener('resize', this.scheduleFromEnvironment);
    document.fonts?.removeEventListener('loadingdone', this.scheduleFromEnvironment);
    this.source.remove();
    this.measure.remove();
  }

  private indexText(): void {
    this.spans = [];
    this.totalLength = 0;
    const walker = document.createTreeWalker(this.source, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node as Text;
      const start = this.totalLength;
      this.totalLength += text.data.length;
      this.spans.push({ node: text, start, end: this.totalLength });
      node = walker.nextNode();
    }
    this.sourceText = this.source.textContent ?? '';
  }

  private paginate(anchor: number): void {
    this.reflowPasses += 1;
    this.syncMeasureStyle();
    if (this.totalLength === 0) {
      this.pages = [{ start: 0, end: 0 }];
      this.pageIndex = 0;
      this.viewport.innerHTML = this.source.innerHTML;
      return;
    }
    const pages: PageBoundary[] = [];
    let start = 0;
    while (start < this.totalLength) {
      let step = 256;
      let low = start + 1;
      let high = Math.min(this.totalLength, start + step);
      let best = low;
      while (high < this.totalLength && this.fits(start, high)) {
        best = high;
        low = high + 1;
        step *= 2;
        high = Math.min(this.totalLength, start + step);
      }
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (this.fits(start, middle)) { best = middle; low = middle + 1; }
        else high = middle - 1;
      }
      const end = this.snapBoundary(start, best);
      pages.push({ start, end });
      start = end > start ? end : start + 1;
    }
    this.pages = pages;
    this.pageIndex = Math.max(0, pages.findIndex(page => anchor >= page.start && anchor < page.end));
    if (this.pageIndex < 0) this.pageIndex = pages.length - 1;
    this.render();
  }

  private syncMeasureStyle(): void {
    this.syncSurfaceIdentity(this.source);
    this.syncSurfaceIdentity(this.measure);
  }

  private fits(start: number, end: number): boolean {
    this.measure.replaceChildren(this.fragment(start, end));
    return fitsWithinSurface(this.measure);
  }

  private render(): void {
    const page = this.pages[this.pageIndex];
    this.viewport.replaceChildren(this.fragment(page.start, page.end));
    if (!fitsWithinSurface(this.viewport) && page.end > page.start + 1) {
      const originalEnd = page.end;
      let low = page.start + 1;
      let high = page.end - 1;
      let best = page.start + 1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        this.viewport.replaceChildren(this.fragment(page.start, middle));
        if (fitsWithinSurface(this.viewport)) { best = middle; low = middle + 1; }
        else high = middle - 1;
      }
      page.end = Math.max(page.start + 1, this.snapBoundary(page.start, best));
      const next = this.pages[this.pageIndex + 1];
      if (next) next.start = page.end;
      else if (page.end < originalEnd) this.pages.push({ start: page.end, end: originalEnd });
      this.viewport.replaceChildren(this.fragment(page.start, page.end));
    }
  }

  private fragment(start: number, end: number): Node {
    const startPoint = this.point(start, false);
    const endPoint = this.point(end, true);
    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);

    let content: Node = range.cloneContents();
    let ancestor = range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    while (ancestor && ancestor !== this.source) {
      const wrapper = ancestor.cloneNode(false) as Element;
      wrapper.append(content);
      content = wrapper;
      if (ancestor.classList.contains('moyuplus-book-content')) break;
      ancestor = ancestor.parentElement;
    }
    return content;
  }

  private point(offset: number, atEnd: boolean): { node: Text; offset: number } {
    let low = 0;
    let high = this.spans.length - 1;
    let match = high;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const span = this.spans[middle];
      if (offset < span.end || (atEnd && offset === span.end)) {
        match = middle;
        high = middle - 1;
      } else low = middle + 1;
    }
    const span = this.spans[match];
    return { node: span.node, offset: Math.max(0, Math.min(span.node.length, offset - span.start)) };
  }

  private snapBoundary(start: number, candidate: number): number {
    if (candidate >= this.totalLength) return this.totalLength;
    const floor = Math.max(start + 1, candidate - 80);
    for (let index = candidate; index >= floor; index -= 1) {
      if (/\s|[，。！？；、,.!?;]/u.test(this.sourceText[index - 1] ?? '')) return index;
    }
    return candidate;
  }

  private syncSurfaceIdentity(surface: HTMLDivElement): void {
    surface.className = this.viewport.className;
    for (const key of Object.keys(surface.dataset)) delete surface.dataset[key];
    for (const [key, value] of Object.entries(this.viewport.dataset)) surface.dataset[key] = value;
    surface.style.cssText = this.viewport.style.cssText;
    const computed = getComputedStyle(this.viewport);
    for (const name of Array.from(computed)) {
      if (name.startsWith('--')) surface.style.setProperty(name, computed.getPropertyValue(name));
    }
    Object.assign(surface.style, {
      position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden', overflow: 'hidden',
      width: `${this.viewport.clientWidth}px`, height: `${this.viewport.clientHeight}px`
    });
  }
}
