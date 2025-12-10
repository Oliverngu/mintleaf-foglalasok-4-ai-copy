import React from 'react';

interface ColorPickerProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ label, value, onChange }) => {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
      <div className="flex items-center gap-2">
        <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-gray-300 shadow-sm">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute -top-2 -left-2 w-16 h-16 p-0 border-0 cursor-pointer"
          />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          maxLength={7}
        />
      </div>
    </div>
  );
};
export default ColorPicker;
