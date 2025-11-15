import { db, auth, serverTimestamp, Timestamp } from './config';
import { 
    collection, 
    addDoc, 
    query, 
    where, 
    orderBy, 
    onSnapshot,
    doc,
    runTransaction,
    getDoc,
    getDocs
} from 'firebase/firestore';
import { Poll, PollWithResults, PollVote, User } from '../data/mockData';

const pollsCollection = collection(db, 'polls');

/**
 * Creates a new poll in Firestore.
 */
export const createPoll = async (pollData: Omit<Poll, 'id' | 'createdAt' | 'createdBy'>): Promise<void> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated to create a poll.');
  }
  await addDoc(pollsCollection, {
    ...pollData,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
  });
};

/**
 * Fetches all polls for a specific unit.
 */
export const getPollsForUnit = (unitId: string, onUpdate: (polls: Poll[]) => void): (() => void) => {
  const q = query(
    pollsCollection,
    where('unitId', '==', unitId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, snapshot => {
    const polls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Poll));
    onUpdate(polls);
  });
};

/**
 * Fetches a single poll and aggregates its results.
 */
export const getPollWithResults = (pollId: string, userId: string, onUpdate: (data: PollWithResults | null) => void): (() => void) => {
  const pollRef = doc(db, 'polls', pollId);
  const votesRef = collection(pollRef, 'votes');
  const userVoteRef = doc(votesRef, userId);

  const unsubscribe = onSnapshot(pollRef, async pollDoc => {
    if (!pollDoc.exists()) {
      onUpdate(null);
      return;
    }

    const pollData = { id: pollDoc.id, ...pollDoc.data() } as Poll;

    try {
      const voteDocSnap = await getDoc(userVoteRef);

      // Correctly fetch all votes and aggregate results
      const votesQuery = collection(db, 'polls', pollId, 'votes');
      const votesSnapshot = await getDocs(votesQuery);

      const results: Record<string, number> = {};
      pollData.options.forEach(option => {
        results[option.id] = 0;
      });
      let totalVotes = 0;

      votesSnapshot.forEach(voteDoc => {
          const voteData = voteDoc.data() as PollVote;
          voteData.selectedOptionIds.forEach(optionId => {
              if (results[optionId] !== undefined) {
                  results[optionId]++;
              }
          });
          totalVotes++;
      });
      
      const pollWithResults: PollWithResults = {
        ...pollData,
        results,
        totalVotes,
        userVote: voteDocSnap.exists() ? (voteDocSnap.data() as PollVote).selectedOptionIds : null,
      };
      onUpdate(pollWithResults);

    } catch(e) {
      console.error("Error getting poll results:", e);
    }
  });

  return unsubscribe;
};

/**
 * Casts a vote on a poll using a Firestore transaction.
 */
export const castVote = async (pollId: string, user: User, selectedOptionIds: string[]): Promise<void> => {
  const pollRef = doc(db, 'polls', pollId);
  const voteRef = doc(collection(pollRef, 'votes'), user.id);

  return runTransaction(db, async (transaction) => {
    const pollDoc = await transaction.get(pollRef);
    const voteDoc = await transaction.get(voteRef);

    if (!pollDoc.exists()) {
      throw new Error("Szavazás nem található.");
    }

    if (voteDoc.exists) {
      throw new Error("Már szavaztál.");
    }
    
    const poll = pollDoc.data() as Poll;

    if (!user.unitIds?.includes(poll.unitId)) {
        throw new Error("Nincs jogosultságod ebben az egységben szavazni.");
    }

    if (poll.closesAt && poll.closesAt.toDate() < new Date()) {
      throw new Error("Ez a szavazás lezárult.");
    }

    if (!poll.multipleChoice && selectedOptionIds.length !== 1) {
      throw new Error("Csak egy opciót választhatsz.");
    }

    if (selectedOptionIds.length === 0) {
        throw new Error("Legalább egy opciót ki kell választanod.");
    }

    const newVote: PollVote = {
      userId: user.id,
      selectedOptionIds,
      votedAt: Timestamp.now(),
    };

    transaction.set(voteRef, newVote);
  });
};