import React from 'react';

export type PillPanelSection = {
  id: string;
  label: string;
};

interface PillPanelLayoutProps {
  sections: readonly PillPanelSection[];
  activeId: string;
  onChange: (id: string) => void;
  renderPanel: (activeId: string) => React.ReactNode;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
  idPrefix?: string;
}

const PillPanelLayout: React.FC<PillPanelLayoutProps> = ({
  sections,
  activeId,
  onChange,
  renderPanel,
  onKeyDown,
  ariaLabel,
  idPrefix = 'pill-panel',
}) => {
  return (
    <div className="flex h-full flex-col gap-4 md:flex-row md:gap-6">
      <div className="shrink-0 md:w-56">
        <div className="md:sticky md:top-0">
          <div
            role="tablist"
            aria-label={ariaLabel}
            className="flex items-center gap-2 overflow-x-auto whitespace-nowrap px-1 pb-2 md:flex-col md:items-stretch md:overflow-visible md:px-0 md:pb-0"
          >
            {sections.map(section => {
              const isActive = section.id === activeId;
              return (
                <button
                  key={section.id}
                  type="button"
                  id={`${idPrefix}-tab-${section.id}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`${idPrefix}-panel-${section.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => onChange(section.id)}
                  onKeyDown={onKeyDown}
                  className="rounded-full border px-3 py-1 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                  style={{
                    backgroundColor: isActive ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: isActive ? 'var(--color-text-on-primary)' : 'var(--color-text-secondary)',
                    borderColor: isActive
                      ? 'var(--color-primary)'
                      : 'var(--color-border, rgba(148,163,184,0.4))',
                  }}
                >
                  {section.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          role="tabpanel"
          id={`${idPrefix}-panel-${activeId}`}
          aria-labelledby={`${idPrefix}-tab-${activeId}`}
          className="h-full overflow-y-auto rounded-xl border p-4"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-main)',
          }}
        >
          {renderPanel(activeId)}
        </div>
      </div>
    </div>
  );
};

export default PillPanelLayout;
