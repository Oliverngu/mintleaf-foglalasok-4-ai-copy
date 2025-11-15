import React, { useState, useEffect } from 'react';
import { getPollsForUnit } from '../../firebase/pollService';
import { Poll, User } from '../../data/mockData';

interface PollListProps {
  currentUser: User;
  onSelectPoll: (pollId: string) => void;
  polls: Poll[];
}

const PollList: React.FC<PollListProps> = ({ currentUser, onSelectPoll, polls }) => {

  if (!currentUser.unitIds || currentUser.unitIds.length === 0) {
    return <p>Nincs egységhez rendelve, így nem láthatsz szavazásokat.</p>
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Aktuális szavazások</h2>
      {polls.length === 0 ? (
        <p>Nincsenek aktív szavazások ebben az egységben.</p>
      ) : (
        <div className="space-y-3">
          {polls.map(poll => {
            const isClosed = poll.closesAt && poll.closesAt.toDate() < new Date();
            return (
              <div
                key={poll.id}
                onClick={() => onSelectPoll(poll.id)}
                className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50"
              >
                <div className="flex justify-between items-center">
                    <p className="font-semibold">{poll.question}</p>
                    {isClosed && <span className="text-sm font-bold text-red-600 bg-red-100 px-2 py-1 rounded-full">Lezárva</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PollList;