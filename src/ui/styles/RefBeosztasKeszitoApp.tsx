import React, { useState, useMemo, useRef } from 'react';
import { DASH_STYLE, getBadgeColor } from './schedulerDashStyle';
import { 
  MOCK_EMPLOYEES, 
  buildRange, 
  getShiftForDay, 
  ViewSpan, 
  Employee 
} from './mockSchedulerData';

/**
 * STRICT Full Table PNG Export Helper
 * Captures the entire grid, including off-screen content.
 */
const exportToPng = async (
  contentRef: HTMLElement | null, 
  scrollRef: HTMLElement | null,
  setExporting: (v: boolean) => void
) => {
  if (!contentRef || !scrollRef) return;

  try {
    setExporting(true);
    
    // 1. Wait for fonts and browser layout to settle
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    // 2. Reset scroll to top-left to avoid capture displacement issues
    const originalScrollLeft = scrollRef.scrollLeft;
    const originalScrollTop = scrollRef.scrollTop;
    scrollRef.scrollLeft = 0;
    scrollRef.scrollTop = 0;

    // 3. Dynamic import of html2canvas
    // @ts-ignore
    const html2canvas = (await import('https://esm.sh/html2canvas@1.4.1')).default;
    
    // 4. Measure the full rendered content
    const width = contentRef.scrollWidth;
    const height = contentRef.scrollHeight;

    const captureOptions = {
      scale: 2, // High resolution
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc: Document) => {
        // Double check sticky elements in the clone
        const stickies = clonedDoc.querySelectorAll('.sticky');
        stickies.forEach(s => {
          (s as HTMLElement).style.position = 'static';
          (s as HTMLElement).style.top = 'auto';
          (s as HTMLElement).style.left = 'auto';
          (s as HTMLElement).style.boxShadow = 'none';
        });

        // Ensure the export root is fully expanded
        const root = clonedDoc.querySelector('[data-export-root]') as HTMLElement;
        if (root) {
          root.style.width = `${width}px`;
          root.style.height = `${height}px`;
          root.style.display = 'block';
          root.style.overflow = 'visible';
        }
      }
    };

    try {
      const canvas = await html2canvas(contentRef, captureOptions);
      const link = document.createElement('a');
      link.download = `beosztas-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (scaleErr) {
      console.warn("Retrying at scale 1 due to size constraints", scaleErr);
      const canvas = await html2canvas(contentRef, { ...captureOptions, scale: 1 });
      const link = document.createElement('a');
      link.download = `beosztas-lite-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }

    // 5. Restore original scroll position
    scrollRef.scrollLeft = originalScrollLeft;
    scrollRef.scrollTop = originalScrollTop;
    setExporting(false);
  } catch (e) {
    console.error("Export failed", e);
    setExporting(false);
  }
};

const BeosztasKeszitoApp: React.FC = () => {
  const [viewSpan, setViewSpan] = useState<ViewSpan>('1W');
  const [editMode, setEditMode] = useState(false);
  const [anchorDate, setAnchorDate] = useState(new Date(2026, 4, 12));
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);

  const tableContentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => buildRange(anchorDate, viewSpan), [anchorDate, viewSpan]);

  const changeMonth = (offset: number) => {
    setAnchorDate(prev => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + offset);
      return next;
    });
  };

  const handleExport = () => {
    exportToPng(tableContentRef.current, scrollContainerRef.current, setIsExporting);
  };

  const EngineContent = () => (
    <>
      <div className={DASH_STYLE.panel.scoreCard}>
        <div className={DASH_STYLE.panel.scoreLabel}>Labor Efficiency Score</div>
        <div className={DASH_STYLE.panel.scoreValue}>94.2%</div>
        {!isExporting && (
          <div className="text-[10px] font-bold text-emerald-400 mt-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            Optimal Coverage Detected
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className={DASH_STYLE.panel.header}>Active Violations</div>
        <div className={DASH_STYLE.panel.item}>
          <div className={`${DASH_STYLE.panel.itemTitle} text-rose-500`}>Rest Period Alert</div>
          <p className={DASH_STYLE.panel.itemDesc}>Adám Kovács: Less than 11h break between Mon and Tue shifts.</p>
        </div>

        <div className={DASH_STYLE.panel.header}>AI Suggestions</div>
        <div className={DASH_STYLE.panel.item}>
          <div className={`${DASH_STYLE.panel.itemTitle} text-emerald-600`}>Lunch Peak Coverage</div>
          <p className={DASH_STYLE.panel.itemDesc}>Assign Lilla Kiss to Kitchen on Fri to optimize wait times.</p>
        </div>
      </div>
    </>
  );

  return (
    <div className={`${DASH_STYLE.root} ${isExporting ? 'is-exporting' : ''}`}>
      {/* TOOLBAR */}
      <header className={`${DASH_STYLE.toolbar.container} is-exporting-hide`}>
        <div className={DASH_STYLE.toolbar.identity}>
          <div className={DASH_STYLE.toolbar.logo}>M</div>
          <h1 className={DASH_STYLE.toolbar.title}>Beosztás</h1>
          {viewSpan === 'Month' && (
            <div className="flex items-center gap-1 ml-4 bg-slate-50 border border-slate-100 px-2 py-1 rounded-lg">
               <button onClick={() => changeMonth(-1)} className="text-slate-400 hover:text-slate-600 px-1">‹</button>
               <span className="text-[10px] font-black uppercase text-slate-500 min-w-[80px] text-center">
                 {anchorDate.toLocaleString('default', { month: 'short', year: 'numeric' })}
               </span>
               <button onClick={() => changeMonth(1)} className="text-slate-400 hover:text-slate-600 px-1">›</button>
            </div>
          )}
        </div>

        <div className={DASH_STYLE.toolbar.viewSpanWrapper}>
          {(['1W', '2W', '3W', '4W', 'Month'] as ViewSpan[]).map(v => (
            <button 
              key={v} 
              className={DASH_STYLE.toolbar.viewBtn(viewSpan === v)}
              onClick={() => setViewSpan(v)}
            >
              {v}
            </button>
          ))}
        </div>

        <div className={DASH_STYLE.toolbar.actions}>
          <div 
            className={DASH_STYLE.toolbar.modeToggle(editMode)}
            onClick={() => setEditMode(!editMode)}
          >
            <div className={`w-2 h-2 rounded-full ${editMode ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className="text-[10px] font-black uppercase tracking-[0.1em]">{editMode ? 'Edit' : 'View'}</span>
          </div>
          <button className={DASH_STYLE.toolbar.btnPrimary} onClick={handleExport} disabled={isExporting}>
            {isExporting ? 'Exporting...' : 'Export PNG'}
          </button>
        </div>
      </header>

      <div className={DASH_STYLE.layoutWrapper}>
        <main className={DASH_STYLE.mainArea}>
          <div className={DASH_STYLE.table.container} ref={scrollContainerRef}>
            {/* THIS IS THE EXPORT ROOT */}
            <div ref={tableContentRef} data-export-root className="bg-white inline-block">
              <table className={DASH_STYLE.table.wrapper}>
                <thead>
                  <tr className={DASH_STYLE.table.headerRow}>
                    <th className={`${DASH_STYLE.table.headerCell} ${DASH_STYLE.table.employeeColumn}`}>
                      Staff / Role
                    </th>
                    {days.map((d, i) => (
                      <th key={i} className={DASH_STYLE.table.headerCell}>
                        <div className="flex flex-col">
                          <span className="opacity-50 text-[9px] font-black uppercase tracking-widest">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                          <span className="text-base md:text-xl font-black text-slate-800 tracking-tight leading-none">{d.getDate()}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MOCK_EMPLOYEES.map(emp => (
                    <tr key={emp.id} className={DASH_STYLE.table.row}>
                      <td 
                        className={`${DASH_STYLE.table.employeeCell} ${DASH_STYLE.table.employeeColumn}`}
                        onClick={() => !isExporting && setSelectedEmp(emp)}
                      >
                        <div className="flex items-center gap-3">
                          <img src={emp.avatar} alt="" className={DASH_STYLE.table.avatar} />
                          <div className="flex flex-col min-w-0">
                            <span className={DASH_STYLE.table.empName}>{emp.name}</span>
                            <span className={DASH_STYLE.table.empRole}>{emp.role}</span>
                          </div>
                        </div>
                      </td>
                      {days.map((d, i) => {
                        const shift = getShiftForDay(emp.id, d);
                        return (
                          <td key={i} className={DASH_STYLE.table.cell}>
                            {!shift ? (
                              <div className={DASH_STYLE.table.shift.empty(editMode)}>
                                {editMode && !isExporting && <span className="text-emerald-300 font-black text-xl">+</span>}
                              </div>
                            ) : shift.type === 'off' ? (
                              <div className={DASH_STYLE.table.shift.off}>
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-30">OFF</span>
                              </div>
                            ) : (
                              <div className={`${DASH_STYLE.table.shift.base} ${
                                shift.type === 'suggested' ? DASH_STYLE.table.shift.suggested :
                                shift.type === 'violation' ? DASH_STYLE.table.shift.violation : DASH_STYLE.table.shift.normal
                              }`}>
                                <div>
                                  <span className={DASH_STYLE.table.timeRange}>{shift.time.split(' ')[0]}</span>
                                  <span className={DASH_STYLE.table.posName}>{shift.pos}</span>
                                </div>
                                <div className="flex justify-between items-end">
                                  <span className={`${DASH_STYLE.table.shift.badge} ${getBadgeColor(shift.pos)}`}>
                                    {shift.pos[0]}
                                  </span>
                                  {shift.type === 'violation' && !isExporting && (
                                    <div className={DASH_STYLE.table.shift.dot} />
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>

        <aside className={`${DASH_STYLE.panel.container} is-exporting-hide`}>
          <div className={DASH_STYLE.panel.header}>Operational Engine</div>
          <div className={DASH_STYLE.panel.content}>
            <EngineContent />
          </div>
        </aside>

        {!isExporting && (
          <div className={`${DASH_STYLE.panel.mobileDock} is-exporting-hide`}>
            <div className="flex gap-2">
               <button 
                  className={DASH_STYLE.panel.mobileDockSecondary}
                  onClick={() => setIsDrawerOpen(true)}
                >
                  ⚙️
                </button>
                <button 
                  className={DASH_STYLE.panel.mobileDockSecondary}
                  onClick={() => setEditMode(!editMode)}
                >
                  {editMode ? '👁️' : '✏️'}
                </button>
            </div>
            <button className={DASH_STYLE.panel.mobileDockBtn} onClick={() => setIsDrawerOpen(true)}>
              Engine Insights
            </button>
          </div>
        )}

        {isDrawerOpen && !isExporting && (
          <>
            <div className={DASH_STYLE.panel.mobileDrawerOverlay} onClick={() => setIsDrawerOpen(false)} />
            <div className={DASH_STYLE.panel.mobileDrawer}>
              <div className={DASH_STYLE.panel.drawerHandle} />
              <div className="flex justify-between px-8 mb-4">
                <h2 className="font-black text-2xl text-slate-800 tracking-tight">Engine</h2>
                <button onClick={() => setIsDrawerOpen(false)} className="text-slate-400 font-bold p-2">✕</button>
              </div>
              <div className="overflow-y-auto px-8 pb-16">
                <EngineContent />
              </div>
            </div>
          </>
        )}
      </div>

      {selectedEmp && (
        <div className={DASH_STYLE.profile.overlay}>
          <div className={DASH_STYLE.profile.backdrop} onClick={() => setSelectedEmp(null)} />
          <div className={DASH_STYLE.profile.modal}>
            <img src={selectedEmp.avatar} className={DASH_STYLE.profile.avatar} alt={selectedEmp.name} />
            <h3 className={DASH_STYLE.profile.name}>{selectedEmp.name}</h3>
            <p className={DASH_STYLE.profile.role}>{selectedEmp.role}</p>
            <div className={DASH_STYLE.profile.insight}>
               "Highly reliable team lead with 98% attendance. Preferred for weekend bar rushes and training junior staff members."
            </div>
            <button 
              className={DASH_STYLE.profile.closeBtn}
              onClick={() => setSelectedEmp(null)}
            >
              Close Profile
            </button>
          </div>
        </div>
      )}

      {/* STRICT EXPORT STYLES */}
      <style>{`
        .is-exporting .is-exporting-hide { display: none !important; }
        
        .is-exporting .sticky { 
          position: static !important; 
          top: auto !important; 
          left: auto !important; 
          box-shadow: none !important;
          background-color: #fff !important;
        }

        .is-exporting * { 
          transform: none !important; 
          filter: none !important; 
          animation: none !important; 
          transition: none !important; 
          opacity: 1 !important; 
          box-shadow: none !important;
        }

        .is-exporting [data-export-root] {
          display: block !important;
          background: #ffffff !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        .is-exporting table {
          border-collapse: collapse !important;
        }

        .is-exporting td, .is-exporting th {
          border: 1px solid #e2e8f0 !important;
        }

        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
};

export default BeosztasKeszitoApp;
