import React, { useEffect, useMemo, useRef } from 'react';
import '../../../styles/scheduler/schedulerPreviewPulse.css';

type PreviewFocus = {
  type: 'suggestion' | 'violation';
  key: string;
} | null;

type SchedulerPreviewPanelProps = {
  weekBlocksDays: Date[][];
  renderWeekTable: (
    weekDaysForBlock: Date[],
    blockIndex: number,
    options?: {
      enableCellRefs?: boolean;
      enableInteractions?: boolean;
    }
  ) => React.ReactNode;
  focus: PreviewFocus;
  highlightCellKeys: string[];
  onApplySuggestionFromCell: (suggestionKey: string) => void;
  selectedSuggestionKey: string | null;
  title?: string;
};

const escapeSelectorValue = (value: string) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"');
};

export const SchedulerPreviewPanel: React.FC<SchedulerPreviewPanelProps> = ({
  weekBlocksDays,
  renderWeekTable,
  focus,
  highlightCellKeys,
  onApplySuggestionFromCell,
  selectedSuggestionKey,
  title = 'Preview'
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const highlightSet = useMemo(() => new Set(highlightCellKeys), [highlightCellKeys]);
  const isSuggestionFocus = focus?.type === 'suggestion' && Boolean(selectedSuggestionKey);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cells = Array.from(
      container.querySelectorAll<HTMLElement>('[data-preview-cell-key]')
    );

    cells.forEach(cell => {
      cell.classList.remove(
        'ml-preview-pulse',
        'ml-preview-focus-suggestion',
        'ml-preview-focus-violation',
        'ml-preview-cell-active'
      );
    });

    if (highlightSet.size === 0) return;

    highlightSet.forEach(key => {
      const selector = `[data-preview-cell-key="${escapeSelectorValue(key)}"]`;
      const cell = container.querySelector<HTMLElement>(selector);
      if (!cell) return;
      cell.classList.add('ml-preview-pulse');
      cell.classList.add(
        focus?.type === 'violation'
          ? 'ml-preview-focus-violation'
          : 'ml-preview-focus-suggestion'
      );
      if (isSuggestionFocus) {
        cell.classList.add('ml-preview-cell-active');
      }
    });
  }, [focus, highlightSet, isSuggestionFocus]);

  if (weekBlocksDays.length === 0) return null;

  return (
    <div className="flex min-h-0 w-full max-w-[720px] flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-500">Asztali előnézet (kattintható cellák)</p>
        </div>
      </div>
      <div
        ref={containerRef}
        className="ml-preview-grid flex-1 overflow-auto px-4 py-3"
        onClick={event => {
          if (!isSuggestionFocus || !selectedSuggestionKey) return;
          const target = event.target as HTMLElement | null;
          const cell = target?.closest<HTMLElement>('[data-preview-cell-key]');
          if (!cell) return;
          const cellKey = cell.dataset.previewCellKey;
          if (!cellKey || !highlightSet.has(cellKey)) return;
          onApplySuggestionFromCell(selectedSuggestionKey);
        }}
      >
        <div className="min-w-fit">
          {renderWeekTable(weekBlocksDays[0], 0, {
            enableCellRefs: false,
            enableInteractions: false
          })}
        </div>
      </div>
    </div>
  );
};
