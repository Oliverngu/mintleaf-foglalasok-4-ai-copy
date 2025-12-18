import React from 'react';

export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return null;

  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
};

export const getDeepGlassVars = (primaryHex: string): React.CSSProperties => {
  const rgb = hexToRgb(primaryHex) || { r: 22, g: 101, b: 52 };
  const vars: React.CSSProperties & Record<string, string | number> = {
    '--ml-r': rgb.r,
    '--ml-g': rgb.g,
    '--ml-b': rgb.b,
    '--press-scale': 0.96,
    '--press-y': '1px',
  };

  return vars;
};

export const getDeepGlassClass = (isPressed: boolean): string =>
  `btn-deep${isPressed ? ' is-pressed' : ''}`;
