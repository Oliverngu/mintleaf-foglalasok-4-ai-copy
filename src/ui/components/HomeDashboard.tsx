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
  useBrandTheme: boolean;
  onBrandChange: (enabled: boolean) => void;
  themeBases: ThemeBases;
  onThemeBasesChange: (bases: ThemeBases) => void;
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
  useBrandTheme,
  onBrandChange,
  themeBases,
  onThemeBasesChange,
}) => {
  const isGlobalAdmin = currentUser?.role === 'Admin';

  const [isClockInModalOpen, setClockInModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig[]>([]);
  const [wages, setWages] = useState<Record<string, number | ''>>({});
  const isMultiUnitView = activeUnitIds.length > 1;
  const [showThemeEditor, setShowThemeEditor] = useState(false);

  // --- Data Filtering ---
  const filteredTimeEntries = useMemo(() => timeEntries.filter(e => activeUnitIds.includes(e.unitId)), [timeEntries, activeUnitIds]);
  const filteredSchedule = useMemo(() => schedule.filter(s => s.unitId && activeUnitIds.includes(s.unitId)), [schedule, activeUnitIds]);
  const filteredRequests = useMemo(() => requests.filter(r => r.unitId && activeUnitIds.includes(r.unitId)), [requests, activeUnitIds]);
  const filteredTodos = useMemo(() => todos.filter(t => t.unitId && activeUnitIds.includes(t.unitId)), [todos, activeUnitIds]);
  const filteredFeedback = useMemo(() => feedbackList.filter(f => activeUnitIds.includes(f.unitId)), [feedbackList, activeUnitIds]);
  const filteredPolls = useMemo(() => polls.filter(p => activeUnitIds.includes(p.unitId)), [polls, activeUnitIds]);
  
  const unitMap = useMemo(() => new Map(allUnits.map(unit => [unit.id, unit])), [allUnits]);
  const primaryUnit = useMemo(() => activeUnit || unitMap.get(activeUnitIds[0]) || null, [activeUnit, activeUnitIds, unitMap]);

  useEffect(() => {
    const fetchWages = async () => {
        try {
            const docRef = doc(db, 'user_private_data', currentUser.id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) setWages(docSnap.data()?.wages || {});
        } catch (error) { console.error("Wage fetch error:", error); }
    };
    fetchWages();
  }, [currentUser.id]);

  useEffect(() => {
    const userConfig = currentUser.dashboardConfig;
    if (userConfig && userConfig.length > 0) {
      const userWidgetIds = new Set(userConfig.map(w => w.id));
      const newConfig = [...userConfig];
      DEFAULT_WIDGETS.forEach(w => { if (!userWidgetIds.has(w.id)) newConfig.push(w); });
      setWidgetConfig(newConfig);
    } else {
      setWidgetConfig(DEFAULT_WIDGETS);
    }
  }, [currentUser.dashboardConfig]);

  const activeTimeEntry = useMemo(() => filteredTimeEntries.find(e => e.status === 'active'), [filteredTimeEntries]);
  const [activeShiftDuration, setActiveShiftDuration] = useState('');

  useEffect(() => {
    let interval: number;
    if (activeTimeEntry) {
      interval = window.setInterval(() => {
        const now = new Date();
        const start = activeTimeEntry.startTime.toDate();
        if (now < start) {
            setActiveShiftDuration(`Műszak kezdődik: ${start.toLocaleTimeString('hu-HU', {hour:'2-digit', minute:'2-digit'})}`);
        } else {
            const diffMs = now.getTime() - start.getTime();
            const h = Math.floor(diffMs / 3600000);
            const m = Math.floor((diffMs % 3600000) / 60000);
            const s = Math.floor((diffMs % 60000) / 1000);
            setActiveShiftDuration(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeTimeEntry]);

  const todayShifts = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
    return filteredSchedule.filter(s => { const d = s.start.toDate(); return d >= today && d < tomorrow; });
  }, [filteredSchedule]);

  const upcomingShift = useMemo(() => {
    const now = new Date();
    return todayShifts.filter(s => s.userId === currentUser.id && s.start.toDate() > now).sort((a,b) => a.start.toMillis() - b.start.toMillis())[0];
  }, [todayShifts, currentUser.id]);

  const openRequests = useMemo(() => filteredRequests.filter(r => r.status === 'pending'), [filteredRequests]);
  const activeTodos = useMemo(() => filteredTodos.filter(t => !t.isDone), [filteredTodos]);

  const handleSaveConfig = async () => {
    try {
        await updateDoc(doc(db, 'users', currentUser.id), { dashboardConfig: widgetConfig });
        setIsEditMode(false);
    } catch (e) { alert("Hiba a mentéskor."); }
  };

  const toggleWidgetVisibility = (id: string) => setWidgetConfig(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  
  const moveWidget = (id: string, dir: 'up' | 'down') => {
    const sorted = [...widgetConfig].sort((a,b) => a.order - b.order);
    const idx = sorted.findIndex(w => w.id === id);
    if (idx === -1) return;
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    
    const newConfig = [...widgetConfig];
    const curr = newConfig.find(w => w.id === sorted[idx].id);
    const target = newConfig.find(w => w.id === sorted[targetIdx].id);
    if (curr && target) {
        const temp = curr.order; curr.order = target.order; target.order = temp;
        setWidgetConfig(newConfig);
    }
  };

  // --- WIDGETEK ---
  // Fontos: A 'bg-white' helyett 'var(--color-surface)'-t használunk!
  const commonWidgetStyle = { backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)', borderColor: 'var(--color-border)' };

  const ShiftAndPayrollWidget = () => {
    const [isPayVisible, setIsPayVisible] = useState(false);
    const monthlyData = useMemo(() => {
        if (!Object.keys(wages).length) return { totalHours: 0, totalEarnings: 0 };
        const now = new Date();
        const entries = filteredTimeEntries.filter(e => {
            const t = e.startTime.toDate();
            return e.status === 'completed' && t.getMonth() === now.getMonth() && t.getFullYear() === now.getFullYear();
        });
        return entries.reduce((acc, e) => {
            if(e.endTime) {
                const dur = (e.endTime.toMillis() - e.startTime.toMillis()) / 3600000;
                acc.totalHours += dur;
                acc.totalEarnings += dur * (Number(wages[e.unitId]) || 0);
            }
            return acc;
        }, { totalHours: 0, totalEarnings: 0 });
    }, [filteredTimeEntries, wages]);

    return (
        <div className="p-6 rounded-2xl shadow-md border flex flex-col items-center justify-between text-center h-full transition-colors duration-200" style={commonWidgetStyle}>
            <div className="w-full">
                <div className="flex items-center justify-center gap-2 mb-2">
                    <ClockInOutIcon className="h-6 w-6 text-green-600"/>
                    <h2 className="text-xl font-bold">Műszak és Bér</h2>
                </div>
                {activeTimeEntry ? (
                    <div>
                        <p style={{color:'var(--color-text-secondary)'}}>{activeShiftDuration.startsWith('Műszak')?'Hamarosan...':'Aktív:'}</p>
                        <p className={`my-1 font-bold ${activeShiftDuration.startsWith('Műszak')?'text-lg':'text-3xl text-green-600'}`}>{activeShiftDuration}</p>
                    </div>
                ) : upcomingShift ? (
                    <div>
                        <p style={{color:'var(--color-text-secondary)'}}>Következő:</p>
                        <p className="text-xl font-bold my-2">{upcomingShift.start.toDate().toLocaleTimeString('hu-HU', {hour:'2-digit', minute:'2-digit'})}</p>
                    </div>
                ) : <p className="my-2" style={{color:'var(--color-text-secondary)'}}>Nincs több mára.</p>}
            </div>
            <div className="w-full mt-4">
                 <div className="py-4 border-t border-b" style={{borderColor:'var(--color-border)'}}>
                    <label className="text-sm font-semibold" style={{color:'var(--color-text-secondary)'}}>Becsült bér</label>
                    <div className="flex items-center justify-center gap-2 mt-1">
                        <p className={`text-2xl font-bold text-green-600 transition-all ${!isPayVisible && 'blur-md'}`}>{monthlyData.totalEarnings.toLocaleString('hu-HU',{style:'currency',currency:'HUF',maximumFractionDigits:0})}</p>
                        <button onClick={(e)=>{e.stopPropagation(); setIsPayVisible(!isPayVisible)}} className="opacity-60 hover:opacity-100">{isPayVisible?<EyeSlashIcon/>:<EyeIcon/>}</button>
                    </div>
                 </div>
                 <button onClick={(e)=>{if(!isEditMode){e.stopPropagation(); setClockInModalOpen(true)}}} className={`w-full mt-4 font-semibold py-2 px-4 rounded-lg text-white ${activeTimeEntry?'bg-red-600':'bg-green-600'} ${!isEditMode?'hover:opacity-90':'cursor-default opacity-70'}`}>
                    {activeTimeEntry ? 'Befejezés' : 'Kezdés'}
                </button>
            </div>
        </div>
    );
  };

  const QuickLinksWidget = () => (
    <div className="p-6 rounded-2xl shadow-md border h-full transition-colors duration-200" style={commonWidgetStyle}>
        <h2 className="text-xl font-bold mb-4">Gyorsmenü</h2>
        <div className="space-y-3">
            {[
                {label:'Beosztásom', app:'beosztas'}, 
                {label:'Szabadnap', app:'kerelemek'}, 
                {label:'Teendők', app:'todos'}
            ].map(l => (
                <button key={l.app} onClick={()=>!isEditMode && setActiveApp(l.app)} className={`w-full text-left p-3 rounded-lg font-semibold ${!isEditMode?'hover:opacity-80':'cursor-default opacity-70'}`} style={{backgroundColor:'var(--color-background)', color:'var(--color-text-main)'}}>
                    {l.label}
                </button>
            ))}
        </div>
    </div>
  );

  const TodosWidget = () => (
    <div className="p-6 rounded-2xl shadow-md border h-full transition-colors duration-200" style={commonWidgetStyle}>
        <div className="flex items-center gap-2 mb-4"><TodoIcon className="h-6 w-6 text-blue-600"/><h2 className="text-xl font-bold">Aktív teendők</h2></div>
        {activeTodos.slice(0,3).map(t => (
            <div key={t.id} className="p-2 bg-blue-50/50 border-l-4 border-blue-400 rounded-r-lg mb-2"><p className="text-sm font-medium truncate">{t.text}</p></div>
        ))}
        {activeTodos.length===0 && <p style={{color:'var(--color-text-secondary)'}}>Nincs teendő.</p>}
    </div>
  );

  const RequestsWidget = () => (
    <div className="p-5 rounded-2xl shadow-md border h-full flex flex-col justify-center transition-colors duration-200" style={commonWidgetStyle}>
        <div className="flex items-center gap-2"><CalendarIcon className="h-6 w-6 text-yellow-600"/><h3 className="font-bold">Függőben</h3></div>
        <p className="text-4xl font-bold text-yellow-600 mt-2">{openRequests.length}</p>
    </div>
  );

  const ScheduleWidget = () => (
    <div className="p-6 rounded-2xl shadow-md border h-full transition-colors duration-200" style={commonWidgetStyle}>
        <div className="flex items-center gap-2 mb-4"><ScheduleIcon className="h-6 w-6 text-indigo-600"/><h2 className="text-xl font-bold">Mai Beosztás</h2></div>
        <div className="space-y-3 overflow-y-auto max-h-64">
            {[...todayShifts].sort((a,b)=>a.start.toMillis()-b.start.toMillis()).map(s => (
                <div key={s.id} className="p-3 rounded-lg" style={{backgroundColor:'var(--color-background)'}}>
                    <p className="font-semibold">{s.userName}</p>
                    <p className="text-sm opacity-80">{s.isDayOff?'Szabadnap':`${s.start.toDate().toLocaleTimeString('hu-HU',{hour:'2-digit',minute:'2-digit'})} - ${s.end?s.end.toDate().toLocaleTimeString('hu-HU',{hour:'2-digit',minute:'2-digit'}):'Zárásig'}`}</p>
                </div>
            ))}
            {todayShifts.length===0 && <p style={{color:'var(--color-text-secondary)'}}>Üres.</p>}
        </div>
    </div>
  );

  const BookingsWidget = () => (
    <div className="p-6 rounded-2xl shadow-md border h-full transition-colors duration-200" style={commonWidgetStyle}>
        <h2 className="text-xl font-bold mb-4">Foglalások</h2>
        <p style={{color:'var(--color-text-secondary)'}}>Lista hamarosan.</p>
    </div>
  );

  const VelemenyekWidget = () => (
    <div className="p-6 rounded-2xl shadow-md border h-full transition-colors duration-200" style={commonWidgetStyle}>
        <div className="flex items-center gap-2 mb-4"><FeedbackIcon className="h-6 w-6 text-purple-600"/><h2 className="text-xl font-bold">Visszajelzések</h2></div>
        <p className="text-3xl font-bold">{filteredFeedback.length}</p>
    </div>
  );

  const SzavazasokWidget = () => (
    <div className="p-6 rounded-2xl shadow-md border h-full transition-colors duration-200" style={commonWidgetStyle}>
        <div className="flex items-center gap-2 mb-4"><PollsIcon className="h-6 w-6 text-cyan-600"/><h2 className="text-xl font-bold">Szavazások</h2></div>
        <p style={{color:'var(--color-text-secondary)'}}>Aktív: {filteredPolls.filter(p => !p.closesAt || p.closesAt.toDate()>new Date()).length}</p>
    </div>
  );

  const widgetMap: any = { shift_payroll: ShiftAndPayrollWidget, quicklinks: QuickLinksWidget, todos: TodosWidget, requests: RequestsWidget, schedule: ScheduleWidget, bookings: BookingsWidget, velemenyek: VelemenyekWidget, szavazasok: SzavazasokWidget };
  const sortedWidgets = useMemo(() => (isEditMode ? widgetConfig : widgetConfig.filter(w => w.visible)).sort((a,b) => a.order - b.order), [widgetConfig, isEditMode]);

  return (
    <div className="p-4 md:p-8">
       {isClockInModalOpen && <ClockInOutModal isOpen={isClockInModalOpen} onClose={()=>setClockInModalOpen(false)} activeTimeEntry={activeTimeEntry||null} currentUser={currentUser} />}
      
      {/* HEADER: KÉP MEGJELENÍTÉSE */}
      <div 
        className="rounded-2xl p-6 mb-8 text-white shadow-lg relative overflow-hidden transition-all duration-300"
        style={{
            backgroundColor: 'var(--color-header-bg)', 
            backgroundImage: 'var(--ui-header-image)', // EZ KELL A KÉPHEZ!
            backgroundBlendMode: 'var(--ui-header-blend-mode)',
            backgroundSize: 'cover', backgroundPosition: 'center',
            color: 'var(--color-text-on-primary)'
        }}
      >
        <div className="absolute inset-0 bg-black/10 pointer-events-none" />
        <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div><h1 className="text-3xl font-bold">Üdv, {currentUser.firstName}!</h1><p className="mt-1 opacity-90">Jó újra látni.</p></div>
            <div className="flex items-center gap-3">
                <ThemeSelector 
                    activeUnit={primaryUnit} 
                    currentTheme={themeMode}
                    onThemeChange={onThemeChange} 
                    useBrandTheme={useBrandTheme}
                    onBrandChange={onBrandChange}
                />
                {isGlobalAdmin && <button onClick={()=>setShowThemeEditor(prev=>!prev)} className="px-3 py-2 text-sm font-semibold rounded-lg border bg-white/20 hover:bg-white/30 text-white backdrop-blur-md">Editor</button>}
                <button onClick={()=>setIsEditMode(!isEditMode)} className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white backdrop-blur-md"><PencilIcon className="h-6 w-6"/></button>
            </div>
        </div>
      </div>

      {isGlobalAdmin && showThemeEditor && <div className="mb-4"><AdminThemeEditor bases={themeBases} onChangeBases={onThemeBasesChange} onClose={()=>setShowThemeEditor(false)} /></div>}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
          {sortedWidgets.map((widget, index) => {
            const WC = widgetMap[widget.id];
            if (!WC) return null;
            const targetApp = {shift_payroll:'berezesem',todos:'todos',requests:'kerelemek',schedule:'beosztas',bookings:'foglalasok',velemenyek:'velemenyek',szavazasok:'szavazasok'}[widget.id];
            return (
                <div key={widget.id} className={`relative transition-opacity duration-300 ${widget.id==='schedule'?'md:col-span-2':''} ${isEditMode?'border-2 border-dashed border-blue-400 rounded-2xl p-1':''} ${!widget.visible && isEditMode ? 'opacity-50' : ''}`}>
                   {isEditMode && (
                        <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 backdrop-blur-md p-1 rounded-full shadow border border-gray-200" style={{backgroundColor:'var(--color-surface)', color:'var(--color-text-main)'}}>
                            <button onClick={()=>moveWidget(widget.id,'up')} disabled={index===0} className="p-1.5 hover:bg-black/5 rounded-full disabled:opacity-30"><ArrowUpIcon/></button>
                            <button onClick={()=>moveWidget(widget.id,'down')} disabled={index===sortedWidgets.length-1} className="p-1.5 hover:bg-black/5 rounded-full disabled:opacity-30"><ArrowDownIcon/></button>
                            <div className="w-px h-5 bg-gray-300 mx-1"></div>
                            <button onClick={()=>toggleWidgetVisibility(widget.id)} className="p-1.5 hover:bg-black/5 rounded-full">{widget.visible?<EyeIcon/>:<EyeSlashIcon/>}</button>
                        </div>
                   )}
                   <div className={`h-full ${!isEditMode && targetApp ? 'cursor-pointer hover:opacity-95' : ''}`} onClick={!isEditMode && targetApp ? ()=>setActiveApp(targetApp):undefined}><WC/></div>
                </div>
            )
          })}
      </div>
    </div>
  );
};

export default HomeDashboard;
