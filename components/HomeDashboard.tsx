import React, { useState, useMemo, useEffect } from 'react';
import { User, Request, Booking, Shift, Todo, TimeEntry, WidgetConfig, Feedback, Poll } from '../data/mockData';
import { db } from '../firebase/config';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import ClockInOutModal from './ClockInOutModal';
import ClockInOutIcon from './icons/ClockInOutIcon';
import PencilIcon from './icons/PencilIcon';
import EyeIcon from './icons/EyeIcon';
import EyeSlashIcon from './icons/EyeSlashIcon';
import ArrowUpIcon from './icons/ArrowUpIcon';
import ArrowDownIcon from './icons/ArrowDownIcon';
import MoneyIcon from './icons/MoneyIcon';
import ScheduleIcon from './icons/ScheduleIcon';
import TodoIcon from './icons/TodoIcon';
import CalendarIcon from './icons/CalendarIcon';
import FeedbackIcon from './icons/FeedbackIcon';
import PollsIcon from './icons/PollsIcon';

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

const HomeDashboard: React.FC<HomeDashboardProps> = ({ currentUser, requests, schedule, todos, adminTodos, timeEntries, setActiveApp, feedbackList, polls, activeUnitIds }) => {
  const [isClockInModalOpen, setClockInModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig[]>([]);
  const [wages, setWages] = useState<Record<string, number | ''>>({});

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
  
  // Fetch user's config or set default
  useEffect(() => {
    const userConfig = currentUser.dashboardConfig;
    if (userConfig && userConfig.length > 0) {
      // Ensure all default widgets are present in user config, add if missing
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
            // Shift hasn't started yet because of rounding
            const startTimeString = start.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
            setActiveShiftDuration(`Műszak kezdődik: ${startTimeString}`);
        } else {
            // Shift has started, calculate duration
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
  
  // --- Edit Mode Handlers ---
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
  
  // --- Arrow Reordering Handlers ---
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
        <div className="bg-white p-6 rounded-2xl shadow-md border flex flex-col items-center justify-between text-center h-full">
            <div className="w-full">
                <div className="flex items-center justify-center gap-2 mb-2">
                    <ClockInOutIcon className="h-6 w-6 text-green-700"/>
                    <h2 className="text-xl font-bold text-gray-800">Műszak és Bér</h2>
                </div>
                {activeTimeEntry ? (
                    <div>
                        <p className="text-gray-600">{activeShiftDuration.startsWith('Műszak') ? 'Hamarosan...' : 'Aktív műszakban:'}</p>
                        <p className={`my-1 font-bold ${activeShiftDuration.startsWith('Műszak') ? 'text-lg text-gray-700' : 'text-3xl text-green-800'}`}>{activeShiftDuration}</p>
                        <p className="text-sm text-gray-600">Kezdés: {activeTimeEntry.startTime.toDate().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                ) : upcomingShift ? (
                    <div>
                        <p className="text-gray-600">Következő műszakod:</p>
                        <p className="text-xl font-bold my-2 text-gray-800">{upcomingShift.start.toDate().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                ) : (
                    <p className="text-gray-600 my-2">Ma nincs több beosztásod.</p>
                )}
            </div>
            
            <div className="w-full mt-4">
                 <div className="py-4 border-t border-b">
                    <label className="text-sm font-semibold text-gray-600">Becsült bér ebben a hónapban</label>
                    <div className="flex items-center justify-center gap-2 mt-1">
                        <p className={`text-2xl font-bold text-green-700 transition-all duration-300 ${!isPayVisible && 'blur-md'}`}>
                            {monthlyData.totalEarnings.toLocaleString('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 })}
                        </p>
                        <button onClick={(e) => {e.stopPropagation(); setIsPayVisible(!isPayVisible)}} className="text-gray-500 hover:text-gray-800">
                            {isPayVisible ? <EyeSlashIcon /> : <EyeIcon />}
                        </button>
                    </div>
                     <p className="text-xs text-gray-500 mt-1">{Object.keys(wages).length > 0 ? `${monthlyData.totalHours.toFixed(2)} óra alapján` : 'Add meg az órabéred a számításhoz.'}</p>
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
    <div className="bg-white p-6 rounded-2xl shadow-md border h-full">
        <h2 className="text-xl font-bold mb-4 text-gray-800">Gyorsmenü</h2>
        <div className="space-y-3">
            <button
                onClick={() => !isEditMode && setActiveApp('beosztas')}
                className={`w-full text-left p-3 bg-gray-50 rounded-lg font-semibold text-gray-800 ${!isEditMode ? 'hover:bg-gray-100' : 'cursor-default opacity-70'}`}
            >
                Beosztásom megtekintése
            </button>
            <button
                onClick={() => !isEditMode && setActiveApp('kerelemek')}
                className={`w-full text-left p-3 bg-gray-50 rounded-lg font-semibold text-gray-800 ${!isEditMode ? 'hover:bg-gray-100' : 'cursor-default opacity-70'}`}
            >
                Szabadnap kérelem
            </button>
            <button
                onClick={() => !isEditMode && setActiveApp('todos')}
                className={`w-full text-left p-3 bg-gray-50 rounded-lg font-semibold text-gray-800 ${!isEditMode ? 'hover:bg-gray-100' : 'cursor-default opacity-70'}`}
            >
                Teendők
            </button>
        </div>
    </div>
  );

  const TodosWidget = () => {
    const latestTodos = activeTodos.slice(0, 3);
    return (
        <div className="bg-white p-6 rounded-2xl shadow-md border h-full">
            <div className="flex items-center gap-2 mb-4">
                <TodoIcon className="h-6 w-6 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-800">Aktív teendők ({activeTodos.length})</h2>
            </div>
            {latestTodos.length > 0 ? (
                <div className="space-y-3">
                    {latestTodos.map(todo => (
                        <div key={todo.id} className="p-2 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg">
                            <p className="text-sm font-medium text-gray-800 truncate">{todo.text}</p>
                            <p className="text-xs text-gray-600">Létrehozta: {todo.createdBy}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-gray-600">Nincsenek aktív teendők.</p>
            )}
        </div>
    );
  };

  const RequestsWidget = () => (
    <div className="bg-white p-5 rounded-2xl shadow-md border h-full flex flex-col justify-center">
        <div className="flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-yellow-600" />
            <h3 className="font-bold text-gray-800">Függőben lévő kérelmek</h3>
        </div>
        <p className="text-4xl font-bold text-yellow-600 mt-2">{openRequests.length}</p>
    </div>
  );
  
  const ScheduleWidget = () => {
    const sortedTodayShifts = [...todayShifts].sort((a,b) => a.start.toMillis() - b.start.toMillis());
    return (
        <div className="bg-white p-6 rounded-2xl shadow-md border h-full">
            <div className="flex items-center gap-2 mb-4">
                <ScheduleIcon className="h-6 w-6 text-indigo-600" />
                <h2 className="text-xl font-bold text-gray-800">Mai Beosztás</h2>
            </div>
            {sortedTodayShifts.length > 0 ? (
                <div className="space-y-3 overflow-y-auto max-h-64">
                    {sortedTodayShifts.map(shift => (
                        <div key={shift.id} className="p-3 bg-gray-50 rounded-lg">
                            <p className="font-semibold text-gray-800">{shift.userName}</p>
                            <p className="text-sm text-gray-600">
                                {shift.start.toDate().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })} - {shift.end ? shift.end.toDate().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }) : 'Zárásig'}
                            </p>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-gray-600">Ma nincsenek beosztott műszakok.</p>
            )}
        </div>
    );
  };

  const BookingsWidget = () => (
    <div className="bg-white p-6 rounded-2xl shadow-md border h-full">
        <h2 className="text-xl font-bold mb-4 text-gray-800">Mai foglalások</h2>
        <p className="text-gray-600">A mai foglalások listája itt jelenik meg.</p>
    </div>
  );

  const VelemenyekWidget = () => (
    <div className="bg-white p-6 rounded-2xl shadow-md border h-full">
        <div className="flex items-center gap-2 mb-4">
            <FeedbackIcon className="h-6 w-6 text-purple-600" />
            <h2 className="text-xl font-bold text-gray-800">Névtelen Visszajelzések</h2>
        </div>
        {filteredFeedback.length > 0 ? (
            <div>
                <p className="text-3xl font-bold text-gray-800">{filteredFeedback.length}</p>
                <p className="text-gray-600">összesen</p>
                <p className="text-sm text-gray-600 mt-2 truncate">Legutóbbi: "{filteredFeedback[0].text}"</p>
            </div>
        ) : (
            <p className="text-gray-600">Nincsenek új visszajelzések.</p>
        )}
    </div>
  );

  const SzavazasokWidget = () => {
      const activePolls = useMemo(() => filteredPolls.filter(p => !p.closesAt || p.closesAt.toDate() > new Date()), [filteredPolls]);
      return (
          <div className="bg-white p-6 rounded-2xl shadow-md border h-full">
              <div className="flex items-center gap-2 mb-4">
                  <PollsIcon className="h-6 w-6 text-cyan-600" />
                  <h2 className="text-xl font-bold text-gray-800">Szavazások ({activePolls.length})</h2>
              </div>
              {activePolls.length > 0 ? (
                   <div className="space-y-2">
                      {activePolls.slice(0,2).map(poll => (
                          <div key={poll.id} className="p-2 bg-cyan-50 border-l-4 border-cyan-400 rounded-r-lg">
                             <p className="text-sm font-medium text-gray-800 truncate">{poll.question}</p>
                          </div>
                      ))}
                  </div>
              ) : (
                  <p className="text-gray-600">Nincsenek aktív szavazások.</p>
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
      <div className="flex justify-between items-center mb-2">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Üdv, {currentUser.firstName}!</h1>
          <p className="text-gray-600 mt-1">Jó újra látni. Itt egy gyors áttekintés a mai napodról.</p>
        </div>
        <div>
            {isEditMode ? (
                 <button onClick={handleSaveConfig} className="bg-green-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-800 flex items-center gap-2">
                    Mentés
                </button>
            ) : (
                <button onClick={() => setIsEditMode(true)} className="p-2 rounded-full hover:bg-gray-100 border-2 border-transparent hover:border-gray-300" title="Widgetek szerkesztése">
                    <PencilIcon className="h-6 w-6 text-gray-600"/>
                </button>
            )}
        </div>
      </div>
      {isEditMode && <p className="text-sm text-blue-600 bg-blue-50 p-3 rounded-lg my-4">Szerkesztő mód aktív. Rendezd a kártyákat a nyilakkal, vagy kapcsold ki őket a szem ikonnal.</p>}

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
                        ${isEditMode ? 'border-2 border-dashed border-blue-400 rounded-2xl p-1 bg-blue-50' : ''}
                        ${!isVisible && isEditMode ? 'opacity-30' : ''}
                    `}
                >
                   {isEditMode && (
                        <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 bg-white/70 backdrop-blur-sm p-1 rounded-full shadow">
                            <button 
                                onClick={() => moveWidget(widget.id, 'up')}
                                disabled={index === 0}
                                className="p-1.5 hover:bg-gray-200 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Fel"
                            >
                                <ArrowUpIcon />
                            </button>
                            <button 
                                onClick={() => moveWidget(widget.id, 'down')}
                                disabled={index === sortedWidgets.length - 1}
                                className="p-1.5 hover:bg-gray-200 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Le"
                            >
                                <ArrowDownIcon />
                            </button>
                            <div className="w-px h-5 bg-gray-300 mx-1"></div>
                            <button onClick={() => toggleWidgetVisibility(widget.id)} className="p-1.5 hover:bg-gray-200 rounded-full" title={isVisible ? 'Elrejt' : 'Megjelenít'}>
                                {isVisible ? <EyeIcon/> : <EyeSlashIcon/>}
                            </button>
                        </div>
                   )}
                   <div 
                     className={`h-full ${isClickable ? 'cursor-pointer' : ''}`}
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