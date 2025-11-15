import React, { useState, useEffect, useMemo } from 'react';
import { User, TimeEntry, Unit } from '../../core/models/data';
import { db, Timestamp } from '../../core/firebase/config';
import { collection, where, query, getDocs, doc, addDoc, updateDoc, documentId } from 'firebase/firestore';

interface ClockInOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTimeEntry: TimeEntry | null;
  currentUser: User;
}

/**
 * Rounds a given Date object to the nearest 15-minute interval.
 * @param date The date to round.
 * @returns A new Date object with the minutes rounded.
 */
const roundToNearestQuarterHour = (date: Date): Date => {
    const minutes = date.getMinutes();
    const roundedMinutes = Math.round(minutes / 15) * 15;
    const newDate = new Date(date);
    
    // Handle hour overflow if rounding up from > 45 mins
    if (roundedMinutes === 60) {
        newDate.setHours(date.getHours() + 1, 0, 0, 0);
    } else {
        newDate.setMinutes(roundedMinutes, 0, 0);
    }
    
    return newDate;
};

/**
 * Formats a Date object into a "HH:mm" string for the time input.
 * @param date The date to format.
 * @returns A string in HH:mm format.
 */
const formatTimeForInput = (date: Date): string => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
};

const ClockInOutModal: React.FC<ClockInOutModalProps> = ({ isOpen, onClose, activeTimeEntry, currentUser }) => {
  if (!isOpen) {
    return null;
  }

  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeValue, setTimeValue] = useState('');

  useEffect(() => {
    // Populate user's units
    if (currentUser.unitIds && currentUser.unitIds.length > 0) {
      const unitsQuery = query(collection(db, 'units'), where(documentId(), 'in', currentUser.unitIds));
      getDocs(unitsQuery)
        .then(snapshot => {
          const userUnits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Unit));
          setUnits(userUnits);
          // Pre-select the first unit if only one exists
          if (userUnits.length === 1) {
            setSelectedUnitId(userUnits[0].id);
          }
        })
        .catch(err => {
            console.error("Error fetching units for clock-in:", err);
            setError("Hiba az egységek betöltésekor.");
        });
    }
  }, [currentUser.unitIds]);

  useEffect(() => {
    // Reset state and set rounded time when modal opens
    if (isOpen) {
        setError('');
        const roundedTime = roundToNearestQuarterHour(new Date());
        setTimeValue(formatTimeForInput(roundedTime));
        
        if (units.length === 1) {
            setSelectedUnitId(units[0].id);
        } else if (!activeTimeEntry) {
            setSelectedUnitId(''); // Only reset unit for clock-in
        }
    }
  }, [isOpen, units, activeTimeEntry]);
  
  const handleSave = async () => {
    if (activeTimeEntry) {
        await handleClockOut();
    } else {
        await handleClockIn();
    }
  };


  const handleClockIn = async () => {
    if (!selectedUnitId) {
      setError('Kérlek, válassz egy egységet a munkavégzéshez.');
      return;
    }
    setIsLoading(true);
    setError('');

    try {
        const today = new Date();
        const [hours, minutes] = timeValue.split(':').map(Number);
        const finalDateTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);

      await addDoc(collection(db, 'time_entries'), {
        userId: currentUser.id,
        unitId: selectedUnitId,
        startTime: Timestamp.fromDate(finalDateTime),
        status: 'active',
      });
      onClose();
    } catch (err) {
      console.error("Error clocking in:", err);
      setError('Hiba történt a műszak indításakor.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeTimeEntry) return;
    setIsLoading(true);
    setError('');
    
    try {
        const today = new Date();
        const [hours, minutes] = timeValue.split(':').map(Number);
        const finalDateTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
        
        // Handle overnight shifts
        if (finalDateTime < activeTimeEntry.startTime.toDate()) {
            finalDateTime.setDate(finalDateTime.getDate() + 1);
        }

      await updateDoc(doc(db, 'time_entries', activeTimeEntry.id), {
        endTime: Timestamp.fromDate(finalDateTime),
        status: 'completed',
      });
      onClose();
    } catch (err) {
      console.error("Error clocking out:", err);
      setError('Hiba történt a műszak lezárásakor.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">{activeTimeEntry ? 'Műszak Befejezése' : 'Műszak Indítása'}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 text-gray-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
            
            {!activeTimeEntry && units.length > 1 && (
                <div>
                  <label htmlFor="unit-select" className="block text-sm font-medium text-gray-700">Melyik egységben?</label>
                  <select
                    id="unit-select"
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm rounded-md"
                  >
                    <option value="" disabled>Válassz egységet...</option>
                    {units.map(unit => (
                      <option key={unit.id} value={unit.id}>{unit.name}</option>
                    ))}
                  </select>
                </div>
            )}
            
            <div>
                 <label htmlFor="time-input" className="block text-sm font-medium text-gray-700">
                    {activeTimeEntry ? 'Befejezés időpontja' : 'Kezdés időpontja'}
                </label>
                <input
                    id="time-input"
                    type="time"
                    value={timeValue}
                    onChange={(e) => setTimeValue(e.target.value)}
                    className="mt-1 block w-full pl-3 pr-4 py-2 text-base border-gray-300 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm rounded-md"
                />
            </div>

          <button
            onClick={handleSave}
            disabled={isLoading || (!activeTimeEntry && units.length > 1 && !selectedUnitId)}
            className={`w-full mt-4 font-bold py-3 px-4 rounded-lg text-white ${activeTimeEntry ? 'bg-red-600 hover:bg-red-700' : 'bg-green-700 hover:bg-green-800'} disabled:bg-gray-400`}
          >
            {isLoading ? 'Mentés...' : 'Időpont mentése'}
          </button>
         
          {error && <p className="text-red-500 text-sm mt-4 text-center">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default ClockInOutModal;