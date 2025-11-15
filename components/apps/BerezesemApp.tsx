import React, { useState, useEffect, useMemo } from 'react';
import { User, Shift, TimeEntry, Unit } from '../../data/mockData';
import { db, Timestamp } from '../../firebase/config';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection } from 'firebase/firestore';
import LoadingSpinner from '../LoadingSpinner';
import MoneyIcon from '../icons/MoneyIcon';
import PencilIcon from '../icons/PencilIcon';
import TrashIcon from '../icons/TrashIcon';
import PlusIcon from '../icons/PlusIcon';
import ScheduleIcon from '../icons/ScheduleIcon';
import ArrowDownIcon from '../icons/ArrowDownIcon';

interface BerezesemAppProps {
  currentUser: User;
  schedule: Shift[];
  activeUnitIds: string[];
  timeEntries: TimeEntry[];
  allUnits: Unit[];
}

const calculateShiftDuration = (shift: Shift): number => {
    if (!shift.start || !shift.end) return 0;
    const durationMs = shift.end.toMillis() - shift.start.toMillis();
    return durationMs > 0 ? durationMs / (1000 * 60 * 60) : 0;
};

// Helper to get YYYY-MM-DD string from a local Date object, avoiding timezone issues.
const toLocalDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};


// --- Day Entries Modal Component ---
const DayEntriesModal: React.FC<{
    date: Date;
    entries: TimeEntry[];
    allUnits: Unit[];
    onClose: () => void;
    onEdit: (entry: TimeEntry) => void;
    onAddNew: (date: Date) => void;
    onDelete: (entryId: string) => Promise<void>;
}> = ({ date, entries, allUnits, onClose, onEdit, onAddNew, onDelete }) => {
    const getUnitName = (unitId: string) => allUnits.find(u => u.id === unitId)?.name || 'Ismeretlen';

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">
                        Bejegyzések - {date.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 text-gray-500">&times;</button>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
                    {entries.length > 0 ? entries.sort((a,b) => a.startTime.toMillis() - b.startTime.toMillis()).map(entry => {
                        const duration = entry.endTime ? (entry.endTime.toMillis() - entry.startTime.toMillis()) / (1000 * 60 * 60) : 0;
                        return (
                            <div key={entry.id} className="bg-gray-50 p-3 rounded-lg flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-gray-800">
                                        {entry.startTime.toDate().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
                                        {' - '}
                                        {entry.endTime?.toDate().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
                                        <span className="ml-2 font-normal text-sm text-gray-600">({duration.toFixed(2)} óra)</span>
                                    </p>
                                    <p className="text-sm text-gray-500">{getUnitName(entry.unitId)}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => onEdit(entry)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-full" title="Szerkesztés"><PencilIcon className="h-5 w-5" /></button>
                                    <button onClick={() => onDelete(entry.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-full" title="Törlés"><TrashIcon className="h-5 w-5" /></button>
                                </div>
                            </div>
                        );
                    }) : (
                        <p className="text-gray-500 text-center">Nincsenek bejegyzések ezen a napon.</p>
                    )}
                </div>
                <div className="p-4 bg-gray-50 flex justify-end gap-3 items-center rounded-b-2xl">
                    <button onClick={() => onAddNew(date)} className="bg-green-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-800 flex items-center gap-2">
                        <PlusIcon className="h-5 w-5" />
                        Új bejegyzés ehhez a naphoz
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- Add Modal Component ---
interface AddTimeEntryModalProps {
    currentUser: User;
    allUnits: Unit[];
    onClose: () => void;
    onSave: (newEntry: { start: Date; end: Date; unitId: string }) => Promise<void>;
    initialDate?: Date;
}

const AddTimeEntryModal: React.FC<AddTimeEntryModalProps> = ({ currentUser, allUnits, onClose, onSave, initialDate }) => {
    const userUnits = useMemo(() => 
        allUnits.filter(u => currentUser.unitIds?.includes(u.id)),
    [allUnits, currentUser.unitIds]);
    
    const [formData, setFormData] = useState({
        date: initialDate ? toLocalDateKey(initialDate) : toLocalDateKey(new Date()),
        startTime: '08:00',
        endTime: '16:00',
        unitId: userUnits.length === 1 ? userUnits[0].id : '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData(prev => ({...prev, [e.target.name]: e.target.value}));
    };

    const handleSave = async () => {
        setError('');
        if (!formData.unitId) {
            setError('Kérlek, válassz egységet.');
            return;
        }
        const newStart = new Date(`${formData.date}T${formData.startTime}`);
        const newEnd = new Date(`${formData.date}T${formData.endTime}`);
        
        if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
            setError('Érvénytelen dátum vagy idő formátum.');
            return;
        }
        if (newEnd <= newStart) {
            newEnd.setDate(newEnd.getDate() + 1); // Assume overnight if end is before start
        }
        setIsSaving(true);
        await onSave({ start: newStart, end: newEnd, unitId: formData.unitId });
        setIsSaving(false); // onSave will close the modal
    };
    
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">Új időbejegyzés</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 text-gray-500">&times;</button>
                </div>
                <div className="p-6 space-y-4">
                    {userUnits.length > 1 && (
                        <div>
                            <label className="text-sm font-medium">Egység</label>
                            <select name="unitId" value={formData.unitId} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg bg-white" required>
                                <option value="" disabled>Válassz...</option>
                                {userUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div><label className="text-sm font-medium">Dátum</label><input type="date" name="date" value={formData.date} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg"/></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-sm font-medium">Kezdés ideje</label><input type="time" name="startTime" value={formData.startTime} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg"/></div>
                        <div><label className="text-sm font-medium">Befejezés ideje</label><input type="time" name="endTime" value={formData.endTime} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg"/></div>
                    </div>
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                </div>
                <div className="p-4 bg-gray-50 flex justify-end gap-3 items-center rounded-b-2xl">
                    <button type="button" onClick={onClose} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold">Mégse</button>
                    <button type="button" onClick={handleSave} disabled={isSaving} className="bg-green-700 text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-400">{isSaving ? 'Mentés...' : 'Mentés'}</button>
                </div>
            </div>
        </div>
    )
};


// --- Edit Modal Component ---
interface EditTimeEntryModalProps {
    entry: TimeEntry;
    onClose: () => void;
    onSave: (entryId: string, newStart: Date, newEnd: Date) => Promise<void>;
    onDelete: (entryId: string) => Promise<void>;
}

const EditTimeEntryModal: React.FC<EditTimeEntryModalProps> = ({ entry, onClose, onSave, onDelete }) => {
    const toTimeInputString = (date: Date) => date.toTimeString().split(' ')[0].substring(0, 5);

    const [formData, setFormData] = useState({
        startDate: toLocalDateKey(entry.startTime.toDate()),
        startTime: toTimeInputString(entry.startTime.toDate()),
        endDate: entry.endTime ? toLocalDateKey(entry.endTime.toDate()) : '',
        endTime: entry.endTime ? toTimeInputString(entry.endTime.toDate()) : '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({...prev, [e.target.name]: e.target.value}));
    };

    const handleSave = async () => {
        setError('');
        const newStart = new Date(`${formData.startDate}T${formData.startTime}`);
        const newEnd = new Date(`${formData.endDate}T${formData.endTime}`);
        
        if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
            setError('Érvénytelen dátum vagy idő formátum.');
            return;
        }
        if (newEnd <= newStart) {
            setError('A befejezési időpontnak a kezdés után kell lennie.');
            return;
        }
        setIsSaving(true);
        await onSave(entry.id, newStart, newEnd);
        setIsSaving(false); // onSave will close the modal
    };
    
    return (
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                 <div className="p-5 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">Időbejegyzés szerkesztése</h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 text-gray-500">&times;</button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-sm font-medium">Kezdés dátuma</label><input type="date" name="startDate" value={formData.startDate} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg"/></div>
                        <div><label className="text-sm font-medium">Kezdés ideje</label><input type="time" name="startTime" value={formData.startTime} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg"/></div>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-sm font-medium">Befejezés dátuma</label><input type="date" name="endDate" value={formData.endDate} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg"/></div>
                        <div><label className="text-sm font-medium">Befejezés ideje</label><input type="time" name="endTime" value={formData.endTime} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg"/></div>
                    </div>
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                </div>
                <div className="p-4 bg-gray-50 flex justify-between items-center rounded-b-2xl">
                    <div>
                        <button type="button" onClick={async () => { await onDelete(entry.id); onClose(); }} className="text-red-600 font-semibold hover:bg-red-50 p-2 rounded-lg">Törlés</button>
                    </div>
                    <div className="flex gap-3">
                        <button type="button" onClick={onClose} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold">Mégse</button>
                        <button type="button" onClick={handleSave} disabled={isSaving} className="bg-green-700 text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-400">{isSaving ? 'Mentés...' : 'Mentés'}</button>
                    </div>
                </div>
            </div>
        </div>
    )
};


const BerezesemApp: React.FC<BerezesemAppProps> = ({ currentUser, schedule, activeUnitIds, timeEntries, allUnits }) => {
    const [wages, setWages] = useState<Record<string, number | ''>>({});
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    
    const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
    const [dateForNewEntry, setDateForNewEntry] = useState<Date | null>(null);
    const [selectedDayForEditing, setSelectedDayForEditing] = useState<Date | null>(null);
    const [isWagesExpanded, setIsWagesExpanded] = useState(false);

    const [currentDate, setCurrentDate] = useState(new Date());

    const userPrivateDataRef = useMemo(() => doc(db, 'user_private_data', currentUser.id), [currentUser.id]);
    const userUnits = useMemo(() => allUnits.filter(u => currentUser.unitIds?.includes(u.id)), [allUnits, currentUser.unitIds]);

    useEffect(() => {
        const fetchWages = async () => {
            setLoading(true);
            try {
                const docSnap = await getDoc(userPrivateDataRef);
                if (docSnap.exists()) {
                    setWages(docSnap.data()?.wages || {});
                }
            } catch (error) {
                console.error("Error fetching hourly wages:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchWages();
    }, [userPrivateDataRef]);

    const handleSaveWages = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setSuccessMessage('');
        try {
             const wagesToSave: Record<string, number> = {};
            Object.entries(wages).forEach(([unitId, wage]) => {
                wagesToSave[unitId] = Number(wage) || 0;
            });
            await setDoc(userPrivateDataRef, { wages: wagesToSave }, { merge: true });
            setSuccessMessage('Órabérek sikeresen mentve!');
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (error) {
            console.error("Error saving hourly wages:", error);
            alert('Hiba történt a mentés során.');
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleUpdateEntry = async (entryId: string, newStart: Date, newEnd: Date) => {
        try {
            await updateDoc(doc(db, 'time_entries', entryId), {
                startTime: Timestamp.fromDate(newStart),
                endTime: Timestamp.fromDate(newEnd),
            });
            setEditingEntry(null);
        } catch (err) {
            console.error("Error updating time entry:", err);
            alert("Hiba történt a bejegyzés frissítésekor.");
        }
    };
    
    const handleDeleteEntry = async (entryId: string) => {
        if (window.confirm('Biztosan törölni szeretnéd ezt a bejegyzést?')) {
            try {
                await deleteDoc(doc(db, 'time_entries', entryId));
                if (editingEntry?.id === entryId) {
                    setEditingEntry(null);
                }
            } catch (err) {
                console.error("Error deleting time entry:", err);
                alert("Hiba történt a törlés során.");
            }
        }
    };

    const handleAddNewEntry = async (entryData: { start: Date; end: Date; unitId: string }) => {
        try {
            await addDoc(collection(db, 'time_entries'), {
                userId: currentUser.id,
                startTime: Timestamp.fromDate(entryData.start),
                endTime: Timestamp.fromDate(entryData.end),
                unitId: entryData.unitId,
                status: 'completed',
            });
            setDateForNewEntry(null);
        } catch (err) {
            console.error("Error adding new time entry:", err);
            alert("Hiba történt a bejegyzés mentésekor.");
        }
    };
    
    const completedEntries = useMemo(() => 
        timeEntries
            .filter(entry => entry.status === 'completed' && entry.endTime)
            .sort((a, b) => b.startTime.toMillis() - a.startTime.toMillis()),
        [timeEntries]
    );

    const entriesByDate = useMemo(() => {
        const map = new Map<string, TimeEntry[]>();
        completedEntries.forEach(entry => {
            const key = toLocalDateKey(entry.startTime.toDate());
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(entry);
        });
        return map;
    }, [completedEntries]);


    const monthTotals = useMemo(() => {
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

        const { totalHours, totalEarnings } = completedEntries.reduce((acc, entry) => {
            const entryDate = entry.startTime.toDate();
            if (entryDate >= startOfMonth && entryDate <= endOfMonth && entry.endTime) {
                const duration = (entry.endTime.toMillis() - entry.startTime.toMillis()) / (1000 * 60 * 60);
                const wageForUnit = Number(wages[entry.unitId]) || 0;
                acc.totalHours += duration;
                acc.totalEarnings += duration * wageForUnit;
            }
            return acc;
        }, { totalHours: 0, totalEarnings: 0 });

        return { totalHours, totalEarnings };
    }, [completedEntries, wages, currentDate]);

    const userShifts = useMemo(() => 
        schedule.filter(s => 
            s.userId === currentUser.id && 
            s.status === 'published' &&
            s.unitId && activeUnitIds.includes(s.unitId)
        ),
    [schedule, currentUser.id, activeUnitIds]);

    const weeklyData = useMemo(() => {
        const weeks: { [key: string]: { hours: number, earnings: number, weekLabel: string } } = {};
        
        userShifts.forEach(shift => {
            const shiftDate = shift.start.toDate();
            const day = shiftDate.getDay();
            const diff = shiftDate.getDate() - day + (day === 0 ? -6 : 1); 
            const weekStart = new Date(shiftDate.setDate(diff));
            weekStart.setHours(0,0,0,0);
            const weekStartKey = weekStart.toISOString().split('T')[0];

            if (!weeks[weekStartKey]) {
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 6);
                weeks[weekStartKey] = { 
                    hours: 0, 
                    earnings: 0,
                    weekLabel: `${weekStart.toLocaleDateString('hu-HU', {month: 'short', day: 'numeric'})} - ${weekEnd.toLocaleDateString('hu-HU', {month: 'short', day: 'numeric'})}`
                };
            }

            const duration = calculateShiftDuration(shift);
            const wageForUnit = Number(wages[shift.unitId!]) || 0;
            weeks[weekStartKey].hours += duration;
            weeks[weekStartKey].earnings += duration * wageForUnit;
        });

        return Object.entries(weeks).sort(([a], [b]) => b.localeCompare(a));
    }, [userShifts, wages]);

    const handleDayClick = (day: Date) => {
        const dateKey = toLocalDateKey(day);
        const dayEntries = entriesByDate.get(dateKey) || [];
        if (dayEntries.length > 0) {
            setSelectedDayForEditing(day);
        } else {
            setDateForNewEntry(day);
        }
    };


    const renderCalendar = () => {
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const days = [];
        const startDayOfWeek = (startOfMonth.getDay() + 6) % 7;

        for (let i = 0; i < startDayOfWeek; i++) {
            days.push(null); // Placeholder for empty cells
        }
        for (let i = 1; i <= endOfMonth.getDate(); i++) {
            days.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
        }

        const todayKey = toLocalDateKey(new Date());
        
        return (
             <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                    <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className="p-2 rounded-full hover:bg-gray-100">&lt;</button>
                    <h2 className="text-xl font-bold text-gray-800 capitalize">{currentDate.toLocaleDateString('hu-HU', { month: 'long', year: 'numeric' })}</h2>
                    <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className="p-2 rounded-full hover:bg-gray-100">&gt;</button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center font-semibold text-gray-500 text-sm mb-2">
                    {['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'].map(day => <div key={day}>{day}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {days.map((day, index) => {
                        if (!day) return <div key={`empty-${index}`}></div>;
                        
                        const dateKey = toLocalDateKey(day);
                        const dayEntries = entriesByDate.get(dateKey) || [];
                        const dayHours = dayEntries.reduce((sum, entry) => {
                            if (entry.endTime) return sum + (entry.endTime.toMillis() - entry.startTime.toMillis()) / (1000 * 60 * 60);
                            return sum;
                        }, 0);

                        return (
                            <div key={dateKey} onClick={() => handleDayClick(day)} className={`h-24 p-2 flex flex-col items-start rounded-lg transition-colors cursor-pointer hover:bg-gray-100 ${dateKey === todayKey ? 'border-2 border-green-500' : 'border border-gray-200'}`}>
                                <span className={`font-bold ${dateKey === todayKey ? 'text-green-600' : 'text-gray-800'}`}>{day.getDate()}</span>
                                {dayHours > 0 && (
                                    <div className="mt-auto w-full text-left">
                                        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">
                                            {dayHours.toFixed(1)} óra
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        )
    }

    if (loading) {
        return <div className="relative h-64"><LoadingSpinner /></div>;
    }

    return (
        <div className="p-4 md:p-8">
            {editingEntry && (
                <EditTimeEntryModal 
                    entry={editingEntry}
                    onClose={() => setEditingEntry(null)}
                    onSave={handleUpdateEntry}
                    onDelete={handleDeleteEntry}
                />
            )}
            {dateForNewEntry && (
                <AddTimeEntryModal
                    currentUser={currentUser}
                    allUnits={allUnits}
                    onClose={() => setDateForNewEntry(null)}
                    onSave={handleAddNewEntry}
                    initialDate={dateForNewEntry}
                />
            )}
            {selectedDayForEditing && (
                <DayEntriesModal
                    date={selectedDayForEditing}
                    entries={entriesByDate.get(toLocalDateKey(selectedDayForEditing)) || []}
                    allUnits={allUnits}
                    onClose={() => setSelectedDayForEditing(null)}
                    onEdit={(entry) => {
                        setSelectedDayForEditing(null);
                        setEditingEntry(entry);
                    }}
                    onAddNew={(date) => {
                        setSelectedDayForEditing(null);
                        setDateForNewEntry(date);
                    }}
                    onDelete={handleDeleteEntry}
                />
            )}

            <h1 className="text-3xl font-bold text-gray-800 mb-6">Óraszámok</h1>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                     <div className="bg-white rounded-2xl shadow-lg border border-gray-100 sticky top-8">
                        <button
                            onClick={() => setIsWagesExpanded(prev => !prev)}
                            className="w-full flex justify-between items-center p-6 text-left"
                            aria-expanded={isWagesExpanded}
                        >
                            <h2 className="text-xl font-bold text-gray-800">Órabér Beállítások</h2>
                            <ArrowDownIcon className={`h-6 w-6 text-gray-500 transform transition-transform duration-300 ${isWagesExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        {isWagesExpanded && (
                            <form onSubmit={handleSaveWages} className="p-6 pt-0">
                                <p className="text-sm text-gray-500 mb-4">Az itt megadott adatokat csak te látod.</p>
                                <div className="space-y-3">
                                    {userUnits.length > 0 ? userUnits.map(unit => (
                                        <div key={unit.id}>
                                            <label htmlFor={`wage-${unit.id}`} className="block text-sm font-medium text-gray-700">{unit.name}</label>
                                            <div className="mt-1 relative rounded-md shadow-sm">
                                                <input
                                                    id={`wage-${unit.id}`}
                                                    type="number"
                                                    value={wages[unit.id] || ''}
                                                    onChange={(e) => setWages(prev => ({ ...prev, [unit.id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                                                    placeholder="2500"
                                                    className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500 pr-16 bg-white text-gray-800"
                                                />
                                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                                    <span className="text-gray-500 sm:text-sm">Ft/óra</span>
                                                </div>
                                            </div>
                                        </div>
                                    )) : <p className="text-sm text-gray-500">Nincs egységhez rendelve.</p>}
                                </div>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="mt-4 w-full bg-green-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-800 disabled:bg-gray-400"
                                >
                                    {isSaving ? 'Mentés...' : 'Órabérek mentése'}
                                </button>
                                {successMessage && <p className="text-green-600 text-sm mt-2 font-semibold">{successMessage}</p>}
                            </form>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-2 space-y-8">
                     <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
                        <h2 className="text-xl font-bold text-gray-800">Manuális óraszámvezető</h2>
                        <div className="p-4 bg-green-50 rounded-lg border border-green-200 my-4 flex justify-around text-center">
                            <div>
                                <p className="text-sm text-green-800 font-semibold">Havi óraszám</p>
                                <p className="text-2xl font-bold text-green-700">{monthTotals.totalHours.toFixed(2)}</p>
                            </div>
                            <div>
                                <p className="text-sm text-green-800 font-semibold">Havi becsült kereset</p>
                                <p className="text-2xl font-bold text-green-700">{monthTotals.totalEarnings.toLocaleString('hu-HU', {style: 'currency', currency: 'HUF', maximumFractionDigits: 0})}</p>
                            </div>
                        </div>
                        {renderCalendar()}
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
                         <h2 className="text-xl font-bold text-gray-800 mb-4">Becsült heti bérezés (beosztás alapján)</h2>
                         {userShifts.length > 0 && Object.keys(wages).some(key => Number(wages[key]) > 0) ? (
                            <div className="space-y-3">
                                {weeklyData.map(([key, data]) => (
                                    <div key={key} className="p-4 bg-gray-50 rounded-lg border flex justify-between items-center">
                                        <div>
                                            <p className="font-semibold text-gray-800">{data.weekLabel}</p>
                                            <p className="text-sm text-gray-600">{data.hours.toFixed(1)} beosztott óra</p>
                                        </div>
                                        <p className="font-bold text-lg text-green-700">{data.earnings.toLocaleString('hu-HU', {style: 'currency', currency: 'HUF', maximumFractionDigits: 0})}</p>
                                    </div>
                                ))}
                            </div>
                         ) : (
                            <div className="text-center py-10">
                                <ScheduleIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                                <h3 className="text-lg font-semibold text-gray-700">Nincs adat a kalkulációhoz</h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    {!Object.keys(wages).some(key => Number(wages[key]) > 0)
                                        ? "Add meg az órabéred a kezdéshez." 
                                        : "Nincsenek publikált műszakjaid a kiválasztott egység(ek)ben."}
                                </p>
                            </div>
                         )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BerezesemApp;