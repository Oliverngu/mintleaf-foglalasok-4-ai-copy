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

const buildUnknownActionKey = (action: unknown, actionType: string) => {
  const stableJson = JSON.stringify(stableSortKeys(action));
  const preview = buildActionPreview(action);
  const actionHash = sha256HexSync(stableJson);
  const hashFormat = getHashFormat(actionHash);
  return `unknown|${actionType}|hash:${hashFormat}|${actionHash}|preview:${preview}`;
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

const validateKnownActionFields = (
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
  return { missing, invalid };
};

const throwInvalidKnownAction = (
  action: Record<string, unknown>,
  missing: string[],
  invalid: string[]
) => {
  const preview = buildActionPreview(action);
  const missingText = missing.length > 0 ? ` missing=${missing.join(',')}` : '';
  const invalidText = invalid.length > 0 ? ` invalid=${invalid.join(',')}` : '';
  throw new Error(
    `Invalid suggestion action (${action.type}):${missingText}${invalidText}; preview=${preview}`
  );
};

type DegradeReason = 'missing_fields' | 'invalid_fields' | 'unknown_action';

const buildActionKeyWithMeta = (action: Suggestion['actions'][number]) => {
  switch (action.type) {
    case 'moveShift': {
      try {
        const { missing, invalid } = validateKnownActionFields(
          action as Record<string, unknown>,
          {
            required: [
              'shiftId',
              'userId',
              'dateKey',
              'newStartTime',
              'newEndTime',
            ],
            optional: ['positionId'],
          }
        );
        if (missing.length > 0 || invalid.length > 0) {
          if (process.env.NODE_ENV === 'production') {
            const actionType =
              typeof action.type === 'string' && action.type.length > 0
                ? action.type
                : 'unknown';
            return {
              key: buildUnknownActionKey(action, actionType),
              degraded: true,
              reason: missing.length > 0 ? 'missing_fields' : 'invalid_fields',
              actionType,
            };
          }
          throwInvalidKnownAction(action as Record<string, unknown>, missing, invalid);
        }
        return {
          key: [
            action.type,
            action.shiftId,
            action.userId,
            action.dateKey,
            action.newStartTime,
            action.newEndTime,
            action.positionId ?? '',
          ].join('|'),
        };
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          const actionType =
            typeof action.type === 'string' && action.type.length > 0
              ? action.type
              : 'unknown';
          return {
            key: buildUnknownActionKey(action, actionType),
            degraded: true,
            reason: 'invalid_fields',
            actionType,
          };
        }
        throw error;
      }
    }
    case 'createShift': {
      try {
        const { missing, invalid } = validateKnownActionFields(
          action as Record<string, unknown>,
          {
            required: ['userId', 'dateKey', 'startTime', 'endTime'],
            optional: ['positionId'],
          }
        );
        if (missing.length > 0 || invalid.length > 0) {
          if (process.env.NODE_ENV === 'production') {
            const actionType =
              typeof action.type === 'string' && action.type.length > 0
                ? action.type
                : 'unknown';
            return {
              key: buildUnknownActionKey(action, actionType),
              degraded: true,
              reason: missing.length > 0 ? 'missing_fields' : 'invalid_fields',
              actionType,
            };
          }
          throwInvalidKnownAction(action as Record<string, unknown>, missing, invalid);
        }
        return {
          key: [
            action.type,
            action.userId,
            action.dateKey,
            action.startTime,
            action.endTime,
            action.positionId ?? '',
          ].join('|'),
        };
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          const actionType =
            typeof action.type === 'string' && action.type.length > 0
              ? action.type
              : 'unknown';
          return {
            key: buildUnknownActionKey(action, actionType),
            degraded: true,
            reason: 'invalid_fields',
            actionType,
          };
        }
        throw error;
      }
    }
    default: {
      const actionAny = action as { type?: string };
      const actionType =
        typeof actionAny.type === 'string' && actionAny.type.length > 0
          ? actionAny.type
          : 'unknown';
      return {
        key: buildUnknownActionKey(action, actionType),
        degraded: true,
        reason: 'unknown_action',
        actionType,
      };
    }
  }
};

const buildActionKeyV2 = (action: Suggestion['actions'][number]) =>
  buildActionKeyWithMeta(action).key;

const extractDegradeMeta = (suggestion: Suggestion) => {
  const degradedActions = suggestion.actions
    .map(buildActionKeyWithMeta)
    .filter(entry => entry.degraded);
  if (degradedActions.length === 0) return {};
  const first = degradedActions[0];
  return {
    signatureDegraded: true,
    signatureDegradeReason: first.reason as DegradeReason,
    signatureDegradeActionType: first.actionType ?? 'unknown',
  };
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
    ...extractDegradeMeta(suggestion),
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
