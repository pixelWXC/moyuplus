import './styles.css';
import { LayoutEngine } from './layoutEngine';

export const READER_APP_BUILD_TARGET = 'webview';

declare global { interface Window { MoyuplusReader: { LayoutEngine: typeof LayoutEngine } } }

window.MoyuplusReader = { LayoutEngine };
