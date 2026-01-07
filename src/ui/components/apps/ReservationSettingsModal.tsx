import React from 'react';
import ReservationSettingsForm from './ReservationSettingsForm';
import { User } from '../../../core/models/data';

interface ReservationSettingsModalProps {
    unitId: string;
    currentUser: User;
    onClose: () => void;
}

const ReservationSettingsModal: React.FC<ReservationSettingsModalProps> = ({ unitId, currentUser, onClose }) => {
    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
            onClick={onClose}
        >
            <ReservationSettingsForm unitId={unitId} currentUser={currentUser} onClose={onClose} layout="modal" />
        </div>
    );
};

export default ReservationSettingsModal;
