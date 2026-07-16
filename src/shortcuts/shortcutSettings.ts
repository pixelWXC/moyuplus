import { ROUTE_ENTER_COMMAND_ID, ROUTE_TAB_COMMAND_ID } from '../commands/shortcutRouter';
import { TOGGLE_TYPING_PRACTICE_COMMAND_ID } from '../typing/typingPracticeCommands';
import { TOGGLE_GIT_LOG_COMMAND_ID } from '../git/gitLogModeCoordinator';

export const NEXT_READER_PAGE_COMMAND_ID = 'moyuplus.reader.nextPage';
export const PREVIOUS_READER_PAGE_COMMAND_ID = 'moyuplus.reader.previousPage';
export const UNDO_READER_LOCATION_COMMAND_ID = 'moyuplus.reader.undoLocation';
export const FOCUS_READER_COMMAND_ID = 'moyuplus.reader.focus';
export const CLOSE_READER_COMMAND_ID = 'moyuplus.reader.close';
export const OPEN_READER_LIBRARY_COMMAND_ID = 'moyuplus.reader.openLibrary';
export const PREVIOUS_READER_CHAPTER_COMMAND_ID = 'moyuplus.reader.previousChapter';
export const NEXT_READER_CHAPTER_COMMAND_ID = 'moyuplus.reader.nextChapter';
export const OPEN_READER_TOC_COMMAND_ID = 'moyuplus.reader.openToc';
export const OPEN_READER_SETTINGS_COMMAND_ID = 'moyuplus.reader.openSettings';

export type ShortcutRisk = 'low' | 'high';
export type ShortcutEnablement = 'enter' | 'tab';

export interface ShortcutSettingItem {
  commandId: string;
  label: string;
  description: string;
  defaultBinding?: string;
  enabled: boolean;
  configurableEnablement?: ShortcutEnablement;
  risk: ShortcutRisk;
  conflictWarning?: string;
}

export interface ShortcutSettingsStateInput {
  enableEnterRouter: boolean;
  enableTabRouter: boolean;
}

export function createShortcutSettingsState(input: ShortcutSettingsStateInput): ShortcutSettingItem[] {
  return [
    action(NEXT_READER_PAGE_COMMAND_ID, '阅读器：下一页', '将阅读器翻到下一页。'),
    action(PREVIOUS_READER_PAGE_COMMAND_ID, '阅读器：上一页', '返回阅读器历史中的上一页。'),
    action(UNDO_READER_LOCATION_COMMAND_ID, '阅读器：撤回阅读位置', '返回最近一次成功导航前的位置。'),
    action(PREVIOUS_READER_CHAPTER_COMMAND_ID, '阅读器：上一章', '跳转到上一章节。'),
    action(NEXT_READER_CHAPTER_COMMAND_ID, '阅读器：下一章', '跳转到下一章节。'),
    action(OPEN_READER_LIBRARY_COMMAND_ID, '阅读器：书架', '返回 MoyuPlus 书架。'),
    action(OPEN_READER_TOC_COMMAND_ID, '阅读器：目录', '打开当前书籍目录。'),
    action(OPEN_READER_SETTINGS_COMMAND_ID, '阅读器：设置', '打开阅读设置。'),
    action(FOCUS_READER_COMMAND_ID, '阅读器：打开', '打开并聚焦 MoyuPlus Reader。'),
    action(CLOSE_READER_COMMAND_ID, '阅读器：关闭', '关闭当前侧边栏。'),
    action(TOGGLE_GIT_LOG_COMMAND_ID, 'Git Log：打开或退出', '通过专用快捷键切换分页式当前分支 Git Log。'),
    action(TOGGLE_TYPING_PRACTICE_COMMAND_ID, '打字练习：开启或关闭', '根据当前练习状态开启或关闭打字练习。'),
    {
      commandId: ROUTE_ENTER_COMMAND_ID,
      label: '编辑器：Enter 组合动作',
      description: '插入真实换行，并按设置推进练习行或阅读器页面。',
      defaultBinding: 'Enter',
      enabled: input.enableEnterRouter,
      configurableEnablement: 'enter',
      risk: 'high',
      conflictWarning: 'Enter 是高频编辑按键；仅在明确需要组合动作时启用。'
    },
    {
      commandId: ROUTE_TAB_COMMAND_ID,
      label: '编辑器：Tab 练习补全',
      description: '练习开启且补全菜单与 snippet 不活跃时补全当前练习行。',
      defaultBinding: 'Tab',
      enabled: input.enableTabRouter,
      configurableEnablement: 'tab',
      risk: 'high',
      conflictWarning: 'Tab 可能与补全或 snippet 冲突；路由带有限定条件且默认关闭。'
    }
  ];
}

function action(commandId: string, label: string, description: string): ShortcutSettingItem {
  return {
    commandId,
    label,
    description,
    enabled: true,
    risk: 'low'
  };
}
