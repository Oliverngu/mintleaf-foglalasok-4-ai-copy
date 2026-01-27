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
import { buildAssistantSuggestionIdV1 } from '../ids/suggestionId.js';
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
  decisionState: AssistantSuggestion['decisionState'] | undefined,
  includeDecisionState: boolean,
  explainability: Pick<AssistantSuggestion, 'why' | 'whyNow' | 'whatIfAccepted'>
): AssistantSuggestion => ({
  id: buildAssistantSuggestionIdV1(suggestion),
  type: suggestion.type,
  severity: 'low',
  why: explainability.why,
  whyNow: explainability.whyNow,
  whatIfAccepted: explainability.whatIfAccepted,
  explanation: suggestion.explanation,
  expectedImpact: suggestion.expectedImpact,
  actions: suggestion.actions,
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
  const versionedDecisions = sessionDecisions?.filter(
    decision =>
      decision.suggestionVersion === 'v1' ||
      (decision.suggestionVersion === undefined &&
        getSuggestionIdVersion(decision.suggestionId) === 'v1')
  );
  const decisionMap = buildDecisionMap(versionedDecisions);
  const suggestionsById = new Map(
    pipeline.suggestions.map(suggestion => [buildAssistantSuggestionIdV1(suggestion), suggestion])
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
    const suggestion = pipeline.suggestions.find(
      item => buildAssistantSuggestionIdV1(item) === decision.suggestionId
    );
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
    ? normalizeDecisions(versionedDecisions)
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
    pipeline.suggestions
      .filter(
        suggestion =>
          !(
            includeDecisionState &&
            wasSuggestionAccepted(buildAssistantSuggestionIdV1(suggestion), decisionMap)
          )
      )
      .map(suggestion =>
        toAssistantSuggestion(
          suggestion,
          getDecisionState(buildAssistantSuggestionIdV1(suggestion), decisionMap, includeDecisionState),
          includeDecisionState,
          resolveSuggestionExplainability(buildAssistantSuggestionIdV1(suggestion))
        )
      )
  );

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
