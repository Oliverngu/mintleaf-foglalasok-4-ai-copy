import React, { useState, useMemo, useCallback, useEffect, FC, useRef } from 'react';
import { Shift, Request, User, Unit, Position, ScheduleSettings, ExportStyleSettings } from '../../data/mockData';
import { db, Timestamp } from '../../firebase/config';
import { collection, doc, onSnapshot, orderBy, writeBatch, updateDoc, addDoc, deleteDoc, setDoc, query, getDoc } from 'firebase/firestore';
import LoadingSpinner from '../LoadingSpinner';
import PencilIcon from '../icons/PencilIcon';
import TrashIcon from '../icons/TrashIcon';
import PlusIcon from '../icons/PlusIcon';
import DownloadIcon from '../icons/DownloadIcon';
import { generateExcelExport } from './ExportModal';
import SettingsIcon from '../icons/SettingsIcon';
import html2canvas from 'html2canvas';
import ImageIcon from '../icons/ImageIcon';
import ArrowUpIcon from '../icons/ArrowUpIcon';
import ArrowDownIcon from '../icons/ArrowDownIcon';
import EyeSlashIcon from '../icons/EyeSlashIcon';
import EyeIcon from '../icons/EyeIcon';

// Helper function to calculate shift duration in hours
const calculateShiftDuration = (shift: Shift, dailyClosingTime?: string | null): number => {
    if (shift.isDayOff || !shift.start) return 0;
    
    let end = shift.end?.toDate();
    if (!end && dailyClosingTime) {
        const [hours, minutes] = dailyClosingTime.split(':').map(Number);
        const startDate = shift.start.toDate();
        end = new Date(startDate);
        end.setHours(hours, minutes, 0, 0);
        // Handle overnight closing times (e.g., opens at 22:00, closes at 02:00)
        if (end < startDate) {
            end.setDate(end.getDate() + 1);
        }
    }

    if (!end) return 0;

    const durationMs = end.getTime() - shift.start.toDate().getTime();
    return durationMs > 0 ? durationMs / (1000 * 60 * 60) : 0;
};


interface ShiftModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (shift: Partial<Shift> & { id?: string }) => void;
    onDelete: (shiftId: string) => void;
    shift: Shift | null;
    userId: string;
    date: Date;
    users: User[];
    viewMode: 'draft' | 'published';
}

const ShiftModal: FC<ShiftModalProps> = ({ isOpen, onClose, onSave, onDelete, shift, userId, date, users, viewMode }) => {
    const [formData, setFormData] = useState({
        userId: userId,
        startTime: '',
        endTime: '',
        note: ''
    });
    const [isDayOff, setIsDayOff] = useState(false);

    useEffect(() => {
        if (shift) {
            setIsDayOff(!!shift.isDayOff);
            setFormData({
                userId: shift.userId,
                startTime: shift.isDayOff ? '' : shift.start?.toDate().toTimeString().substring(0, 5) || '',
                endTime: shift.isDayOff ? '' : shift.end?.toDate()?.toTimeString().substring(0, 5) || '',
                note: shift.note || ''
            });
        } else {
             setIsDayOff(false);
             setFormData({ userId: userId, startTime: '', endTime: '', note: '' });
        }
    }, [shift, userId, isOpen]);

    const userFullName = useMemo(() => {
        const user = users.find(u => u.id === formData.userId);
        return user ? user.fullName : '';
    }, [users, formData.userId]);
    
    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        const user = users.find(u => u.id === formData.userId);
        if(!user) return;

        if (isDayOff) {
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            onSave({
                id: shift?.id,
                userId: user.id,
                userName: user.fullName,
                position: user.position || 'N/A',
                start: Timestamp.fromDate(dayStart),
                end: null,
                note: formData.note,
                status: viewMode,
                isDayOff: true,
            });
        } else {
            const [startHour, startMinute] = formData.startTime.split(':').map(Number);
            const startDate = new Date(date);
            startDate.setHours(startHour, startMinute, 0, 0);
            
            let endDate: Date | null = null;
            if(formData.endTime) {
                const [endHour, endMinute] = formData.endTime.split(':').map(Number);
                endDate = new Date(date);
                endDate.setHours(endHour, endMinute, 0, 0);
                if (endDate <= startDate) { // Handle overnight shifts
                    endDate.setDate(endDate.getDate() + 1);
                }
            }
            
            onSave({
                id: shift?.id,
                userId: user.id,
                userName: user.fullName,
                position: user.position || 'N/A',
                start: Timestamp.fromDate(startDate),
                end: endDate ? Timestamp.fromDate(endDate) : null,
                note: formData.note,
                status: viewMode,
                isDayOff: false,
            });
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                 <form onSubmit={handleSubmit}>
                    <div className="p-5 border-b flex justify-between items-center">
                        <h2 className="text-xl font-bold text-gray-800">{shift ? 'Műszak szerkesztése' : 'Új műszak'}</h2>
                        <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 text-gray-500">&times;</button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="text-sm font-medium">Munkatárs</label>
                            <input type="text" value={userFullName} readOnly className="w-full mt-1 p-2 border rounded-lg bg-gray-100" />
                        </div>
                        <div className="flex items-center gap-2">
                            <input 
                                type="checkbox" 
                                id="isDayOff" 
                                checked={isDayOff} 
                                onChange={(e) => setIsDayOff(e.target.checked)} 
                                className="h-5 w-5 rounded text-green-600 focus:ring-green-500"
                            />
                            <label htmlFor="isDayOff" className="font-medium text-gray-700">Szabadnap (X)</label>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="text-sm font-medium">Kezdés</label>
                                <input type="time" value={formData.startTime} onChange={e => setFormData(f=>({...f, startTime: e.target.value}))} className="w-full mt-1 p-2 border rounded-lg" disabled={isDayOff} required={!isDayOff} />
                            </div>
                             <div>
                                <label className="text-sm font-medium">Befejezés (opcionális)</label>
                                <input type="time" value={formData.endTime} onChange={e => setFormData(f=>({...f, endTime: e.target.value}))} className="w-full mt-1 p-2 border rounded-lg" disabled={isDayOff} />
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium">Megjegyzés</label>
                            <textarea value={formData.note} onChange={e => setFormData(f=>({...f, note: e.target.value}))} rows={2} className="w-full mt-1 p-2 border rounded-lg" />
                        </div>
                    </div>
                     <div className="p-4 bg-gray-50 flex justify-between items-center rounded-b-2xl">
                        <div>{shift && <button type="button" onClick={() => onDelete(shift.id)} className="text-red-600 font-semibold hover:bg-red-50 p-2 rounded-lg">Törlés</button>}</div>
                        <div className="flex gap-3">
                            <button type="button" onClick={onClose} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold">Mégse</button>
                            <button type="submit" className="bg-green-700 text-white px-4 py-2 rounded-lg font-semibold">Mentés</button>
                        </div>
                    </div>
                 </form>
            </div>
        </div>
    );
};


interface PublishWeekModalProps {
  units: { unitId: string, unitName: string, draftCount: number }[];
  onClose: () => void;
  onConfirm: (selectedUnitIds: string[]) => Promise<void>;
}

const PublishWeekModal: FC<PublishWeekModalProps> = ({ units, onClose, onConfirm }) => {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleToggle = (unitId: string) => {
        setSelectedIds(prev => prev.includes(unitId) ? prev.filter(id => id !== unitId) : [...prev, unitId]);
    };

    const handleToggleAll = () => {
        if (selectedIds.length === units.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(units.map(u => u.unitId));
        }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        await onConfirm(selectedIds);
        // The parent component will close the modal, no need to set state here.
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b">
                    <h2 className="text-xl font-bold text-gray-800">Hét Publikálása</h2>
                    <p className="text-sm text-gray-600 mt-1">Válaszd ki, melyik egységek piszkozatait szeretnéd publikálni.</p>
                </div>
                <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
                    <label className="flex items-center p-3 bg-gray-100 rounded-lg font-semibold">
                        <input
                            type="checkbox"
                            checked={selectedIds.length === units.length}
                            onChange={handleToggleAll}
                            className="h-5 w-5 rounded text-green-600 focus:ring-green-500"
                        />
                        <span className="ml-3">Összes kijelölése</span>
                    </label>
                    {units.map(({ unitId, unitName, draftCount }) => (
                        <label key={unitId} className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                            <input
                                type="checkbox"
                                checked={selectedIds.includes(unitId)}
                                onChange={() => handleToggle(unitId)}
                                className="h-5 w-5 rounded text-green-600 focus:ring-green-500"
                            />
                            <span className="ml-3 flex-grow font-medium text-gray-800">{unitName}</span>
                            <span className="text-sm bg-gray-200 text-gray-700 font-bold px-2 py-1 rounded-full">{draftCount} műszak</span>
                        </label>
                    ))}
                </div>
                <div className="p-4 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
                    <button type="button" onClick={onClose} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold">Mégse</button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting || selectedIds.length === 0}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-400"
                    >
                        {isSubmitting ? 'Publikálás...' : `Kiválasztottak publikálása (${selectedIds.length})`}
                    </button>
                </div>
            </div>
        </div>
    );
};


interface BeosztasAppProps {
    schedule: Shift[];
    requests: Request[];
    loading: boolean;
    error: string | null;
    currentUser: User;
    canManage: boolean;
    allUnits: Unit[];
    activeUnitIds: string[];
}

const getWeekDays = (date: Date): Date[] => {
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }, (_, i) => {
        const newDay = new Date(startOfWeek);
        newDay.setDate(startOfWeek.getDate() + i);
        return newDay;
    });
};

const toDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const createDefaultSettings = (unitId: string, weekStartDate: string): ScheduleSettings => ({
    id: `${unitId}_${weekStartDate}`,
    unitId,
    weekStartDate,
    showOpeningTime: false,
    showClosingTime: false,
    dailySettings: Array.from({ length: 7 }, () => ({
        isOpen: true, openingTime: '08:00', closingTime: '22:00', quotas: {}
    })).reduce((acc, curr, i) => ({ ...acc, [i]: curr }), {})
});

// --- NEW: Default Export Settings ---
const DEFAULT_EXPORT_SETTINGS: ExportStyleSettings = {
    id: '',
    zebraStrength: 15,
    zebraColor: '#F1F5F9',
    nameColumnColor: '#E2E8F0',
    dayHeaderBgColor: '#CBD5E1',
    categoryHeaderBgColor: '#CBD5E1',
    categoryHeaderTextColor: '#1E293B',
    gridThickness: 1,
    gridColor: '#9CA3AF',
    useRoundedCorners: true,
    borderRadius: 8,
    fontSizeCell: 14,
    fontSizeHeader: 16,
    useFullNameForDays: true,
    lastUsedColors: ['#FFFFFF', '#F1F5F9', '#E2E8F0', '#CBD5E1', '#9CA3AF', '#334155'],
};

const adjustColor = (hex: string, percent: number): string => {
    if (!hex || hex.length < 7) return '#FFFFFF';
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);
    const amount = Math.round(2.55 * percent);
    r = Math.min(255, Math.max(0, r + amount));
    g = Math.min(255, Math.max(0, g + amount));
    b = Math.min(255, Math.max(0, b + amount));
    const toHex = (c: number) => Math.round(c).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};


// --- COLOR HELPER FUNCTIONS ---
const hexToRgb = (hex: string): { r: number, g: number, b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
};

const hexToHsv = (hex: string): { h: number, s: number, v: number } => {
    let { r, g, b } = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
    r /= 255; g /= 255; b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, v = max;
    let d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max !== min) {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, v: v * 100 };
};

const hsvToHex = (h: number, s: number, v: number): string => {
    s /= 100; v /= 100;
    let i = Math.floor((h / 360) * 6);
    let f = (h / 360) * 6 - i;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);
    let r = 0, g = 0, b = 0;
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    const toHex = (c: number) => ('0' + Math.round(c * 255).toString(16)).slice(-2);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const getContrastingTextColor = (hex: string): '#FFFFFF' | '#000000' => {
    if (!hex) return '#000000';
    const rgb = hexToRgb(hex);
    if (!rgb) return '#000000';
    const yiq = ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#FFFFFF';
};

const getLuminance = (r: number, g: number, b: number) => {
    const a = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
};

const getContrastRatio = (hex1: string, hex2: string) => {
    const rgb1 = hexToRgb(hex1);
    const rgb2 = hexToRgb(hex2);
    if (!rgb1 || !rgb2) return 1;
    const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
    const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    return (brightest + 0.05) / (darkest + 0.05);
};

// --- NEW: Color Picker Popup Component ---
const ColorPickerPopup: FC<{
    color: string;
    onChange: (newColor: string) => void;
    onClose: () => void;
    lastUsedColors: string[];
}> = ({ color, onChange, onClose, lastUsedColors }) => {
    const popupRef = useRef<HTMLDivElement>(null);
    const [hsv, setHsv] = useState(() => hexToHsv(color));

    useEffect(() => {
        setHsv(hexToHsv(color));
    }, [color]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const handleSliderChange = (part: 'h' | 's' | 'v', value: number) => {
        const newHsv = { ...hsv, [part]: value };
        setHsv(newHsv);
        onChange(hsvToHex(newHsv.h, newHsv.s, newHsv.v));
    };

    const hueGradient = `linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)`;
    const saturationGradient = `linear-gradient(to right, #fff, ${hsvToHex(hsv.h, 100, 100)})`;
    const valueGradient = `linear-gradient(to right, #000, ${hsvToHex(hsv.h, 100, 100)})`;

    return (
        <div ref={popupRef} className="absolute z-20 w-72 bg-white rounded-lg shadow-2xl border p-4">
            <div className="w-full h-20 rounded mb-4" style={{ backgroundColor: color }}></div>
            <div className="space-y-3">
                <div>
                    <label className="text-xs font-semibold text-gray-600">Színárnyalat</label>
                    <div className="h-6 rounded-full" style={{ background: hueGradient }}>
                        <input type="range" min="0" max="360" value={hsv.h} onChange={e => handleSliderChange('h', +e.target.value)} className="w-full h-full slider-thumb" />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-semibold text-gray-600">Telítettség</label>
                    <div className="h-6 rounded-full" style={{ background: saturationGradient }}>
                        <input type="range" min="0" max="100" value={hsv.s} onChange={e => handleSliderChange('s', +e.target.value)} className="w-full h-full slider-thumb" />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-semibold text-gray-600">Fényerő</label>
                    <div className="h-6 rounded-full" style={{ background: valueGradient }}>
                        <input type="range" min="0" max="100" value={hsv.v} onChange={e => handleSliderChange('v', +e.target.value)} className="w-full h-full slider-thumb" />
                    </div>
                </div>
            </div>
            <div className="mt-4 pt-3 border-t">
                <h4 className="text-xs font-semibold text-gray-600 mb-2">Utoljára használt</h4>
                <div className="flex flex-wrap gap-2">
                    {(lastUsedColors || []).map((c, i) => (
                        <button key={i} onClick={() => onChange(c)} className="h-7 w-7 rounded-full border-2 border-white shadow shrink-0" style={{ backgroundColor: c }} title={c}></button>
                    ))}
                </div>
            </div>
            <style>{`
                .slider-thumb { -webkit-appearance: none; appearance: none; width: 100%; height: 100%; background: transparent; cursor: pointer; }
                .slider-thumb::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; background: #fff; border-radius: 50%; border: 2px solid #ccc; box-shadow: 0 0 4px rgba(0,0,0,0.2); }
                .slider-thumb::-moz-range-thumb { width: 24px; height: 24px; background: #fff; border-radius: 50%; border: 2px solid #ccc; box-shadow: 0 0 4px rgba(0,0,0,0.2); }
            `}</style>
        </div>
    );
};

// --- Export Settings Panel Component ---
const ExportSettingsPanel: FC<{
    settings: ExportStyleSettings;
    setSettings: React.Dispatch<React.SetStateAction<ExportStyleSettings>>;
}> = ({ settings, setSettings }) => {
    const [activeColorPicker, setActiveColorPicker] = useState<keyof ExportStyleSettings | null>(null);

    const handleColorChange = (key: keyof ExportStyleSettings, value: string) => {
        setSettings(prev => ({...prev, [key]: value}));
    };
    
    const handleSliderChange = (key: keyof ExportStyleSettings, value: string) => {
        setSettings(prev => ({...prev, [key]: Number(value)}));
    };
    
    const handleCheckboxChange = (key: keyof ExportStyleSettings, checked: boolean) => {
        setSettings(prev => ({...prev, [key]: checked}));
    };
    
    const categoryTextColor = useMemo(() => getContrastingTextColor(settings.categoryHeaderBgColor), [settings.categoryHeaderBgColor]);
    const dayHeaderTextColor = useMemo(() => getContrastingTextColor(settings.dayHeaderBgColor), [settings.dayHeaderBgColor]);
    const nameColumnTextColor = useMemo(() => getContrastingTextColor(settings.nameColumnColor), [settings.nameColumnColor]);
    const zebraTextColor = useMemo(() => getContrastingTextColor(settings.zebraColor), [settings.zebraColor]);

    const contrastWarning = useMemo(() => {
        const checks = [
            getContrastRatio(settings.categoryHeaderBgColor, categoryTextColor),
            getContrastRatio(settings.dayHeaderBgColor, dayHeaderTextColor),
            getContrastRatio(settings.nameColumnColor, nameColumnTextColor),
            getContrastRatio(settings.zebraColor, zebraTextColor),
        ];
        return checks.some(ratio => ratio < 3.0) ? "Alacsony kontraszt – válassz világosabb vagy sötétebb árnyalatot." : null;
    }, [settings, categoryTextColor, dayHeaderTextColor, nameColumnTextColor, zebraTextColor]);

    const altZebraColor = useMemo(() => adjustColor(settings.zebraColor, -(settings.zebraStrength / 2)), [settings.zebraColor, settings.zebraStrength]);
    const altNameColor = useMemo(() => adjustColor(settings.nameColumnColor, -(settings.zebraStrength / 2)), [settings.nameColumnColor, settings.zebraStrength]);
    const altZebraTextColor = useMemo(() => getContrastingTextColor(altZebraColor), [altZebraColor]);
    const altNameTextColor = useMemo(() => getContrastingTextColor(altNameColor), [altNameColor]);


    const ColorInput: FC<{id: keyof ExportStyleSettings, label: string}> = ({id, label}) => (
        <div className="relative">
            <label className="block text-sm">{label}</label>
            <button type="button" onClick={() => setActiveColorPicker(id)} className="w-full h-10 p-1 border rounded-lg flex items-center justify-between text-sm px-2" style={{ backgroundColor: settings[id] as string, color: getContrastingTextColor(settings[id] as string) }}>
                <span>{settings[id] as string}</span>
                <div className="w-6 h-6 rounded border border-gray-400" style={{ backgroundColor: settings[id] as string }}></div>
            </button>
            {activeColorPicker === id && (
                <ColorPickerPopup
                    color={settings[id] as string}
                    onChange={(newColor) => handleColorChange(id, newColor)}
                    onClose={() => setActiveColorPicker(null)}
                    lastUsedColors={settings.lastUsedColors}
                />
            )}
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            {/* Left: Controls */}
            <div className="space-y-6">
                 <div>
                    <h4 className="font-semibold mb-2">Sorok színezése</h4>
                    <label className="block text-sm">Zebra erősség: {settings.zebraStrength}%</label>
                    <input type="range" min="0" max="100" value={settings.zebraStrength} onChange={e => handleSliderChange('zebraStrength', e.target.value)} className="w-full" />
                    <ColorInput id="zebraColor" label="Alapszín" />
                </div>
                 <div>
                    <h4 className="font-semibold mb-2">Név oszlop</h4>
                    <ColorInput id="nameColumnColor" label="Alapszín" />
                 </div>
                 <div>
                    <h4 className="font-semibold mb-2">Fejlécek</h4>
                     <ColorInput id="dayHeaderBgColor" label="Napok fejléce" />
                     <ColorInput id="categoryHeaderBgColor" label="Kategória háttér" />
                </div>
                 <div>
                    <h4 className="font-semibold mb-2">Rács és Keret</h4>
                    <ColorInput id="gridColor" label="Rácsvonal színe" />
                    <label className="block text-sm mt-2">Lekerekítés: {settings.borderRadius}px</label>
                    <input type="range" min="0" max="24" value={settings.borderRadius} onChange={e => handleSliderChange('borderRadius', e.target.value)} className="w-full" />
                    <label className="flex items-center gap-2"><input type="checkbox" checked={settings.useRoundedCorners} onChange={e => handleCheckboxChange('useRoundedCorners', e.target.checked)} /> Lekerekített sarkok</label>
                </div>
                 <div>
                    <h4 className="font-semibold mb-2">Tipográfia</h4>
                     <label className="block text-sm">Napok formátuma</label>
                    <select value={settings.useFullNameForDays ? 'full' : 'short'} onChange={e => handleCheckboxChange('useFullNameForDays', e.target.value === 'full')} className="w-full p-2 border rounded">
                        <option value="full">Teljes napnevek (Hétfő, Kedd...)</option>
                        <option value="short">Rövid nevek (H, K...)</option>
                    </select>
                </div>
            </div>
            {/* Right: Preview */}
            <div className="sticky top-0">
                <h4 className="font-semibold mb-2">Előnézet</h4>
                <div className="p-2 bg-gray-200" style={{ borderRadius: settings.useRoundedCorners ? `${settings.borderRadius}px` : '0px' }}>
                    <table className="w-full text-xs border-collapse" style={{ border: `${settings.gridThickness}px solid ${settings.gridColor}` }}>
                        <thead>
                            <tr>
                                <th style={{ background: settings.nameColumnColor, color: nameColumnTextColor, padding: '4px', border: `${settings.gridThickness}px solid ${settings.gridColor}`, fontSize: `${settings.fontSizeHeader}px`, verticalAlign: 'middle', textAlign: 'center' }}>Munkatárs</th>
                                <th style={{ background: settings.dayHeaderBgColor, color: dayHeaderTextColor, padding: '4px', border: `${settings.gridThickness}px solid ${settings.gridColor}`, fontSize: `${settings.fontSizeHeader}px`, verticalAlign: 'middle', textAlign: 'center' }}>H</th>
                                <th style={{ background: settings.dayHeaderBgColor, color: dayHeaderTextColor, padding: '4px', border: `${settings.gridThickness}px solid ${settings.gridColor}`, fontSize: `${settings.fontSizeHeader}px`, verticalAlign: 'middle', textAlign: 'center' }}>K</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style={{ background: settings.categoryHeaderBgColor }}>
                                <td colSpan={3} style={{ padding: '6px', border: `${settings.gridThickness}px solid ${settings.gridColor}`, fontWeight: 'bold', color: categoryTextColor, fontSize: '1.1em', verticalAlign: 'middle', textAlign: 'center' }}>Pultos</td>
                            </tr>
                            <tr style={{ background: settings.zebraColor, color: zebraTextColor }}>
                                <td style={{ padding: '4px', border: `${settings.gridThickness}px solid ${settings.gridColor}`, background: settings.nameColumnColor, color: nameColumnTextColor, fontSize: `${settings.fontSizeCell}px`, verticalAlign: 'middle', textAlign: 'center' }}>Minta János</td>
                                <td style={{ padding: '4px', border: `${settings.gridThickness}px solid ${settings.gridColor}`, fontSize: `${settings.fontSizeCell}px`, verticalAlign: 'middle', textAlign: 'center' }}>10:00-18:00</td>
                                <td style={{ padding: '4px', border: `${settings.gridThickness}px solid ${settings.gridColor}`, fontSize: `${settings.fontSizeCell}px`, verticalAlign: 'middle', textAlign: 'center' }}>X</td>
                            </tr>
                            <tr style={{ background: altZebraColor, color: altZebraTextColor }}>
                                <td style={{ padding: '4px', border: `${settings.gridThickness}px solid ${settings.gridColor}`, background: altNameColor, color: altNameTextColor, fontSize: `${settings.fontSizeCell}px`, verticalAlign: 'middle', textAlign: 'center' }}>Teszt Eszter</td>
                                <td style={{ padding: '4px', border: `${settings.gridThickness}px solid ${settings.gridColor}`, fontSize: `${settings.fontSizeCell}px`, verticalAlign: 'middle', textAlign: 'center' }}>X</td>
                                <td style={{ padding: '4px', border: `${settings.gridThickness}px solid ${settings.gridColor}`, fontSize: `${settings.fontSizeCell}px`, verticalAlign: 'middle', textAlign: 'center' }}>14:00-22:00</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                {contrastWarning && <p className="text-xs text-red-600 font-semibold mt-2">{contrastWarning}</p>}
            </div>
        </div>
        </div>
    );
};

interface ExportConfirmationModalProps {
    type: 'PNG' | 'Excel';
    onClose: () => void;
    onConfirm: () => Promise<void>;
    exportSettings: ExportStyleSettings;
    unitName: string;
}

const ExportConfirmationModal: FC<ExportConfirmationModalProps> = ({ type, onClose, onConfirm, exportSettings, unitName }) => {
    const [isExporting, setIsExporting] = useState(false);

    const handleConfirmClick = async () => {
        setIsExporting(true);
        try {
            await onConfirm();
            // On success, the parent will close the modal and show a toast.
        } catch (err) {
            // Errors are typically handled inside the export functions with an alert.
            setIsExporting(false); // Re-enable button on failure.
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // A miniaturized version of the ExportSettingsPanel preview for the confirmation modal
    const Preview: FC<{ settings: ExportStyleSettings }> = ({ settings }) => {
        const altZebraColor = useMemo(() => adjustColor(settings.zebraColor, -(settings.zebraStrength / 2)), [settings.zebraColor, settings.zebraStrength]);
        const altNameColor = useMemo(() => adjustColor(settings.nameColumnColor, -(settings.zebraStrength / 2)), [settings.nameColumnColor, settings.zebraStrength]);
        const categoryTextColor = getContrastingTextColor(settings.categoryHeaderBgColor);

        return (
            <div className="p-2 bg-gray-200" style={{ borderRadius: settings.useRoundedCorners ? `${settings.borderRadius}px` : '0px' }}>
                <table className="w-full text-xs border-collapse" style={{ border: `${settings.gridThickness}px solid ${settings.gridColor}` }}>
                    <thead>
                        <tr>
                            <th style={{ background: settings.nameColumnColor, color: getContrastingTextColor(settings.nameColumnColor), padding: '4px', border: `${settings.gridThickness}px solid ${settings.gridColor}` }}>Név</th>
                            <th style={{ background: settings.dayHeaderBgColor, color: getContrastingTextColor(settings.dayHeaderBgColor), padding: '4px', border: `${settings.gridThickness}px solid ${settings.gridColor}` }}>H</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style={{ background: settings.categoryHeaderBgColor }}>
                            <td colSpan={2} style={{ padding: '6px', border: `${settings.gridThickness}px solid ${settings.gridColor}`, fontWeight: 'bold', color: categoryTextColor }}>Pultos</td>
                        </tr>
                        <tr style={{ background: settings.zebraColor, color: getContrastingTextColor(settings.zebraColor) }}>
                            <td style={{ padding: '4px', border: `${settings.gridThickness}px solid ${settings.gridColor}`, background: settings.nameColumnColor, color: getContrastingTextColor(settings.nameColumnColor) }}>Minta J.</td>
                            <td style={{ padding: '4px', border: `${settings.gridThickness}px solid ${settings.gridColor}` }}>08-16</td>
                        </tr>
                        <tr style={{ background: altZebraColor, color: getContrastingTextColor(altZebraColor) }}>
                            <td style={{ padding: '4px', border: `${settings.gridThickness}px solid ${settings.gridColor}`, background: altNameColor, color: getContrastingTextColor(altNameColor) }}>Teszt E.</td>
                            <td style={{ padding: '4px', border: `${settings.gridThickness}px solid ${settings.gridColor}` }}>X</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b">
                    <h2 className="text-xl font-bold text-gray-800">Export előnézet és megerősítés</h2>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    <div>
                        <h3 className="font-semibold text-gray-800">Előnézet</h3>
                        <div className="mt-2 scale-90 origin-top-left"><Preview settings={exportSettings} /></div>
                    </div>
                    <div className="space-y-4">
                        <p className="text-gray-600">
                            Az exportált táblázat megjelenése testreszabható a Beállítások menüben.
                            Biztosan exportálni szeretnéd ezzel a formátummal?
                        </p>
                        <div className="p-3 bg-gray-100 rounded-lg text-sm">
                            <span className="font-semibold">Egység:</span> {unitName}<br/>
                            <span className="font-semibold">Formátum:</span> {type}
                        </div>
                    </div>
                </div>
                <div className="p-4 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
                    <button type="button" onClick={onClose} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold">Mégse</button>
                    <button
                        onClick={handleConfirmClick}
                        disabled={isExporting}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-400 flex items-center gap-2"
                    >
                        {isExporting && <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                        {isExporting ? 'Exportálás...' : 'Exportálás megerősítése'}
                    </button>
                </div>
            </div>
        </div>
    );
};


export const BeosztasApp: FC<BeosztasAppProps> = ({ schedule, requests, currentUser, canManage, allUnits, activeUnitIds }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'draft' | 'published'>('published');
    const [allAppUsers, setAllAppUsers] = useState<User[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [isDataLoading, setIsDataLoading] = useState(true);
    
    const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
    const [editingShift, setEditingShift] = useState<{shift: Shift | null, userId: string, date: Date} | null>(null);

    const [weekSettings, setWeekSettings] = useState<ScheduleSettings | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    // NEW: state for settings modal tabs
    const [activeSettingsTab, setActiveSettingsTab] = useState<'opening' | 'export'>('opening');

    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [unitsWithDrafts, setUnitsWithDrafts] = useState<{ unitId: string, unitName: string, draftCount: number }[]>([]);

    const [isPngExporting, setIsPngExporting] = useState(false);
    const [orderedUsers, setOrderedUsers] = useState<User[]>([]);
    const [hiddenUserIds, setHiddenUserIds] = useState<Set<string>>(new Set());
    const [isHiddenMenuOpen, setIsHiddenMenuOpen] = useState(false);
    const tableRef = useRef<HTMLTableElement>(null);
    
    const [isEditMode, setIsEditMode] = useState(false);

    const [savedOrderedUserIds, setSavedOrderedUserIds] = useState<string[]>([]);
    const [savedHiddenUserIds, setSavedHiddenUserIds] = useState<string[]>([]);
    
    // --- NEW: Export settings states ---
    const [exportSettings, setExportSettings] = useState<ExportStyleSettings>(DEFAULT_EXPORT_SETTINGS);
    const [initialExportSettings, setInitialExportSettings] = useState<ExportStyleSettings>(DEFAULT_EXPORT_SETTINGS);
    const [isSavingExportSettings, setIsSavingExportSettings] = useState(false);
    const exportSettingsHaveChanged = useMemo(() => JSON.stringify(exportSettings) !== JSON.stringify(initialExportSettings), [exportSettings, initialExportSettings]);

    const [exportConfirmation, setExportConfirmation] = useState<{ type: 'PNG' | 'Excel' } | null>(null);
    const [successToast, setSuccessToast] = useState('');


    const settingsDocId = useMemo(() => {
        if (activeUnitIds.length === 0) return null;
        return activeUnitIds.sort().join('_');
    }, [activeUnitIds]);

    useEffect(() => {
        const unsubUsers = onSnapshot(collection(db, 'users'), snapshot => {
            setAllAppUsers(snapshot.docs.map(doc => {
                const data = doc.data();
                const lastName = data.lastName || '';
                const firstName = data.firstName || '';
                return {
                    id: doc.id,
                    ...data,
                    fullName: data.fullName || `${lastName} ${firstName}`.trim(),
                } as User;
            }));
            setIsDataLoading(false);
        });
        const unsubPositions = onSnapshot(query(collection(db, 'positions'), orderBy('name')), snapshot => {
            setPositions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Position)));
        });

        return () => { unsubUsers(); unsubPositions(); };
    }, []);

    const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
    
    const filteredUsers = useMemo(() => {
        if (!activeUnitIds || activeUnitIds.length === 0) return [];
        return allAppUsers
            .filter(u => u.unitIds && u.unitIds.some(uid => activeUnitIds.includes(uid)))
            .sort((a, b) => (a.position || '').localeCompare(b.position || ''));
    }, [allAppUsers, activeUnitIds]);

    useEffect(() => {
        if (!settingsDocId) return;
        const docRef = doc(db, 'schedule_display_settings', settingsDocId);
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setSavedOrderedUserIds(data.orderedUserIds || []);
                setSavedHiddenUserIds(data.hiddenUserIds || []);
            } else {
                setSavedOrderedUserIds([]);
                setSavedHiddenUserIds([]);
            }
        });
        return () => unsubscribe();
    }, [settingsDocId]);
    
    useEffect(() => {
        setHiddenUserIds(new Set(savedHiddenUserIds));

        if (savedOrderedUserIds.length > 0) {
            const userMap = new Map(filteredUsers.map(u => [u.id, u]));
            const ordered = savedOrderedUserIds
                .map((id: string) => userMap.get(id))
                .filter((u: User | undefined): u is User => u !== undefined);
            
            const newUsers = filteredUsers.filter(u => !savedOrderedUserIds.includes(u.id));
            setOrderedUsers([...ordered, ...newUsers]);
        } else {
            setOrderedUsers(filteredUsers);
        }
    }, [filteredUsers, savedOrderedUserIds, savedHiddenUserIds]);

    const saveDisplaySettings = useCallback(async (newOrder: string[], newHidden: string[]) => {
        if (!settingsDocId) return;
        const docRef = doc(db, 'schedule_display_settings', settingsDocId);
        try {
            await setDoc(docRef, { 
                orderedUserIds: newOrder,
                hiddenUserIds: newHidden
            }, { merge: true });
        } catch (error) {
            console.error("Failed to save display settings:", error);
        }
    }, [settingsDocId]);

    // --- NEW/MODIFIED: Fetch Export Settings based on unit ---
    useEffect(() => {
        // This effect loads the unit-specific export settings when an admin selects a single unit.
        if (!canManage || activeUnitIds.length !== 1) {
            // Reset to default if multiple units are selected or user is not an admin
            setExportSettings(DEFAULT_EXPORT_SETTINGS);
            setInitialExportSettings(DEFAULT_EXPORT_SETTINGS);
            return;
        };

        const unitId = activeUnitIds[0];
        const settingsDocRef = doc(db, 'unit_export_settings', unitId);
        const unsub = onSnapshot(settingsDocRef, (docSnap) => {
            const settings = { ...DEFAULT_EXPORT_SETTINGS, ...(docSnap.data() || {}) } as ExportStyleSettings;
            setExportSettings(settings);
            setInitialExportSettings(settings);
        });
        return () => unsub();
    }, [activeUnitIds, canManage]);

    const handleSaveExportSettings = async () => {
        if (!canManage || activeUnitIds.length !== 1) {
             alert("A beállítások mentéséhez válasszon ki pontosan egy egységet.");
            return;
        }
        setIsSavingExportSettings(true);
        const unitId = activeUnitIds[0];
        try {
            const settingsDocRef = doc(db, 'unit_export_settings', unitId);
            
            const currentSettingsColors = [
                exportSettings.zebraColor,
                exportSettings.nameColumnColor,
                exportSettings.dayHeaderBgColor,
                exportSettings.categoryHeaderBgColor,
            ].filter(c => c && c.startsWith('#'));

            const docSnap = await getDoc(settingsDocRef);
            const existingColors = docSnap.exists() ? docSnap.data().lastUsedColors || [] : [];
            
            const updatedLastUsedColors = [
                ...new Set([...currentSettingsColors, ...existingColors])
            ].slice(0, 12);

            const settingsToSave = {
                ...exportSettings,
                categoryHeaderTextColor: getContrastingTextColor(exportSettings.categoryHeaderBgColor), // Save calculated color
                lastUsedColors: updatedLastUsedColors
            };

            await setDoc(settingsDocRef, settingsToSave);

            alert("Exportálási beállítások mentve ehhez az egységhez!");
            setInitialExportSettings(settingsToSave);
        } catch (error) {
            console.error("Failed to save export settings for unit:", error);
            alert("Hiba történt a beállítások mentésekor.");
        } finally {
            setIsSavingExportSettings(false);
        }
    };


    useEffect(() => {
        if (!canManage || activeUnitIds.length !== 1) {
            setWeekSettings(null);
            return;
        }
        const unitId = activeUnitIds[0];
        const weekStartDateStr = toDateString(weekDays[0]);
        const settingsId = `${unitId}_${weekStartDateStr}`;
        const unsub = onSnapshot(doc(db, 'schedule_settings', settingsId), docSnap => {
            if (docSnap.exists()) {
                setWeekSettings(docSnap.data() as ScheduleSettings);
            } else {
                setWeekSettings(createDefaultSettings(unitId, weekStartDateStr));
            }
        });
        return () => unsub();
    }, [activeUnitIds, weekDays, canManage]);
    
    const activeShifts = useMemo(() => schedule.filter(s => (s.status || 'draft') === viewMode), [schedule, viewMode]);

    const shiftsByUserDay = useMemo(() => {
        const map = new Map<string, Map<string, Shift[]>>();
        orderedUsers.forEach(user => map.set(user.id, new Map()));
        activeShifts.forEach(shift => {
            if (shift.start) {
                const userShifts = map.get(shift.userId);
                if (userShifts) {
                    const dayKey = toDateString(shift.start.toDate());
                    if (!userShifts.has(dayKey)) userShifts.set(dayKey, []);
                    userShifts.get(dayKey)!.push(shift);
                }
            }
        });
        return map;
    }, [activeShifts, orderedUsers]);

    const requestsByUserDay = useMemo(() => {
        const map = new Map<string, Set<string>>();
        requests.filter(r => r.status === 'approved').forEach(req => {
            if (!map.has(req.userId)) map.set(req.userId, new Set());
            const userRequests = map.get(req.userId)!;
            if(req.startDate && req.endDate){
                const start = req.startDate.toDate();
                const end = req.endDate.toDate();
                const loopDate = new Date(start);
                while (loopDate <= end) {
                    userRequests.add(toDateString(loopDate));
                    loopDate.setDate(loopDate.getDate() + 1);
                }
            }
        });
        return map;
    }, [requests]);

    const workHours = useMemo(() => {
        const userTotals: Record<string, number> = {};
        const dayTotals: number[] = Array(7).fill(0);
        
        orderedUsers.forEach(user => {
            userTotals[user.id] = 0;
            weekDays.forEach((day, dayIndex) => {
                const dayKey = toDateString(day);
                const dayShifts = shiftsByUserDay.get(user.id)?.get(dayKey) || [];
                const dailyClosingTime = weekSettings?.dailySettings[dayIndex]?.closingTime;

                const dayHours = dayShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift, dailyClosingTime), 0);
                userTotals[user.id] += dayHours;
                if (!hiddenUserIds.has(user.id)) {
                    dayTotals[dayIndex] += dayHours;
                }
            });
        });
        const grandTotal = dayTotals.reduce((a, b) => a + b, 0);
        return { userTotals, dayTotals, grandTotal };
    }, [orderedUsers, hiddenUserIds, weekDays, shiftsByUserDay, weekSettings]);

    const visibleUsersByPosition = useMemo(() => {
        const visible = orderedUsers.filter(u => !hiddenUserIds.has(u.id));
        const grouped: Record<string, User[]> = {};
        visible.forEach(user => {
            const pos = user.position || 'Nincs pozíció';
            if (!grouped[pos]) grouped[pos] = [];
            grouped[pos].push(user);
        });
        return grouped;
    }, [orderedUsers, hiddenUserIds]);

    const visiblePositionOrder = useMemo(() => {
        const originalOrder = [...new Set(orderedUsers.map(u => u.position || 'Nincs pozíció'))];
        return originalOrder.filter(pos => visibleUsersByPosition[pos] && visibleUsersByPosition[pos].length > 0);
    }, [orderedUsers, visibleUsersByPosition]);
    
    const hiddenUsers = useMemo(() => allAppUsers.filter(u => hiddenUserIds.has(u.id)), [allAppUsers, hiddenUserIds]);


    const handlePrevWeek = () => setCurrentDate(d => {
        const newDate = new Date(d);
        newDate.setDate(newDate.getDate() - 7);
        return newDate;
    });

    const handleNextWeek = () => setCurrentDate(d => {
        const newDate = new Date(d);
        newDate.setDate(newDate.getDate() + 7);
        return newDate;
    });

    const handlePublishWeek = () => {
        const weekStart = weekDays[0];
        const weekEnd = new Date(weekDays[6]);
        weekEnd.setHours(23, 59, 59, 999);

        const draftShifts = schedule.filter(s =>
            (s.status === 'draft' || !s.status) &&
            s.start &&
            s.start.toDate() >= weekStart &&
            s.start.toDate() <= weekEnd &&
            s.unitId
        );

        if (draftShifts.length === 0) {
            alert('Nincsenek piszkozatban lévő műszakok ezen a héten.');
            return;
        }

        const draftsByUnit = draftShifts.reduce((acc, shift) => {
            if (shift.unitId) {
                if (!acc[shift.unitId]) {
                    acc[shift.unitId] = 0;
                }
                acc[shift.unitId]++;
            }
            return acc;
        }, {} as Record<string, number>);

        const unitsData = Object.entries(draftsByUnit)
            .map(([unitId, count]) => ({
                unitId,
                unitName: allUnits.find(u => u.id === unitId)?.name || 'Ismeretlen Egység',
                draftCount: count,
            }))
            .sort((a, b) => a.unitName.localeCompare(b.unitName));

        setUnitsWithDrafts(unitsData);
        setIsPublishModalOpen(true);
    };

    const handleConfirmPublish = async (selectedUnitIds: string[]) => {
        if (selectedUnitIds.length === 0) return;

        const weekStart = weekDays[0];
        const weekEnd = new Date(weekDays[6]);
        weekEnd.setHours(23, 59, 59, 999);

        const shiftsToPublish = schedule.filter(s =>
            (s.status === 'draft' || !s.status) &&
            s.start &&
            s.start.toDate() >= weekStart &&
            s.start.toDate() <= weekEnd &&
            s.unitId &&
            selectedUnitIds.includes(s.unitId)
        );

        if (shiftsToPublish.length > 0) {
            const batch = writeBatch(db);
            shiftsToPublish.forEach(shift => batch.update(doc(db, 'shifts', shift.id), { status: 'published' }));
            await batch.commit();
            alert('A kiválasztott műszakok sikeresen publikálva!');
        }
        setIsPublishModalOpen(false);
    };
    
    const handleOpenShiftModal = (shift: Shift | null, userId: string, date: Date) => {
        setEditingShift({shift, userId, date});
        setIsShiftModalOpen(true);
    }
    
    const handleSaveShift = async (shiftData: Partial<Shift> & { id?: string }) => {
        const shiftToSave = { ...shiftData, unitId: activeUnitIds[0] };
        if (shiftToSave.id) {
            const docId = shiftToSave.id;
            const { id, ...dataToUpdate } = shiftToSave;
            await updateDoc(doc(db, 'shifts', docId), dataToUpdate);
        } else {
            const { id, ...dataToAdd } = shiftToSave;
            await addDoc(collection(db, 'shifts'), dataToAdd);
        }
        setIsShiftModalOpen(false);
    };

    const handleDeleteShift = async (shiftId: string) => {
        if(window.confirm('Biztosan törölni szeretnéd ezt a műszakot?')){
            await deleteDoc(doc(db, 'shifts', shiftId));
            setIsShiftModalOpen(false);
        }
    };

    const handleSettingsChange = useCallback(async (newSettings: ScheduleSettings) => {
        setWeekSettings(newSettings);
        if (!canManage || activeUnitIds.length !== 1) return;
        try {
            await setDoc(doc(db, 'schedule_settings', newSettings.id), newSettings);
        } catch (error) {
            console.error("Failed to save settings:", error);
        }
    }, [canManage, activeUnitIds]);

    const handlePngExport = (): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!tableRef.current) {
                reject(new Error("Table ref not found"));
                return;
            }
            setIsPngExporting(true);
        
            const exportContainer = document.createElement('div');
            Object.assign(exportContainer.style, {
                position: 'absolute',
                left: '-9999px',
                top: '0',
                backgroundColor: '#ffffff',
                padding: '20px',
                display: 'inline-block',
                borderRadius: exportSettings.useRoundedCorners ? `${exportSettings.borderRadius}px` : '0px',
                overflow: 'hidden',
            });
        
            const tableClone = tableRef.current.cloneNode(true) as HTMLTableElement;
            exportContainer.appendChild(tableClone);
            document.body.appendChild(exportContainer);
        
            tableClone.querySelectorAll('.export-hide').forEach(el => el.remove());
            
            tableClone.querySelectorAll('tr').forEach(row => {
                const positionHeader = row.querySelector('td[colSpan]');
                if (positionHeader) {
                    positionHeader.setAttribute('colSpan', '8');
                }
            });
            
            const dayHeaderCells = tableClone.querySelectorAll('thead tr:first-child th');
            const dayNamesFull = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];
            const dayNamesShort = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];
            const dayNames = exportSettings.useFullNameForDays ? dayNamesFull : dayNamesShort;
            dayHeaderCells.forEach((th, index) => {
                if (index > 0 && index < 8) { 
                    const originalContent = th.innerHTML; 
                    const datePart = originalContent.split('<br>')[1];
                    th.innerHTML = `${dayNames[index-1]}<br>${datePart}`;
                }
            });
        
            Object.assign(tableClone.style, { tableLayout: 'auto', borderCollapse: 'collapse' });
            tableClone.querySelectorAll('.sticky').forEach(el => el.classList.remove('sticky'));
            
            tableClone.querySelectorAll('th, td').forEach(cell => {
                const c = cell as HTMLElement;
                c.style.verticalAlign = 'middle';
                c.style.textAlign = 'center';
                c.style.padding = '8px';
                c.style.wordBreak = 'break-word';
                c.style.border = `${exportSettings.gridThickness}px solid ${exportSettings.gridColor}`;
            });
            
            tableClone.querySelectorAll('thead th').forEach((th, index) => {
                const c = th as HTMLElement;
                const bgColor = index === 0 ? exportSettings.nameColumnColor : exportSettings.dayHeaderBgColor;
                c.style.backgroundColor = bgColor;
                c.style.color = getContrastingTextColor(bgColor);
                c.style.fontSize = `${exportSettings.fontSizeHeader}px`;
            });
            
            tableClone.querySelectorAll('thead tr').forEach(row => {
                const firstCellText = row.querySelector('td, th')?.textContent;
                if (firstCellText === 'Nyitás' || firstCellText === 'Zárás') {
                    row.querySelectorAll('td, th').forEach(cell => {
                        const bgColor = exportSettings.dayHeaderBgColor;
                        (cell as HTMLElement).style.backgroundColor = bgColor;
                        (cell as HTMLElement).style.color = getContrastingTextColor(bgColor);
                    });
                }
            });

            const nameHeader = tableClone.querySelector('thead tr:first-child th:first-child');
            if (nameHeader) { (nameHeader as HTMLElement).style.width = '200px'; }
        
            let userRowIdx = 0;
            tableClone.querySelectorAll('tbody tr').forEach(row => {
                const isCategoryRow = row.querySelector('td[colSpan]');
                if (isCategoryRow) {
                    const c = isCategoryRow as HTMLElement;
                    const bgColor = exportSettings.categoryHeaderBgColor;
                    c.style.backgroundColor = bgColor;
                    c.style.color = getContrastingTextColor(bgColor);
                    c.style.fontSize = `${exportSettings.fontSizeHeader + 2}px`;
                    c.style.padding = '12px 8px';
                    userRowIdx = 0;
                } else {
                    userRowIdx++;
                    const isEven = userRowIdx % 2 === 0;
                    
                    const rowZebraColor = isEven ? adjustColor(exportSettings.zebraColor, -(exportSettings.zebraStrength / 2)) : exportSettings.zebraColor;
                    const nameZebraColor = isEven ? adjustColor(exportSettings.nameColumnColor, -(exportSettings.zebraStrength / 2)) : exportSettings.nameColumnColor;

                    row.querySelectorAll('td').forEach((td, colIndex) => {
                        td.style.fontSize = `${exportSettings.fontSizeCell}px`;
                        let bgColor;
                        if (colIndex === 0) {
                            bgColor = nameZebraColor;
                        } else {
                            bgColor = rowZebraColor;
                        }
                        td.style.backgroundColor = bgColor;
                        td.style.color = getContrastingTextColor(bgColor);
                    });
                }
            });
        
            html2canvas(exportContainer, {
                useCORS: true,
                scale: 2,
                backgroundColor: '#ffffff',
            }).then(canvas => {
                const link = document.createElement('a');
                const weekStart = weekDays[0].toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\.\s/g, '-').replace('.', '');
                link.download = `beosztas_${weekStart}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                resolve();
            }).catch(err => {
                console.error('PNG export failed:', err);
                alert('Hiba történt a PNG exportálás során.');
                reject(err);
            }).finally(() => {
                document.body.removeChild(exportContainer);
                setIsPngExporting(false);
            });
        });
    };
    
    const handleMoveUser = (userIdToMove: string, direction: 'up' | 'down') => {
        const currentIndex = orderedUsers.findIndex(u => u.id === userIdToMove);
        if (currentIndex === -1) return;
    
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= orderedUsers.length) return;
    
        const currentUser = orderedUsers[currentIndex];
        const targetUser = orderedUsers[targetIndex];
    
        if (targetUser && (currentUser.position || 'Nincs pozíció') === (targetUser.position || 'Nincs pozíció')) {
            const newOrderedUsers = [...orderedUsers];
            [newOrderedUsers[currentIndex], newOrderedUsers[targetIndex]] = [newOrderedUsers[targetIndex], newOrderedUsers[currentIndex]];
            setOrderedUsers(newOrderedUsers);
            saveDisplaySettings(newOrderedUsers.map(u => u.id), Array.from(hiddenUserIds));
        }
    };

    const handleMoveGroup = (positionToMove: string, direction: 'up' | 'down') => {
        const allUsersByPos = orderedUsers.reduce((acc, user) => {
            const pos = user.position || 'Nincs pozíció';
            if (!acc[pos]) acc[pos] = [];
            acc[pos].push(user);
            return acc;
        }, {} as Record<string, User[]>);
    
        const stablePositionOrder = [...new Set(orderedUsers.map(u => u.position || 'Nincs pozíció'))];
        
        const currentIndex = stablePositionOrder.indexOf(positionToMove);
        if (currentIndex === -1) return;
    
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= stablePositionOrder.length) return;
    
        [stablePositionOrder[currentIndex], stablePositionOrder[targetIndex]] = [stablePositionOrder[targetIndex], stablePositionOrder[currentIndex]];
    
        const newOrderedUsers = stablePositionOrder.flatMap(pos => allUsersByPos[pos] || []);
        setOrderedUsers(newOrderedUsers);
        saveDisplaySettings(newOrderedUsers.map(u => u.id), Array.from(hiddenUserIds));
    };
    
    const handleHideUser = (userId: string) => {
        const newHidden = new Set(hiddenUserIds).add(userId);
        setHiddenUserIds(newHidden);
        saveDisplaySettings(orderedUsers.map(u => u.id), Array.from(newHidden));
    };

    const handleShowUser = (userId: string) => {
        const newHidden = new Set(hiddenUserIds);
        newHidden.delete(userId);
        setHiddenUserIds(newHidden);
        saveDisplaySettings(orderedUsers.map(u => u.id), Array.from(newHidden));
    };

    if (isDataLoading) return <div className="relative h-64"><LoadingSpinner /></div>;
    
    let userRowIndex = 0;

    return (
        <div className="p-4 md:p-8">
            <style>{`.toggle-checkbox:checked { right: 0; border-color: #16a34a; } .toggle-checkbox:checked + .toggle-label { background-color: #16a34a; }`}</style>
            
            <ShiftModal 
                isOpen={isShiftModalOpen}
                onClose={() => setIsShiftModalOpen(false)}
                onSave={handleSaveShift}
                onDelete={handleDeleteShift}
                shift={editingShift?.shift || null}
                userId={editingShift?.userId || ''}
                date={editingShift?.date || new Date()}
                users={filteredUsers}
                viewMode={viewMode}
            />

            {isPublishModalOpen && (
                <PublishWeekModal
                    units={unitsWithDrafts}
                    onClose={() => setIsPublishModalOpen(false)}
                    onConfirm={handleConfirmPublish}
                />
            )}
            
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={handlePrevWeek} className="p-2 rounded-full hover:bg-gray-200">&lt;</button>
                    <h2 className="text-xl font-bold text-center">{weekDays[0].toLocaleDateString('hu-HU', { month: 'long', day: 'numeric' })} - {weekDays[6].toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })}</h2>
                    <button onClick={handleNextWeek} className="p-2 rounded-full hover:bg-gray-200">&gt;</button>
                </div>
                <div className="flex items-center gap-3">
                    {hiddenUsers.length > 0 && (
                        <div className="relative">
                            <button onClick={() => setIsHiddenMenuOpen(p => !p)} className="p-2 rounded-full hover:bg-gray-200 flex items-center gap-2 text-sm font-semibold text-gray-700" title="Elrejtett munkatársak">
                                <EyeIcon className="h-6 w-6" />
                                <span>({hiddenUsers.length})</span>
                            </button>
                            {isHiddenMenuOpen && (
                                <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border z-20 p-2">
                                    <p className="text-sm font-bold p-2">Elrejtett munkatársak</p>
                                    <div className="max-h-60 overflow-y-auto">
                                    {hiddenUsers.map(user => (
                                        <div key={user.id} className="flex items-center justify-between p-2 hover:bg-gray-100 rounded">
                                            <span className="text-sm text-gray-800">{user.fullName}</span>
                                            <button onClick={() => handleShowUser(user.id)} className="text-xs font-semibold text-blue-600 hover:underline">Visszaállítás</button>
                                        </div>
                                    ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {canManage && <button onClick={()=>setShowSettings(!showSettings)} className="p-2 rounded-full hover:bg-gray-200" title="Heti beállítások"><SettingsIcon className="h-6 w-6" /></button>}
                    {canManage && (<div className="flex items-center bg-gray-200 rounded-full p-1"><button onClick={() => setViewMode('draft')} className={`px-4 py-1 rounded-full text-sm font-semibold ${viewMode === 'draft' ? 'bg-white shadow' : ''}`}>Piszkozat</button><button onClick={() => setViewMode('published')} className={`px-4 py-1 rounded-full text-sm font-semibold ${viewMode === 'published' ? 'bg-white shadow' : ''}`}>Publikált</button></div>)}
                    <button onClick={() => setExportConfirmation({ type: 'PNG' })} disabled={isPngExporting} className="p-2 rounded-full hover:bg-gray-200" title="Exportálás PNG-be">
                        {isPngExporting ? <svg className="animate-spin h-6 w-6 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <ImageIcon className="h-6 w-6" />}
                    </button>
                    <button onClick={() => setExportConfirmation({ type: 'Excel' })} className="p-2 rounded-full hover:bg-gray-200" title="Exportálás Excelbe"><DownloadIcon className="h-6 w-6" /></button>
                </div>
            </div>

            {canManage && showSettings && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-40 p-4" onClick={() => setShowSettings(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b">
                            <div className="flex border-b">
                                <button onClick={() => setActiveSettingsTab('opening')} className={`px-4 py-2 font-semibold ${activeSettingsTab === 'opening' ? 'border-b-2 border-green-600 text-green-600' : 'text-gray-500'}`}>Nyitvatartás</button>
                                <button onClick={() => setActiveSettingsTab('export')} className={`px-4 py-2 font-semibold ${activeSettingsTab === 'export' ? 'border-b-2 border-green-600 text-green-600' : 'text-gray-500'}`} disabled={activeUnitIds.length !== 1}>Export (PNG) Stílus</button>
                            </div>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            {activeSettingsTab === 'opening' && weekSettings && (
                                <>
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <label className="flex items-center gap-2"><input type="checkbox" checked={weekSettings.showOpeningTime} onChange={e => handleSettingsChange({...weekSettings, showOpeningTime: e.target.checked})} className="h-4 w-4 rounded" /> Nyitás megjelenítése</label>
                                        <label className="flex items-center gap-2"><input type="checkbox" checked={weekSettings.showClosingTime} onChange={e => handleSettingsChange({...weekSettings, showClosingTime: e.target.checked})} className="h-4 w-4 rounded" /> Zárás megjelenítése</label>
                                    </div>
                                    {Array.from({length: 7}).map((_, i) => (
                                        <div key={i} className="flex items-center gap-2 p-2 rounded hover:bg-gray-100">
                                            <span className="font-semibold w-24">{weekDays[i].toLocaleDateString('hu-HU', {weekday: 'long'})}</span>
                                            <input type="time" value={weekSettings.dailySettings[i]?.openingTime || ''} onChange={e => handleSettingsChange({...weekSettings, dailySettings: {...weekSettings.dailySettings, [i]: {...weekSettings.dailySettings[i], openingTime: e.target.value}}})} className="p-1 border rounded" />
                                            <input type="time" value={weekSettings.dailySettings[i]?.closingTime || ''} onChange={e => handleSettingsChange({...weekSettings, dailySettings: {...weekSettings.dailySettings, [i]: {...weekSettings.dailySettings[i], closingTime: e.target.value}}})} className="p-1 border rounded" />
                                        </div>
                                    ))}
                                </>
                            )}
                             {activeSettingsTab === 'export' && (
                                <ExportSettingsPanel settings={exportSettings} setSettings={setExportSettings} />
                            )}
                        </div>
                         <div className="p-4 bg-gray-50 flex justify-between items-center rounded-b-2xl">
                             <button onClick={() => setExportSettings(DEFAULT_EXPORT_SETTINGS)} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold">Alaphelyzet</button>
                             <div>
                                <button onClick={() => setShowSettings(false)} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold mr-2">Bezár</button>
                                {activeSettingsTab === 'export' && (
                                    <button onClick={handleSaveExportSettings} disabled={!exportSettingsHaveChanged || isSavingExportSettings} className="bg-green-700 text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-400">
                                        {isSavingExportSettings ? "Mentés..." : "Mentés"}
                                    </button>
                                )}
                             </div>
                        </div>
                    </div>
                </div>
            )}
            
            {canManage && viewMode === 'draft' && <div className="mb-4 text-center"><button onClick={handlePublishWeek} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700">Hét publikálása</button></div>}

            {exportConfirmation && (
                <ExportConfirmationModal
                    type={exportConfirmation.type}
                    onClose={() => setExportConfirmation(null)}
                    onConfirm={async () => {
                        if (exportConfirmation.type === 'PNG') {
                            await handlePngExport();
                        } else {
                            await generateExcelExport({
                                users: orderedUsers.filter(u => !hiddenUserIds.has(u.id)),
                                weekDays,
                                shiftsByUserDay,
                                requestsByUserDay,
                                toDateString,
                                units: allUnits,
                                currentUser,
                                weekSettings,
                                exportSettings
                            });
                        }
                        setExportConfirmation(null);
                        setSuccessToast('✔ Export sikeres');
                        setTimeout(() => setSuccessToast(''), 3000);
                    }}
                    exportSettings={exportSettings}
                    unitName={allUnits.find(u => u.id === activeUnitIds[0])?.name || 'Globális'}
                />
            )}
            {successToast && (
                <div className="fixed bottom-5 right-5 bg-green-600 text-white py-2 px-4 rounded-lg shadow-lg z-50 transition-opacity duration-300">
                    {successToast}
                </div>
            )}
            
            <div className="overflow-x-auto bg-white rounded-2xl shadow-lg border border-gray-400">
                <table ref={tableRef} className="w-full min-w-[1080px] border-collapse">
                    <thead className="bg-slate-300">
                        <tr>
                             {canManage && (
                                <th className={`p-1 sticky left-0 z-20 bg-slate-300 border-r border-gray-400 export-hide transition-all duration-300 ${isEditMode ? 'w-16' : 'w-8'}`}>
                                    <button 
                                        onClick={() => setIsEditMode(prev => !prev)}
                                        className={`p-1.5 rounded-full w-full flex justify-center ${isEditMode ? 'bg-blue-200 text-blue-800' : 'hover:bg-slate-400'}`}
                                        title={isEditMode ? "Szerkesztés befejezése" : "Sorrend szerkesztése"}
                                    >
                                        <PencilIcon className="h-5 w-5" />
                                    </button>
                                </th>
                            )}
                            <th className={`p-3 font-semibold text-center sticky ${canManage ? (isEditMode ? 'left-16' : 'left-8') : 'left-0'} bg-slate-300 z-10 w-52 transition-all duration-300`}>Munkatárs</th>
                            {weekDays.map(day => (<th key={day.toISOString()} className="p-3 font-semibold text-center border-l border-gray-400 bg-slate-300 min-w-[90px]">{day.toLocaleDateString('hu-HU', { weekday: 'short' })}<br /><span className="font-normal text-sm">{day.toLocaleDateString('hu-HU', { month: '2-digit', day: '2-digit' })}</span></th>))}
                            <th className="p-3 font-semibold text-center border-l border-gray-400 w-24 export-hide">Órák</th>
                        </tr>
                        {canManage && weekSettings?.showOpeningTime && (
                           <tr style={{ backgroundColor: exportSettings.dayHeaderBgColor, color: getContrastingTextColor(exportSettings.dayHeaderBgColor) }}>
                               <td style={{ backgroundColor: exportSettings.dayHeaderBgColor }} className={`p-2 sticky left-0 z-20 border-r border-gray-400 export-hide transition-all duration-300 ${isEditMode ? 'w-16' : 'w-8'}`}></td>
                               <td style={{ backgroundColor: exportSettings.dayHeaderBgColor }} className={`p-2 font-bold sticky ${isEditMode ? 'left-16' : 'left-8'} z-10 transition-all duration-300`}>Nyitás</td>
                               {Array.from({length: 7}).map((_, i)=>(<td key={i} className="p-2 border-l border-gray-400 text-center font-semibold">{weekSettings.dailySettings[i]?.openingTime}</td>))}
                               <td className="border-l border-gray-400 export-hide"></td>
                           </tr>
                        )}
                        {canManage && weekSettings?.showClosingTime && (
                           <tr style={{ backgroundColor: exportSettings.dayHeaderBgColor, color: getContrastingTextColor(exportSettings.dayHeaderBgColor) }}>
                                <td style={{ backgroundColor: exportSettings.dayHeaderBgColor }} className={`p-2 sticky left-0 z-20 border-r border-gray-400 export-hide transition-all duration-300 ${isEditMode ? 'w-16' : 'w-8'}`}></td>
                               <td style={{ backgroundColor: exportSettings.dayHeaderBgColor }} className={`p-2 font-bold sticky ${isEditMode ? 'left-16' : 'left-8'} z-10 transition-all duration-300`}>Zárás</td>
                               {Array.from({length: 7}).map((_, i)=>(<td key={i} className="p-2 border-l border-gray-400 text-center font-semibold">{weekSettings.dailySettings[i]?.closingTime}</td>))}
                               <td className="border-l border-gray-400 export-hide"></td>
                           </tr>
                        )}
                    </thead>
                    <tbody>
                        {visiblePositionOrder.map((position, groupIndex) => {
                            const isFirstGroup = groupIndex === 0;
                            const isLastGroup = groupIndex === visiblePositionOrder.length - 1;

                            return (
                                <React.Fragment key={position || 'no-position'}>
                                    <tr className="bg-slate-300">
                                        {canManage && (
                                            <td className={`p-1 text-center sticky left-0 z-20 bg-slate-300 border-r border-gray-400 export-hide transition-all duration-300 ${isEditMode ? 'w-16' : 'w-8'}`}>
                                                {isEditMode && (
                                                    <div className="flex justify-center items-center gap-0.5">
                                                        <button onClick={() => handleMoveGroup(position, 'up')} disabled={isFirstGroup} className="p-1 rounded-full hover:bg-gray-400 disabled:opacity-20 disabled:cursor-not-allowed" title="Csoport fel"><ArrowUpIcon className="h-5 w-5"/></button>
                                                        <button onClick={() => handleMoveGroup(position, 'down')} disabled={isLastGroup} className="p-1 rounded-full hover:bg-gray-400 disabled:opacity-20 disabled:cursor-not-allowed" title="Csoport le"><ArrowDownIcon className="h-5 w-5"/></button>
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                        <td colSpan={canManage ? 8 : 8} className={`p-3 font-bold text-lg text-gray-800 sticky ${canManage ? (isEditMode ? 'left-16' : 'left-8') : 'left-0'} z-10 bg-slate-300 text-center align-middle transition-all duration-300`}>
                                            {position}
                                        </td>
                                        <td className="export-hide"></td>
                                    </tr>

                                    {visibleUsersByPosition[position].map(user => {
                                        userRowIndex++;
                                        const isEven = userRowIndex % 2 === 0;
                                        const userRequests = requestsByUserDay.get(user.id);

                                        const usersInGroup = visibleUsersByPosition[position];
                                        const userIndexInGroup = usersInGroup.findIndex(u => u.id === user.id);
                                        const isFirstInGroup = userIndexInGroup === 0;
                                        const isLastInGroup = userIndexInGroup === usersInGroup.length - 1;
                                        
                                        return (
                                            <tr key={user.id} className={`group border-t border-gray-400 hover:bg-slate-200`}>
                                                {canManage && (
                                                    <td className={`p-1 text-center sticky left-0 z-10 ${isEven ? 'bg-slate-300' : 'bg-slate-200'} group-hover:bg-slate-200 border-r border-gray-400 export-hide transition-all duration-300 ${isEditMode ? 'w-16' : 'w-8'}`}>
                                                        {isEditMode && (
                                                            <div className="flex justify-center items-center gap-0.5">
                                                                <button onClick={() => handleMoveUser(user.id, 'up')} disabled={isFirstInGroup} className="p-1 rounded-full hover:bg-gray-300 disabled:opacity-20 disabled:cursor-not-allowed" title="Fel"><ArrowUpIcon className="h-4 w-4"/></button>
                                                                <button onClick={() => handleMoveUser(user.id, 'down')} disabled={isLastInGroup} className="p-1 rounded-full hover:bg-gray-300 disabled:opacity-20 disabled:cursor-not-allowed" title="Le"><ArrowDownIcon className="h-4 w-4"/></button>
                                                                <div className="w-px h-4 bg-gray-300 mx-1"></div>
                                                                <button onClick={() => handleHideUser(user.id)} className="p-1 rounded-full hover:bg-gray-300" title="Elrejtés"><EyeSlashIcon className="h-5 w-5"/></button>
                                                            </div>
                                                        )}
                                                    </td>
                                                )}
                                                <td className={`p-2 font-bold text-gray-800 sticky ${canManage ? (isEditMode ? 'left-16' : 'left-8') : 'left-0'} z-10 border-r border-gray-400 ${isEven ? 'bg-slate-300' : 'bg-slate-200'} group-hover:bg-slate-200 text-center align-middle transition-all duration-300`}>
                                                    {user.fullName}
                                                </td>
                                                {weekDays.map((day) => {
                                                    const dayKey = toDateString(day);
                                                    const isOnLeave = userRequests?.has(dayKey);
                                                    const dayShifts = shiftsByUserDay.get(user.id)?.get(dayKey) || [];
                                                    
                                                    return (
                                                        <td key={dayKey} className={`p-1 border-l border-gray-400 text-center align-middle ${isOnLeave ? 'bg-red-50' : (isEven ? 'bg-slate-100' : 'bg-white')}`}>
                                                            {isOnLeave ? (
                                                                <div className="font-bold text-red-600 p-2">SZ</div>
                                                            ) : (
                                                                <div className="space-y-1">
                                                                    {dayShifts.map(shift => (
                                                                        <div key={shift.id} onClick={() => canManage && handleOpenShiftModal(shift, user.id, day)} className={`p-2 rounded-lg text-center ${canManage ? 'cursor-pointer hover:bg-gray-200' : ''}`}>
                                                                            {shift.isDayOff ? (
                                                                                <p className="font-bold text-lg">X</p>
                                                                            ) : (
                                                                                <>
                                                                                    <p className="font-bold text-lg">
                                                                                        {shift.start.toDate().toTimeString().substring(0,5)}
                                                                                        {shift.end ? ` - ${shift.end.toDate().toTimeString().substring(0,5)}` : ''}
                                                                                    </p>
                                                                                    {shift.note && <p className="text-xs text-gray-600 truncate">{shift.note}</p>}
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                    {canManage && (
                                                                        <button onClick={() => handleOpenShiftModal(null, user.id, day)} className="w-full flex items-center justify-center p-1.5 rounded-md text-gray-400 hover:bg-green-100 hover:text-green-700 export-hide">
                                                                            <PlusIcon className="h-5 w-5" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td className="p-2 border-l border-gray-400 text-center font-bold text-gray-800 align-middle export-hide">
                                                    {workHours.userTotals[user.id] > 0 ? workHours.userTotals[user.id].toFixed(1) : '-'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </React.Fragment>
                            )
                        })}
                    </tbody>
                    <tfoot className="bg-slate-300 font-bold export-hide">
                        <tr className="border-t-2 border-gray-500">
                            <td colSpan={canManage ? 2 : 1} className={`sticky left-0 bg-slate-300 z-10 border-r border-gray-400 text-center align-middle transition-all duration-300`}>Összesen</td>
                            {workHours.dayTotals.map((total, i) => (
                                <td key={i} className="p-3 border-l border-gray-400 text-center">{total > 0 ? total.toFixed(1) : '-'}</td>
                            ))}
                            <td className="p-3 border-l border-gray-400 text-center">{workHours.grandTotal > 0 ? workHours.grandTotal.toFixed(1) : '-'}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};