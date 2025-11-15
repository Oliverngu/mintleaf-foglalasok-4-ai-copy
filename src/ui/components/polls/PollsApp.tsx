import React, { useState } from 'react';
import { User, Poll } from '../../../core/models/data';
import PollList from './PollList';
import PollDetail from './PollDetail';
import CreatePoll from './CreatePoll';

interface PollsAppProps {
  currentUser: User;
  canCreatePolls: boolean;
  polls: Poll[];
}

type PollsViewState = { view: 'list' } | { view: 'detail'; pollId: string } | { view: 'create' };

const PollsApp: React.FC<PollsAppProps> = ({ currentUser, canCreatePolls, polls }) => {
  const [viewState, setViewState] = useState<PollsViewState>({ view: 'list' });

  const canCreate = canCreatePolls;

  const renderContent = () => {
    switch (viewState.view) {
      case 'detail':
        return <PollDetail pollId={viewState.pollId} currentUser={currentUser} onBack={() => setViewState({ view: 'list' })} />;
      case 'create':
        return <CreatePoll currentUser={currentUser} onPollCreated={() => setViewState({ view: 'list' })} />;
      case 'list':
      default:
        return <PollList currentUser={currentUser} onSelectPoll={(pollId) => setViewState({ view: 'detail', pollId })} polls={polls} />;
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Szavazások</h1>
        {canCreate && viewState.view === 'list' && (
          <button onClick={() => setViewState({ view: 'create' })} className="p-2 bg-green-600 text-white rounded font-semibold">
            Új szavazás
          </button>
        )}
         {viewState.view === 'create' && (
          <button onClick={() => setViewState({ view: 'list' })} className="p-2 bg-gray-500 text-white rounded font-semibold">
            Mégse
          </button>
        )}
      </div>
      {renderContent()}
    </div>
  );
};

export default PollsApp;