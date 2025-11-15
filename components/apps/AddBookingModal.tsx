import React, { useState, useMemo } from 'react';
import { Booking } from '../../data/mockData';
import { Timestamp } from '../../firebase/config';

export type BookingFormData = Omit<Booking, 'id' | 'createdAt' | 'status' | 'startTime' | 'endTime'> & {
    date: string;
    startTime: string;
    endTime: string;
};

interface AddBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBooking: (bookingData: Omit<Booking, 'id'>) => Promise<void>;
  unitId: string;
}

const AddBookingModal: React.FC<AddBookingModalProps> = ({ isOpen, onClose, onAddBooking, unitId }) => {
  const toInputDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [formData, setFormData] = useState({
    date: toInputDateString(new Date()),
    startTime: '12:00',
    endTime: '14:00',
    name: '',
    headcount: '2',
    notes: '',
    email: '',
    phone: '',
    occasion: 'Vacsora',
    source: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  const occasionOptions = ['Brunch', 'Ebéd', 'Vacsora', 'Születésnap', 'Italozás', 'Egyéb'];

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const startDateTime = new Date(`${formData.date}T${formData.startTime}`);
    const endDateTime = new Date(`${formData.date}T${formData.endTime}`);
    
    if (endDateTime <= startDateTime) {
        setError('A befejezési időpontnak a kezdési időpont után kell lennie.');
        return;
    }

    setIsSubmitting(true);
    try {
      const bookingData: Omit<Booking, 'id'> = {
        unitId,
        name: formData.name,
        headcount: parseInt(formData.headcount, 10),
        occasion: formData.occasion,
        source: formData.source,
        startTime: Timestamp.fromDate(startDateTime),
        endTime: Timestamp.fromDate(endDateTime),
        status: 'confirmed',
        createdAt: Timestamp.now(),
        notes: formData.notes,
        email: formData.email,
        phone: formData.phone,
      };
      await onAddBooking(bookingData);
    } catch (e: any) {
      setError(`Hiba történt: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="p-5 border-b">
            <h2 className="text-xl font-bold text-gray-800">Új foglalás hozzáadása (Admin)</h2>
          </div>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <label className="text-sm font-medium">Név</label>
              <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg" required placeholder="Vendég neve" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="text-sm font-medium">Email cím</label>
                    <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg" placeholder="vendeg@email.com" />
                </div>
                <div>
                    <label className="text-sm font-medium">Telefonszám</label>
                    <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg" placeholder="+36 30 123 4567" />
                </div>
            </div>
            <div>
              <label className="text-sm font-medium">Dátum</label>
              <input type="date" name="date" value={formData.date} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg" required />
            </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Kezdés</label>
                <input type="time" name="startTime" value={formData.startTime} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg" required />
              </div>
              <div>
                <label className="text-sm font-medium">Befejezés</label>
                <input type="time" name="endTime" value={formData.endTime} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg" required />
              </div>
            </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="text-sm font-medium">Alkalom</label>
                    <select name="occasion" value={formData.occasion} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg bg-white" required>
                        {occasionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-sm font-medium">Létszám (fő)</label>
                    <input type="number" name="headcount" value={formData.headcount} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg" required min="1" />
                </div>
            </div>
            <div>
              <label className="text-sm font-medium">Megjegyzés</label>
              <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="w-full mt-1 p-2 border rounded-lg" />
            </div>
            {error && <p className="text-red-500 text-sm font-semibold">{error}</p>}
          </div>
          <div className="p-4 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
            <button type="button" onClick={onClose} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold">Mégse</button>
            <button type="submit" disabled={isSubmitting} className="bg-green-700 text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-400">
              {isSubmitting ? 'Hozzáadás...' : 'Foglalás hozzáadása'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddBookingModal;