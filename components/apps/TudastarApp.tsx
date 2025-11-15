import React, { useState, useEffect, useMemo, FC, useCallback } from 'react';
import { User, Unit, FileMetadata } from '../../data/mockData';
import { db, storage, serverTimestamp } from '../../firebase/config';
import { collection, onSnapshot, query, where, orderBy, addDoc, doc, deleteDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import LoadingSpinner from '../LoadingSpinner';
import BookIcon from '../icons/BookIcon';
import TrashIcon from '../icons/TrashIcon';
import DownloadIcon from '../icons/DownloadIcon';
import PlusIcon from '../icons/PlusIcon';

interface TudastarAppProps {
  currentUser: User;
  allUnits: Unit[];
  activeUnitIds: string[];
}

const FileUploadModal: FC<{
    onClose: () => void;
    currentUser: User;
    allUnits: Unit[];
}> = ({ onClose, currentUser, allUnits }) => {
    const [file, setFile] = useState<File | null>(null);
    const [unitId, setUnitId] = useState(currentUser.role === 'Admin' ? 'central' : currentUser.unitIds?.[0] || '');
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setError('Nincs fájl kiválasztva.');
            return;
        }
        if (!unitId) {
            setError('Nincs egység kiválasztva.');
            return;
        }

        setIsUploading(true);
        setError('');

        try {
            // 1. Upload file to Firebase Storage
            const storagePath = `tudastar/${unitId}/${Date.now()}_${file.name}`;
            const storageRef = ref(storage, storagePath);
            const uploadResult = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(uploadResult.ref);

            // 2. Create metadata document in Firestore
            const fileMetadata: Omit<FileMetadata, 'id'> = {
                name: file.name,
                url: downloadURL,
                storagePath: storagePath,
                size: file.size,
                contentType: file.type,
                uploadedBy: currentUser.fullName,
                uploadedByUid: currentUser.id,
                uploadedAt: serverTimestamp() as Timestamp,
                unitId: unitId,
            };

            await addDoc(collection(db, 'files'), fileMetadata);
            onClose();

        } catch (err) {
            console.error("Error uploading file:", err);
            setError("Hiba a fájl feltöltése során.");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <form onSubmit={handleUpload}>
                    <div className="p-5 border-b">
                        <h2 className="text-xl font-bold text-gray-800">Új dokumentum feltöltése</h2>
                    </div>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="text-sm font-medium">Fájl kiválasztása</label>
                            <input type="file" onChange={handleFileChange} className="w-full mt-1 p-2 border rounded-lg" required />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Hova tartozik?</label>
                            <select value={unitId} onChange={e => setUnitId(e.target.value)} className="w-full mt-1 p-2 border rounded-lg bg-white" required>
                                <option value="" disabled>Válassz...</option>
                                {currentUser.role === 'Admin' && <option value="central">Mindenki (központi)</option>}
                                {allUnits.filter(u => currentUser.unitIds?.includes(u.id) || currentUser.role === 'Admin').map(unit => (
                                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                                ))}
                            </select>
                        </div>
                        {error && <p className="text-red-500">{error}</p>}
                    </div>
                    <div className="p-4 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
                        <button type="button" onClick={onClose} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold">Mégse</button>
                        <button type="submit" disabled={isUploading} className="bg-green-700 text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-400">
                            {isUploading ? 'Feltöltés...' : 'Feltöltés'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


const TudastarApp: React.FC<TudastarAppProps> = ({ currentUser, allUnits, activeUnitIds }) => {
    const [files, setFiles] = useState<FileMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    
    const canManage = currentUser.role === 'Admin' || currentUser.role === 'Unit Admin';

    useEffect(() => {
        setLoading(true);
        const unitIdsToQuery = ['central', ...activeUnitIds];
        
        const filesQuery = query(
            collection(db, 'files'), 
            where('unitId', 'in', unitIdsToQuery),
            orderBy('uploadedAt', 'desc')
        );

        const unsubscribe = onSnapshot(filesQuery, snapshot => {
            const fetchedFiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FileMetadata));
            setFiles(fetchedFiles);
            setLoading(false);
        }, err => {
            console.error("Error fetching files:", err);
            setError("Hiba a dokumentumok betöltésekor.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [activeUnitIds]);

    const handleDeleteFile = async (file: FileMetadata) => {
        if (window.confirm(`Biztosan törölni szeretnéd a(z) "${file.name}" fájlt?`)) {
            try {
                // Delete from Storage
                const storageRef = ref(storage, file.storagePath);
                await deleteObject(storageRef);
                // Delete from Firestore
                await deleteDoc(doc(db, 'files', file.id));
            } catch (err) {
                console.error("Error deleting file:", err);
                alert("Hiba a fájl törlése során.");
            }
        }
    };
    
    const formatBytes = (bytes: number, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    const filesByUnit = useMemo(() => {
        const grouped: { [key: string]: FileMetadata[] } = {};
        const centralUnit = { id: 'central', name: 'Központi Dokumentumok' };
        const displayUnits = [centralUnit, ...allUnits];

        files.forEach(file => {
            const unitName = displayUnits.find(u => u.id === file.unitId)?.name || 'Ismeretlen';
            if (!grouped[unitName]) {
                grouped[unitName] = [];
            }
            grouped[unitName].push(file);
        });
        return Object.entries(grouped);
    }, [files, allUnits]);


    return (
        <div className="p-4 md:p-8">
            {isUploadModalOpen && <FileUploadModal onClose={() => setIsUploadModalOpen(false)} currentUser={currentUser} allUnits={allUnits} />}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Tudástár</h1>
                {canManage && (
                    <button onClick={() => setIsUploadModalOpen(true)} className="bg-green-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-800 flex items-center gap-2">
                        <PlusIcon className="h-5 w-5" />
                        Új feltöltése
                    </button>
                )}
            </div>
            
            {loading && <div className="relative h-64"><LoadingSpinner /></div>}
            {error && <div className="bg-red-100 p-4 rounded-lg text-red-700">{error}</div>}
            
            {!loading && !error && files.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-xl">
                    <BookIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700">A tudástár üres</h3>
                    <p className="text-gray-500 mt-1">{canManage ? 'Tölts fel egy dokumentumot a kezdéshez.' : 'Nincsenek elérhető dokumentumok.'}</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {filesByUnit.map(([unitName, unitFiles]) => (
                        <div key={unitName}>
                            <h2 className="text-2xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">{unitName}</h2>
                            <div className="space-y-3">
                                {unitFiles.map(file => (
                                    <div key={file.id} className="bg-white p-4 rounded-xl shadow-md border flex items-center justify-between">
                                        <div>
                                            <p className="font-semibold text-gray-800">{file.name}</p>
                                            <p className="text-sm text-gray-500">
                                                {formatBytes(file.size)} - Feltöltötte: {file.uploadedBy} - {file.uploadedAt.toDate().toLocaleDateString('hu-HU')}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <a href={file.url} target="_blank" rel="noopener noreferrer" className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-full" title="Letöltés">
                                                <DownloadIcon className="h-5 w-5" />
                                            </a>
                                            {canManage && (
                                                <button onClick={() => handleDeleteFile(file)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-full" title="Törlés">
                                                    <TrashIcon className="h-5 w-5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TudastarApp;
