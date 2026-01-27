import type { Suggestion } from '../../engine/types.js';
import { getHashFormat, sha256HexSync } from './hashUtils.js';

export type SuggestionSignatureV2 = {
  version: 'sig:v2';
  type: Suggestion['type'];
  actionKeys: string[];
};

const stableSortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(item => stableSortKeys(item));
  }
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = stableSortKeys(record[key]);
      return acc;
    }, {});
};

const ACTION_PREVIEW_LIMIT = 120;

const sanitizePreview = (value: string) =>
  value.replace(/[|;\n\r]/g, ' ').replace(/\s+/g, ' ').trim();

const buildActionPreview = (action: unknown) => {
  const stableJson = JSON.stringify(stableSortKeys(action));
  const sanitized = sanitizePreview(stableJson);
  return sanitized.length > ACTION_PREVIEW_LIMIT
    ? `${sanitized.slice(0, ACTION_PREVIEW_LIMIT)}…`
    : sanitized;
};

const ensureStringField = (
  value: unknown,
  field: string,
  missing: string[]
) => {
  if (typeof value !== 'string' || value.length === 0) {
    missing.push(field);
  }
};

const ensureOptionalStringField = (
  value: unknown,
  field: string,
  invalid: string[]
) => {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    invalid.push(field);
  }
};

const buildKnownActionKey = (
  action: Record<string, unknown>,
  fields: {
    required: string[];
    optional: string[];
  }
) => {
  const missing: string[] = [];
  const invalid: string[] = [];
  fields.required.forEach(field =>
    ensureStringField(action[field], field, missing)
  );
  fields.optional.forEach(field =>
    ensureOptionalStringField(action[field], field, invalid)
  );
  if (missing.length > 0 || invalid.length > 0) {
    const preview = buildActionPreview(action);
    const missingText = missing.length > 0 ? ` missing=${missing.join(',')}` : '';
    const invalidText = invalid.length > 0 ? ` invalid=${invalid.join(',')}` : '';
    throw new Error(
      `Invalid suggestion action (${action.type}):${missingText}${invalidText}; preview=${preview}`
    );
  }
};

const buildActionKeyV2 = (action: Suggestion['actions'][number]) => {
  switch (action.type) {
    case 'moveShift': {
      buildKnownActionKey(action as Record<string, unknown>, {
        required: [
          'shiftId',
          'userId',
          'dateKey',
          'newStartTime',
          'newEndTime',
        ],
        optional: ['positionId'],
      });
      return [
        action.type,
        action.shiftId,
        action.userId,
        action.dateKey,
        action.newStartTime,
        action.newEndTime,
        action.positionId ?? '',
      ].join('|');
    }
    case 'createShift': {
      buildKnownActionKey(action as Record<string, unknown>, {
        required: ['userId', 'dateKey', 'startTime', 'endTime'],
        optional: ['positionId'],
      });
      return [
        action.type,
        action.userId,
        action.dateKey,
        action.startTime,
        action.endTime,
        action.positionId ?? '',
      ].join('|');
    }
    default: {
      const actionAny = action as { type?: string };
      const actionType =
        typeof actionAny.type === 'string' && actionAny.type.length > 0
          ? actionAny.type
          : 'unknown';
      const stableJson = JSON.stringify(stableSortKeys(action));
      const preview = buildActionPreview(action);
      const actionHash = sha256HexSync(stableJson);
      return `unknown|${actionType}|sha256:${actionHash}|preview:${preview}`;
    }
  }
};

const assertNoUndefinedInCanonicalKeys = (keys: string[]) => {
  if (keys.some(key => key.includes('undefined'))) {
    throw new Error(`Suggestion signature contains undefined field: ${keys.join(';')}`);
  }
};

export const buildSuggestionCanonicalKeysV2 = (suggestion: Suggestion): string[] => {
  const keys = suggestion.actions.map(buildActionKeyV2).sort();
  assertNoUndefinedInCanonicalKeys(keys);
  return keys;
};

export const buildSuggestionSignatureV2 = (suggestion: Suggestion): SuggestionSignatureV2 => {
  return {
    version: 'sig:v2',
    type: suggestion.type,
    actionKeys: buildSuggestionCanonicalKeysV2(suggestion),
  };
};

export const stringifySuggestionSignature = (signature: SuggestionSignatureV2): string =>
  JSON.stringify(stableSortKeys(signature));

export const buildSuggestionCanonicalStringV2 = (suggestion: Suggestion): string =>
  `v2|${suggestion.type}|${buildSuggestionCanonicalKeysV2(suggestion).join(';')}`;

const SIGNATURE_PREVIEW_LIMIT = 160;

export const buildSuggestionSignatureMeta = (suggestion: Suggestion) => {
  const signature = stringifySuggestionSignature(buildSuggestionSignatureV2(suggestion));
  const signaturePreview =
    signature.length > SIGNATURE_PREVIEW_LIMIT
      ? `${signature.slice(0, SIGNATURE_PREVIEW_LIMIT)}…`
      : signature;
  const signatureHash = sha256HexSync(signature);
  return {
    signatureVersion: 'sig:v2' as const,
    signaturePreview,
    signatureHash,
    signatureHashFormat: getHashFormat(signatureHash),
  };
};

export const assertSuggestionSignatureInvariant = (suggestion: Suggestion) => {
  if (process.env.NODE_ENV === 'production') return;
  const canonical = buildSuggestionCanonicalStringV2(suggestion);
  const canonicalAgain = buildSuggestionCanonicalStringV2(suggestion);
  if (canonical !== canonicalAgain) {
    throw new Error('Suggestion signature canonicalization is not deterministic.');
  }
};
