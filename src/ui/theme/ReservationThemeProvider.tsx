import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { ThemeSettings } from '../../core/models/data';

export const DEFAULT_THEME: ThemeSettings = {
    primary: '#16a34a',
    surface: '#ffffff',
    background: '#f9fafb',
    textPrimary: '#1f2937',
    textSecondary: '#4b5563',
    accent: '#10b981',
    success: '#22c55e',
    danger: '#ef4444',
    radius: 'lg',
    elevation: 'mid',
    typographyScale: 'M'
};

interface ThemeProviderProps {
    theme?: Partial<ThemeSettings>;
    children: ReactNode;
}

const ThemeContext = createContext<ThemeSettings>(DEFAULT_THEME);

const ThemeProvider: React.FC<ThemeProviderProps> = ({ theme, children }) => {
    const value = useMemo<ThemeSettings>(() => ({
        ...DEFAULT_THEME,
        ...(theme || {})
    }), [theme]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

const useTheme = () => useContext(ThemeContext);

export { ThemeContext, ThemeProvider, useTheme };
