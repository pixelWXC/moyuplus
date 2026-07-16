import { describe, expect, it } from 'vitest';
import {
  CLOSE_READER_COMMAND_ID,
  FOCUS_READER_COMMAND_ID,
  NEXT_READER_PAGE_COMMAND_ID,
  PREVIOUS_READER_PAGE_COMMAND_ID,
  NEXT_READER_CHAPTER_COMMAND_ID, OPEN_READER_LIBRARY_COMMAND_ID, OPEN_READER_SETTINGS_COMMAND_ID,
  OPEN_READER_TOC_COMMAND_ID, PREVIOUS_READER_CHAPTER_COMMAND_ID,
  UNDO_READER_LOCATION_COMMAND_ID,
  createShortcutSettingsState
} from '../../shortcuts/shortcutSettings';
import { ROUTE_ENTER_COMMAND_ID, ROUTE_TAB_COMMAND_ID } from '../../commands/shortcutRouter';
import { TOGGLE_TYPING_PRACTICE_COMMAND_ID } from '../../typing/typingPracticeCommands';
import { TOGGLE_GIT_LOG_COMMAND_ID } from '../../git/gitLogModeCoordinator';

describe('shortcut settings state', () => {
  it('describes every major reader and typing action in a stable order', () => {
    const items = createShortcutSettingsState({
      enableEnterRouter: false,
      enableTabRouter: true
    });

    expect(items.map((item) => item.commandId)).toEqual([
      NEXT_READER_PAGE_COMMAND_ID,
      PREVIOUS_READER_PAGE_COMMAND_ID,
      UNDO_READER_LOCATION_COMMAND_ID,
      PREVIOUS_READER_CHAPTER_COMMAND_ID,
      NEXT_READER_CHAPTER_COMMAND_ID,
      OPEN_READER_LIBRARY_COMMAND_ID,
      OPEN_READER_TOC_COMMAND_ID,
      OPEN_READER_SETTINGS_COMMAND_ID,
      FOCUS_READER_COMMAND_ID,
      CLOSE_READER_COMMAND_ID,
      TOGGLE_GIT_LOG_COMMAND_ID,
      TOGGLE_TYPING_PRACTICE_COMMAND_ID,
      ROUTE_ENTER_COMMAND_ID,
      ROUTE_TAB_COMMAND_ID
    ]);
    expect(items.every((item) => item.label.length > 0 && item.description.length > 0)).toBe(true);
  });

  it('shows guarded Enter and Tab defaults with their real enabled state and conflict warning', () => {
    const items = createShortcutSettingsState({
      enableEnterRouter: false,
      enableTabRouter: true
    });

    expect(items.find((item) => item.commandId === ROUTE_ENTER_COMMAND_ID)).toMatchObject({
      defaultBinding: 'Enter',
      enabled: false,
      configurableEnablement: 'enter',
      risk: 'high'
    });
    expect(items.find((item) => item.commandId === ROUTE_TAB_COMMAND_ID)).toMatchObject({
      defaultBinding: 'Tab',
      enabled: true,
      configurableEnablement: 'tab',
      risk: 'high'
    });
    expect(items.filter((item) => item.risk === 'high').every((item) => item.conflictWarning?.length)).toBe(true);
  });
});
