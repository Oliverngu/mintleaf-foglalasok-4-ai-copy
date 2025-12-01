import { ReservationSetting, ThemeSettings } from '../models/data';

export type ReservationThemeKey = 'minimal' | 'elegant' | 'bubbly';

export interface ReservationThemeTokens {
  key: ReservationThemeKey;
  colors: {
    primary: string;
    accent: string;
    surface: string;
    background: string;
    textPrimary: string;
    textSecondary: string;
    success: string;
    danger: string;
    highlight: string;
  };
  radiusClass: string;
  shadowClass: string;
  fontFamilyClass: string;
  fontSizeClass: string;
  pageBg: string;
  card: string;
  primaryButton: string;
  secondaryButton: string;
  outlineButton: string;
  progressWrapper: string;
  progressTrack: string;
  progressThumb: string;
  stepActive: string;
  stepIdle: string;
}

const radiusMap: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-2xl',
  xl: 'rounded-3xl',
};

const elevationMap: Record<'none' | 'low' | 'medium' | 'mid' | 'high', string> = {
  none: 'shadow-none',
  low: 'shadow-sm',
  medium: 'shadow-md',
  mid: 'shadow-md',
  high: 'shadow-xl',
};

const typographyScaleMap: Record<'S' | 'M' | 'L', string> = {
  S: 'text-sm',
  M: 'text-base',
  L: 'text-lg',
};

const themeKeyMap: Record<string, ReservationThemeKey> = {
  minimal_glass: 'minimal',
  minimal: 'minimal',
  elegant: 'elegant',
  classic_elegant: 'elegant',
  playful_bubbles: 'bubbly',
  playful_bubble: 'bubbly',
  bubbly: 'bubbly',
};

const basePalettes: Record<ReservationThemeKey, ReservationThemeTokens> = {
  minimal: {
    key: 'minimal',
    colors: {
      primary: '#16a34a',
      accent: '#22c55e',
      surface: '#0f172a',
      background: '#0b1224',
      textPrimary: '#e2e8f0',
      textSecondary: '#cbd5e1',
      success: '#22c55e',
      danger: '#ef4444',
      highlight: '#38bdf8',
    },
    radiusClass: radiusMap.lg,
    shadowClass: elevationMap.high,
    fontFamilyClass: 'font-sans',
    fontSizeClass: typographyScaleMap.M,
    pageBg:
      'min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900',
    card:
      'relative w-full max-w-4xl bg-white/10 backdrop-blur-xl border border-white/20 text-[color:var(--color-text-primary)]',
    primaryButton:
      'inline-flex items-center justify-center font-semibold text-white px-4 py-2 transition hover:brightness-110',
    secondaryButton:
      'inline-flex items-center justify-center font-semibold px-4 py-2 bg-white/20 text-white hover:bg-white/30 border border-white/30 transition',
    outlineButton:
      'inline-flex items-center justify-center font-semibold px-4 py-2 border border-white/40 text-white/90 hover:bg-white/10 transition backdrop-blur-sm',
    progressWrapper: 'flex items-center justify-center w-full max-w-2xl mx-auto mb-6 gap-2',
    progressTrack: 'h-1 flex-1 rounded-full bg-white/20',
    progressThumb: 'h-1 rounded-full bg-[var(--color-primary)]',
    stepActive:
      'bg-white text-[color:var(--color-primary)] border-2 border-[color:var(--color-primary)] shadow-sm',
    stepIdle: 'bg-white/60 text-[color:var(--color-text-secondary)] border border-white/40',
  },
  elegant: {
    key: 'elegant',
    colors: {
      primary: '#8b5e34',
      accent: '#b45309',
      surface: '#ffffff',
      background: '#fef3c7',
      textPrimary: '#1f2937',
      textSecondary: '#4b5563',
      success: '#16a34a',
      danger: '#b91c1c',
      highlight: '#f59e0b',
    },
    radiusClass: radiusMap.md,
    shadowClass: elevationMap.medium,
    fontFamilyClass: 'font-serif',
    fontSizeClass: typographyScaleMap.M,
    pageBg:
      'min-h-screen flex flex-col bg-gradient-to-br from-amber-50 via-amber-100 to-rose-50',
    card:
      'relative w-full max-w-4xl bg-white border border-amber-100 text-[color:var(--color-text-primary)]',
    primaryButton:
      'inline-flex items-center justify-center font-semibold text-white px-4 py-2 transition hover:shadow-md border border-transparent',
    secondaryButton:
      'inline-flex items-center justify-center font-semibold px-4 py-2 border border-amber-200 text-amber-900 bg-white hover:bg-amber-50 transition',
    outlineButton:
      'inline-flex items-center justify-center font-semibold px-4 py-2 border border-amber-300 text-amber-800 bg-transparent hover:bg-amber-50 transition',
    progressWrapper: 'flex items-center justify-center w-full max-w-2xl mx-auto mb-6 gap-2',
    progressTrack: 'h-1 flex-1 rounded-full bg-amber-100',
    progressThumb: 'h-1 rounded-full bg-[var(--color-primary)] shadow-sm',
    stepActive:
      'bg-[color:var(--color-primary)] text-white shadow-sm border border-transparent',
    stepIdle: 'bg-white text-[color:var(--color-text-secondary)] border border-amber-100',
  },
  bubbly: {
    key: 'bubbly',
    colors: {
      primary: '#0ea5e9',
      accent: '#22c55e',
      surface: '#ffffff',
      background: '#dbeafe',
      textPrimary: '#0f172a',
      textSecondary: '#475569',
      success: '#16a34a',
      danger: '#ef4444',
      highlight: '#38bdf8',
    },
    radiusClass: radiusMap.xl,
    shadowClass: elevationMap.high,
    fontFamilyClass: 'font-sans',
    fontSizeClass: typographyScaleMap.M,
    pageBg:
      'min-h-screen flex flex-col relative overflow-hidden bg-gradient-to-br from-sky-100 via-blue-100 to-indigo-100',
    card:
      'relative w-full max-w-4xl bg-white/85 backdrop-blur-md border border-sky-100 text-[color:var(--color-text-primary)]',
    primaryButton:
      'inline-flex items-center justify-center font-semibold text-white px-5 py-2 transition transform hover:scale-[1.03] hover:shadow-lg',
    secondaryButton:
      'inline-flex items-center justify-center font-semibold px-4 py-2 bg-white/80 text-[color:var(--color-text-primary)] hover:bg-white shadow-sm border border-sky-100 transition rounded-full',
    outlineButton:
      'inline-flex items-center justify-center font-semibold px-4 py-2 border border-sky-200 text-[color:var(--color-primary)] bg-white/60 hover:bg-white transition rounded-full transform hover:translate-y-[-1px]',
    progressWrapper: 'flex items-center justify-center w-full max-w-2xl mx-auto mb-6 gap-3',
    progressTrack: 'h-2 flex-1 rounded-full bg-white/60',
    progressThumb: 'h-2 rounded-full bg-[var(--color-primary)] shadow-md',
    stepActive:
      'bg-[color:var(--color-primary)] text-white shadow-md border border-transparent',
    stepIdle: 'bg-white text-[color:var(--color-text-secondary)] border border-sky-100',
  },
};

export const syncThemeCssVariables = (theme: ReservationThemeTokens) => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const colorMap: Record<string, string> = {
    primary: theme.colors.primary,
    accent: theme.colors.accent,
    surface: theme.colors.surface,
    background: theme.colors.background,
    textPrimary: theme.colors.textPrimary,
    textSecondary: theme.colors.textSecondary,
    success: theme.colors.success,
    danger: theme.colors.danger,
    highlight: theme.colors.highlight,
  };

  Object.entries(colorMap).forEach(([key, value]) => {
    root.style.setProperty(`--color-${key}`, value);
  });
};

export const defaultThemeSettings: ThemeSettings = {
  primary: '#166534',
  surface: '#ffffff',
  background: '#f9fafb',
  textPrimary: '#1f2937',
  textSecondary: '#4b5563',
  accent: '#10b981',
  success: '#16a34a',
  danger: '#dc2626',
  radius: 'lg',
  elevation: 'mid',
  typographyScale: 'M',
  highlight: '#38bdf8',
};

const isReservationSetting = (value: any): value is ReservationSetting =>
  value && typeof value === 'object' && 'theme' in value;

export const buildReservationTheme = (
  settings: ReservationSetting | ThemeSettings | null,
  uiThemeOverride?: ReservationSetting['uiTheme']
): ReservationThemeTokens => {
  const themeSettings: ThemeSettings = isReservationSetting(settings)
    ? settings.theme || defaultThemeSettings
    : settings || defaultThemeSettings;

  const uiThemeKey = uiThemeOverride
    ? themeKeyMap[uiThemeOverride] || 'minimal'
    : isReservationSetting(settings) && settings.uiTheme
    ? themeKeyMap[settings.uiTheme] || 'minimal'
    : 'minimal';

  const base = basePalettes[uiThemeKey];
  const overrides = themeSettings;

  const radiusValue = overrides?.radius && radiusMap[overrides.radius]
    ? radiusMap[overrides.radius]
    : base.radiusClass;
  const shadowValue = overrides?.elevation && elevationMap[overrides.elevation]
    ? elevationMap[overrides.elevation]
    : base.shadowClass;
  const fontSizeClass = overrides?.typographyScale
    ? typographyScaleMap[overrides.typographyScale]
    : base.fontSizeClass;

  const colors = {
    primary: overrides?.primary || base.colors.primary,
    accent: overrides?.accent || base.colors.accent,
    surface: overrides?.surface || base.colors.surface,
    background: overrides?.background || base.colors.background,
    textPrimary: overrides?.textPrimary || base.colors.textPrimary,
    textSecondary: overrides?.textSecondary || base.colors.textSecondary,
    success: overrides?.success || base.colors.success,
    danger: overrides?.danger || base.colors.danger,
    highlight: overrides?.highlight || base.colors.highlight,
  };

  return {
    key: base.key,
    colors,
    radiusClass: radiusValue,
    shadowClass: shadowValue,
    fontFamilyClass: base.fontFamilyClass,
    fontSizeClass,
    pageBg: `${base.pageBg} bg-[${colors.background}] ${base.fontFamilyClass} ${fontSizeClass}`,
    card: `${base.card} ${radiusValue} ${shadowValue} bg-[${colors.surface}] text-[${colors.textPrimary}]`,
    primaryButton: `${base.primaryButton} ${radiusValue} bg-[${colors.primary}]`,
    secondaryButton: `${base.secondaryButton} ${radiusValue} bg-[${colors.accent}] text-white`,
    progressWrapper: base.progressWrapper,
    progressTrack: `${base.progressTrack}`,
    progressThumb: `${base.progressThumb} bg-[${colors.primary}]`,
    stepActive: `${base.stepActive} ${radiusValue}`,
    stepIdle: `${base.stepIdle} ${radiusValue}`,
  };
};

