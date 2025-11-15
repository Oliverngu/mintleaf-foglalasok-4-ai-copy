import React, { useState, useEffect, useMemo, FC } from 'react';
import { ReservationSetting, ThemeSettings, GuestFormSettings, CustomSelectField } from '../../../core/models/data';
import { db } from '../../../core/firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import ArrowUpIcon from '../../../../components/icons/ArrowUpIcon';
import ArrowDownIcon from '../../../../components/icons/ArrowDownIcon';
import TrashIcon from '../../../../components/icons/TrashIcon';
import PencilIcon from '../../../../components/icons/PencilIcon';
import ColorPicker from '../common/ColorPicker';

interface ReservationSettingsModalProps {
    unitId: string;
    onClose: () => void;
}

const DEFAULT_THEME: ThemeSettings = {
    primary: '#16a34a', surface: '#ffffff', background: '#f9fafb', textPrimary: '#1f2937', 
    textSecondary: '#4b5563', accent: '#10b981', success: '#22c55e', danger: '#ef4444',
    radius: 'lg', elevation: 'mid', typographyScale: 'M'
};

const DEFAULT_GUEST_FORM: GuestFormSettings = {
    customSelects: [
        { id: 'occasion', label: 'Alkalom', options: ['Brunch', 'Ebéd', 'Vacsora', 'Születésnap', 'Italozás', 'Egyéb'] },
        { id: 'heardFrom', label: 'Hol hallottál rólunk?', options: ['Google', 'Facebook / Instagram', 'Ismerős ajánlása', 'Sétáltam az utcán', 'Egyéb'] }
    ]
};

type SettingsTab = 'általános' | 'űrlap' | 'téma';

// --- COLOR UTILITIES ---
function hexToRgb(hex: string): {r: number, g: number, b: number} | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}
function getLuminance(r: number, g: number, b: number): number {
    const a = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}
function getContrastRatio(color1: string, color2: string): number {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    if (!rgb1 || !rgb2) return 1;
    const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
    const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
    return (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05);
}

const getContrastingTextColors = (hex: string): { primary: string; secondary: string } => {
    const rgb = hexToRgb(hex);
    if (!rgb) return { primary: '#1f2937', secondary: '#6b7280' }; // Default dark text

    // Using YIQ formula to determine brightness
    const yiq = ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
    
    if (yiq >= 128) {
        // Background is light, use dark text
        return { primary: '#1f2937', secondary: '#6b7280' };
    } else {
        // Background is dark, use light text
        return { primary: '#ffffff', secondary: '#d1d5db' };
    }
};


const ReservationSettingsModal: FC<ReservationSettingsModalProps> = ({ unitId, onClose }) => {
    const [settings, setSettings] = useState<ReservationSetting | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<SettingsTab>('általános');
    
    useEffect(() => {
        const fetchSettings = async () => {
            setLoading(true);
            const docRef = doc(db, 'reservation_settings', unitId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data() as any; // Use any for migration
                 let guestForm: GuestFormSettings = { ...DEFAULT_GUEST_FORM, ...(data.guestForm || {}) };

                // Migration logic from old string arrays to new customSelects structure
                if (!guestForm.customSelects) {
                    guestForm.customSelects = [];
                    if (data.guestForm?.occasionOptions?.length > 0) {
                        guestForm.customSelects.push({ id: 'occasion', label: 'Alkalom', options: data.guestForm.occasionOptions });
                    }
                    if (data.guestForm?.heardFromOptions?.length > 0) {
                        guestForm.customSelects.push({ id: 'heardFrom', label: 'Hol hallottál rólunk?', options: data.guestForm.heardFromOptions });
                    }
                }

                setSettings({
                    id: unitId,
                    blackoutDates: data.blackoutDates || [],
                    dailyCapacity: data.dailyCapacity ?? null,
                    bookableWindow: data.bookableWindow || { from: '11:00', to: '23:00' },
                    kitchenStartTime: data.kitchenStartTime ?? data.kitchenOpen ?? null,
                    kitchenEndTime: data.kitchenEndTime ?? null,
                    barStartTime: data.barStartTime ?? null,
                    barEndTime: data.barEndTime ?? data.barClose ?? null,
                    guestForm,
                    theme: { ...DEFAULT_THEME, ...data.theme },
                    reservationMode: data.reservationMode || 'request',
                    notificationEmails: data.notificationEmails || [],
                });
            } else {
                setSettings({
                    id: unitId,
                    blackoutDates: [],
                    dailyCapacity: null,
                    bookableWindow: { from: '11:00', to: '23:00' },
                    kitchenStartTime: null,
                    kitchenEndTime: null,
                    barStartTime: null,
                    barEndTime: null,
                    guestForm: DEFAULT_GUEST_FORM,
                    theme: DEFAULT_THEME,
                    reservationMode: 'request',
                    notificationEmails: [],
                });
            }
            setLoading(false);
        };
        fetchSettings();
    }, [unitId]);

    const handleSave = async () => {
        if (!settings) return;
        setIsSaving(true);
        try {
            const { occasionOptions, heardFromOptions, ...cleanGuestForm } = settings.guestForm as any;
            const settingsToSave = {
                ...settings,
                guestForm: cleanGuestForm
            };
            
            await setDoc(doc(db, 'reservation_settings', unitId), settingsToSave, { merge: true });

            alert('Beállítások mentve!');
            onClose();
        } catch (error) {
            console.error("Error saving settings:", error);
            alert('Hiba a mentés során.');
        } finally {
            setIsSaving(false);
        }
    };

    const renderContent = () => {
        if (loading || !settings) return <div className="h-full relative"><LoadingSpinner /></div>;
        switch (activeTab) {
            case 'általános': return <GeneralSettingsTab settings={settings} setSettings={setSettings} />;
            case 'űrlap': return <FormOptionsTab settings={settings} setSettings={setSettings} />;
            case 'téma': return <ThemeStyleTab settings={settings} setSettings={setSettings} />;
            default: return null;
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">Foglalási beállítások</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 text-gray-500">&times;</button>
                </div>
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex gap-4 px-6">
                        <button onClick={() => setActiveTab('általános')} className={`py-3 px-1 border-b-2 font-semibold ${activeTab === 'általános' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Általános</button>
                        <button onClick={() => setActiveTab('űrlap')} className={`py-3 px-1 border-b-2 font-semibold ${activeTab === 'űrlap' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Űrlap opciók</button>
                        <button onClick={() => setActiveTab('téma')} className={`py-3 px-1 border-b-2 font-semibold ${activeTab === 'téma' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Téma és stílus</button>
                    </nav>
                </div>
                <div className="flex-1 p-6 overflow-y-auto bg-gray-50">{renderContent()}</div>
                <div className="p-4 bg-white border-t flex justify-end gap-3 rounded-b-2xl">
                    <button type="button" onClick={onClose} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold">Mégse</button>
                    <button type="button" onClick={handleSave} disabled={isSaving} className="bg-green-700 text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-400">{isSaving ? 'Mentés...' : 'Mentés'}</button>
                </div>
            </div>
        </div>
    );
};

const GeneralSettingsTab: FC<{ settings: ReservationSetting, setSettings: React.Dispatch<React.SetStateAction<ReservationSetting | null>> }> = ({ settings, setSettings }) => {
    const [newBlackoutDate, setNewBlackoutDate] = useState('');

    const handleFieldChange = (field: keyof ReservationSetting, value: any) => {
        setSettings(prev => prev ? ({ ...prev, [field]: value }) : null);
    };

    const handleTimeWindowChange = (part: 'from' | 'to', value: string) => {
        setSettings(prev => prev ? ({...prev, bookableWindow: { ...prev.bookableWindow!, [part]: value }}) : null);
    };

    const addBlackoutDate = () => {
        if(newBlackoutDate && !settings.blackoutDates.includes(newBlackoutDate)){
            const updatedDates = [...settings.blackoutDates, newBlackoutDate].sort();
            handleFieldChange('blackoutDates', updatedDates);
            setNewBlackoutDate('');
        }
    };
    
    const removeBlackoutDate = (date: string) => {
        handleFieldChange('blackoutDates', settings.blackoutDates.filter(d => d !== date));
    };

    return (
        <div className="space-y-6">
            <div className="p-4 bg-white border rounded-lg">
                <h3 className="font-bold mb-2">Foglalás módja</h3>
                <p className="text-sm text-gray-500 mb-3">Válaszd ki, hogy a vendégfoglalások automatikusan megerősítésre kerüljenek, vagy manuális jóváhagyást igényeljenek.</p>
                <div className="space-y-2">
                    <label className="flex items-center p-3 border rounded-lg has-[:checked]:bg-blue-50 has-[:checked]:border-blue-400 cursor-pointer">
                        <input 
                            type="radio" 
                            name="reservationMode" 
                            value="request" 
                            checked={settings.reservationMode === 'request' || !settings.reservationMode}
                            onChange={() => handleFieldChange('reservationMode', 'request')}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-3">
                            <span className="font-semibold">Foglalási kérelem</span>
                            <span className="block text-sm text-gray-500">Jóváhagyás szükséges</span>
                        </span>
                    </label>
                    <label className="flex items-center p-3 border rounded-lg has-[:checked]:bg-green-50 has-[:checked]:border-green-400 cursor-pointer">
                        <input 
                            type="radio" 
                            name="reservationMode" 
                            value="auto" 
                            checked={settings.reservationMode === 'auto'}
                            onChange={() => handleFieldChange('reservationMode', 'auto')}
                            className="h-4 w-4 text-green-600 focus:ring-green-500"
                        />
                        <span className="ml-3">
                            <span className="font-semibold">Automatikus megerősítés</span>
                             <span className="block text-sm text-gray-500">Azonnali elfogadás</span>
                        </span>
                    </label>
                </div>
            </div>
            <div className="p-4 bg-white border rounded-lg">
                <h3 className="font-bold mb-2">Foglalható időablak</h3>
                 <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm">Kezdés</label><input type="time" value={settings.bookableWindow?.from} onChange={e => handleTimeWindowChange('from', e.target.value)} className="w-full p-2 border rounded-md" step="300" /></div>
                    <div><label className="text-sm">Vége</label><input type="time" value={settings.bookableWindow?.to} onChange={e => handleTimeWindowChange('to', e.target.value)} className="w-full p-2 border rounded-md" step="300" /></div>
                </div>
            </div>
             <div className="p-4 bg-white border rounded-lg">
                <h3 className="font-bold mb-2">Konyha nyitvatartás</h3>
                 <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm">Nyitás</label><input type="time" value={settings.kitchenStartTime || ''} onChange={e => handleFieldChange('kitchenStartTime', e.target.value || null)} className="w-full p-2 border rounded-md"/></div>
                    <div><label className="text-sm">Zárás</label><input type="time" value={settings.kitchenEndTime || ''} onChange={e => handleFieldChange('kitchenEndTime', e.target.value || null)} className="w-full p-2 border rounded-md"/></div>
                </div>
            </div>
            <div className="p-4 bg-white border rounded-lg">
                <h3 className="font-bold mb-2">Bár nyitvatartás</h3>
                 <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm">Nyitás</label><input type="time" value={settings.barStartTime || ''} onChange={e => handleFieldChange('barStartTime', e.target.value || null)} className="w-full p-2 border rounded-md"/></div>
                    <div><label className="text-sm">Zárás</label><input type="time" value={settings.barEndTime || ''} onChange={e => handleFieldChange('barEndTime', e.target.value || null)} className="w-full p-2 border rounded-md"/></div>
                </div>
            </div>
            <div className="p-4 bg-white border rounded-lg">
                <label className="font-bold mb-2 block">Napi létszám limit</label>
                <input type="number" placeholder="Nincs limit" value={settings.dailyCapacity || ''} onChange={e => handleFieldChange('dailyCapacity', e.target.value ? Number(e.target.value) : null)} className="w-full p-2 border rounded-md"/>
            </div>
            <div className="p-4 bg-white border rounded-lg">
                <h3 className="font-bold mb-2">Blackout napok</h3>
                <div className="flex gap-2 mb-3">
                    <input type="date" value={newBlackoutDate} onChange={e => setNewBlackoutDate(e.target.value)} className="w-full p-2 border rounded-md"/>
                    <button onClick={addBlackoutDate} className="bg-blue-600 text-white px-3 rounded font-semibold shrink-0">Hozzáad</button>
                </div>
                 <div className="space-y-1 max-h-40 overflow-y-auto">
                    {settings.blackoutDates.map(date => (
                        <div key={date} className="flex justify-between items-center bg-gray-100 p-2 rounded">
                            <span>{date}</span>
                            <button onClick={() => removeBlackoutDate(date)} className="p-1 text-red-500"><TrashIcon className="h-4 w-4"/></button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const FormOptionsTab: FC<{ settings: ReservationSetting, setSettings: React.Dispatch<React.SetStateAction<ReservationSetting | null>> }> = ({ settings, setSettings }) => {
    const customSelects = settings.guestForm?.customSelects || [];

    const updateCustomSelects = (newSelects: CustomSelectField[]) => {
        setSettings(prev => prev ? { ...prev, guestForm: { ...prev.guestForm, customSelects: newSelects } } : null);
    };

    const handleUpdateField = (index: number, updatedField: CustomSelectField) => {
        const newSelects = [...customSelects];
        newSelects[index] = updatedField;
        updateCustomSelects(newSelects);
    };

    const handleDeleteField = (index: number) => {
        if (window.confirm('Biztosan törölni szeretnéd ezt az egész csoportot?')) {
            const newSelects = customSelects.filter((_, i) => i !== index);
            updateCustomSelects(newSelects);
        }
    };

    const handleAddField = () => {
        const newField: CustomSelectField = { id: Date.now().toString(), label: 'Új mező', options: ['Opció 1'] };
        updateCustomSelects([...customSelects, newField]);
    };

    return (
        <div className="space-y-6">
            {customSelects.map((field, index) => (
                <CustomFieldManager 
                    key={field.id}
                    field={field}
                    onUpdate={(updatedField) => handleUpdateField(index, updatedField)}
                    onDelete={() => handleDeleteField(index)}
                />
            ))}
            <button onClick={handleAddField} className="w-full p-3 border-2 border-dashed rounded-lg text-gray-600 font-semibold hover:bg-gray-100">
                + Új űrlap mező hozzáadása
            </button>
        </div>
    );
};

const CustomFieldManager: FC<{field: CustomSelectField, onUpdate: (field: CustomSelectField)=>void, onDelete: ()=>void}> = ({ field, onUpdate, onDelete }) => {
    return (
        <div className="bg-white p-4 rounded-lg border">
            <div className="flex justify-between items-center mb-3">
                <input 
                    value={field.label}
                    onChange={e => onUpdate({ ...field, label: e.target.value })}
                    className="font-bold text-lg p-1 -m-1 border-transparent hover:border-gray-300 focus:border-gray-400 rounded"
                />
                <button onClick={onDelete} className="p-2 text-red-500 hover:bg-red-50 rounded-full"><TrashIcon className="h-5 w-5"/></button>
            </div>
             <OptionManager 
                options={field.options}
                setOptions={(newOptions) => onUpdate({ ...field, options: newOptions })}
            />
        </div>
    );
};


const OptionManager: FC<{options: string[], setOptions: (opts: string[])=>void}> = ({ options, setOptions }) => {
    const [newOption, setNewOption] = useState('');
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editingText, setEditingText] = useState('');

    const startEditing = (index: number, text: string) => {
        setEditingIndex(index);
        setEditingText(text);
    };

    const saveEdit = (index: number) => {
        if (editingText.trim()) {
            const newOptions = [...options];
            newOptions[index] = editingText.trim();
            setOptions(newOptions);
        }
        setEditingIndex(null);
        setEditingText('');
    };

    const addOption = () => {
        if (newOption.trim() && !options.includes(newOption.trim())) {
            setOptions([...options, newOption.trim()]);
            setNewOption('');
        }
    };

    const removeOption = (index: number) => {
        setOptions(options.filter((_, i) => i !== index));
    };

    const moveOption = (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= options.length) return;
        const newOptions = [...options];
        [newOptions[index], newOptions[newIndex]] = [newOptions[newIndex], newOptions[index]];
        setOptions(newOptions);
    };

    return (
        <div>
            <div className="space-y-2 mb-4">
                {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 p-2 rounded border group">
                        {editingIndex === i ? (
                             <input 
                                value={editingText}
                                onChange={e => setEditingText(e.target.value)}
                                onBlur={() => saveEdit(i)}
                                onKeyDown={e => {if (e.key === 'Enter') {e.preventDefault(); saveEdit(i)}}}
                                className="flex-grow bg-white p-1 rounded border border-blue-500"
                                autoFocus
                            />
                        ) : (
                            <span className="flex-grow p-1">{opt}</span>
                        )}
                        <button onClick={() => startEditing(i, opt)} className="p-1 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100"><PencilIcon className="h-4 w-4"/></button>
                        <button onClick={() => moveOption(i, 'up')} disabled={i === 0} className="p-1 disabled:opacity-30 text-gray-400 hover:text-gray-800 opacity-0 group-hover:opacity-100"><ArrowUpIcon className="h-4 w-4" /></button>
                        <button onClick={() => moveOption(i, 'down')} disabled={i === options.length - 1} className="p-1 disabled:opacity-30 text-gray-400 hover:text-gray-800 opacity-0 group-hover:opacity-100"><ArrowDownIcon className="h-4 w-4" /></button>
                        <button onClick={() => removeOption(i)} className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100"><TrashIcon className="h-4 w-4" /></button>
                    </div>
                ))}
            </div>
            <div className="flex gap-2">
                <input value={newOption} onChange={e => setNewOption(e.target.value)} placeholder="Új opció..." className="w-full p-2 border rounded" onKeyDown={e => {if (e.key === 'Enter') {e.preventDefault(); addOption();}}} />
                <button onClick={addOption} className="bg-blue-600 text-white px-3 rounded font-semibold shrink-0">Hozzáad</button>
            </div>
        </div>
    );
};

const ThemeStyleTab: FC<{ settings: ReservationSetting, setSettings: React.Dispatch<React.SetStateAction<ReservationSetting | null>> }> = ({ settings, setSettings }) => {
    const theme = settings.theme!;

    const handleThemeChange = (key: keyof ThemeSettings, value: string) => {
        setSettings(prev => {
            if (!prev) return null;
            const newTheme = { ...prev.theme!, [key]: value };

            if (key === 'surface') {
                const { primary, secondary } = getContrastingTextColors(value);
                newTheme.textPrimary = primary;
                newTheme.textSecondary = secondary;
            }

            return { ...prev, theme: newTheme };
        });
    };

    const contrastWarning = useMemo(() => {
        const checkContrast = (bg: string, text: string) => {
            const ratio = getContrastRatio(bg, text);
            return ratio < 4.5; // WCAG AA
        };
        const warnings: string[] = [];
        if (checkContrast(theme.surface, theme.textPrimary)) warnings.push("Felület / Elsődleges szöveg");
        if (checkContrast(theme.background, theme.textPrimary)) warnings.push("Háttér / Szöveg (alacsony kontraszt a kártyákon kívül)");
        if (checkContrast(theme.primary, '#ffffff')) warnings.push("Gomb / Fehér szöveg");
        return warnings;
    }, [theme]);
    
    return (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="bg-white p-4 rounded-lg border space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <ColorInput label="Elsődleges szín (gombok)" color={theme.primary} onChange={v => handleThemeChange('primary', v)} />
                    <ColorInput label="Kiemelő szín" color={theme.accent} onChange={v => handleThemeChange('accent', v)} />
                </div>
                 <div className="grid grid-cols-2 gap-4">
                    <ColorInput label="Felület (kártyák)" color={theme.surface} onChange={v => handleThemeChange('surface', v)} />
                    <ColorInput label="Háttér" color={theme.background} onChange={v => handleThemeChange('background', v)} />
                </div>
                <div className="p-3 bg-gray-100 rounded-md">
                    <p className="text-sm font-medium text-gray-800">Szövegszínek (automatikus)</p>
                    <p className="text-xs text-gray-500">A szövegszínek a kártya háttérszínéhez ('Felület') igazodnak a jó olvashatóság érdekében.</p>
                    <div className="mt-2 flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: theme.textPrimary }}></div>
                            <span className="text-sm">Elsődleges</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: theme.textSecondary }}></div>
                            <span className="text-sm">Másodlagos</span>
                        </div>
                    </div>
                </div>

                {contrastWarning.length > 0 && <div className="text-sm text-amber-700 bg-amber-100 p-2 rounded">Figyelem: alacsony kontraszt a következőknél: {contrastWarning.join(', ')}</div>}
                 <hr/>
                <div>
                    <h4 className="font-bold mb-2">Stílus</h4>
                     <div className="grid grid-cols-3 gap-2">
                        {(['low', 'mid', 'high'] as const).map(el => <button key={el} onClick={() => handleThemeChange('elevation', el)} className={`p-2 rounded border ${theme.elevation === el ? 'border-green-600 bg-green-100' : ''}`}>{el}</button>)}
                    </div>
                </div>
                <div>
                     <h4 className="font-bold mb-2">Lekerekítés</h4>
                     <div className="grid grid-cols-3 gap-2">
                        {(['sm', 'md', 'lg'] as const).map(r => <button key={r} onClick={() => handleThemeChange('radius', r)} className={`p-2 rounded border ${theme.radius === r ? 'border-green-600 bg-green-100' : ''}`}>{r}</button>)}
                    </div>
                </div>
                 <div>
                     <h4 className="font-bold mb-2">Betűméret</h4>
                     <div className="grid grid-cols-3 gap-2">
                        {(['S', 'M', 'L'] as const).map(s => <button key={s} onClick={() => handleThemeChange('typographyScale', s)} className={`p-2 rounded border ${theme.typographyScale === s ? 'border-green-600 bg-green-100' : ''}`}>{s}</button>)}
                    </div>
                </div>
                 <button onClick={() => setSettings(prev => prev ? ({...prev, theme: DEFAULT_THEME}) : null)} className="text-sm text-gray-500 hover:underline">Alapértékek visszaállítása</button>
            </div>
            <div className="p-4 rounded-lg bg-white border">
                <ThemePreview theme={theme} />
            </div>
         </div>
    );
};

const ColorInput: FC<{label: string, color: string, onChange: (c: string) => void}> = ({ label, color, onChange }) => (
    <div>
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <ColorPicker value={color} onChange={onChange} />
    </div>
);

const ThemePreview: FC<{theme: ThemeSettings}> = ({ theme }) => {
     const radiusClass = { sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg' }[theme.radius];
     const shadowClass = { low: 'shadow-sm', mid: 'shadow-md', high: 'shadow-lg' }[theme.elevation];
     const fontBaseClass = { S: 'text-sm', M: 'text-base', L: 'text-lg' }[theme.typographyScale];

    return (
        <div className="h-full p-4 rounded" style={{ backgroundColor: theme.background, color: theme.textPrimary }}>
            <div className={`p-4 ${radiusClass} ${shadowClass}`} style={{ backgroundColor: theme.surface }}>
                <h3 className={`font-bold text-lg ${fontBaseClass}`} style={{ color: theme.textPrimary }}>Élő előnézet</h3>
                <p className={`mt-1 text-sm ${fontBaseClass}`} style={{ color: theme.textSecondary }}>Ez a kártya a beállításaidat tükrözi.</p>
                <div className="flex gap-2 mt-4">
                    <button className={`py-2 px-4 font-bold text-white ${radiusClass}`} style={{ backgroundColor: theme.primary }}>Elsődleges gomb</button>
                    <button className={`py-2 px-4 font-bold border ${radiusClass}`} style={{ color: theme.textPrimary, borderColor: theme.textSecondary }}>Másodlagos</button>
                </div>
            </div>
        </div>
    );
};

export default ReservationSettingsModal;