import React from 'react';
import ReservationSettingsForm from './ReservationSettingsForm';

interface ReservationSettingsModalProps {
    unitId: string;
    onClose: () => void;
}

const ReservationSettingsModal: React.FC<ReservationSettingsModalProps> = ({ unitId, onClose }) => {
    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
            onClick={onClose}
        >
            <ReservationSettingsForm unitId={unitId} onClose={onClose} layout="modal" />
        </div>
    );
};

export default ReservationSettingsModal;
