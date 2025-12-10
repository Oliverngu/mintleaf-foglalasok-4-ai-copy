import React, { useEffect } from 'react';
import { Unit } from '../models/data';

interface ThemeManagerProps {
  activeUnit?: Unit | null;
}

const BRAND_COLOR_VARIABLES = [
  '--color-primary',
  '--color-secondary',
  '--color-accent',
  '--color-surface',
  '--color-highlight'
];

const ThemeManager: React.FC<ThemeManagerProps> = ({ activeUnit }) => {
  useEffect(() => {
    const rootStyle = document.documentElement.style;

    if (activeUnit?.uiTheme === 'brand' && activeUnit.brandColors?.length) {
      BRAND_COLOR_VARIABLES.forEach((cssVar, idx) => {
        const colorValue = activeUnit.brandColors?.[idx];
        if (colorValue) {
          rootStyle.setProperty(cssVar, colorValue);
        } else {
          rootStyle.removeProperty(cssVar);
        }
      });
    } else {
      BRAND_COLOR_VARIABLES.forEach(cssVar => rootStyle.removeProperty(cssVar));
    }
  }, [activeUnit]);

  return null;
};

export default ThemeManager;
