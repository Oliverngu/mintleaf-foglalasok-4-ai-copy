/**
 * A reusable color picker component with support for recently used and saved colors.
 * Palettes are persisted in localStorage.
 * - Recent colors key: 'mintleaf_recent_colors'
 * - Saved colors key: 'mintleaf_saved_colors'
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import TrashIcon from '../../../../components/icons/TrashIcon';
import PlusIcon from '../../../../components/icons/PlusIcon';

// --- Constants ---
const RECENT_COLORS_KEY = 'mintleaf_recent_colors';
const SAVED_COLORS_KEY = 'mintleaf_saved_colors';
const MAX_RECENT_COLORS = 12;
const MAX_SAVED_COLORS = 24;

// --- LocalStorage Helpers ---
const getStoredColors = (key: string): string[] => {
    try {
        const stored = localStorage.getItem(key);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.every(c => typeof c === 'string' && /^#([0-9A-F]{3}){1,2}$/i.test(c))) {
                return parsed;
            }
        }
    } catch (e) { console.error(`Failed to read colors from localStorage with key: ${key}`, e); }
    return [];
};

const addRecentColor = (color: string) => {
    if (!/^#([0-9A-F]{3}){1,2}$/i.test(color)) return;
    const recent = getStoredColors(RECENT_COLORS_KEY);
    const filtered = recent.filter(c => c.toLowerCase() !== color.toLowerCase());
    const newRecent = [color, ...filtered].slice(0, MAX_RECENT_COLORS);
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(newRecent));
};

// --- Color Conversion Helpers ---
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

interface ColorPickerPopupProps {
    color: string;
    onChange: (color: string) => void;
    onClose: () => void;
}

const ColorPickerPopup: React.FC<ColorPickerPopupProps> = ({ color, onChange, onClose }) => {
    const [hsv, setHsv] = useState(() => hexToHsv(color));
    const [hex, setHex] = useState(color);
    const [recentColors, setRecentColors] = useState<string[]>(() => getStoredColors(RECENT_COLORS_KEY));
    const [savedColors, setSavedColors] = useState<string[]>(() => getStoredColors(SAVED_COLORS_KEY));

    useEffect(() => {
        setHsv(hexToHsv(color));
        setHex(color);
    }, [color]);

    const handleSliderChange = (part: 'h' | 's' | 'v', value: number) => {
        const newHsv = { ...hsv, [part]: value };
        setHsv(newHsv);
        const newHex = hsvToHex(newHsv.h, newHsv.s, newHsv.v);
        setHex(newHex);
        onChange(newHex);
    };

    const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let newHex = e.target.value;
        setHex(newHex);
        if (/^#([0-9A-F]{3}){1,2}$/i.test(newHex)) {
            onChange(newHex);
        }
    };
    
    const handleColorSelect = (selectedColor: string) => {
        onChange(selectedColor);
        addRecentColor(selectedColor);
        setRecentColors(getStoredColors(RECENT_COLORS_KEY));
    }
    
    const handleSaveColor = () => {
        const newSaved = [color, ...savedColors.filter(c => c.toLowerCase() !== color.toLowerCase())].slice(0, MAX_SAVED_COLORS);
        setSavedColors(newSaved);
        localStorage.setItem(SAVED_COLORS_KEY, JSON.stringify(newSaved));
    };
    
    const handleRemoveSavedColor = (colorToRemove: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSaved = savedColors.filter(c => c.toLowerCase() !== colorToRemove.toLowerCase());
        setSavedColors(newSaved);
        localStorage.setItem(SAVED_COLORS_KEY, JSON.stringify(newSaved));
    };

    const hueGradient = `linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)`;
    const saturationGradient = `linear-gradient(to right, ${hsvToHex(hsv.h, 0, 100)}, ${hsvToHex(hsv.h, 100, 100)})`;
    const valueGradient = `linear-gradient(to right, #000, ${hsvToHex(hsv.h, 100, 100)})`;

    return (
        <div className="absolute z-20 w-72 bg-white rounded-lg shadow-2xl border p-4 mt-2" onMouseUp={() => addRecentColor(color)}>
            <div className="w-full h-20 rounded mb-4 border" style={{ backgroundColor: color }}></div>
            <div className="space-y-3">
                <SliderControl label="Színárnyalat" gradient={hueGradient} min={0} max={360} value={hsv.h} onChange={v => handleSliderChange('h', v)} />
                <SliderControl label="Telítettség" gradient={saturationGradient} min={0} max={100} value={hsv.s} onChange={v => handleSliderChange('s', v)} />
                <SliderControl label="Fényerő" gradient={valueGradient} min={0} max={100} value={hsv.v} onChange={v => handleSliderChange('v', v)} />
            </div>
            <div className="mt-4">
                <input value={hex} onChange={handleHexChange} className="w-full p-2 border rounded text-center font-mono"/>
            </div>
            <PaletteSection title="Saját paletta" colors={savedColors} onSelect={handleColorSelect} onSave={handleSaveColor} onRemove={handleRemoveSavedColor} />
            <PaletteSection title="Utoljára használt" colors={recentColors} onSelect={handleColorSelect} />
        </div>
    );
};

const SliderControl: React.FC<{label: string, gradient: string, min: number, max: number, value: number, onChange: (v: number) => void}> = ({label, gradient, ...props}) => (
    <div>
        <label className="text-xs font-semibold text-gray-600">{label}</label>
        <div className="h-6 rounded-full" style={{ background: gradient }}>
            <input type="range" {...props} className="w-full h-full slider-thumb" />
        </div>
        <style>{`
            .slider-thumb { -webkit-appearance: none; appearance: none; width: 100%; height: 100%; background: transparent; cursor: pointer; }
            .slider-thumb::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; background: #fff; border-radius: 50%; border: 2px solid #ccc; box-shadow: 0 0 4px rgba(0,0,0,0.2); margin-top: -10px;}
            .slider-thumb::-moz-range-thumb { width: 20px; height: 20px; background: #fff; border-radius: 50%; border: 2px solid #ccc; box-shadow: 0 0 4px rgba(0,0,0,0.2); }
        `}</style>
    </div>
);

const PaletteSection: React.FC<{
    title: string;
    colors: string[];
    onSelect: (c: string) => void;
    onSave?: () => void;
    onRemove?: (c: string, e: React.MouseEvent) => void;
}> = ({ title, colors, onSelect, onSave, onRemove }) => (
    <div className="mt-4 pt-3 border-t">
        <div className="flex justify-between items-center mb-2">
            <h4 className="text-xs font-semibold text-gray-600">{title}</h4>
            {onSave && <button onClick={onSave} className="p-1 text-blue-600 hover:bg-blue-100 rounded-full" title="Jelenlegi szín mentése"><PlusIcon className="h-4 w-4"/></button>}
        </div>
        <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
                <button key={c} onClick={() => onSelect(c)} className="h-7 w-7 rounded-full border-2 border-white shadow-sm shrink-0 relative group" style={{ backgroundColor: c }} title={c}>
                    {onRemove && <div onClick={(e) => onRemove(c, e)} className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon className="h-4 w-4 text-white" /></div>}
                </button>
            ))}
        </div>
    </div>
);

interface ColorPickerProps {
    value: string;
    onChange: (color: string) => void;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const handleClickOutside = useCallback((event: MouseEvent) => {
        if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
            setIsOpen(false);
        }
    }, []);

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [handleClickOutside]);

    return (
        <div ref={wrapperRef} className="relative w-full mt-1">
            <button type="button" onClick={() => setIsOpen(p => !p)} className="w-full h-10 p-1 border rounded-lg flex items-center justify-between text-sm px-2 bg-white">
                <span className="font-mono text-gray-700">{value}</span>
                <div className="w-8 h-full rounded border border-gray-300" style={{ backgroundColor: value }}></div>
            </button>
            {isOpen && (
                <ColorPickerPopup
                    color={value}
                    onChange={onChange}
                    onClose={() => setIsOpen(false)}
                />
            )}
        </div>
    );
};

export default ColorPicker;
