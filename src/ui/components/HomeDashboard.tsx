import React, { useState, useMemo, useEffect } from 'react';
import { User, Request, Shift, Todo, TimeEntry, WidgetConfig, Feedback, Poll, Unit } from '../../core/models/data';
import { db } from '../../core/firebase/config';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import ClockInOutModal from './ClockInOutModal';
import ClockInOutIcon from '../../../components/icons/ClockInOutIcon';
import PencilIcon from '../../../components/icons/PencilIcon';
import EyeIcon from '../../../components/icons/EyeIcon';
import EyeSlashIcon from '../../../components/icons/EyeSlashIcon';
import ArrowUpIcon from '../../../components/icons/ArrowUpIcon';
import ArrowDownIcon from '../../../components/icons/ArrowDownIcon';
import ScheduleIcon from '../../../components/icons/ScheduleIcon';
import TodoIcon from '../../../components/icons/TodoIcon';
import CalendarIcon from '../../../components/icons/CalendarIcon';
import FeedbackIcon from '../../../components/icons/FeedbackIcon';
import PollsIcon from '../../../components/icons/PollsIcon';
import UnitLogoBadge from './common/UnitLogoBadge';
import ThemeSelector from './dashboard/ThemeSelector';
import { ThemeMode, ThemeBases } from '../../core/theme/types';
import AdminThemeEditor from './theme/AdminThemeEditor';

interface HomeDashboardProps {
  currentUser: User;
  requests: Request[];
  schedule: Shift[];
  todos: Todo[];
  adminTodos: Todo[];
  timeEntries: TimeEntry[];
  setActiveApp: (app: any) => void;
  feedbackList: Feedback[];
  polls: Poll[];
  activeUnitIds: string[];
  allUnits: Unit[];
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  activeUnit: Unit | null;
  themeBases: ThemeBases;
  onThemeBasesChange: (bases: ThemeBases) => void;
  useBrandTheme: boolean;
  onBrandChange: (enabled: boolean) => void;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
    { id: 'shift_payroll', visible: true, order: 1 },
    { id: 'quicklinks', visible: true, order: 2 },
    { id: 'todos', visible: true, order: 3 },
    { id: 'velemenyek', visible: true, order: 4 },
    { id: 'szavazasok', visible: true, order: 5 },
    { id: 'requests', visible: true, order: 6 },
    { id: 'schedule', visible: true, order: 7 },
    { id: 'bookings', visible: true, order: 8 },
];

const HomeDashboard: React.FC<HomeDashboardProps> = ({
  currentUser,
  requests,
  schedule,
  todos,
  adminTodos,
  timeEntries,
  setActiveApp,
  feedbackList,
  polls,
  activeUnitIds,
  allUnits,
  themeMode,
  onThemeChange,
  activeUnit,
  themeBases,
  onThemeBasesChange,
  useBrandTheme,
  onBrandChange,
}) => {
  // --- BIZTONSÁGI ELLENŐRZÉS ---
  // Csak akkor true, ha a role pontosan 'Admin'. 'Unit Admin' vagy 'User' esetén false.
  const isGlobalAdmin = currentUser?.role === 'Admin';

  const [isClockInModalOpen, setClockInModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig[]>([]);
  const [wages, setWages] = useState<Record<string, number | ''>>({});
  const isMultiUnitView = activeUnitIds.length > 1;
  const [showThemeEditor, setShowThemeEditor] = useState(false);
  const surfaceCardBg = 'var(--color-surface-card, var(--color-surface, rgba(255,255,255,0.92)))';

  // --- Data Filtering based on activeUnitIds ---
  const filteredTimeEntries = useMemo(() => 
      timeEntries.filter(entry => activeUnitIds.includes(entry.unitId)),
      [timeEntries, activeUnitIds]
  );
  const filteredSchedule = useMemo(() => 
      schedule.filter(s => s.unitId && activeUnitIds.includes(s.unitId)),
      [schedule, activeUnitIds]
  );
  const filteredRequests = useMemo(() => 
      requests.filter(r => r.unitId && activeUnitIds.includes(r.unitId)),
      [requests, activeUnitIds]
  );
  const filteredTodos = useMemo(() => 
      todos.filter(t => t.unitId && activeUnitIds.includes(t.unitId)),
      [todos, activeUnitIds]
  );
  const filteredFeedback = useMemo(() => 
      feedbackList.filter(f => activeUnitIds.includes(f.unitId)),
      [feedbackList, activeUnitIds]
  );
  const filteredPolls = useMemo(() =>
      polls.filter(p => activeUnitIds.includes(p.unitId)),
      [polls, activeUnitIds]
  );
  const unitMap = useMemo(() => new Map(allUnits.map(unit => [unit.id, unit])), [allUnits]);
  const primaryUnit = useMemo(
    () => activeUnit || unitMap.get(activeUnitIds[0]) || null,
    [activeUnit, activeUnitIds, unitMap]
  );
  // --- End Data Filtering ---

  useEffect(() => {
    const fetchWages = async () => {
        try {
            const docRef = doc(db, 'user_private_data', currentUser.id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setWages(docSnap.data()?.wages || {});
            }
        } catch (error) {
            console.error("Error fetching hourly wage for dashboard:", error);
        }
    };
    fetchWages();
  }, [currentUser.id]);

  useEffect(() => {
    const userConfig = currentUser.dashboardConfig;
    if (userConfig && userConfig.length > 0) {
      const userWidgetIds = new Set(userConfig.map(w => w.id));
      const newConfig = [...userConfig];
      DEFAULT_WIDGETS.forEach(defaultWidget => {
        if (!userWidgetIds.has(defaultWidget.id)) {
          newConfig.push(defaultWidget);
        }
      });
      setWidgetConfig(newConfig);
    } else {
      setWidgetConfig(DEFAULT_WIDGETS);
    }
  }, [currentUser.dashboardConfig]);


  const activeTimeEntry = useMemo(() => 
    filteredTimeEntries.find(entry => entry.status === 'active'),
    [filteredTimeEntries]
  );

  const [activeShiftDuration, setActiveShiftDuration] = useState('');

  useEffect(() => {
    let interval: number | undefined;
    if (activeTimeEntry) {
      interval = window.setInterval(() => {
        const now = new Date();
        const start = activeTimeEntry.startTime.toDate();

        if (now < start) {
            const startTimeString = start.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
            setActiveShiftDuration(`Műszak kezdődik: ${startTimeString}`);
        } else {
            const diffMs = now.getTime() - start.getTime();
            const hours = Math.floor(diffMs / 3600000);
            const minutes = Math.floor((diffMs % 3600000) / 60000);
            const seconds = Math.floor((diffMs % 60000) / 1000);
            setActiveShiftDuration(
              `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
            );
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeTimeEntry]);


  const todayShifts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    return filteredSchedule.filter(s => {
      const shiftDate = s.start.toDate();
      return shiftDate >= today && shiftDate < tomorrow;
    });
  }, [filteredSchedule]);

  const upcomingShift = useMemo(() => {
    const now = new Date();
    return todayShifts
      .filter(s => s.userId === currentUser.id && s.start.toDate() > now)
      .sort((a, b) => a.start.toMillis() - b.start.toMillis())[0];
  }, [todayShifts, currentUser.id]);

  const openRequests = useMemo(() => filteredRequests.filter(r => r.status === 'pending'), [filteredRequests]);
  const activeTodos = useMemo(() => filteredTodos.filter(t => !t.isDone), [filteredTodos]);

  const handleSaveConfig = async () => {
    try {
        await updateDoc(doc(db, 'users', currentUser.id), {
            dashboardConfig: widgetConfig
        });
        setIsEditMode(false);
    } catch (error) {
        console.error("Failed to save dashboard config:", error);
        alert("Hiba történt a beállítások mentésekor.");
    }
  };

  const toggleWidgetVisibility = (id: string) => {
    setWidgetConfig(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const moveWidget = (widgetId: string, direction: 'up' | 'down') => {
    const sorted = [...widgetConfig].sort((a, b) => a.order - b.order);
    const currentIndex = sorted.findIndex(w => w.id === widgetId);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    const newConfig = [...widgetConfig];
    const currentItem = newConfig.find(w => w.id === sorted[currentIndex].id);
    const targetItem = newConfig.find(w => w.id === sorted[targetIndex].id);

    if (currentItem && targetItem) {
        const tempOrder = currentItem.order;
        currentItem.order = targetItem.order;
        targetItem.order = tempOrder;
        setWidgetConfig(newConfig);
    }
  };

  // --- Widget Components ---
  
  const ShiftAndPayrollWidget = () => {
    const [isPayVisible, setIsPayVisible] = useState(false);

    const monthlyData = useMemo(() => {
        if (!Object.keys(wages).length) return { totalHours: 0, totalEarnings: 0 };
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const entriesThisMonth = filteredTimeEntries.filter(entry => {
            const startTime = entry.startTime.toDate();
            return entry.status === 'completed' && startTime >= startOfMonth && startTime <= endOfMonth;
        });

        const { totalHours, totalEarnings } = entriesThisMonth.reduce((acc, entry) => {
            if (entry.endTime) {
                const duration = (entry.endTime.toMillis() - entry.startTime.toMillis()) / (1000 * 60 * 60);
                const wageForUnit = Number(wages[entry.unitId]) || 0;
                acc.totalHours += duration;
                acc.totalEarnings += duration * wageForUnit;
            }
            return acc;
        }, { totalHours: 0, totalEarnings: 0 });

        return { totalHours, totalEarnings };
    }, [filteredTimeEntries, wages]);

    return (
        <div
            className="p-6 rounded-2xl shadow-md border flex flex-col items-center justify-between text-center h-full transition-colors duration-200"
            style={{ 
                backgroundColor: surfaceCardBg, 
                color: 'var(--color-text-main)', 
                borderColor: 'var(--color-border)' 
            }}
        >
            <div className="w-full">
                <div className="flex items-center justify-center gap-2 mb-2">
                    <ClockInOutIcon className="h-6 w-6 text-green-700"/>
                    <h2 className="text-xl font-bold">Műszak és Bér</h2>
                </div>
                {activeTimeEntry ? (
                    <div>
                        <p style={{ color: 'var(--color-text-secondary)' }}>{activeShiftDuration.startsWith('Műszak') ? 'Hamarosan...' : 'Aktív műszakban:'}</p>
                        <p className={`my-1 font-bold ${activeShiftDuration.startsWith('Műszak') ? 'text-lg' : 'text-3xl text-green-700'}`}>{activeShiftDuration}</p>
                        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Kezdés: {activeTimeEntry.startTime.toDate().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                ) : upcomingShift ? (
                    <div>
                        <p style={{ color: 'var(--color-text-secondary)' }}>Következő műszakod:</p>
                        <p className="text-xl font-bold my-2">{upcomingShift.start.toDate().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                ) : (
                    <p className="my-2" style={{ color: 'var(--color-text-secondary)' }}>Ma nincs több beosztásod.</p>
                )}
            </div>

            <div className="w-full mt-4">
                 <div className="py-4 border-t border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <label className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Becsült bér ebben a hónapban</label>
                    <div className="flex items-center justify-center gap-2 mt-1">
                        <p className={`text-2xl font-bold text-green-700 transition-all duration-300 ${!isPayVisible && 'blur-md'}`}>
                            {monthlyData.totalEarnings.toLocaleString('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 })}
                        </p>
                        <button onClick={(e) => {e.stopPropagation(); setIsPayVisible(!isPayVisible)}} className="text-gray-500 hover:text-gray-800">
                            {isPayVisible ? <EyeSlashIcon /> : <EyeIcon />}
                        </button>
                    </div>
                     <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{Object.keys(wages).length > 0 ? `${monthlyData.totalHours.toFixed(2)} óra alapján` : 'Add meg az órabéred a számításhoz.'}</p>
                 </div>
                 <button
                    onClick={(e) => { if (!isEditMode) { e.stopPropagation(); setClockInModalOpen(true); }}}
                    className={`w-full mt-4 font-semibold py-2 px-4 rounded-lg text-white ${activeTimeEntry ? 'bg-red-600' : 'bg-green-700'} ${!isEditMode ? (activeTimeEntry ? 'hover:bg-red-700' : 'hover:bg-green-800') : 'cursor-default opacity-70'}`}
                >
                    {activeTimeEntry ? 'Műszak Befejezése' : 'Műszak Kezdése'}
                </button>
            </div>
        </div>
    );
};

  const QuickLinksWidget = () => (
    <div
        className="p-6 rounded-2xl shadow-md border h-full transition-colors duration-200"
        style={{ 
            backgroundColor: surfaceCardBg, 
            color: 'var(--color-text-main)', 
            borderColor: 'var(--color-border)' 
        }}
    >
        <h2 className="text-xl font-bold mb-4">Gyorsmenü</h2>
        <div className="space-y-3">
            <button
                onClick={() => !isEditMode && setActiveApp('beosztas')}
                className={`w-full text-left p-3 rounded-lg font-semibold ${!isEditMode ? 'hover:opacity-80' : 'cursor-default opacity-70'}`}
                style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-main)' }}
            >
                Beosztásom megtekintése
            </button>
            <button
                onClick={() => !isEditMode && setActiveApp('kerelemek')}
                className={`w-full text-left p-3 rounded-lg font-semibold ${!isEditMode ? 'hover:opacity-80' : 'cursor-default opacity-70'}`}
                style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-main)' }}
            >
                Szabadnap kérelem
            </button>
            <button
                onClick={() => !isEditMode && setActiveApp('todos')}
                className={`w-full text-left p-3 rounded-lg font-semibold ${!isEditMode ? 'hover:opacity-80' : 'cursor-default opacity-70'}`}
                style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-main)' }}
            >
                Teendők
            </button>
        </div>
    </div>
  );

  const TodosWidget = () => {
    const latestTodos = activeTodos.slice(0, 3);
    return (
        <div
            className="p-6 rounded-2xl shadow-md border h-full transition-colors duration-200"
            style={{ 
                backgroundColor: surfaceCardBg, 
                color: 'var(--color-text-main)', 
                borderColor: 'var(--color-border)' 
            }}
        >
            <div className="flex items-center gap-2 mb-4">
                <TodoIcon className="h-6 w-6 text-blue-600" />
                <h2 className="text-xl font-bold">Aktív teendők ({activeTodos.length})</h2>
            </div>
            {latestTodos.length > 0 ? (
                <div className="space-y-3">
                    {latestTodos.map(todo => (
                        <div key={todo.id} className="p-2 bg-blue-50/50 border-l-4 border-blue-400 rounded-r-lg">
                            <p className="text-sm font-medium truncate">{todo.text}</p>
                            <p className="text-xs opacity-70">Létrehozta: {todo.createdBy}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <p style={{ color: 'var(--color-text-secondary)' }}>Nincsenek aktív teendők.</p>
            )}
        </div>
    );
  };

  const RequestsWidget = () => (
    <div
        className="p-5 rounded-2xl shadow-md border h-full flex flex-col justify-center transition-colors duration-200"
        style={{ 
            backgroundColor: surfaceCardBg, 
            color: 'var(--color-text-main)', 
            borderColor: 'var(--color-border)' 
        }}
    >
        <div className="flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-yellow-600" />
            <h3 className="font-bold">Függőben lévő kérelmek</h3>
        </div>
        <p className="text-4xl font-bold text-yellow-600 mt-2">{openRequests.length}</p>
    </div>
  );

  const ScheduleWidget = () => {
    const sortedTodayShifts = [...todayShifts].sort((a,b) => a.start.toMillis() - b.start.toMillis());
    return (
        <div
            className="p-6 rounded-2xl shadow-md border h-full transition-colors duration-200"
            style={{ 
                backgroundColor: surfaceCardBg, 
                color: 'var(--color-text-main)', 
                borderColor: 'var(--color-border)' 
            }}
        >
            <div className="flex items-center gap-2 mb-4">
                <ScheduleIcon className="h-6 w-6 text-indigo-600" />
                <h2 className="text-xl font-bold">Mai Beosztás</h2>
            </div>
            {sortedTodayShifts.length > 0 ? (
                <div className="space-y-3 overflow-y-auto max-h-64">
                    {sortedTodayShifts.map(shift => {
                        const unit = shift.unitId ? unitMap.get(shift.unitId) : undefined;
                        const startTime = shift.start.toDate().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
                        const endTime = shift.end ? shift.end.toDate().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }) : 'Zárásig';
                        return (
                            <div key={shift.id} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-background)' }}>
                                <div className="flex items-center gap-2">
                                    <p className="font-semibold">{shift.userName}</p>
                                    {isMultiUnitView && unit && (
                                        <UnitLogoBadge unit={unit} size={18} />
                                    )}
                                </div>
                                <p className="text-sm opacity-80">
                                    {shift.isDayOff ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-rose-600 font-semibold">
                                            Szabadnap
                                        </span>
                                    ) : (
                                        `${startTime} - ${endTime}`
                                    )}
                                </p>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p style={{ color: 'var(--color-text-secondary)' }}>Ma nincsenek beosztott műszakok.</p>
            )}
        </div>
    );
  };

  const BookingsWidget = () => (
    <div
        className="p-6 rounded-2xl shadow-md border h-full transition-colors duration-200"
        style={{ 
            backgroundColor: surfaceCardBg, 
            color: 'var(--color-text-main)', 
            borderColor: 'var(--color-border)' 
        }}
    >
        <h2 className="text-xl font-bold mb-4">Mai foglalások</h2>
        <p style={{ color: 'var(--color-text-secondary)' }}>A mai foglalások listája itt jelenik meg.</p>
    </div>
  );

  const VelemenyekWidget = () => (
    <div
        className="p-6 rounded-2xl shadow-md border h-full transition-colors duration-200"
        style={{ 
            backgroundColor: surfaceCardBg, 
            color: 'var(--color-text-main)', 
            borderColor: 'var(--color-border)' 
        }}
    >
        <div className="flex items-center gap-2 mb-4">
            <FeedbackIcon className="h-6 w-6 text-purple-600" />
            <h2 className="text-xl font-bold">Névtelen Visszajelzések</h2>
        </div>
        {filteredFeedback.length > 0 ? (
            <div>
                <p className="text-3xl font-bold">{filteredFeedback.length}</p>
                <p style={{ color: 'var(--color-text-secondary)' }}>összesen</p>
                <p className="text-sm mt-2 truncate" style={{ color: 'var(--color-text-secondary)' }}>Legutóbbi: "{filteredFeedback[0].text}"</p>
            </div>
        ) : (
            <p style={{ color: 'var(--color-text-secondary)' }}>Nincsenek új visszajelzések.</p>
        )}
    </div>
  );

  const SzavazasokWidget = () => {
      const activePolls = useMemo(() => filteredPolls.filter(p => !p.closesAt || p.closesAt.toDate() > new Date()), [filteredPolls]);
      return (
          <div
            className="p-6 rounded-2xl shadow-md border h-full transition-colors duration-200"
            style={{ 
                backgroundColor: surfaceCardBg, 
                color: 'var(--color-text-main)', 
                borderColor: 'var(--color-border)' 
            }}
          >
              <div className="flex items-center gap-2 mb-4">
                  <PollsIcon className="h-6 w-6 text-cyan-600" />
                  <h2 className="text-xl font-bold">Szavazások ({activePolls.length})</h2>
              </div>
              {activePolls.length > 0 ? (
                   <div className="space-y-2">
                      {activePolls.slice(0,2).map(poll => (
                          <div key={poll.id} className="p-2 bg-cyan-50/50 border-l-4 border-cyan-400 rounded-r-lg">
                             <p className="text-sm font-medium truncate">{poll.question}</p>
                          </div>
                      ))}
                  </div>
              ) : (
                  <p style={{ color: 'var(--color-text-secondary)' }}>Nincsenek aktív szavazások.</p>
              )}
          </div>
      );
  };

  const widgetMap: { [key: string]: React.FC } = {
    shift_payroll: ShiftAndPayrollWidget,
    quicklinks: QuickLinksWidget,
    todos: TodosWidget,
    requests: RequestsWidget,
    schedule: ScheduleWidget,
    bookings: BookingsWidget,
    velemenyek: VelemenyekWidget,
    szavazasok: SzavazasokWidget,
  };

  const sortedWidgets = useMemo(() => {
    const visible = isEditMode ? widgetConfig : widgetConfig.filter(w => w.visible);
    return [...visible].sort((a,b) => a.order - b.order);
  }, [widgetConfig, isEditMode]);


  return (
    <div className="p-4 md:p-8">
       {isClockInModalOpen && (
        <ClockInOutModal 
          isOpen={isClockInModalOpen}
          onClose={() => setClockInModalOpen(false)}
          activeTimeEntry={activeTimeEntry || null}
          currentUser={currentUser}
        />
      )}
      
      {/* --- ÚJ FEJLÉC (HEADER) --- */}
      <div 
        className="rounded-2xl p-6 mb-8 text-white shadow-lg relative overflow-hidden transition-all duration-300"
        style={{
            backgroundColor: 'var(--color-header-bg)', 
            backgroundImage: 'var(--ui-header-image)',
            backgroundBlendMode: 'var(--ui-header-blend-mode)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            color: 'var(--color-text-on-primary)'
        }}
      >
        <div className="absolute inset-0 bg-black/10 pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
                <h1 className="text-3xl font-bold">Üdv, {currentUser.firstName}!</h1>
                <p className="mt-1 opacity-90">Jó újra látni. Itt egy gyors áttekintés a mai napodról.</p>
            </div>
            
            <div className="flex items-center gap-3">
                <ThemeSelector
                    activeUnit={primaryUnit}
                    currentTheme={themeMode}
                    onThemeChange={onThemeChange}
                    useBrandTheme={useBrandTheme}
                    onBrandChange={onBrandChange}
                />
                
                {/* --- 1. VÉDELEM: Theme Editor gomb CSAK ADMINNAK --- */}
                {isGlobalAdmin && (
                    <button
                        onClick={() => setShowThemeEditor(prev => !prev)}
                        className="px-3 py-2 text-sm font-semibold rounded-lg border transition-colors bg-white/20 hover:bg-white/30 text-white border-white/30 backdrop-blur-md"
                        type="button"
                    >
                        Theme Editor
                    </button>
                )}

                {/* Widget Edit Mode */}
                {isEditMode ? (
                    <button
                    onClick={handleSaveConfig}
                    className="bg-white text-green-700 font-bold py-2 px-4 rounded-lg hover:bg-gray-100 flex items-center gap-2 shadow-sm"
                    >
                    Mentés
                    </button>
                ) : (
                    <button
                    onClick={() => setIsEditMode(true)}
                    className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur-md"
                    title="Widgetek szerkesztése"
                    >
                    <PencilIcon className="h-6 w-6" />
                    </button>
                )}
            </div>
        </div>
      </div>
      {/* --- FEJLÉC VÉGE --- */}

      {/* --- 2. VÉDELEM: Admin Theme Editor komponens CSAK ADMINNAK --- */}
      {isGlobalAdmin && showThemeEditor && (
        <div className="mb-4">
          <AdminThemeEditor bases={themeBases} onChangeBases={onThemeBasesChange} />
        </div>
      )}
      
      {isEditMode && <p className="text-sm text-blue-600 bg-blue-50 p-3 rounded-lg my-4 border border-blue-200">Szerkesztő mód aktív. Rendezd a kártyákat a nyilakkal, vagy kapcsold ki őket a szem ikonnal.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
          {sortedWidgets.map((widget, index) => {
            const WidgetComponent = widgetMap[widget.id];
            if (!WidgetComponent) return null;

            const widgetIdToAppMap: Record<string, string | null> = {
                shift_payroll: 'berezesem',
                quicklinks: null,
                todos: 'todos',
                requests: 'kerelemek',
                schedule: 'beosztas',
                bookings: 'foglalasok',
                velemenyek: 'velemenyek',
                szavazasok: 'szavazasok',
            };
            const targetApp = widgetIdToAppMap[widget.id];
            const isClickable = !isEditMode && !!targetApp;
            const isVisible = widget.visible;

            return (
                <div
                    key={widget.id}
                    className={`relative transition-opacity duration-300
                        ${widget.id === 'schedule' ? 'md:col-span-2' : ''}
                        ${isEditMode ? 'border-2 border-dashed border-blue-400 rounded-2xl p-1 bg-blue-50/50' : ''}
                        ${!isVisible && isEditMode ? 'opacity-50' : ''}
                    `}
                >
                   {isEditMode && (
                        <div
                          className="absolute top-2 right-2 z-10 flex items-center gap-0.5 backdrop-blur-md p-1 rounded-full shadow border border-gray-200"
                          style={{
                            backgroundColor: surfaceCardBg,
                            color: 'var(--color-text-main)',
                            opacity: 0.95,
                          }}
                        >
                            <button
                                onClick={() => moveWidget(widget.id, 'up')}
                                disabled={index === 0}
                                className="p-1.5 hover:bg-black/5 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Fel"
                            >
                                <ArrowUpIcon />
                            </button>
                            <button 
                                onClick={() => moveWidget(widget.id, 'down')}
                                disabled={index === sortedWidgets.length - 1}
                                className="p-1.5 hover:bg-black/5 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Le"
                            >
                                <ArrowDownIcon />
                            </button>
                            <div className="w-px h-5 bg-gray-300 mx-1"></div>
                            <button onClick={() => toggleWidgetVisibility(widget.id)} className="p-1.5 hover:bg-black/5 rounded-full" title={isVisible ? 'Elrejt' : 'Megjelenít'}>
                                {isVisible ? <EyeIcon/> : <EyeSlashIcon/>}
                            </button>
                        </div>
                   )}
                   <div 
                     className={`h-full ${isClickable ? 'cursor-pointer hover:opacity-95 transition-opacity' : ''}`}
                     onClick={isClickable ? () => setActiveApp(targetApp) : undefined}
                   >
                     <WidgetComponent/>
                   </div>
                </div>
            )
          })}
      </div>
    </div>
  );
};

export default HomeDashboard;
