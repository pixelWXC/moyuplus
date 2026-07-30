const TOGGLE_GIT_LOG_COMMAND_ID = 'moyuplus.gitLog.toggle';

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
export const STOP_IMMERSIVE_READING_COMMAND_ID = 'moyuplus.immersive.stop';

export interface ShortcutSettingItem {
  commandId: string;
  label: string;
  description: string;
}

export function createShortcutSettingsState(): ShortcutSettingItem[] {
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
    action(STOP_IMMERSIVE_READING_COMMAND_ID, '沉浸阅读：结束', '保存当前页首并结束沉浸阅读。'),
    action(TOGGLE_GIT_LOG_COMMAND_ID, 'Git Log：打开或退出', '通过专用快捷键切换分页式当前分支 Git Log。')
  ];
}

function action(commandId: string, label: string, description: string): ShortcutSettingItem {
  return {
    commandId,
    label,
    description
  };
}
