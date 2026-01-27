import React, { useMemo, useState } from 'react';
import type { EngineResult, MinCoverageRule } from '../../../../core/scheduling/engine/types';
import type { Scenario } from '../../../../core/scheduling/scenarios/types';
import type { Position, User } from '../../../../core/models/data';
import {
  buildFocusWindow,
  describeScenario,
  filterRulesByFocus,
  formatTimeRangeLabel,
  getRuleSummaryLabel,
  getSuggestionSummary,
  getViolationDetail,
  labelViolation,
  sortScenariosForTimeline,
  summarizeViolations
} from './ScenarioTimelineUtils';

const RULES_PREVIEW_COUNT = 3;

type ScenarioTimelinePanelProps = {
  engineResult: EngineResult;
  scenarios: Scenario[];
  positions: Position[];
  users: User[];
  weekDays: string[];
  selectedDateKey?: string;
  onClose: () => void;
};

const renderRuleList = (
  rules: MinCoverageRule[],
  positionNameById: Map<string, string>,
  showAll: boolean,
  onToggle: () => void
) => {
  if (rules.length === 0) {
    return <p className="text-sm text-gray-500">Nincs lefedettségi szabály.</p>;
  }
  const visibleRules = showAll ? rules : rules.slice(0, RULES_PREVIEW_COUNT);
  return (
    <div>
      <ul className="space-y-2 text-sm text-gray-700">
        {visibleRules.map((rule, index) => (
          <li key={`${rule.positionId}-${rule.startTime}-${index}`} className="rounded bg-gray-50 px-3 py-2">
            {getRuleSummaryLabel(rule, positionNameById)}
          </li>
        ))}
      </ul>
      {rules.length > RULES_PREVIEW_COUNT && (
        <button
          type="button"
          onClick={onToggle}
          className="mt-2 text-xs font-semibold text-green-700 hover:text-green-800"
        >
          {showAll ? 'Kevesebb' : 'További szabályok'}
        </button>
      )}
    </div>
  );
};

export const ScenarioTimelinePanel: React.FC<ScenarioTimelinePanelProps> = ({
  engineResult,
  scenarios,
  positions,
  users,
  weekDays,
  selectedDateKey,
  onClose
}) => {
  const [showAllBefore, setShowAllBefore] = useState(false);
  const [showAllAfter, setShowAllAfter] = useState(false);

  const positionNameById = useMemo(
    () => new Map(positions.map(position => [position.id, position.name])),
    [positions]
  );
  const userNameById = useMemo(
    () => new Map(users.map(user => [user.id, user.fullName])),
    [users]
  );

  const activeScenarios = useMemo(
    () => sortScenariosForTimeline(scenarios),
    [scenarios]
  );

  const focusWindow = useMemo(
    () => buildFocusWindow(weekDays, activeScenarios, selectedDateKey),
    [weekDays, activeScenarios, selectedDateKey]
  );

  const ruleDiff = engineResult.scenarioEffects?.ruleDiff;
  const beforeRules = useMemo(
    () => filterRulesByFocus(ruleDiff?.before ?? [], focusWindow),
    [ruleDiff, focusWindow]
  );
  const afterRules = useMemo(
    () => filterRulesByFocus(ruleDiff?.after ?? [], focusWindow),
    [ruleDiff, focusWindow]
  );

  const violationSummary = useMemo(
    () => summarizeViolations(engineResult.violations),
    [engineResult.violations]
  );

  const topViolations = engineResult.violations.slice(0, 3);
  const focusLabel = `${focusWindow.dateKey} · ${formatTimeRangeLabel(focusWindow.timeRange)}`;

  return (
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">Scenario Timeline</h2>
          <p className="text-xs text-gray-500">Fókusz: {focusLabel}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border px-3 py-1 text-sm font-semibold text-gray-600 hover:bg-gray-100"
        >
          Bezár
        </button>
      </div>
      <div className="overflow-y-auto p-5">
        <div className="relative">
          <div className="absolute left-3 top-3 h-full w-px bg-gray-200" />
          <div className="space-y-8">
            <div className="relative pl-10">
              <div className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold">
                1
              </div>
              <h3 className="text-base font-semibold">Original Context</h3>
              <p className="mt-1 text-xs text-gray-500">Kiinduló lefedettségi szabályok</p>
              <div className="mt-3">
                {renderRuleList(beforeRules, positionNameById, showAllBefore, () =>
                  setShowAllBefore(prev => !prev)
                )}
              </div>
            </div>

            <div className="relative pl-10">
              <div className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-xs font-semibold text-white">
                2
              </div>
              <h3 className="text-base font-semibold">The Change</h3>
              <p className="mt-1 text-xs text-gray-500">Alkalmazott scenáriók</p>
              <div className="mt-3 space-y-3">
                {activeScenarios.length === 0 ? (
                  <p className="text-sm text-gray-500">Nincs aktív scenárió.</p>
                ) : (
                  activeScenarios.map(scenario => (
                    <div key={scenario.id} className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-indigo-600 px-2 py-0.5 font-semibold text-white">
                          {scenario.type}
                        </span>
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 font-semibold text-gray-700">
                          {scenario.inheritMode ?? 'ADD'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-gray-700">
                        {describeScenario(scenario, userNameById, positionNameById)}
                      </p>
                      {engineResult.scenarioEffects && (
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                          <span className="rounded-full bg-white px-2 py-0.5 text-green-700">
                            +{engineResult.scenarioEffects.addedRulesCount} szabály
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-amber-700">
                            {engineResult.scenarioEffects.overriddenRulesCount} felülírás
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-red-700">
                            {engineResult.scenarioEffects.removedShiftsCount} törölt műszak
                          </span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="relative pl-10">
              <div className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-xs font-semibold text-white">
                3
              </div>
              <h3 className="text-base font-semibold">The Outcome</h3>
              <p className="mt-1 text-xs text-gray-500">Végső lefedettségi igények és következmények</p>
              <div className="mt-3">
                {renderRuleList(afterRules, positionNameById, showAllAfter, () =>
                  setShowAllAfter(prev => !prev)
                )}
              </div>
              <div className="mt-4 rounded-xl border bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Violations</span>
                  <span className="text-xs text-gray-500">
                    {violationSummary.total} összesen
                  </span>
                </div>
                {violationSummary.total === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">Nincs aktív megsértés.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <div className="text-xs font-semibold text-gray-600">
                      Legmagasabb súlyosság: {violationSummary.highestSeverity}
                    </div>
                    <ul className="space-y-2">
                      {topViolations.map((violation, index) => {
                        const detail = getViolationDetail(violation, positionNameById);
                        return (
                          <li
                            key={`${violation.constraintId}-${index}`}
                            className="rounded bg-gray-50 px-3 py-2 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{labelViolation(violation)}</span>
                              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold">
                                {violation.severity}
                              </span>
                            </div>
                            <p className="text-gray-600">{violation.message}</p>
                            {detail && <p className="text-gray-400">{detail}</p>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
              <div className="mt-3">
                <details className="rounded-xl border bg-white p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-700">
                    Suggested Fixes
                  </summary>
                  <p className="mt-2 text-xs text-gray-500">
                    {getSuggestionSummary(engineResult.suggestions)}
                  </p>
                </details>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
