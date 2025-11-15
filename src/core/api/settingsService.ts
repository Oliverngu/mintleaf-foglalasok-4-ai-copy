// src/core/api/settingsService.ts
import { db } from '../firebase/config';
import { doc, updateDoc, getDoc } from 'firebase/firestore';

export const getUserNotificationSettings = async (userId: string) => {
    const userRef = doc(db, 'users', userId);
    const docSnap = await getDoc(userRef);
    if (docSnap.exists()) {
        return docSnap.data().notifications || {};
    }
    return {};
};

export const updateUserNotificationSettings = async (userId: string, settings: any) => {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
        notifications: settings
    });
};
