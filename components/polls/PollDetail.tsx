import React, { useState, useEffect } from 'react';
import { getPollWithResults, castVote } from '../../firebase/pollService';
import { PollWithResults, User } from '../../data/mockData';

interface PollDetailProps {
  pollId: string;
  currentUser: User;
  onBack: () => void;
}

const PollDetail: React.FC<PollDetailProps> = ({ pollId, currentUser, onBack }) => {
  const [poll, setPoll] = useState<PollWithResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [isVoting, setIsVoting] = useState(false);

  useEffect(() => {
    const unsubscribe = getPollWithResults(pollId, currentUser.id, (data) => {
      setPoll(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [pollId, currentUser.id]);

  const handleVote = async () => {
    if (selectedOptions.length === 0) {
      setError('Válassz legalább egy opciót.');
      return;
    }
    setIsVoting(true);
    setError('');
    try {
      await castVote(pollId, currentUser, selectedOptions);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsVoting(false);
    }
  };

  const handleSelectionChange = (optionId: string) => {
    if (poll?.multipleChoice) {
      setSelectedOptions(prev => 
        prev.includes(optionId)
          ? prev.filter(id => id !== optionId)
          : [...prev, optionId]
      );
    } else {
      setSelectedOptions([optionId]);
    }
  };
  
  if (loading) return <p>Betöltés...</p>;
  if (!poll) return <p>A szavazás nem található.</p>;

  const isPollClosed = poll.closesAt && poll.closesAt.toDate() < new Date();
  const hasVoted = poll.userVote !== null;

  const renderResults = () => (
    <div>
      <h3 className="text-xl font-semibold mb-2">Eredmények</h3>
      <p className="text-sm text-gray-600 mb-4">Összesen {poll.totalVotes} szavazat.</p>
      <div className="space-y-3">
        {poll.options.map(option => {
          const voteCount = poll.results[option.id] || 0;
          const percentage = poll.totalVotes > 0 ? (voteCount / poll.totalVotes) * 100 : 0;
          const didUserVoteForThis = poll.userVote?.includes(option.id);
          return (
            <div key={option.id}>
              <div className="flex justify-between items-center mb-1">
                <p className={`font-semibold ${didUserVoteForThis ? 'text-blue-600' : ''}`}>
                    {option.label}
                    {didUserVoteForThis && ' (a te szavazatod)'}
                </p>
                <span className="font-bold">{voteCount} szavazat</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div 
                    className="bg-green-600 h-4 rounded-full text-xs font-medium text-blue-100 text-center p-0.5 leading-none" 
                    style={{ width: `${percentage}%` }}>
                   {percentage > 10 && `${percentage.toFixed(0)}%`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderVotingForm = () => (
    <div>
      <h3 className="text-xl font-semibold mb-4">Szavazz!</h3>
      <div className="space-y-2">
        {poll.options.map(option => (
          <label key={option.id} className="flex items-center gap-3 p-3 border rounded-lg">
            <input
              type={poll.multipleChoice ? 'checkbox' : 'radio'}
              name="pollOption"
              checked={selectedOptions.includes(option.id)}
              onChange={() => handleSelectionChange(option.id)}
              className="h-5 w-5"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {error && <p className="text-red-500 mt-4">{error}</p>}
      <button 
        onClick={handleVote} 
        disabled={isVoting}
        className="mt-4 p-2 bg-blue-600 text-white rounded w-full disabled:bg-gray-400"
       >
        {isVoting ? 'Szavazás...' : 'Szavazat elküldése'}
      </button>
    </div>
  );

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-blue-600">&larr; Vissza a listához</button>
      <div className="p-4 border rounded-lg">
        <h2 className="text-2xl font-bold">{poll.question}</h2>
        {isPollClosed && <p className="text-red-600 font-semibold my-2">Ez a szavazás lezárult.</p>}
        <hr className="my-4" />
        {hasVoted || isPollClosed ? renderResults() : renderVotingForm()}
      </div>
    </div>
  );
};

export default PollDetail;
