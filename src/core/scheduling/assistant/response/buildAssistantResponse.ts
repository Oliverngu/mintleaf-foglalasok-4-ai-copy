import type { EngineInput, EngineResult, Suggestion } from '../../engine/types.js';
import { runSuggestionPipeline } from '../suggestionPipeline.js';
import type { Explanation } from '../types.js';
import type { AssistantResponse, AssistantSuggestion } from './types.js';
import type { DecisionRecord } from './decisionTypes.js';

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
  decisions?: DecisionRecord[]
): boolean => {
  if (!decisions) return false;
  return decisions.some(
    decision => decision.suggestionId === suggestionId && decision.decision === 'accepted'
  );
};

export const getDecisionState = (
  suggestionId: string,
  decisions?: DecisionRecord[]
): AssistantSuggestion['decisionState'] | undefined => {
  if (!decisions) return undefined;
  const decision = decisions.find(item => item.suggestionId === suggestionId);
  if (decision?.decision === 'accepted') return 'accepted';
  if (decision?.decision === 'rejected') return 'rejected';
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
  decisions?: DecisionRecord[]
): AssistantResponse => {
  const pipeline = runSuggestionPipeline({
    input,
    result: {
      capacityMap: result.capacityMap,
      violations: result.violations,
      suggestions: result.suggestions,
    },
  });

  const includeDecisionState = decisions !== undefined;
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
  const decisionExplanations: Explanation[] = decisions
    ? decisions
        .map(buildDecisionExplanation)
        .filter((item): item is Explanation => item !== null)
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];

  const assistantSuggestions = sortAssistantSuggestions(
    pipeline.suggestions
      .filter(
        suggestion =>
          !(includeDecisionState && wasSuggestionAccepted(buildSuggestionId(suggestion), decisions))
      )
      .map(suggestion =>
        toAssistantSuggestion(
          suggestion,
          getDecisionState(buildSuggestionId(suggestion), decisions),
          includeDecisionState
        )
      )
  );

  return {
    explanations: [...pipeline.explanations, ...decisionExplanations],
    suggestions: assistantSuggestions,
  };
};

export { buildSuggestionId };
