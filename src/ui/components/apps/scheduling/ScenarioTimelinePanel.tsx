import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ConstraintViolation,
  EngineResult,
  MinCoverageRule
} from '../../../../core/scheduling/engine/types';
import type { Scenario } from '../../../../core/scheduling/scenarios/types';
import type { Position, User } from '../../../../core/models/data';
import {
  describeScenario,
  buildSuggestionKey,
  buildViolationKey,
  buildSuggestionViolationLinks,
  describeSuggestionActionCompact,
  filterSuggestionViolationLinksByFocus,
  filterRulesByFocus,
  formatScenarioMeta,
  formatTimeRangeLabel,
  getRuleSummaryLabel,
  getScenarioFocusTimeOptions,
  getViolationDetail,
  labelViolation,
  sortScenariosForTimeline,
  summarizeViolationsForSuggestion,
  summarizeSuggestions,
  summarizeViolations,
  summarizeViolationsBySeverity
} from './ScenarioTimelineUtils';

const RULES_PREVIEW_COUNT = 3;

type ScenarioTimelinePanelProps = {
  engineResult: EngineResult;
  scenarios: Scenario[];
  positions: Position[];
  users: User[];
  weekDays: string[];
  selectedDateKey?: string;
  onAcceptSuggestion: (suggestionKey: string) => void;
  onUndoSuggestion: () => void;
  canUndoSuggestion: boolean;
  onClose: () => void;
};

type ResolvedViolationItem = {
  key: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
};

const buildRuleKey = (rule: MinCoverageRule) => {
  const dateKeys = (rule.dateKeys ?? []).slice().sort().join(',');
  return `${rule.positionId}|${rule.startTime}-${rule.endTime}|${rule.minCount}|${dateKeys}`;
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
        {visibleRules.map(rule => (
          <li key={buildRuleKey(rule)} className="rounded bg-gray-50 px-3 py-2">
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
          {showAll ? 'Mutass kevesebbet' : 'Mutass többet'}
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
  onAcceptSuggestion,
  onUndoSuggestion,
  canUndoSuggestion,
  onClose
}) => {
  const [showAllBeforeRules, setShowAllBeforeRules] = useState(false);
  const [showAllAfterRules, setShowAllAfterRules] = useState(false);
  const [activeDateKey, setActiveDateKey] = useState(selectedDateKey ?? weekDays[0] ?? '');
  const [selectedTimeKey, setSelectedTimeKey] = useState('ALL_DAY');

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

  const timeOptions = useMemo(
    () => getScenarioFocusTimeOptions(activeScenarios, activeDateKey),
    [activeScenarios, activeDateKey]
  );

  useEffect(() => {
    if (!activeDateKey) {
      const fallbackDate = selectedDateKey ?? weekDays[0] ?? '';
      if (fallbackDate) setActiveDateKey(fallbackDate);
    }
  }, [activeDateKey, selectedDateKey, weekDays]);

  useEffect(() => {
    if (!timeOptions.some(option => option.key === selectedTimeKey)) {
      setSelectedTimeKey(timeOptions[0]?.key ?? 'ALL_DAY');
    }
  }, [timeOptions, selectedTimeKey]);

  const selectedTimeOption = useMemo(
    () => timeOptions.find(option => option.key === selectedTimeKey) ?? timeOptions[0],
    [timeOptions, selectedTimeKey]
  );

  const focusWindow = useMemo(
    () => ({
      dateKey: activeDateKey,
      timeRange: selectedTimeOption?.timeRange
    }),
    [activeDateKey, selectedTimeOption]
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
  const ruleDiffCounts = useMemo(() => {
    if (!ruleDiff) {
      return { added: 0, removed: 0, unchanged: 0 };
    }
    const beforeKeys = new Set(beforeRules.map(buildRuleKey));
    const afterKeys = new Set(afterRules.map(buildRuleKey));
    let added = 0;
    let removed = 0;
    let unchanged = 0;
    afterKeys.forEach(key => {
      if (beforeKeys.has(key)) {
        unchanged += 1;
      } else {
        added += 1;
      }
    });
    beforeKeys.forEach(key => {
      if (!afterKeys.has(key)) {
        removed += 1;
      }
    });
    return { added, removed, unchanged };
  }, [afterRules, beforeRules, ruleDiff]);

  const violationSummary = useMemo(
    () => summarizeViolations(engineResult.violations),
    [engineResult.violations]
  );
  const violationBreakdown = useMemo(
    () => summarizeViolationsBySeverity(engineResult.violations),
    [engineResult.violations]
  );
  const suggestionSummary = useMemo(
    () => summarizeSuggestions(engineResult.suggestions, userNameById, positionNameById),
    [engineResult.suggestions, userNameById, positionNameById]
  );
  const linkIndex = useMemo(
    () =>
      buildSuggestionViolationLinks(
        engineResult.violations,
        engineResult.suggestions,
        userNameById,
        positionNameById
      ),
    [engineResult.violations, engineResult.suggestions, positionNameById, userNameById]
  );
  const focusLinkIndex = useMemo(
    () =>
      filterSuggestionViolationLinksByFocus(
        linkIndex,
        focusWindow,
        engineResult.violations,
        engineResult.suggestions
      ),
    [engineResult.suggestions, engineResult.violations, focusWindow, linkIndex]
  );

  const topViolations = engineResult.violations.slice(0, 3);
  const [selectedSuggestionKey, setSelectedSuggestionKey] = useState<string | null>(null);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const suggestionRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const focusLabel = `${focusWindow.dateKey} · ${formatTimeRangeLabel(focusWindow.timeRange)}`;
  const focusSuggestionKeys = useMemo(() => {
    const keys = new Set<string>();
    focusLinkIndex.suggestionToViolations.forEach((violationKeys, suggestionKey) => {
      if (violationKeys.length > 0) {
        keys.add(suggestionKey);
      }
    });
    return keys;
  }, [focusLinkIndex]);
  const baseSuggestions = useMemo(() => {
    if (focusSuggestionKeys.size === 0) {
      return engineResult.suggestions;
    }
    return engineResult.suggestions.filter(suggestion =>
      focusSuggestionKeys.has(buildSuggestionKey(suggestion))
    );
  }, [engineResult.suggestions, focusSuggestionKeys]);
  const visibleSuggestions = showAllSuggestions
    ? baseSuggestions
    : baseSuggestions.slice(0, 5);
  const suggestionCards = visibleSuggestions.map((suggestion, index) => {
    const key = buildSuggestionKey(suggestion);
    return {
      suggestion,
      key,
      index
    };
  });
  const [appliedSuggestionKeys, setAppliedSuggestionKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [appliedSuggestionOrder, setAppliedSuggestionOrder] = useState<string[]>([]);
  const [resolvedViolationKeys, setResolvedViolationKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [resolvedViolationItems, setResolvedViolationItems] = useState<ResolvedViolationItem[]>(
    []
  );
  const [resolvedViolationStack, setResolvedViolationStack] = useState<string[][]>([]);
  const [resolvedItemsStack, setResolvedItemsStack] = useState<ResolvedViolationItem[][]>([]);
  const [pendingAccept, setPendingAccept] = useState<{
    suggestionKey: string;
    previousViolations: ConstraintViolation[];
  } | null>(null);
  const buildResolvedLabel = useCallback(
    (violation: ConstraintViolation): ResolvedViolationItem => {
      const detail = getViolationDetail(violation, positionNameById);
      const dateLabel = violation.affected.dateKeys?.[0];
      const slotLabel = violation.affected.slots?.[0];
      const label = [labelViolation(violation), detail, dateLabel, slotLabel]
        .filter(Boolean)
        .join(' · ');
      return {
        key: buildViolationKey(violation),
        label,
        severity: violation.severity
      };
    },
    [positionNameById]
  );

  useEffect(() => {
    if (!pendingAccept) return;
    const beforeKeys = new Set(
      pendingAccept.previousViolations.map(violation => buildViolationKey(violation))
    );
    const afterKeys = new Set(engineResult.violations.map(violation => buildViolationKey(violation)));
    const resolvedKeys = Array.from(beforeKeys).filter(key => !afterKeys.has(key));
    const resolvedItems = pendingAccept.previousViolations
      .filter(violation => resolvedKeys.includes(buildViolationKey(violation)))
      .map(buildResolvedLabel);

    setAppliedSuggestionKeys(prev => {
      const next = new Set(prev);
      next.add(pendingAccept.suggestionKey);
      return next;
    });
    setAppliedSuggestionOrder(prev => [...prev, pendingAccept.suggestionKey]);
    setResolvedViolationKeys(prev => new Set([...prev, ...resolvedKeys]));
    setResolvedViolationItems(prev => [...prev, ...resolvedItems]);
    setResolvedViolationStack(prev => [...prev, resolvedKeys]);
    setResolvedItemsStack(prev => [...prev, resolvedItems]);
    setPendingAccept(null);
  }, [buildResolvedLabel, engineResult.violations, pendingAccept]);

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
      <div className="border-b px-5 py-4">
        <div className="flex flex-col gap-3 text-xs font-semibold text-gray-600">
          <div>
            <span className="block text-[10px] uppercase tracking-[0.2em] text-gray-400">Nap</span>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
              {weekDays.map(dayKey => (
                <button
                  key={dayKey}
                  type="button"
                  onClick={() => setActiveDateKey(dayKey)}
                  className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    dayKey === activeDateKey
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {dayKey}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-[0.2em] text-gray-400">Idősáv</span>
            <select
              value={selectedTimeOption?.key ?? 'ALL_DAY'}
              onChange={event => setSelectedTimeKey(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700"
            >
              {timeOptions.map(option => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="overflow-y-auto px-5 pb-6 pt-5">
        <div className="relative">
          <div className="absolute left-4 top-4 h-full w-px bg-gray-200" />
          <div className="space-y-10">
            <div className="relative pl-12">
              <div className="absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-semibold text-gray-500 shadow-sm">
                1
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                Original Context
              </span>
              <h3 className="mt-1 text-base font-semibold text-gray-900">Kiinduló lefedettség</h3>
              <p className="mt-1 text-xs text-gray-500">
                A részletes szabálylista és a változások a Rule Diff blokkban találhatók.
              </p>
            </div>

            <div className="relative pl-12">
              <div className="absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white shadow">
                2
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-indigo-600">
                The Change
              </span>
              <h3 className="mt-1 text-base font-semibold text-gray-900">Alkalmazott scenáriók</h3>
              <p className="mt-1 text-xs text-gray-500">Mit és hogyan módosítanak a scenáriók.</p>
              <div className="mt-4 space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/80 p-4 shadow-sm sm:-rotate-1 sm:origin-top-left">
                {activeScenarios.length === 0 ? (
                  <p className="text-sm text-indigo-800/70">Nincs aktív scenárió.</p>
                ) : (
                  activeScenarios.map(scenario => {
                    const meta = formatScenarioMeta(scenario, userNameById, positionNameById);
                    return (
                      <div key={scenario.id} className="rounded-xl border border-indigo-100 bg-white/80 p-3">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
                          <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-white">
                            {scenario.type}
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-indigo-700">
                            {scenario.inheritMode ?? 'ADD'}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-gray-600">
                          {meta.dateLabel && (
                            <span className="font-semibold text-gray-700">{meta.dateLabel}</span>
                          )}
                          {meta.timeLabel && (
                            <span className="ml-2 text-gray-500">· {meta.timeLabel}</span>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-gray-700">
                          {describeScenario(scenario, userNameById, positionNameById)}
                        </p>
                        {meta.overrideLabel && (
                          <p className="mt-1 text-xs text-indigo-700">
                            Lefedettség: {meta.overrideLabel}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
                {engineResult.scenarioEffects && (
                  <div className="rounded-xl border border-indigo-200 bg-white/90 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-400">
                      Összesített heti hatás
                    </div>
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
                  </div>
                )}
              </div>
            </div>

            <div className="relative pl-12">
              <div className="absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-xs font-semibold text-white shadow">
                3
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-red-200">
                The Outcome
              </span>
              <h3 className="mt-1 text-base font-semibold text-gray-900">Végső állapot</h3>
              <p className="mt-1 text-xs text-gray-500">A fókusz szerinti végeredmény és következmények.</p>
              <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                      Rule Diff
                    </div>
                    <h4 className="mt-1 text-sm font-semibold text-gray-700">Before / After rules</h4>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] font-semibold">
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-700">
                      Added: {ruleDiffCounts.added}
                    </span>
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">
                      Removed: {ruleDiffCounts.removed}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                      Unchanged: {ruleDiffCounts.unchanged}
                    </span>
                  </div>
                </div>
                {!ruleDiff ? (
                  <p className="mt-3 text-xs text-gray-500">
                    Nincs rule diff adat (engineResult.scenarioEffects.ruleDiff hiányzik).
                  </p>
                ) : (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                        Before rules
                      </div>
                      <div className="mt-2">
                        {renderRuleList(beforeRules, positionNameById, showAllBeforeRules, () =>
                          setShowAllBeforeRules(prev => !prev)
                        )}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-gray-100 bg-white p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                        After rules
                      </div>
                      <div className="mt-2">
                        {renderRuleList(afterRules, positionNameById, showAllAfterRules, () =>
                          setShowAllAfterRules(prev => !prev)
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-red-700">Violations</span>
                  <span className="text-xs text-red-400">{violationSummary.total} összesen</span>
                </div>
                {violationSummary.total === 0 ? (
                  <p className="mt-2 text-sm text-red-300">Nincs aktív megsértés.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-white px-2 py-0.5 text-green-700">
                        Low: {violationBreakdown.low}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-amber-700">
                        Medium: {violationBreakdown.medium}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-red-700">
                        High: {violationBreakdown.high}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-gray-600">
                        Max: {violationBreakdown.highestSeverity ?? '-'}
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {topViolations.map((violation, index) => {
                        const detail = getViolationDetail(violation, positionNameById);
                        const violationRefKey = focusLinkIndex.violationsByKey.get(
                          buildViolationKey(violation)
                        )?.key;
                        const suggestionKeys = violationRefKey
                          ? focusLinkIndex.violationToSuggestions.get(violationRefKey) ?? []
                          : [];
                        const suggestionCandidates = suggestionKeys
                          .map(key => focusLinkIndex.suggestionsByKey.get(key))
                          .filter((ref): ref is NonNullable<typeof ref> => Boolean(ref));
                        return (
                          <li
                            key={`${violation.constraintId}-${index}`}
                            className="rounded-xl border border-red-100 bg-white px-3 py-2 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-red-700">
                                {labelViolation(violation)}
                              </span>
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                                {violation.severity}
                              </span>
                            </div>
                            <p className="text-gray-600">{violation.message}</p>
                            {detail && <p className="text-gray-400">{detail}</p>}
                            {suggestionCandidates.length > 0 && (
                              <div className="mt-2">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-300">
                                  Fix candidates
                                </div>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {suggestionCandidates.slice(0, 3).map(ref => (
                                    <button
                                      key={ref.key}
                                      type="button"
                                      onClick={() => {
                                        setSelectedSuggestionKey(ref.key);
                                        suggestionRefs.current.get(ref.key)?.scrollIntoView({
                                          behavior: 'smooth',
                                          block: 'center'
                                        });
                                      }}
                                      className="rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-100"
                                    >
                                      {ref.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {resolvedViolationItems.length > 0 && (
                  <div className="mt-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-green-500">
                      Resolved ({resolvedViolationKeys.size})
                    </div>
                    <ul className="mt-2 space-y-2">
                      {resolvedViolationItems.map(item => (
                        <li
                          key={item.key}
                          className="flex items-center justify-between rounded-xl border border-green-100 bg-green-50/60 px-3 py-2 text-xs text-green-700"
                        >
                          <span className="flex items-center gap-2">
                            <span className="text-green-600">✔</span>
                            {item.label}
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-green-700">
                            Resolved
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4">
                <div className="text-sm font-semibold text-gray-700">Suggested Fixes</div>
                {suggestionSummary.total === 0 ? (
                  <p className="mt-2 text-xs text-gray-500">Nincs javaslat.</p>
                ) : (
                  <div className="mt-2 space-y-2 text-xs text-gray-600">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600">
                        Átmozgatás: {suggestionSummary.byType.SHIFT_MOVE_SUGGESTION}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600">
                        Új műszak: {suggestionSummary.byType.ADD_SHIFT_SUGGESTION}
                      </span>
                    </div>
                    {suggestionSummary.firstActionLabel && (
                      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                        {suggestionSummary.firstActionLabel}
                      </p>
                    )}
                    <div className="space-y-2">
                      {suggestionCards.map(card => {
                        const suggestionRef = focusLinkIndex.suggestionsByKey.get(card.key);
                        const violationKeys = focusLinkIndex.suggestionToViolations.get(card.key) ?? [];
                        const violationRefs = violationKeys
                          .map(key => focusLinkIndex.violationsByKey.get(key))
                          .filter((ref): ref is NonNullable<typeof ref> => Boolean(ref));
                        const isSelected = selectedSuggestionKey === card.key;
                        const focusSummary = isSelected
                          ? summarizeViolationsForSuggestion(card.key, focusLinkIndex)
                          : null;
                        const summary =
                          isSelected && focusSummary && focusSummary.total === 0
                            ? summarizeViolationsForSuggestion(card.key, linkIndex)
                            : focusSummary;
                        const actionLabel = isSelected
                          ? describeSuggestionActionCompact(card.suggestion, userNameById, positionNameById)
                          : '';
                        const isApplied = appliedSuggestionKeys.has(card.key);
                        return (
                          <div
                            key={card.key}
                            ref={node => {
                              suggestionRefs.current.set(card.key, node);
                            }}
                            className={`rounded-xl border px-3 py-2 text-xs ${
                              isApplied
                                ? 'border-emerald-200 bg-emerald-50/60 opacity-80'
                                : selectedSuggestionKey === card.key
                                  ? 'border-indigo-300 bg-indigo-50/60'
                                  : 'border-gray-100 bg-white'
                            }`}
                            onClick={() => {
                              setSelectedSuggestionKey(card.key);
                              suggestionRefs.current.get(card.key)?.scrollIntoView({
                                behavior: 'smooth',
                                block: 'center'
                              });
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-semibold text-gray-700">
                                {suggestionRef?.label ?? `Javaslat #${card.index + 1}`}
                              </div>
                              {isApplied && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  <span>✔</span>
                                  Applied
                                </span>
                              )}
                            </div>
                            {violationRefs.length > 0 && (
                              <div className="mt-1">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                                  Addresses
                                </div>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {violationRefs.slice(0, 2).map(ref => (
                                    <span
                                      key={ref.key}
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                        ref.severity === 'high'
                                          ? 'bg-red-100 text-red-600'
                                          : ref.severity === 'medium'
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-green-100 text-green-700'
                                      }`}
                                    >
                                      {ref.label}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {isSelected && summary && (
                              <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-700">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-400">
                                  Expected impact
                                </div>
                                {summary.total === 0 ? (
                                  <p className="mt-1 text-xs text-indigo-700">
                                    No linked violations detected.
                                  </p>
                                ) : (
                                  <div className="mt-1 space-y-1">
                                    <p>
                                      Addresses: {summary.total} (High {summary.high} · Med{' '}
                                      {summary.medium} · Low {summary.low})
                                    </p>
                                    {summary.topLabels.length > 0 && (
                                      <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-indigo-600">
                                        {summary.topLabels.map((label, index) => (
                                          <li key={`${label}-${index}`}>{label}</li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                )}
                                {actionLabel && (
                                  <p className="mt-1">Action: {actionLabel}</p>
                                )}
                              </div>
                            )}
                            {isSelected && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={event => {
                                    event.stopPropagation();
                                    setPendingAccept({
                                      suggestionKey: card.key,
                                      previousViolations: engineResult.violations
                                    });
                                    onAcceptSuggestion(card.key);
                                  }}
                                  className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                                >
                                  Alkalmaz
                                </button>
                                {canUndoSuggestion && (
                                  <button
                                    type="button"
                                    onClick={event => {
                                      event.stopPropagation();
                                      setPendingAccept(null);
                                      setAppliedSuggestionOrder(prev => {
                                        if (prev.length === 0) return prev;
                                        const next = [...prev];
                                        const removedKey = next.pop();
                                        if (removedKey) {
                                          setAppliedSuggestionKeys(current => {
                                            const nextKeys = new Set(current);
                                            nextKeys.delete(removedKey);
                                            return nextKeys;
                                          });
                                        }
                                        return next;
                                      });
                                      setResolvedViolationStack(prev => {
                                        if (prev.length === 0) return prev;
                                        const next = [...prev];
                                        const removed = next.pop() ?? [];
                                        setResolvedViolationKeys(current => {
                                          const nextKeys = new Set(current);
                                          removed.forEach(key => nextKeys.delete(key));
                                          return nextKeys;
                                        });
                                        return next;
                                      });
                                      setResolvedItemsStack(prev => {
                                        if (prev.length === 0) return prev;
                                        const next = [...prev];
                                        const removedItems = next.pop() ?? [];
                                        setResolvedViolationItems(current =>
                                          current.filter(item =>
                                            !removedItems.some(removed => removed.key === item.key)
                                          )
                                        );
                                        return next;
                                      });
                                      onUndoSuggestion();
                                    }}
                                    className="rounded-lg border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                                  >
                                    Visszavonás
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {baseSuggestions.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setShowAllSuggestions(prev => !prev)}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        {showAllSuggestions ? 'Kevesebb javaslat' : 'Összes javaslat megjelenítése'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
