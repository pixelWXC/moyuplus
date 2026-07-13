import { LayoutEngine, type LayoutState } from './layoutEngine';

export interface GitLogPageState {
  pageIndex: number;
  pageCount: number;
  canPreviousPage: boolean;
  canNextPage: boolean;
}

/** A Git-owned pagination session. It shares only the generic text measurement algorithm with Reader. */
export class GitLogPaginator {
  private readonly engine: LayoutEngine;

  constructor(private readonly viewport: HTMLElement, private readonly onChange: (state: GitLogPageState) => void) {
    this.engine = new LayoutEngine(viewport, state => this.emit(state));
  }

  setContent(content: HTMLElement): void {
    this.engine.setContent('git-log', content.innerHTML, 0);
    this.emit(this.engine.getState());
  }

  nextPage(): boolean {
    const moved = this.engine.nextPage();
    this.emit(this.engine.getState());
    return moved;
  }

  previousPage(): boolean {
    const moved = this.engine.previousPage();
    this.emit(this.engine.getState());
    return moved;
  }

  requestReflow(): void { this.engine.requestReflow(); }
  dispose(): void { this.engine.dispose(); }

  private emit(state: LayoutState): void {
    this.onChange({
      pageIndex: state.pageIndex,
      pageCount: state.pageCount,
      canPreviousPage: state.canPreviousPage,
      canNextPage: state.canNextPage
    });
  }
}
