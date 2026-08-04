export const OPEN_IMMERSIVE_IMAGE_COMMAND_ID = 'moyuplus.immersive.openImage';

export interface ImmersiveImageOpenRequest {
  bookId: string;
  sectionId: string;
  resourceId: string;
}

export function isImmersiveImageOpenRequest(value: unknown): value is ImmersiveImageOpenRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 3
    && isNonEmptyString(record.bookId)
    && isNonEmptyString(record.sectionId)
    && isOpaqueResourceId(record.resourceId);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOpaqueResourceId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,127}$/i.test(value);
}
