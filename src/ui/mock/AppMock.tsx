import React, { useState } from 'react';
import { DASH_STYLE, getBadgeStyle } from './styles';

// --- MOCK DATA ---
const DAYS = [
  { label: 'Mon', date: '01' },
  { label: 'Tue', date: '02' },
  { label: 'Wed', date: '03' },
  { label: 'Thu', date: '04' },
  { label: 'Fri', date: '05' },
  { label: 'Sat', date: '06' },
  { label: 'Sun', date: '07' },
];

const EMPLOYEES = [
  { id: 1, name: 'Adám Kovács', role: 'Head Bartender', avatar: 'https://picsum.photos/seed/adam/100' },
  { id: 2, name: 'Zoltán Nagy', role: 'Waiter', avatar: 'https://picsum.photos/seed/zoltan/100' },
  { id: 3, name: 'Eszter Papp', role: 'Floor Manager', avatar: 'https://picsum.photos/seed/eszter/100' },
  { id: 4, name: 'Balázs Tóth', role: 'Chef de Partie', avatar: 'https://picsum.photos/seed/balazs/100' },
  { id: 5, name: 'Lilla Kiss', role: 'Hostess', avatar: 'https://picsum.photos/seed/lilla/100' },
];

const SHIFTS: any = {
  '1-01': { type: 'normal', time: '08:00 - 16:00', pos: 'Bar' },
  '1-02': { type: 'violation', time: '10:00 - 18:00', pos: 'Bar', note: 'Rest period violation' },
  '1-04': { type: 'suggested', time: '08:00 - 16:00', pos: 'Bar' },
  '2-01': { type: 'normal', time: '12:00 - 22:00', pos: 'Floor' },
  '2-03': { type: 'off' },
  '3-01': { type: 'normal', time: '07:30 - 15:30', pos: 'Floor' },
  '3-02': { type: 'normal', time: '07:30 - 15:30', pos: 'Floor' },
  '4-01': { type: 'normal', time: '09:00 - 17:00', pos: 'Kitchen' },
  '4-05': { type: 'suggested', time: '14:00 - 22:00', pos: 'Kitchen' },
};

const App: React.FC = () => {
  const [activeView, setActiveView] = useState('Week');
  const [editMode, setEditMode] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const EngineContent = () => (
    <>
      <div className={DASH_STYLE.panel.scoreCard}>
        <div className={DASH_STYLE.panel.scoreLabel}>Coverage Score</div>
        <div className={DASH_STYLE.panel.scoreValue}>92.4%</div>
        <div className="text-[10px] font-bold text-emerald-400 mt-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Optimal Coverage Target Met
        </div>
      </div>

      <div className={DASH_STYLE.panel.section}>
        <div className={DASH_STYLE.panel.group}>
          <div className={DASH_STYLE.panel.groupTitle}>
            <span>Active Violations</span>
            <span className="text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full">2</span>
          </div>
          <div className={DASH_STYLE.panel.violation('high')}>
            <div className="font-black uppercase tracking-tighter">Rest Period Violation</div>
            <div>Ádám Kovács | Tue 02</div>
            <div className="opacity-60 text-[10px]">Staff needs 11h break between shifts.</div>
          </div>
        </div>

        <div className={DASH_STYLE.panel.group}>
          <div className={DASH_STYLE.panel.groupTitle}>
            <span>AI Suggestions</span>
            <span className="text-emerald-600">AUTO</span>
          </div>
          <div className={DASH_STYLE.panel.suggestion}>
            <div className="font-black uppercase tracking-tighter">Fill Gap: Bar (08-16)</div>
            <div className="text-slate-500">Candidate: <span className="text-emerald-600 font-bold">Ádám Kovács</span></div>
            <button className={DASH_STYLE.panel.btnApply}>Apply Shift</button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className={DASH_STYLE.root}>
      {/* 1) TOP TOOLBAR */}
      <header className={DASH_STYLE.toolbar.container}>
        <div className={DASH_STYLE.toolbar.identity}>
          <div className={DASH_STYLE.toolbar.logo}>M</div>
          <h1 className={DASH_STYLE.toolbar.appName}>Beosztas</h1>
        </div>

        <div className={DASH_STYLE.toolbar.viewSelector}>
          {['1D', '3D', 'Week'].map(v => (
            <button 
              key={v} 
              className={DASH_STYLE.toolbar.viewBtn(activeView === v)}
              onClick={() => setActiveView(v)}
            >
              {v}
            </button>
          ))}
        </div>

        <div className={DASH_STYLE.toolbar.actions}>
          <div 
            className={DASH_STYLE.toolbar.editToggle(editMode)}
            onClick={() => setEditMode(!editMode)}
          >
            <div className={`w-2 h-2 rounded-full ${editMode ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className="text-[10px] font-black uppercase tracking-widest">{editMode ? 'Edit' : 'View'}</span>
          </div>
          <div className={DASH_STYLE.toolbar.userCircle}>JD</div>
        </div>
      </header>

      <div className={DASH_STYLE.layoutWrapper}>
        {/* 2) MAIN SCHEDULING TABLE */}
        <main className={DASH_STYLE.mainArea}>
          <div className={DASH_STYLE.table.container}>
            <div className={DASH_STYLE.table.scrollHint} />
            <table className={DASH_STYLE.table.wrapper}>
              <thead>
                <tr className={DASH_STYLE.table.headerRow}>
                  <th className={`${DASH_STYLE.table.headerCell} ${DASH_STYLE.table.employeeColumn}`}>
                    Staff / Role
                  </th>
                  {DAYS.map(day => (
                    <th key={day.date} className={DASH_STYLE.table.headerCell}>
                      <div className="flex flex-col items-start">
                        <span className="opacity-40">{day.label}</span>
                        <span className="text-sm lg:text-lg font-black text-slate-800 tracking-tight">{day.date}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EMPLOYEES.map(emp => (
                  <tr key={emp.id} className={DASH_STYLE.table.row}>
                    <td 
                      className={`${DASH_STYLE.table.employeeCell} ${DASH_STYLE.table.employeeColumn}`}
                      onClick={() => setSelectedEmp(emp)}
                    >
                      <div className="flex items-center gap-3">
                        <img src={emp.avatar} alt="" className={DASH_STYLE.table.avatar} />
                        <div className="flex flex-col min-w-0">
                          <span className={DASH_STYLE.table.empName}>{emp.name}</span>
                          <span className={DASH_STYLE.table.empRole}>{emp.role}</span>
                        </div>
                      </div>
                    </td>
                    {DAYS.map(day => {
                      const shift = SHIFTS[`${emp.id}-${day.date}`];
                      return (
                        <td key={day.date} className={DASH_STYLE.table.cell}>
                          {!shift && (
                            <div className={DASH_STYLE.table.shift.empty(editMode)}>
                              {editMode && <span className="text-emerald-400 font-black">+</span>}
                            </div>
                          )}
                          {shift?.type === 'off' && (
                            <div className={DASH_STYLE.table.shift.off}>
                              <span className="text-[8px] font-black opacity-30 uppercase tracking-[0.2em]">OFF</span>
                            </div>
                          )}
                          {shift && shift.type !== 'off' && (
                            <div className={`${DASH_STYLE.table.shift.base} ${
                              shift.type === 'suggested' ? DASH_STYLE.table.shift.suggested : 
                              shift.type === 'violation' ? DASH_STYLE.table.shift.violation : 
                              DASH_STYLE.table.shift.normal
                            }`}>
                              <div>
                                <span className={DASH_STYLE.table.timeRange}>{shift.time.split(' ')[0]}</span>
                                <div className={DASH_STYLE.table.positionName}>{shift.pos}</div>
                              </div>
                              <div className="flex justify-end">
                                <span className={`${DASH_STYLE.table.shift.badge} ${getBadgeStyle(shift.pos)}`}>
                                  {shift.pos[0]}
                                </span>
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
        </main>

        {/* 3) DESKTOP SIDE PANEL (ENGINE) */}
        <aside className={DASH_STYLE.panel.container}>
          <div className={DASH_STYLE.panel.header}>
            <div className={DASH_STYLE.panel.title}>
              <span className="w-2 h-2 bg-emerald-500 rounded-full" />
              Scheduling Engine
            </div>
          </div>
          <EngineContent />
        </aside>

        {/* 4) MOBILE DOCK */}
        <div className={DASH_STYLE.panel.mobileDock}>
          <div className={DASH_STYLE.panel.mobileDockStatus}>
            <span className={DASH_STYLE.panel.mobileDockLabel}>Status</span>
            <div className={DASH_STYLE.panel.mobileDockValue}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Draft v1.2
            </div>
          </div>
          <button 
            className={DASH_STYLE.panel.mobileDockButton}
            onClick={() => setIsDrawerOpen(true)}
          >
            Engine
            <span className="opacity-40">→</span>
          </button>
        </div>

        {/* 5) MOBILE DRAWER */}
        {isDrawerOpen && (
          <>
            <div className={DASH_STYLE.panel.mobileDrawerOverlay} onClick={() => setIsDrawerOpen(false)} />
            <div className={DASH_STYLE.panel.mobileDrawer}>
              <div className={DASH_STYLE.panel.drawerHandle} />
              <div className="flex justify-between items-center px-6 py-2">
                <h2 className="text-xl font-black text-slate-800">Engine Insights</h2>
                <button onClick={() => setIsDrawerOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold">✕</button>
              </div>
              <div className="overflow-y-auto flex-1">
                <EngineContent />
              </div>
            </div>
          </>
        )}
      </div>

      {/* 6) ADAPTIVE PROFILE MODAL */}
      {selectedEmp && (
        <div className={DASH_STYLE.profile.overlay} onClick={() => setSelectedEmp(null)}>
          <div className={DASH_STYLE.profile.modal} onClick={e => e.stopPropagation()}>
            <div className={DASH_STYLE.profile.header}>
              <div className={DASH_STYLE.profile.avatarWrapper}>
                <img src={selectedEmp.avatar} className={DASH_STYLE.profile.avatar} alt="" />
              </div>
              <button 
                onClick={() => setSelectedEmp(null)}
                className="absolute top-6 right-6 w-10 h-10 rounded-full bg-black/10 hover:bg-black/20 text-white flex items-center justify-center font-bold text-lg"
              >
                ✕
              </button>
            </div>
            <div className={DASH_STYLE.profile.content}>
              <h2 className={DASH_STYLE.profile.name}>{selectedEmp.name}</h2>
              <p className={DASH_STYLE.profile.role}>{selectedEmp.role}</p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                  <span className={DASH_STYLE.profile.label}>Skill Matrix</span>
                  <div className="mb-6">
                    <div className="flex justify-between text-[11px] font-black uppercase mb-2">
                      <span>Mixology</span>
                      <span className="text-emerald-600">Master</span>
                    </div>
                    <div className={DASH_STYLE.profile.skillBar}>
                      <div className="h-full bg-slate-900 w-full" />
                    </div>
                    <div className="flex justify-between text-[11px] font-black uppercase mb-2">
                      <span>Floor Management</span>
                      <span className="text-slate-400">Advanced</span>
                    </div>
                    <div className={DASH_STYLE.profile.skillBar}>
                      <div className="h-full bg-slate-400 w-[75%]" />
                    </div>
                  </div>
                </div>
                <div>
                  <span className={DASH_STYLE.profile.label}>Availability</span>
                  <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100">
                    <div className="text-sm font-black mb-1">Standard Weekly</div>
                    <div className="text-xs text-slate-500 leading-relaxed">Mon - Fri | 08:00 - 22:00<br/>Sat - Sun | Requested Off</div>
                  </div>
                </div>
              </div>

              <div className="mt-10">
                <span className={DASH_STYLE.profile.label}>AI Deployment Insight</span>
                <div className={DASH_STYLE.profile.insight}>
                  "Recommended for peak Friday night bar operations. High reliability score (98%) and positive peer feedback on communication during rush hours."
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
