export type ThemeMode = 'light' | 'dark';

export type BaseTheme = {
  primary: string;
  secondary: string;
  headerBg: string;
  sidebarBg: string;
  background: string;
  surface: string;
  textMain: string;
  textSecondary: string;
  border: string;
};

export type ThemeBases = {
  light: BaseTheme;
  dark: BaseTheme;
};

export type BrandOverride = {
  headerBg?: string;
  secondary?: string;
  background?: string;
};
