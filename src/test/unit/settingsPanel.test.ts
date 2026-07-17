import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Uri, commands, resetVSCodeShim, window } from '../shims/vscode';
import { SETTINGS_PROTOCOL_VERSION } from '../../settings/settingsMessages';
import {
  MoyuPlusSettingsPanel,
  SETTINGS_PANEL_VIEW_TYPE,
  type SettingsPanelAuthority
} from '../../settings/MoyuPlusSettingsPanel';
import { createDefaultReaderPreferences } from '../../domain/readerPreferences';
import { createDefaultGitLogPreferences } from '../../git/gitLogModels';

function authority(): SettingsPanelAuthority {
  return {
    snapshot: vi.fn(section => ({
      section,
      reader: createDefaultReaderPreferences(),
      gitLog: createDefaultGitLogPreferences(),
      configuration: []
    })),
    change: vi.fn(async (_domain, _key, value) => value),
    reset: vi.fn(async section => section === 'reader'
      ? createDefaultReaderPreferences()
      : createDefaultGitLogPreferences())
  };
}

const ready = (instanceId = 'settings-instance-a') => ({
  type: 'settingsReady', protocolVersion: SETTINGS_PROTOCOL_VERSION, instanceId
});

describe('MoyuPlus settings panel', () => {
  beforeEach(() => resetVSCodeShim());

  it('creates one restricted panel and reuses it for section deep links', async () => {
    const target = authority();
    const controller = new MoyuPlusSettingsPanel(Uri.file('/extension'), target);
    controller.open('reader');
    controller.open('gitLog');

    expect(window.createdWebviewPanels).toHaveLength(1);
    const panel = window.createdWebviewPanels[0];
    expect(panel.viewType).toBe(SETTINGS_PANEL_VIEW_TYPE);
    expect(panel.webview.options.enableScripts).toBe(true);
    expect(panel.webview.options.localResourceRoots?.map(uri => uri.toString())).toEqual([
      Uri.file('/extension/media').toString()
    ]);
    expect(panel.revealCalls).toHaveLength(1);

    await panel.webview.receiveMessage(ready());
    expect(panel.webview.postedMessages.at(-1)).toMatchObject({
      type: 'settingsSnapshot', instanceId: 'settings-instance-a', stateVersion: 1, section: 'gitLog'
    });
  });

  it('blocks mismatched protocol versions without reading a snapshot', async () => {
    const target = authority();
    const controller = new MoyuPlusSettingsPanel(Uri.file('/extension'), target);
    controller.open('reader');
    const panel = window.createdWebviewPanels[0];
    await panel.webview.receiveMessage({ ...ready(), protocolVersion: 99 });
    expect(target.snapshot).not.toHaveBeenCalled();
    expect(panel.webview.postedMessages).toEqual([
      { type: 'settingsProtocolError', message: '请重新加载窗口或更新扩展。' }
    ]);
  });

  it('correlates changes and ignores queued writes from an old Webview instance', async () => {
    let release!: () => void;
    const target = authority();
    (target.change as ReturnType<typeof vi.fn>).mockImplementationOnce(async (_domain, _key, value) => {
      await new Promise<void>(resolve => { release = resolve; });
      return value;
    });
    const controller = new MoyuPlusSettingsPanel(Uri.file('/extension'), target);
    controller.open('reader');
    const panel = window.createdWebviewPanels[0];
    await panel.webview.receiveMessage(ready('settings-old-1'));
    const first = panel.webview.receiveMessage({
      type: 'changeSetting', protocolVersion: SETTINGS_PROTOCOL_VERSION, instanceId: 'settings-old-1', requestId: 'r1', clientRevision: 1,
      domain: 'reader', key: 'fontSize', value: 18
    });
    const queuedOld = panel.webview.receiveMessage({
      type: 'changeSetting', protocolVersion: SETTINGS_PROTOCOL_VERSION, instanceId: 'settings-old-1', requestId: 'r2', clientRevision: 2,
      domain: 'reader', key: 'fontSize', value: 19
    });
    await vi.waitFor(() => expect(target.change).toHaveBeenCalledTimes(1));
    const newReady = panel.webview.receiveMessage(ready('settings-new-2'));
    release();
    await Promise.all([first, queuedOld, newReady]);

    expect(target.change).toHaveBeenCalledTimes(1);
    expect(panel.webview.postedMessages).toContainEqual(expect.objectContaining({
      type: 'changeSaved', instanceId: 'settings-old-1', requestId: 'r1', clientRevision: 1
    }));
    expect(panel.webview.postedMessages.at(-1)).toMatchObject({
      type: 'settingsSnapshot', instanceId: 'settings-new-2', section: 'reader'
    });
  });

  it('confirms high-risk enablement but not disablement', async () => {
    const target = authority();
    const controller = new MoyuPlusSettingsPanel(Uri.file('/extension'), target);
    controller.open('typing');
    const panel = window.createdWebviewPanels[0];
    await panel.webview.receiveMessage(ready());
    window.nextWarningMessageResult = false;
    await panel.webview.receiveMessage({
      type: 'changeSetting', protocolVersion: SETTINGS_PROTOCOL_VERSION, instanceId: 'settings-instance-a', requestId: 'r1', clientRevision: 1,
      domain: 'configuration', key: 'moyuplus.shortcuts.enableEnterRouter', value: true
    });
    await panel.webview.receiveMessage({
      type: 'changeSetting', protocolVersion: SETTINGS_PROTOCOL_VERSION, instanceId: 'settings-instance-a', requestId: 'r2', clientRevision: 2,
      domain: 'configuration', key: 'moyuplus.shortcuts.enableEnterRouter', value: false
    });
    expect(window.warningMessages).toHaveLength(1);
    expect(target.change).toHaveBeenCalledOnce();
    expect(target.change).toHaveBeenCalledWith('configuration', 'moyuplus.shortcuts.enableEnterRouter', false);
    expect(panel.webview.postedMessages).toContainEqual(expect.objectContaining({ type: 'changeFailed', requestId: 'r1', value: false }));
  });

  it('refreshes from authority when becoming visible and opens native shortcuts with the query', async () => {
    const target = authority();
    const controller = new MoyuPlusSettingsPanel(Uri.file('/extension'), target);
    controller.open('shortcuts');
    const panel = window.createdWebviewPanels[0];
    await panel.webview.receiveMessage(ready());
    await panel.setVisible(false);
    await panel.setVisible(true);
    await panel.webview.receiveMessage({
      type: 'openKeyboardShortcuts', protocolVersion: SETTINGS_PROTOCOL_VERSION, instanceId: 'settings-instance-a',
      requestId: 'keys-1', clientRevision: 1
    });
    expect(target.snapshot).toHaveBeenCalledTimes(2);
    expect(commands.executedBuiltinCommands()).toContainEqual({
      commandId: 'workbench.action.openGlobalKeybindings', args: ['moyuplus']
    });
  });
});
