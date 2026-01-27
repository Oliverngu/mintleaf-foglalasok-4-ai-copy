import type { EngineInput, EngineResult, Suggestion } from '../../engine/types.js';
import { runSuggestionPipeline } from '../suggestionPipeline.js';
import type { Explanation } from '../types.js';
import type { AssistantResponse, AssistantSuggestion } from './types.js';
import type { DecisionRecord } from './decisionTypes.js';
import type { AssistantSession } from '../session/types.js';
import { getSessionDecisions } from '../session/helpers.js';
import { buildDecisionMap, normalizeDecisions } from '../session/decisionUtils.js';

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

const buildActionKey = (action: Suggestion['actions'][number]) => {
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

const buildSuggestionId = (suggestion: Suggestion) =>
  [
    'assistant-suggestion',
    suggestion.type,
    suggestion.actions.map(buildActionKey).join(';'),
    suggestion.expectedImpact,
    suggestion.explanation,
  ].join(':');

const buildSuggestionAffected = (suggestion: Suggestion) => {
  const userIds: string[] = [];
  const shiftIds: string[] = [];
  const dateKeys: string[] = [];
  const positionIds: string[] = [];

  suggestion.actions.forEach(action => {
    userIds.push(action.userId);
    if (action.type === 'moveShift') {
      shiftIds.push(action.shiftId);
      dateKeys.push(action.dateKey);
      if (action.positionId) positionIds.push(action.positionId);
    } else {
      dateKeys.push(action.dateKey);
      if (action.positionId) positionIds.push(action.positionId);
    }
  });

  return {
    userIds: Array.from(new Set(userIds)).sort(),
    shiftIds: Array.from(new Set(shiftIds)).sort(),
    dateKeys: Array.from(new Set(dateKeys)).sort(),
    positionId: positionIds.sort()[0],
  };
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
  includeDecisionState: boolean
): AssistantSuggestion => ({
  id: buildSuggestionId(suggestion),
  type: suggestion.type,
  severity: 'low',
  explanation: suggestion.explanation,
  expectedImpact: suggestion.expectedImpact,
  actions: suggestion.actions,
  ...(includeDecisionState && decisionState ? { decisionState } : {}),
});

const sortAssistantSuggestions = (suggestions: AssistantSuggestion[]) =>
  [...suggestions].sort((a, b) => a.id.localeCompare(b.id));

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

  const sessionDecisions = session?.decisions?.length
    ? getSessionDecisions(session)
    : undefined;
  const includeDecisionState = sessionDecisions !== undefined;
  const decisionMap = buildDecisionMap(sessionDecisions);
  const buildDecisionExplanation = (decision: DecisionRecord): Explanation | null => {
    const suggestion = pipeline.suggestions.find(
      item => buildSuggestionId(item) === decision.suggestionId
    );
    if (!suggestion) return null;
    const affected = buildSuggestionAffected(suggestion);
    if (decision.decision === 'accepted') {
      return {
        id: `info:suggestion-applied:${decision.suggestionId}`,
        kind: 'info',
        severity: 'low',
        title: 'Suggestion applied',
        details: suggestion.explanation,
        why: suggestion.explanation,
        whatIfAccepted: suggestion.expectedImpact,
        affected,
        relatedSuggestionId: decision.suggestionId,
      };
    }
    return {
      id: `info:suggestion-dismissed:${decision.suggestionId}`,
      kind: 'info',
      severity: 'low',
      title: 'Suggestion dismissed',
      details: suggestion.explanation,
      affected,
      relatedSuggestionId: decision.suggestionId,
    };
  };
  const decisionExplanations: Explanation[] = sessionDecisions
    ? normalizeDecisions(sessionDecisions)
        .map(buildDecisionExplanation)
        .filter((item): item is Explanation => item !== null)
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];

  const assistantSuggestions = sortAssistantSuggestions(
    pipeline.suggestions
      .filter(
        suggestion =>
          !(
            includeDecisionState &&
            wasSuggestionAccepted(buildSuggestionId(suggestion), decisionMap)
          )
      )
      .map(suggestion =>
        toAssistantSuggestion(
          suggestion,
          getDecisionState(buildSuggestionId(suggestion), decisionMap, includeDecisionState),
          includeDecisionState
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
  [...pipeline.explanations, ...decisionExplanations].forEach(explanation => {
    if (!explanation.relatedSuggestionId) return;
    assertInvariant(
      allowedRelatedIds.has(explanation.relatedSuggestionId),
      `Explanation references missing suggestion id: ${explanation.relatedSuggestionId}`
    );
  });

  return {
    explanations: [...pipeline.explanations, ...decisionExplanations],
    suggestions: assistantSuggestions,
  };
};

export { buildSuggestionId };
