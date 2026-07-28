import { describe, expect, it } from 'vitest';
import {
  SETTINGS_PROTOCOL_VERSION,
  isSettingsToHostMessage
} from '../../settings/settingsMessages';

const envelope = {
  protocolVersion: SETTINGS_PROTOCOL_VERSION,
  instanceId: 'settings-instance-12345678',
  requestId: 'request-1',
  clientRevision: 1
};

describe('settings message protocol', () => {
  it('uses protocol version 2 for theme-inheriting colors', () => {
    expect(SETTINGS_PROTOCOL_VERSION).toBe(2);
  });

  it('accepts the handshake and the four explicit setting domains', () => {
    expect(isSettingsToHostMessage({
      type: 'settingsReady',
      protocolVersion: SETTINGS_PROTOCOL_VERSION,
      instanceId: envelope.instanceId
    })).toBe(true);
    expect(isSettingsToHostMessage({
      ...envelope,
      type: 'changeSetting',
      domain: 'immersive',
      key: 'graphemesPerLine',
      value: 64
    })).toBe(true);
    expect(isSettingsToHostMessage({
      ...envelope,
      type: 'changeSetting',
      domain: 'reader',
      key: 'fontSize',
      value: 20
    })).toBe(true);
    expect(isSettingsToHostMessage({
      ...envelope,
      type: 'changeSetting',
      domain: 'gitLog',
      key: 'showAuthor',
      value: false
    })).toBe(true);
    expect(isSettingsToHostMessage({
      ...envelope,
      type: 'changeSetting',
      domain: 'configuration',
      key: 'moyuplus.shortcuts.enableEnterRouter',
      value: true
    })).toBe(true);
  });

  it('accepts reset, retry, section selection and native shortcut actions', () => {
    expect(isSettingsToHostMessage({ ...envelope, type: 'resetSection', section: 'reader' })).toBe(true);
    expect(isSettingsToHostMessage({ ...envelope, type: 'resetSection', section: 'immersive' })).toBe(true);
    expect(isSettingsToHostMessage({
      type: 'retrySnapshot',
      protocolVersion: SETTINGS_PROTOCOL_VERSION,
      instanceId: envelope.instanceId
    })).toBe(true);
    expect(isSettingsToHostMessage({
      type: 'selectSection',
      protocolVersion: SETTINGS_PROTOCOL_VERSION,
      instanceId: envelope.instanceId,
      section: 'shortcuts'
    })).toBe(true);
    expect(isSettingsToHostMessage({
      type: 'selectSection', protocolVersion: SETTINGS_PROTOCOL_VERSION,
      instanceId: envelope.instanceId, section: 'immersive'
    })).toBe(true);
    expect(isSettingsToHostMessage({
      ...envelope,
      type: 'openKeyboardShortcuts'
    })).toBe(true);
  });

  it('accepts theme inheritance and canonical six-digit color changes only', () => {
    expect(isSettingsToHostMessage({
      ...envelope, type: 'changeSetting', domain: 'reader', key: 'backgroundColor', value: 'theme'
    })).toBe(true);
    expect(isSettingsToHostMessage({
      ...envelope, type: 'changeSetting', domain: 'reader', key: 'backgroundColor', value: '#aabbcc'
    })).toBe(true);
    expect(isSettingsToHostMessage({
      ...envelope, type: 'changeSetting', domain: 'reader', key: 'backgroundColor', value: '#abc'
    })).toBe(false);
    expect(isSettingsToHostMessage({
      ...envelope, type: 'changeSetting', domain: 'immersive', key: 'backgroundColor', value: 'transparent'
    })).toBe(true);
  });

  it('rejects unknown, extra, prototype, malformed and out-of-range values', () => {
    const invalid = [
      { ...envelope, type: 'changeSetting', domain: 'reader', key: 'fontSize', value: 33 },
      { ...envelope, type: 'changeSetting', domain: 'immersive', key: 'visualLines', value: 13 },
      { ...envelope, type: 'changeSetting', domain: 'reader', key: 'fontSize', value: Number.NaN },
      { ...envelope, type: 'changeSetting', domain: 'reader', key: 'theme', value: 'neon' },
      { ...envelope, type: 'changeSetting', domain: 'reader', key: '__proto__', value: 16 },
      { ...envelope, type: 'changeSetting', domain: 'gitLog', key: 'maxCommits', value: 1001 },
      { ...envelope, type: 'changeSetting', domain: 'configuration', key: 'moyuplus.unknown', value: true },
      { ...envelope, type: 'changeSetting', domain: 'configuration', key: 'moyuplus.shortcuts.enableEnterRouter', value: 'yes' },
      { ...envelope, type: 'changeSetting', domain: 'reader', key: 'fontSize', value: 18, extra: true },
      { ...envelope, type: 'unknown' },
      { ...envelope, type: 'resetSection', section: 'typing' },
      { type: 'settingsReady', protocolVersion: 999, instanceId: envelope.instanceId },
      { type: 'settingsReady', protocolVersion: SETTINGS_PROTOCOL_VERSION, instanceId: '../bad' }
    ];
    for (const message of invalid) expect(isSettingsToHostMessage(message), JSON.stringify(message)).toBe(false);
  });
});
