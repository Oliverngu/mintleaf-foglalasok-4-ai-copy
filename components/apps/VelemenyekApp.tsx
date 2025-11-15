import React, { useState, useEffect, useMemo } from 'react';
import { Feedback, User, Unit } from '../../data/mockData';
import { db, serverTimestamp } from '../../firebase/config';
import { collection, addDoc, doc, deleteDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import LoadingSpinner from '../LoadingSpinner';
import FeedbackIcon from '../icons/FeedbackIcon';
import TrashIcon from '../icons/TrashIcon';

interface VelemenyekAppProps {
  currentUser: User;
  allUnits: Unit[];
  activeUnitIds: string[];
  feedbackList: Feedback[];
}

const VelemenyekApp: React.FC<VelemenyekAppProps> = ({ currentUser, allUnits, activeUnitIds, feedbackList }) => {
    const [newFeedbackText, setNewFeedbackText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmitFeedback = async (e: React.FormEvent) => {
        e.preventDefault();
        const unitForFeedback = activeUnitIds.length > 0 ? activeUnitIds[0] : currentUser.unitIds?.[0];

        if (newFeedbackText.trim() === '' || !unitForFeedback) {
            alert('A vélemény elküldéséhez válassz ki egy egységet a fejlécben.');
            return;
        }

        setIsSubmitting(true);
        const newFeedback = {
            text: newFeedbackText.trim(),
            unitId: unitForFeedback,
            createdAt: serverTimestamp(),
            reactions: { thankYou: [] }
        };

        try {
            await addDoc(collection(db, 'feedback'), newFeedback);
            setNewFeedbackText('');
        } catch (err) {
            console.error("Error submitting feedback:", err);
            alert("Hiba történt a vélemény elküldése közben.");
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteFeedback = async (id: string) => {
        if (window.confirm('Biztosan törölni szeretnéd ezt a véleményt?')) {
            try {
                await deleteDoc(doc(db, 'feedback', id));
            } catch (err) {
                console.error("Error deleting feedback:", err);
                alert("Hiba történt a törlés során.");
            }
        }
    };

    const handleReaction = async (feedbackId: string) => {
        const feedbackRef = doc(db, 'feedback', feedbackId);
        try {
            await updateDoc(feedbackRef, {
                'reactions.thankYou': arrayUnion(currentUser.id)
            });
        } catch (err) {
            console.error("Error adding reaction:", err);
        }
    };
    
    const displayedFeedback = useMemo(() => {
        if (currentUser.role === 'Admin') {
            if (activeUnitIds.length === 0) return feedbackList;
            return feedbackList.filter(fb => activeUnitIds.includes(fb.unitId));
        }
        return feedbackList;
    }, [feedbackList, activeUnitIds, currentUser.role]);

    const feedbackByUnit = useMemo(() => {
        if (currentUser.role !== 'Admin') return null;
        
        const grouped: { [key: string]: Feedback[] } = {};
        displayedFeedback.forEach(fb => {
            const unitName = allUnits.find(u => u.id === fb.unitId)?.name || 'Ismeretlen Egység';
            if (!grouped[unitName]) grouped[unitName] = [];
            grouped[unitName].push(fb);
        });
        return Object.entries(grouped);
    }, [displayedFeedback, allUnits, currentUser.role]);

    const FeedbackCard: React.FC<{feedback: Feedback}> = ({ feedback }) => {
        const thankYous = feedback.reactions?.thankYou || [];
        const hasReacted = thankYous.includes(currentUser.id);
        const canDelete = currentUser.role === 'Admin' || (currentUser.role === 'Unit Admin');

        return (
            <div className="bg-white p-5 rounded-xl shadow-md border relative">
                <p className="text-gray-700">{feedback.text}</p>
                <div className="flex justify-between items-center mt-3 pt-3 border-t">
                    <p className="text-xs text-gray-400">Beküldve: {feedback.createdAt?.toDate().toLocaleString('hu-HU')}</p>
                    <div className="flex items-center gap-2">
                         <button 
                            onClick={() => handleReaction(feedback.id)}
                            disabled={hasReacted}
                            className={`text-sm font-semibold px-3 py-1 rounded-full flex items-center gap-1 ${hasReacted ? 'bg-green-200 text-green-800 cursor-default' : 'bg-gray-200 hover:bg-gray-300'}`}
                         >
                            <span>🙏</span>
                            Köszönöm
                        </button>
                        <span className="text-sm font-bold text-gray-600">{thankYous.length > 0 ? thankYous.length : ''}</span>
                    </div>
                </div>
                {canDelete && (
                    <button onClick={() => handleDeleteFeedback(feedback.id)} className="absolute top-2 right-2 p-2 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-50">
                        <TrashIcon className="h-5 w-5" />
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="p-4 md:p-8">
             <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Vélemények és Javaslatok</h1>
            </div>

            <form onSubmit={handleSubmitFeedback} className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 mb-8 max-w-3xl mx-auto">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Új vélemény beküldése</h2>
                <p className="text-sm text-gray-500 mb-4">A beküldött vélemények teljesen névtelenek. A vezetőség a konstruktív javaslatokat felhasználja a munkafolyamatok javítására.</p>
                <textarea
                    value={newFeedbackText}
                    onChange={(e) => setNewFeedbackText(e.target.value)}
                    placeholder="Írd le a javaslatodat vagy véleményedet..."
                    className="w-full h-24 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition"
                    disabled={isSubmitting}
                    required
                />
                <button
                    type="submit"
                    disabled={isSubmitting || newFeedbackText.trim() === ''}
                    className="mt-3 w-full bg-green-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                    {isSubmitting ? 'Küldés...' : 'Névtelen beküldés'}
                </button>
            </form>
            
            {displayedFeedback.length === 0 ? (
                 <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-xl max-w-3xl mx-auto">
                    <FeedbackIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700">Nincsenek vélemények</h3>
                    <p className="text-gray-500 mt-1">Még senki sem küldött be visszajelzést.</p>
                </div>
            ) : (
                currentUser.role === 'Admin' ? (
                    <div className="space-y-8">
                        {feedbackByUnit?.map(([unitName, feedbacks]) => (
                            <div key={unitName}>
                                <h2 className="text-2xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">{unitName}</h2>
                                <div className="space-y-4">
                                    {feedbacks.map(fb => <FeedbackCard key={fb.id} feedback={fb} />)}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-4 max-w-3xl mx-auto">
                        {displayedFeedback.map(fb => <FeedbackCard key={fb.id} feedback={fb} />)}
                    </div>
                )
            )}

        </div>
    );
};

export default VelemenyekApp;