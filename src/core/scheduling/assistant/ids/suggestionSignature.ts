import type { Suggestion } from '../../engine/types.js';
import { sha256HexSync } from './hashUtils.js';

export type SuggestionSignatureV2 = {
  version: 'sig:v2';
  type: Suggestion['type'];
  actions: Array<
    | {
        type: 'moveShift';
        shiftId: string;
        userId: string;
        dateKey: string;
        newStartTime: string;
        newEndTime: string;
        positionId: string;
      }
    | {
        type: 'createShift';
        userId: string;
        dateKey: string;
        startTime: string;
        endTime: string;
        positionId: string;
      }
  >;
};

const buildActionKeyV2 = (action: Suggestion['actions'][number]) => {
  if (action.type === 'moveShift') {
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

  return [
    action.type,
    action.userId,
    action.dateKey,
    action.startTime,
    action.endTime,
    action.positionId ?? '',
  ].join('|');
};

export const buildSuggestionCanonicalKeysV2 = (suggestion: Suggestion): string[] =>
  suggestion.actions.map(buildActionKeyV2).sort();

export const buildSuggestionSignatureV2 = (suggestion: Suggestion): SuggestionSignatureV2 => {
  const actionKeys = buildSuggestionCanonicalKeysV2(suggestion);
  const actions = actionKeys.map(key => {
    const [type, ...parts] = key.split('|');
    if (type === 'moveShift') {
      const [
        shiftId,
        userId,
        dateKey,
        newStartTime,
        newEndTime,
        positionId = '',
      ] = parts;
      return {
        type: 'moveShift',
        shiftId,
        userId,
        dateKey,
        newStartTime,
        newEndTime,
        positionId,
      } as const;
    }
    const [
      userId,
      dateKey,
      startTime,
      endTime,
      positionId = '',
    ] = parts;
    return {
      type: 'createShift',
      userId,
      dateKey,
      startTime,
      endTime,
      positionId,
    } as const;
  });
  return {
    version: 'sig:v2',
    type: suggestion.type,
    actions,
  };
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
  return {
    signatureVersion: 'sig:v2' as const,
    signaturePreview,
    signatureHash: sha256HexSync(signature),
  };
};

export const assertSuggestionSignatureInvariant = (suggestion: Suggestion) => {
  if (process.env.NODE_ENV === 'production') return;
  const keys = buildSuggestionCanonicalKeysV2(suggestion);
  const hasUndefined = keys.some(key => key.includes('undefined'));
  if (hasUndefined) {
    throw new Error(`Suggestion signature contains undefined field: ${keys.join(';')}`);
  }
  const canonical = buildSuggestionCanonicalStringV2(suggestion);
  const canonicalAgain = buildSuggestionCanonicalStringV2(suggestion);
  if (canonical !== canonicalAgain) {
    throw new Error('Suggestion signature canonicalization is not deterministic.');
  }
};
