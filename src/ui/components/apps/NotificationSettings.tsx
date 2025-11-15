// src/ui/components/apps/NotificationSettings.tsx
import React, { useState, useEffect } from 'react';
import { User } from '../../../core/models/data';
import { getUserNotificationSettings, updateUserNotificationSettings } from '../../../core/api/settingsService';
import BellIcon from '../icons/BellIcon';
import LoadingSpinner from '../../../../components/LoadingSpinner';

interface NotificationSettingsProps {
    currentUser: User;
}

const NotificationSettings: React.FC<NotificationSettingsProps> = ({ currentUser }) => {
    const [settings, setSettings] = useState({ newSchedule: true });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        getUserNotificationSettings(currentUser.id).then(userSettings => {
            setSettings(prev => ({ ...prev, ...userSettings }));
            setIsLoading(false);
        });
    }, [currentUser.id]);

    const handleToggle = (key: keyof typeof settings) => {
        setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateUserNotificationSettings(currentUser.id, settings);
            alert('Beállítások mentve!');
        } catch (error) {
            alert('Hiba a mentés során.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="relative h-48"><LoadingSpinner /></div>;

    return (
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2"><BellIcon className="h-6 w-6" /> Értesítési beállítások</h3>
            <p className="text-gray-600 mt-1 mb-4">Itt állíthatod be, hogy miről szeretnél e-mail értesítést kapni.</p>
            <div className="space-y-3">
                <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-700 font-medium">Értesítés új beosztás publikálásakor</span>
                     <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                        <input
                            type="checkbox"
                            checked={settings.newSchedule}
                            onChange={() => handleToggle('newSchedule')}
                            className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                        />
                        <span className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></span>
                    </div>
                </label>
            </div>
            <button onClick={handleSave} disabled={isSaving} className="mt-6 w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400">
                {isSaving ? 'Mentés...' : 'Beállítások mentése'}
            </button>
        </div>
    );
};

export default NotificationSettings;