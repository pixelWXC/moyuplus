export const SETTINGS_PROTOCOL_VERSION = 2 as const;

export type SettingsSection = 'reader' | 'immersive' | 'gitLog' | 'typing' | 'shortcuts';
export type SettingsDomain = 'reader' | 'immersive' | 'gitLog' | 'configuration';

export type SettingsToHostMessage =
  | { type: 'settingsReady'; protocolVersion: typeof SETTINGS_PROTOCOL_VERSION; instanceId: string }
  | { type: 'retrySnapshot'; protocolVersion: typeof SETTINGS_PROTOCOL_VERSION; instanceId: string }
  | { type: 'selectSection'; protocolVersion: typeof SETTINGS_PROTOCOL_VERSION; instanceId: string; section: SettingsSection }
  | RequestEnvelope & { type: 'changeSetting'; domain: SettingsDomain; key: string; value: unknown }
  | RequestEnvelope & { type: 'resetSection'; section: 'reader' | 'immersive' | 'gitLog' }
  | RequestEnvelope & { type: 'openKeyboardShortcuts' };

interface RequestEnvelope {
  protocolVersion: typeof SETTINGS_PROTOCOL_VERSION;
  instanceId: string;
  requestId: string;
  clientRevision: number;
}

const readerValidators: Record<string, (value: unknown) => boolean> = {
  fontFamily: oneOf('system', 'serif', 'sans-serif'),
  fontSize: numberBetween(12, 32),
  lineHeight: numberBetween(1.2, 2.4),
  letterSpacing: numberBetween(-0.05, 0.2),
  paragraphSpacing: numberBetween(0, 3),
  textColor: color,
  backgroundColor: color,
  pagePadding: numberBetween(8, 64),
  textAlign: oneOf('left', 'justify'),
  theme: oneOf('system', 'light', 'sepia', 'dark')
};

const gitLogValidators: Record<string, (value: unknown) => boolean> = {
  showHash: boolean,
  showAuthor: boolean,
  showRelativeTime: boolean,
  showAbsoluteDate: boolean,
  layout: oneOf('lines', 'inline'),
  maxCommits: numberBetween(20, 1000)
};

const immersiveValidators: Record<string, (value: unknown) => boolean> = {
  visualLines: numberBetween(1, 12),
  graphemesPerLine: numberBetween(8, 160),
  textColor: color,
  backgroundColor: value => value === 'transparent' || canonicalColor(value),
  fontWeight: oneOf('normal', '500', '600', 'bold'),
  italic: boolean,
  leftMargin: numberBetween(0, 64)
};

const configurationValidators: Record<string, (value: unknown) => boolean> = {
  'moyuplus.shortcuts.enableTabRouter': boolean,
  'moyuplus.typing.tabMode': oneOf('completeRest', 'replaceLine'),
  'moyuplus.shortcuts.enableEnterRouter': boolean,
  'moyuplus.enter.insertNewLine': boolean,
  'moyuplus.enter.nextPracticeLine': boolean,
  'moyuplus.enter.nextReaderPage': boolean
};

export function isSettingsToHostMessage(value: unknown): value is SettingsToHostMessage {
  if (!isRecord(value) || value.protocolVersion !== SETTINGS_PROTOCOL_VERSION || !isInstanceId(value.instanceId)) {
    return false;
  }
  if (value.type === 'settingsReady' || value.type === 'retrySnapshot') {
    return hasOnlyKeys(value, ['type', 'protocolVersion', 'instanceId']);
  }
  if (value.type === 'selectSection') {
    return hasOnlyKeys(value, ['type', 'protocolVersion', 'instanceId', 'section']) && isSection(value.section);
  }
  if (!hasRequestEnvelope(value)) return false;
  if (value.type === 'resetSection') {
    return hasOnlyKeys(value, requestKeys('section')) && (value.section === 'reader' || value.section === 'immersive' || value.section === 'gitLog');
  }
  if (value.type === 'openKeyboardShortcuts') {
    return hasOnlyKeys(value, requestKeys());
  }
  if (value.type !== 'changeSetting'
    || !hasOnlyKeys(value, requestKeys('domain', 'key', 'value'))
    || !isDomain(value.domain)
    || typeof value.key !== 'string') return false;
  const validators = value.domain === 'reader'
    ? readerValidators
    : value.domain === 'immersive' ? immersiveValidators
      : value.domain === 'gitLog' ? gitLogValidators : configurationValidators;
  return Object.prototype.hasOwnProperty.call(validators, value.key) && validators[value.key](value.value);
}

function hasRequestEnvelope(value: Record<string, unknown>): value is Record<string, unknown> & RequestEnvelope {
  return isNonEmptyString(value.requestId)
    && typeof value.clientRevision === 'number'
    && Number.isSafeInteger(value.clientRevision)
    && value.clientRevision > 0;
}

function requestKeys(...keys: string[]): string[] {
  return ['type', 'protocolVersion', 'instanceId', 'requestId', 'clientRevision', ...keys];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isInstanceId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

function isSection(value: unknown): value is SettingsSection {
  return value === 'reader' || value === 'immersive' || value === 'gitLog' || value === 'typing' || value === 'shortcuts';
}

function isDomain(value: unknown): value is SettingsDomain {
  return value === 'reader' || value === 'immersive' || value === 'gitLog' || value === 'configuration';
}

function boolean(value: unknown): boolean {
  return typeof value === 'boolean';
}

function numberBetween(min: number, max: number): (value: unknown) => boolean {
  return value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function color(value: unknown): boolean {
  return value === 'theme' || canonicalColor(value);
}

function canonicalColor(value: unknown): boolean {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/.test(value);
}

function oneOf(...allowed: unknown[]): (value: unknown) => boolean {
  return value => allowed.includes(value);
}
