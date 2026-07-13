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

export class LayoutEngine {
  private readonly source: HTMLDivElement;
  private readonly measure: HTMLDivElement;
  private sectionId = '';
  private pages: PageBoundary[] = [{ start: 0, end: 0 }];
  private spans: TextSpan[] = [];
  private totalLength = 0;
  private pageIndex = 0;
  private scheduledFrame?: number;
  private reflowPasses = 0;
  private readonly scheduleFromEnvironment = (): void => this.requestReflow();

  public constructor(
    private readonly viewport: HTMLElement,
    private readonly onReflow?: (state: LayoutState) => void
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
    this.sectionId = sectionId;
    this.source.innerHTML = sanitizedHtml;
    this.indexText();
    this.paginate(Math.max(0, Math.min(1, progression)) * this.totalLength);
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
    const style = getComputedStyle(this.viewport);
    for (const name of ['box-sizing', 'width', 'height', 'padding', 'font', 'font-size', 'font-family', 'font-weight', 'line-height', 'letter-spacing', 'word-break', 'white-space']) {
      this.measure.style.setProperty(name, style.getPropertyValue(name));
    }
    this.measure.style.width = `${this.viewport.clientWidth}px`;
    this.measure.style.height = `${this.viewport.clientHeight}px`;
  }

  private fits(start: number, end: number): boolean {
    this.measure.replaceChildren(this.fragment(start, end));
    return this.measure.scrollHeight <= this.measure.clientHeight + 1;
  }

  private render(): void {
    const page = this.pages[this.pageIndex];
    this.viewport.replaceChildren(this.fragment(page.start, page.end));
  }

  private fragment(start: number, end: number): DocumentFragment {
    const range = document.createRange();
    const startPoint = this.point(start, false);
    const endPoint = this.point(end, true);
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    return range.cloneContents();
  }

  private point(offset: number, atEnd: boolean): { node: Text; offset: number } {
    const span = this.spans.find(item => offset < item.end || (atEnd && offset === item.end)) ?? this.spans[this.spans.length - 1];
    return { node: span.node, offset: Math.max(0, Math.min(span.node.length, offset - span.start)) };
  }

  private snapBoundary(start: number, candidate: number): number {
    if (candidate >= this.totalLength) return this.totalLength;
    const text = this.source.textContent ?? '';
    const floor = Math.max(start + 1, candidate - 80);
    for (let index = candidate; index >= floor; index -= 1) {
      if (/\s|[，。！？；、,.!?;]/u.test(text[index - 1] ?? '')) return index;
    }
    return candidate;
  }
}
