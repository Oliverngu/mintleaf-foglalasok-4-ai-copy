import React, { useEffect, useMemo, useRef, useState } from 'react';

interface ColorPickerProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  presetColors?: string[];
  hidePresets?: boolean;
}

type HSL = { h: number; s: number; l: number };

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

const normalizeHex = (hex: string) => {
  if (!hex) return '#15803d';
  const value = hex.startsWith('#') ? hex : `#${hex}`;
  return value.slice(0, 7).padEnd(7, '0');
};

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  if (![3, 6].includes(normalized.length)) return null;
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map(c => c + c)
          .join('')
      : normalized;

  const int = parseInt(expanded, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
};

const rgbToHsl = (r: number, g: number, b: number): HSL => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
};

const hslToRgb = (h: number, s: number, l: number) => {
  h /= 360;
  s /= 100;
  l /= 100;

  if (s === 0) {
    const val = Math.round(l * 255);
    return { r: val, g: val, b: val };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
};

const componentToHex = (c: number) => {
  const hex = c.toString(16);
  return hex.length === 1 ? `0${hex}` : hex;
};

const hslToHex = (h: number, s: number, l: number) => {
  const { r, g, b } = hslToRgb(h, s, l);
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
};

const ColorPicker: React.FC<ColorPickerProps> = ({
  label,
  value,
  onChange,
  presetColors,
  hidePresets,
}) => {
  const normalizedValue = normalizeHex(value);
  const initialHsl = useMemo(() => {
    const rgb = hexToRgb(normalizedValue) || { r: 21, g: 128, b: 61 };
    return rgbToHsl(rgb.r, rgb.g, rgb.b);
  }, [normalizedValue]);

  const [isOpen, setIsOpen] = useState(false);
  const [hexValue, setHexValue] = useState(normalizedValue);
  const [hsl, setHsl] = useState<HSL>(initialHsl);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const uniquePresets = useMemo(() => {
    if (!presetColors || hidePresets) return [];
    return Array.from(new Set(presetColors.filter(Boolean)));
  }, [presetColors, hidePresets]);

  const derivedHex = useMemo(() => hslToHex(hsl.h, hsl.s, hsl.l), [hsl]);

  useEffect(() => {
    const nextHex = normalizeHex(value);
    if (nextHex.toLowerCase() === derivedHex.toLowerCase()) return;

    const rgb = hexToRgb(nextHex);
    if (!rgb) return;
    const nextHsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    setHsl(nextHsl);
    setHexValue(nextHex);
  }, [value, derivedHex]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (isOpen && popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const setFromHex = (next: string, closeAfter = false) => {
    const normalized = normalizeHex(next);
    const rgb = hexToRgb(normalized);
    if (!rgb) return;
    const nextHsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    setHexValue(normalized);
    setHsl(nextHsl);
    onChange(normalized);
    if (closeAfter) setIsOpen(false);
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHexValue(val);
    if (/^#?[0-9a-fA-F]{3,6}$/.test(val)) {
      setFromHex(val.startsWith('#') ? val : `#${val}`);
    }
  };

  const handleSliderChange = (key: keyof HSL, nextVal: number) => {
    const nextHsl = { ...hsl, [key]: nextVal } as HSL;
    setHsl(nextHsl);
    const hex = hslToHex(nextHsl.h, nextHsl.s, nextHsl.l);
    setHexValue(hex);
    onChange(hex);
  };

  const hueGradient =
    'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)';
  const saturationGradient = `linear-gradient(to right, #808080, hsl(${hsl.h}, 100%, 50%))`;
  const lightnessGradient = `linear-gradient(to right, #000, hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%), #fff)`;

  return (
    <div className="flex flex-col gap-1 relative" ref={popoverRef}>
      {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="flex items-center justify-between w-full rounded-lg border border-gray-300 bg-white px-3 py-2 shadow-sm hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-md border border-gray-200 shadow-inner"
            style={{ backgroundColor: hexValue }}
          />
          <span className="font-mono text-sm uppercase text-gray-800">{hexValue}</span>
        </span>
        <svg
          className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-80 right-0 bg-white border border-gray-200 shadow-xl rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={hexValue}
              onChange={e => setFromHex(e.target.value)}
              className="w-12 h-12 rounded-lg border border-gray-200 cursor-pointer"
            />
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-gray-500">HEX</label>
              <input
                type="text"
                value={hexValue}
                onChange={handleHexChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                maxLength={7}
              />
            </div>
          </div>

          {!hidePresets && uniquePresets.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-600">Presetek</div>
              <div className="flex flex-wrap gap-2">
                {uniquePresets.map((color, index) => (
                  <button
                    key={`${color}-${index}`}
                    type="button"
                    onClick={() => setFromHex(color, true)}
                    className="w-7 h-7 rounded-full border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    style={{ backgroundColor: color }}
                    aria-label={`Választott szín ${color}`}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>Hue</span>
              <span className="font-mono">{hsl.h}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              value={hsl.h}
              onChange={e => handleSliderChange('h', clamp(Number(e.target.value), 0, 360))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{ background: hueGradient }}
            />

            <div className="flex items-center justify-between text-xs text-gray-600 mt-2">
              <span>Saturation</span>
              <span className="font-mono">{hsl.s}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={hsl.s}
              onChange={e => handleSliderChange('s', clamp(Number(e.target.value), 0, 100))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{ background: saturationGradient }}
            />

            <div className="flex items-center justify-between text-xs text-gray-600 mt-2">
              <span>Lightness</span>
              <span className="font-mono">{hsl.l}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={hsl.l}
              onChange={e => handleSliderChange('l', clamp(Number(e.target.value), 0, 100))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{ background: lightnessGradient }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ColorPicker;
