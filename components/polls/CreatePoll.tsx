import React, { useState } from 'react';
import { createPoll } from '../../firebase/pollService';
import { PollOption, User, Poll } from '../../data/mockData';
import { Timestamp } from '../../firebase/config';

interface CreatePollProps {
  currentUser: User;
  onPollCreated: () => void;
}

const CreatePoll: React.FC<CreatePollProps> = ({ currentUser, onPollCreated }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<PollOption[]>([
    { id: '1', label: '' },
    { id: '2', label: '' },
  ]);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [closesAt, setClosesAt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index].label = value;
    setOptions(newOptions);
  };

  const addOption = () => {
    setOptions([...options, { id: String(Date.now()), label: '' }]);
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (question.trim() === '' || options.some(opt => opt.label.trim() === '')) {
      setError('A kérdést és az összes opciót ki kell tölteni.');
      return;
    }
    if (!currentUser.unitIds || currentUser.unitIds.length === 0) {
        setError('Nincs egységhez rendelve, nem hozhatsz létre szavazást.');
        return;
    }

    setIsLoading(true);
    try {
      await createPoll({
        question,
        options,
        multipleChoice,
        unitId: currentUser.unitIds[0], // Default to first unit
        closesAt: closesAt ? Timestamp.fromDate(new Date(closesAt)) : null,
      });
      onPollCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Új szavazás létrehozása</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label>Kérdés</label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <div>
          <label>Opciók</label>
          {options.map((option, index) => (
            <div key={option.id} className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={option.label}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                className="w-full p-2 border rounded"
                required
              />
              <button
                type="button"
                onClick={() => removeOption(index)}
                disabled={options.length <= 2}
                className="p-2 bg-red-500 text-white rounded disabled:bg-gray-300"
              >
                X
              </button>
            </div>
          ))}
          <button type="button" onClick={addOption} className="p-2 bg-blue-500 text-white rounded">
            Opció hozzáadása
          </button>
        </div>
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={multipleChoice}
              onChange={(e) => setMultipleChoice(e.target.checked)}
            />
            Több válaszlehetőség engedélyezése
          </label>
        </div>
        <div>
          <label>Lezárás időpontja (opcionális)</label>
          <input
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        {error && <p className="text-red-500">{error}</p>}
        <button type="submit" disabled={isLoading} className="p-2 bg-green-600 text-white rounded disabled:bg-gray-400">
          {isLoading ? 'Létrehozás...' : 'Szavazás létrehozása'}
        </button>
      </form>
    </div>
  );
};

export default CreatePoll;