import React, { useState, useMemo } from 'react';
import { Request, User } from '../../data/mockData';
import { db, Timestamp, serverTimestamp } from '../../firebase/config';
import { collection, doc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import CalendarIcon from '../icons/CalendarIcon';
import LoadingSpinner from '../LoadingSpinner';
import CheckIcon from '../icons/CheckIcon';
import XIcon from '../icons/XIcon';
import TrashIcon from '../icons/TrashIcon';

interface KerelemekAppProps {
  requests: Request[];
  loading: boolean;
  error: string | null;
  currentUser: User;
  canManage: boolean;
}

interface RequestFormProps {
  user: User;
  onSubmit: (dateBlocks: { startDate: Date; endDate: Date }[], note: string) => void;
  onCancel: () => void;
  allRequests: Request[];
}


const RequestForm: React.FC<RequestFormProps> = ({ user, onSubmit, onCancel, allRequests }) => {
  const [note, setNote] = useState('');
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [error, setError] = useState('');

  const toKey = (date: Date): string => {
    if (!date || isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const requestsByDate = useMemo(() => {
    const map = new Map<string, Request[]>();
    if (allRequests) {
        allRequests.forEach(request => {
            if (request.startDate && request.endDate) {
                const start = request.startDate.toDate();
                const end = request.endDate.toDate();
                for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    const key = toKey(new Date(d));
                    if (key) {
                        if (!map.has(key)) {
                            map.set(key, []);
                        }
                        map.get(key)!.push(request);
                    }
                }
            }
        });
    }
    return map;
  }, [allRequests]);


  const handleDateClick = (day: Date) => {
    setError('');
    const dayKey = toKey(day);
    const index = selectedDates.findIndex(d => toKey(d) === dayKey);
    if (index > -1) {
      setSelectedDates(prev => prev.filter((_, i) => i !== index));
    } else {
      setSelectedDates(prev => [...prev, day].sort((a, b) => a.getTime() - b.getTime()));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDates.length === 0) {
      setError('Kérlek, válassz ki legalább egy napot a naptárból.');
      return;
    }

    // Group consecutive dates into blocks
    const dateBlocks: { startDate: Date; endDate: Date }[] = [];
    if (selectedDates.length > 0) {
      let currentBlock = { startDate: selectedDates[0], endDate: selectedDates[0] };
      for (let i = 1; i < selectedDates.length; i++) {
        const prevDate = currentBlock.endDate;
        const currentDate = selectedDates[i];
        const nextDay = new Date(prevDate);
        nextDay.setDate(nextDay.getDate() + 1);
        if (nextDay.getTime() === currentDate.getTime()) {
          currentBlock.endDate = currentDate;
        } else {
          dateBlocks.push(currentBlock);
          currentBlock = { startDate: currentDate, endDate: currentDate };
        }
      }
      dateBlocks.push(currentBlock);
    }
    onSubmit(dateBlocks, note);
  };

  const renderCalendar = () => {
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const days = [];
    const startDayOfWeek = (startOfMonth.getDay() + 6) % 7;
    for (let i = 0; i < startDayOfWeek; i++) {
      const day = new Date(startOfMonth);
      day.setDate(day.getDate() - (startDayOfWeek - i));
      days.push({ date: day, isCurrentMonth: false });
    }
    for (let i = 1; i <= endOfMonth.getDate(); i++) {
      const day = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i);
      days.push({ date: day, isCurrentMonth: true });
    }
    const totalDays = days.length;
    const remainingCells = (totalDays > 35 ? 42 : 35) - totalDays;
    for (let i = 1; i <= remainingCells; i++) {
      const day = new Date(endOfMonth);
      day.setDate(day.getDate() + i);
      days.push({ date: day, isCurrentMonth: false });
    }
    const todayKey = toKey(new Date());
    const selectedKeys = selectedDates.map(toKey);

    return (
      <div>
        <div className="flex justify-between items-center mb-2">
           <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="p-2 rounded-full hover:bg-gray-100">&lt;</button>
          <h3 className="font-bold text-lg">{currentMonth.toLocaleDateString('hu-HU', { month: 'long', year: 'numeric' })}</h3>
          <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="p-2 rounded-full hover:bg-gray-100">&gt;</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center font-semibold text-gray-500 text-sm mb-2">
          {['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map(({ date, isCurrentMonth }, i) => {
            const dateKey = toKey(date);
            const isSelected = selectedKeys.includes(dateKey);
            const isToday = dateKey === todayKey;
            const dayRequests = requestsByDate.get(dateKey) || [];

            return (
              <div
                key={i}
                onClick={() => isCurrentMonth && handleDateClick(date)}
                className={`
                  relative p-1 h-12 flex items-center justify-center text-sm rounded-lg
                  ${isCurrentMonth ? 'cursor-pointer text-gray-700' : 'text-gray-300'}
                  ${isToday && !isSelected && 'border-2 border-green-500'}
                  ${isSelected ? 'bg-green-700 text-white font-bold' : (isCurrentMonth ? 'hover:bg-gray-100' : '')}
                `}
              >
                {date.getDate()}
                 {dayRequests.length > 0 && !isSelected && isCurrentMonth && (
                    <div title={`${dayRequests.length} kérelem ezen a napon`} className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-blue-500 rounded-full"></div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 mt-4">
        <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-800">Szabadnap kérelem</h2>
            <div>
                <label htmlFor="userName" className="block text-sm font-medium text-gray-700">Név</label>
                <input type="text" id="userName" value={user.fullName} readOnly className="mt-1 w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md shadow-sm" />
            </div>
            <div>
                <label htmlFor="note" className="block text-sm font-medium text-gray-700">Megjegyzés (opcionális)</label>
                <textarea id="note" value={note} onChange={e => setNote(e.target.value)} rows={3} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500"></textarea>
                <p className="text-xs text-gray-500 mt-1">A megjegyzést csak az adminisztrátorok látják.</p>
            </div>
            <div>
                 <label className="block text-sm font-medium text-gray-700 mb-2">Napok kiválasztása</label>
                 {renderCalendar()}
            </div>
            {error && <p className="text-red-500 text-sm font-semibold">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onCancel} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">Mégse</button>
                <button type="submit" className="bg-green-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-800">Kérelem benyújtása</button>
            </div>
        </form>
    </div>
  );
};


const KerelemekApp: React.FC<KerelemekAppProps> = ({ requests, loading, error, currentUser, canManage }) => {
  const [isFormVisible, setIsFormVisible] = useState(false);
  const isAdmin = canManage;

  const { pending, approved, rejected, myRequests } = useMemo(() => {
    const sortedRequests = [...requests].sort((a,b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
    return {
        pending: sortedRequests.filter(r => r.status === 'pending'),
        approved: sortedRequests.filter(r => r.status === 'approved'),
        rejected: sortedRequests.filter(r => r.status === 'rejected'),
        myRequests: sortedRequests.filter(r => r.userId === currentUser.id)
    }
  }, [requests, currentUser.id]);

  if (currentUser.role === 'Guest') {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-bold text-red-600">Hozzáférés megtagadva</h2>
        <p className="mt-2 text-gray-600">Vendég felhasználóként nincs jogosultságod szabadságot kérni.</p>
      </div>
    );
  }

  const handleFormSubmit = async (dateBlocks: { startDate: Date; endDate: Date }[], note: string) => {
    const batch = writeBatch(db);
    const unitIdForRequest = currentUser.unitIds?.[0] || ''; // Default to the first unit if user has multiple

    dateBlocks.forEach(block => {
        const newRequestRef = doc(collection(db, 'requests'));
        const newRequest: Omit<Request, 'id'> = {
            userId: currentUser.id,
            userName: currentUser.fullName,
            unitId: unitIdForRequest,
            startDate: Timestamp.fromDate(block.startDate),
            endDate: Timestamp.fromDate(block.endDate),
            note,
            status: 'pending',
            createdAt: Timestamp.now(),
        };
        batch.set(newRequestRef, newRequest);
    });
    
    try {
        await batch.commit();
        setIsFormVisible(false);
    } catch (err) {
        console.error("Error submitting requests:", err);
        alert("Hiba történt a kérelmek benyújtása során.");
    }
  };
  
  const handleUpdateRequestStatus = async (requestId: string, status: 'approved' | 'rejected') => {
    try {
        await updateDoc(doc(db, 'requests', requestId), {
            status,
            reviewedBy: currentUser.fullName,
            reviewedAt: serverTimestamp(),
        });
    } catch (err) {
        console.error("Error updating request status:", err);
        alert("Hiba a kérelem státuszának frissítésekor.");
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (window.confirm('Biztosan törölni szeretnéd ezt a kérelmet? Ez a művelet nem vonható vissza.')) {
        try {
            await deleteDoc(doc(db, 'requests', requestId));
        } catch (err) {
            console.error("Error deleting request:", err);
            alert("Hiba a kérelem törlésekor.");
        }
    }
  };

  interface RequestCardProps {
    req: Request;
    onDelete: (requestId: string) => void;
  }
  const RequestCard: React.FC<RequestCardProps> = ({ req, onDelete }) => {
    const statusStyles = {
        pending: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800', label: 'Függőben' },
        approved: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-800', label: 'Elfogadva' },
        rejected: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-800', label: 'Elutasítva' },
    };
    const style = statusStyles[req.status];

    return (
        <div className={`p-5 rounded-xl shadow-md border ${style.bg} ${style.border}`}>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                <div>
                    <p className="font-bold text-gray-800">{req.userName}</p>
                    <p className="text-sm text-gray-600 font-semibold">
                        {req.startDate?.toDate().toLocaleDateString('hu-HU')}
                        {(req.startDate?.toMillis() || 0) !== (req.endDate?.toMillis() || 0) ? ` - ${req.endDate?.toDate().toLocaleDateString('hu-HU')}` : ''}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Beérkezett: {req.createdAt?.toDate().toLocaleString('hu-HU')}</p>
                </div>
                <div className={`text-sm font-bold px-3 py-1 rounded-full ${style.bg} ${style.text} border ${style.border}`}>{style.label}</div>
            </div>
            {req.note && <div className="mt-3 p-3 bg-white/50 rounded-lg border text-sm text-gray-700"><span className="font-semibold">Megjegyzés:</span> {req.note}</div>}
            {req.reviewedBy && <p className="text-xs text-gray-500 mt-2">Bírálta: {req.reviewedBy} - {req.reviewedAt?.toDate().toLocaleString('hu-HU')}</p>}
            
            {isAdmin && req.status === 'pending' && (
                <div className="flex justify-end gap-3 mt-4 border-t pt-3">
                    <button onClick={() => handleUpdateRequestStatus(req.id, 'rejected')} className="flex items-center gap-2 bg-red-600 text-white font-semibold py-1.5 px-3 rounded-lg hover:bg-red-700"><XIcon className="h-4 w-4"/> Elutasít</button>
                    <button onClick={() => handleUpdateRequestStatus(req.id, 'approved')} className="flex items-center gap-2 bg-green-700 text-white font-semibold py-1.5 px-3 rounded-lg hover:bg-green-800"><CheckIcon className="h-4 w-4"/> Elfogad</button>
                </div>
            )}
            {isAdmin && (req.status === 'approved' || req.status === 'rejected') && (
                 <div className="flex justify-end gap-3 mt-4 border-t pt-3">
                    <button onClick={() => onDelete(req.id)} className="flex items-center gap-2 bg-gray-500 text-white font-semibold py-1.5 px-3 rounded-lg hover:bg-gray-600">
                        <TrashIcon className="h-4 w-4" /> Törlés
                    </button>
                </div>
            )}
        </div>
    );
  };


  return (
    <div className="p-4 md:p-8">
      <div className="flex justify-end mb-6 gap-3">
        {!isFormVisible && (
             <button
                onClick={() => setIsFormVisible(true)}
                className="flex items-center bg-green-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 transition-colors"
              >
                <CalendarIcon className="h-5 w-5 mr-2" />
                Szabadnap kérelem benyújtása
            </button>
        )}
      </div>

      {isFormVisible && (
        <RequestForm 
            user={currentUser}
            onSubmit={handleFormSubmit}
            onCancel={() => setIsFormVisible(false)}
            allRequests={requests}
        />
      )}
      
      {loading && <div className="relative h-64"><LoadingSpinner /></div>}
      {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-r-lg" role="alert"><p className="font-bold">Hiba történt</p><p>{error}</p></div>}
      
      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
            {isAdmin ? (
                <>
                    <div className="space-y-4">
                        <h2 className="text-2xl font-bold text-gray-800">Függőben lévő kérelmek ({pending.length})</h2>
                        {pending.length > 0 ? pending.map(req => <RequestCard key={req.id} req={req} onDelete={handleDeleteRequest} />) : <p className="text-gray-500">Nincsenek függőben lévő kérelmek.</p>}
                    </div>
                     <div className="space-y-4">
                        <h2 className="text-2xl font-bold text-gray-800">Elfogadott kérelmek ({approved.length})</h2>
                        {approved.length > 0 ? approved.map(req => <RequestCard key={req.id} req={req} onDelete={handleDeleteRequest} />) : <p className="text-gray-500">Nincsenek elfogadott kérelmek.</p>}
                    </div>
                     <div className="space-y-4">
                        <h2 className="text-2xl font-bold text-gray-800">Elutasított kérelmek ({rejected.length})</h2>
                        {rejected.length > 0 ? rejected.map(req => <RequestCard key={req.id} req={req} onDelete={handleDeleteRequest} />) : <p className="text-gray-500">Nincsenek elutasított kérelmek.</p>}
                    </div>
                </>
            ) : (
                 <div className="lg:col-span-2 xl:col-span-3 space-y-4">
                    <h2 className="text-2xl font-bold text-gray-800">Saját kérelmeim ({myRequests.length})</h2>
                     {myRequests.length > 0 ? (
                        myRequests.map(req => <RequestCard key={req.id} req={req} onDelete={handleDeleteRequest} />)
                     ) : (
                         <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-xl">
                            <CalendarIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-700">Nincsenek kérelmeid</h3>
                            <p className="text-gray-500 mt-1">Még nem nyújtottál be szabadnap kérelmet.</p>
                        </div>
                     )}
                 </div>
            )}
        </div>
      )}
    </div>
  );
};

export default KerelemekApp;