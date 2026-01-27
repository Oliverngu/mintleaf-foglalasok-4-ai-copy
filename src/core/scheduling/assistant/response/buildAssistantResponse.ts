import type { EngineInput, EngineResult, Suggestion } from '../../engine/types.js';
import { runSuggestionPipeline } from '../suggestionPipeline.js';
import type { DecisionExplanationMeta, Explanation } from '../types.js';
import type { AssistantResponse, AssistantSuggestion } from './types.js';
import type { DecisionRecord } from './decisionTypes.js';
import type { AssistantSession } from '../session/types.js';
import { getSessionDecisions } from '../session/helpers.js';
import { buildDecisionMap, normalizeDecisions } from '../session/decisionUtils.js';
import { normalizeOrResetSession } from '../session/validateSession.js';
import { getSuggestionIdVersion } from './decisionHelpers.js';
import {
  buildAssistantSuggestionIdV1,
  buildAssistantSuggestionIdV2,
} from '../ids/suggestionId.js';
import {
  buildSuggestionSignatureMeta,
  buildSuggestionSignatureV2,
  stringifySuggestionSignature,
} from '../ids/suggestionSignature.js';
import { buildSuggestionExplainability } from '../explainability/buildSuggestionExplainability.js';
import { buildSuggestionAffected } from '../explainability/suggestionAffected.js';

const assertInvariant = (condition: boolean, message: string) => {
  if (process.env.NODE_ENV === 'production') return;
  if (!condition) {
    throw new Error(message);
  }
};

const deepFreeze = (value: unknown, seen = new Set<unknown>()) => {
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  Object.freeze(value);
  const entries = Array.isArray(value) ? value : Object.values(value as object);
  entries.forEach(entry => deepFreeze(entry, seen));
};

export const wasSuggestionAccepted = (
  suggestionId: string,
  decisionMap: Map<string, DecisionRecord['decision']>
): boolean => decisionMap.get(suggestionId) === 'accepted';

export const getDecisionState = (
  suggestionId: string,
  decisionMap: Map<string, DecisionRecord['decision']>,
  includeDecisionState: boolean
): AssistantSuggestion['decisionState'] | undefined => {
  if (!includeDecisionState) return undefined;
  const decision = decisionMap.get(suggestionId);
  if (decision === 'accepted') return 'accepted';
  if (decision === 'rejected') return 'rejected';
  return 'pending';
};

const toAssistantSuggestion = (
  suggestion: Suggestion,
  v1SuggestionId: string,
  v2SuggestionId: string,
  signatureMeta: {
    signatureVersion: 'sig:v2';
    signatureHash: string;
    signaturePreview: string;
  },
  decisionState: AssistantSuggestion['decisionState'] | undefined,
  includeDecisionState: boolean,
  explainability: Pick<AssistantSuggestion, 'why' | 'whyNow' | 'whatIfAccepted'>
): AssistantSuggestion => ({
  id: v2SuggestionId,
  type: suggestion.type,
  severity: 'low',
  why: explainability.why,
  whyNow: explainability.whyNow,
  whatIfAccepted: explainability.whatIfAccepted,
  explanation: suggestion.explanation,
  expectedImpact: suggestion.expectedImpact,
  actions: suggestion.actions,
  meta: { v1SuggestionId, ...signatureMeta },
  ...(includeDecisionState && decisionState ? { decisionState } : {}),
});

const sortAssistantSuggestions = (suggestions: AssistantSuggestion[]) =>
  [...suggestions].sort((a, b) => a.id.localeCompare(b.id));

const buildDecisionExplainability = (decision: DecisionRecord) => {
  const decisionSource = decision.source ?? 'user';
  const decisionReason = decision.reason;
  const decisionWhyNow = decisionReason
    ? `${decisionSource === 'system' ? 'System' : 'User'} decision: ${decision.decision} — ${decisionReason}`
    : undefined;
  const decisionMeta = {
    decisionSource,
    hasDecisionReason: Boolean(decisionReason),
    decisionTimestamp: decision.timestamp ?? undefined,
    decision: decision.decision,
  } satisfies DecisionExplanationMeta;
  return { decisionWhyNow, decisionMeta };
};

export const buildAssistantResponse = (
  input: EngineInput,
  result: EngineResult,
  session?: AssistantSession
): AssistantResponse => {
  if (process.env.NODE_ENV !== 'production') {
    deepFreeze(input);
    deepFreeze(result);
    if (session) deepFreeze(session);
  }

  const pipeline = runSuggestionPipeline({
    input,
    result: {
      capacityMap: result.capacityMap,
      violations: result.violations,
      suggestions: result.suggestions,
    },
  });

  const sessionNow = session?.updatedAt ?? 0;
  const validSession = normalizeOrResetSession(session, input, sessionNow);
  const sessionDecisions = validSession?.decisions?.length
    ? getSessionDecisions(validSession)
    : undefined;
  const includeDecisionState = sessionDecisions !== undefined;
  const versionedDecisions = sessionDecisions?.filter(decision => {
    if (decision.suggestionVersion === 'v2' || decision.suggestionVersion === 'v1') {
      return true;
    }
    if (decision.suggestionVersion !== undefined) return false;
    const version = getSuggestionIdVersion(decision.suggestionId);
    return version === 'v2' || version === 'v1';
  });
  const suggestionIdPairs = pipeline.suggestions.map(suggestion => {
    const v1SuggestionId = buildAssistantSuggestionIdV1(suggestion);
    const v2SuggestionId = buildAssistantSuggestionIdV2(suggestion);
    return { suggestion, v1SuggestionId, v2SuggestionId };
  });
  const v1ToV2SuggestionIds = new Map(
    suggestionIdPairs.map(({ v1SuggestionId, v2SuggestionId }) => [
      v1SuggestionId,
      v2SuggestionId,
    ])
  );
  const resolvedDecisions = versionedDecisions?.map(decision => {
    const mapped = v1ToV2SuggestionIds.get(decision.suggestionId);
    if (!mapped) return decision;
    return {
      ...decision,
      suggestionId: mapped,
    };
  });
  const decisionMap = buildDecisionMap(resolvedDecisions);
  const suggestionsById = new Map(
    suggestionIdPairs.flatMap(({ suggestion, v1SuggestionId, v2SuggestionId }) => [
      [v1SuggestionId, suggestion],
      [v2SuggestionId, suggestion],
    ])
  );
  const violationExplanations = pipeline.explanations.filter(
    explanation => explanation.kind === 'violation'
  );
  const resolveSuggestionExplainability = (suggestionId: string) => {
    const suggestion = suggestionsById.get(suggestionId);
    if (!suggestion) {
      return {
        why: undefined,
        whyNow: undefined,
        whatIfAccepted: undefined,
        relatedConstraintId: undefined,
      };
    }
    return buildSuggestionExplainability(suggestion, violationExplanations);
  };
  const buildDecisionExplanation = (decision: DecisionRecord): Explanation | null => {
    const suggestion = suggestionsById.get(decision.suggestionId);
    if (!suggestion) return null;
    const affected = buildSuggestionAffected(suggestion);
    const { decisionWhyNow, decisionMeta } = buildDecisionExplainability(decision);
    if (decision.decision === 'accepted') {
      return {
        id: `info:suggestion-applied:${decision.suggestionId}`,
        kind: 'info',
        severity: 'low',
        title: 'Suggestion applied',
        details: suggestion.explanation,
        why: suggestion.explanation,
        whyNow: decisionWhyNow,
        whatIfAccepted: suggestion.expectedImpact,
        affected,
        relatedSuggestionId: decision.suggestionId,
        meta: decisionMeta,
      };
    }
    return {
      id: `info:suggestion-dismissed:${decision.suggestionId}`,
      kind: 'info',
      severity: 'low',
      title: 'Suggestion dismissed',
      details: suggestion.explanation,
      whyNow: decisionWhyNow,
      affected,
      relatedSuggestionId: decision.suggestionId,
      meta: decisionMeta,
    };
  };
  const decisionExplanations: Explanation[] = versionedDecisions
    ? normalizeDecisions(resolvedDecisions ?? [])
        .map(buildDecisionExplanation)
        .filter((item): item is Explanation => item !== null)
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const enrichedPipelineExplanations = pipeline.explanations
    .map(explanation => {
      if (explanation.kind !== 'suggestion' || !explanation.relatedSuggestionId) {
        return { ...explanation };
      }
      if (includeDecisionState && wasSuggestionAccepted(explanation.relatedSuggestionId, decisionMap)) {
        return null;
      }
      const explainability = resolveSuggestionExplainability(explanation.relatedSuggestionId);
      return {
        ...explanation,
        why: explainability.why,
        whyNow: explainability.whyNow,
        whatIfAccepted: explainability.whatIfAccepted,
        relatedConstraintId: explanation.relatedConstraintId ?? explainability.relatedConstraintId,
      };
    })
    .filter((item): item is Explanation => item !== null);

  const assistantSuggestions = sortAssistantSuggestions(
    suggestionIdPairs
      .filter(
        ({ suggestion, v2SuggestionId }) =>
          !(
            includeDecisionState &&
            wasSuggestionAccepted(v2SuggestionId, decisionMap)
          )
      )
      .map(({ suggestion, v1SuggestionId, v2SuggestionId }) =>
        toAssistantSuggestion(
          suggestion,
          v1SuggestionId,
          v2SuggestionId,
          buildSuggestionSignatureMeta(suggestion),
          getDecisionState(v2SuggestionId, decisionMap, includeDecisionState),
          includeDecisionState,
          resolveSuggestionExplainability(v2SuggestionId)
        )
      )
  );

  if (process.env.NODE_ENV !== 'production') {
    const collisionMap = new Map<string, { v1Ids: Set<string>; signatures: Set<string> }>();
    suggestionIdPairs.forEach(({ suggestion, v1SuggestionId, v2SuggestionId }) => {
      const signature = stringifySuggestionSignature(buildSuggestionSignatureV2(suggestion));
      const entry = collisionMap.get(v2SuggestionId) ?? {
        v1Ids: new Set<string>(),
        signatures: new Set<string>(),
      };
      entry.v1Ids.add(v1SuggestionId);
      entry.signatures.add(signature);
      collisionMap.set(v2SuggestionId, entry);
    });
    collisionMap.forEach((entry, v2Id) => {
      if (entry.v1Ids.size > 1 || entry.signatures.size > 1) {
        throw new Error(
          `Suggestion ID collision detected for v2Id=${v2Id}; signatures=${[...entry.signatures].join('|')}`
        );
      }
    });
  }

  if (!includeDecisionState) {
    assistantSuggestions.forEach(suggestion => {
      assertInvariant(
        !('decisionState' in suggestion),
        'decisionState must not be set when session is undefined.'
      );
    });
  }

  const suggestionIds = new Set(assistantSuggestions.map(suggestion => suggestion.id));
  const pipelineSuggestionIds = new Set(
    pipeline.explanations
      .map(explanation => explanation.relatedSuggestionId)
      .filter((id): id is string => Boolean(id))
  );
  assistantSuggestions.forEach(suggestion => {
    assertInvariant(
      !wasSuggestionAccepted(suggestion.id, decisionMap),
      `Accepted suggestion must not appear in response: ${suggestion.id}`
    );
  });

  const duplicateIds = assistantSuggestions
    .map(suggestion => suggestion.id)
    .filter((id, index, list) => list.indexOf(id) !== index);
  assertInvariant(
    duplicateIds.length === 0,
    `Duplicate suggestion id detected: ${duplicateIds[0]}`
  );

  const allowedRelatedIds = new Set([
    ...suggestionIds,
    ...pipelineSuggestionIds,
    ...decisionMap.keys(),
  ]);
  const finalExplanations = [...enrichedPipelineExplanations, ...decisionExplanations];
  const explanationIds = finalExplanations.map(explanation => explanation.id);
  const duplicateExplanationIds = explanationIds.filter(
    (id, index, list) => list.indexOf(id) !== index
  );
  assertInvariant(
    duplicateExplanationIds.length === 0,
    `Duplicate explanation id detected: ${duplicateExplanationIds[0]}`
  );
  finalExplanations.forEach(explanation => {
    if (!explanation.relatedSuggestionId) return;
    assertInvariant(
      allowedRelatedIds.has(explanation.relatedSuggestionId),
      `Explanation references missing suggestion id: ${explanation.relatedSuggestionId}`
    );
  });

  return {
    explanations: finalExplanations,
    suggestions: assistantSuggestions,
  };
};
