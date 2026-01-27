import type { EngineInput, EngineResult, Suggestion } from '../../engine/types.js';
import { runSuggestionPipeline } from '../suggestionPipeline.js';
import type { AssistantResponse, AssistantSuggestion } from './types.js';

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

const toAssistantSuggestion = (suggestion: Suggestion): AssistantSuggestion => ({
  id: buildSuggestionId(suggestion),
  type: suggestion.type,
  severity: 'low',
  explanation: suggestion.explanation,
  expectedImpact: suggestion.expectedImpact,
  actions: suggestion.actions,
});

const sortAssistantSuggestions = (suggestions: AssistantSuggestion[]) =>
  [...suggestions].sort((a, b) => a.id.localeCompare(b.id));

export const buildAssistantResponse = (
  input: EngineInput,
  result: EngineResult
): AssistantResponse => {
  const pipeline = runSuggestionPipeline({
    input,
    result: {
      capacityMap: result.capacityMap,
      violations: result.violations,
      suggestions: result.suggestions,
    },
  });

  const assistantSuggestions = sortAssistantSuggestions(
    pipeline.suggestions.map(toAssistantSuggestion)
  );

  return {
    explanations: pipeline.explanations,
    suggestions: assistantSuggestions,
  };
};

export { buildSuggestionId };
