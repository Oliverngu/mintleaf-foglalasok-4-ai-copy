import { type CSSProperties } from 'react';
import { ReservationSetting, ThemeSettings } from '../models/data';

type RadiusKey = 'sm' | 'md' | 'lg' | 'xl';
type ElevationKey = 'none' | 'low' | 'medium' | 'mid' | 'high';
type TypographyKey = 'S' | 'M' | 'L';
export type ReservationUiTheme = 'minimal_glass' | 'classic_elegant' | 'playful_bubble';

export interface ReservationThemeStyles {
  page: string;
  pageInner: string;
  pageOverlay?: string;
  card: string;
  infoPanel: string;
  primaryButton: string;
  secondaryButton: string;
  outlineButton: string;
  input: string;
  badge: string;
  chip: string;
  stepWrapper: string;
  stepTrack: string;
  stepThumb: string;
  stepActive: string;
  stepInactive: string;
  watermark?: string;
}

export interface ReservationThemeTokens {
  uiTheme: ReservationUiTheme;
  colors: {
    primary: string;
    accent: string;
    background: string;
    surface: string;
    textPrimary: string;
    textSecondary: string;
    success: string;
    danger: string;
    highlight: string;
  };
  radiusClass: string;
  shadowClass: string;
  fontSizeClass: string;
  fontFamilyClass: string;
  pageStyle?: CSSProperties;
  cardStyle?: CSSProperties;
  watermarkStyle?: CSSProperties;
  styles: ReservationThemeStyles;
}

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
  backgroundImageUrl: undefined,
  headerBrandMode: 'text',
};

const radiusMap: Record<RadiusKey, string> = {
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-2xl',
  xl: 'rounded-3xl',
};

const elevationMap: Record<ElevationKey, string> = {
  none: 'shadow-none',
  low: 'shadow-sm',
  medium: 'shadow-md',
  mid: 'shadow-md',
  high: 'shadow-xl',
};

const typographyMap: Record<TypographyKey, string> = {
  S: 'text-sm',
  M: 'text-base',
  L: 'text-lg',
};

const uiThemeAlias: Record<string, ReservationUiTheme> = {
  minimal_glass: 'minimal_glass',
  minimal: 'minimal_glass',
  elegant: 'classic_elegant',
  classic_elegant: 'classic_elegant',
  classic: 'classic_elegant',
  playful_bubble: 'playful_bubble',
  playful_bubbles: 'playful_bubble',
  bubbly: 'playful_bubble',
};

type BasePreset = {
  uiTheme: ReservationUiTheme;
  pageBackground: string;
  pageOverlay?: string;
  cardBase: string;
  infoPanel: string;
  primaryButton: string;
  secondaryButton: string;
  outlineButton: string;
  input: string;
  badge: string;
  chip: string;
  fontFamily: string;
  stepWrapper: string;
  stepTrack: string;
  stepThumb: string;
  stepActive: string;
  stepInactive: string;
  watermark?: string;
};

const basePresets: Record<ReservationUiTheme, BasePreset> = {
  minimal_glass: {
    uiTheme: 'minimal_glass',
    pageBackground:
      'min-h-screen flex flex-col bg-gradient-to-br from-slate-900/90 via-slate-950/90 to-slate-900/85 text-white',
    pageOverlay:
      'absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-white/5 pointer-events-none mix-blend-screen',
    cardBase:
      'relative overflow-hidden backdrop-blur-2xl border border-white/50 shadow-[0_18px_45px_rgba(0,0,0,0.25)] text-[color:var(--color-text-primary)]',
    infoPanel: 'bg-white/20 border border-white/40 backdrop-blur text-white/90',
    primaryButton:
      'bg-white/25 border border-white/40 text-white hover:bg-white/35 hover:shadow-lg transition transform hover:scale-[1.02] backdrop-blur',
    secondaryButton:
      'bg-transparent border border-white/50 text-white hover:bg-white/10 transition',
    outlineButton:
      'border border-white/50 text-white/90 hover:bg-white/10 transition backdrop-blur',
    input:
      'bg-white/25 border border-white/40 text-white placeholder:text-white/60 focus:ring-2 focus:ring-white/60',
    badge: 'bg-white/15 text-white border border-white/40 backdrop-blur',
    chip: 'bg-white/20 text-white',
    fontFamily: 'font-sans',
    stepWrapper: 'flex items-center justify-center w-full max-w-2xl mx-auto mb-6 gap-3',
    stepTrack: 'h-1 flex-1 rounded-full bg-white/25',
    stepThumb: 'h-1 rounded-full bg-white',
    stepActive:
      'bg-white text-[color:var(--color-primary)] border-2 border-[color:var(--color-primary)] shadow-sm',
    stepInactive: 'bg-white/70 text-white/70 border border-white/40',
    watermark: 'text-white/70',
  },
  classic_elegant: {
    uiTheme: 'classic_elegant',
    pageBackground:
      'min-h-screen flex flex-col bg-gradient-to-br from-amber-50 via-amber-100 to-rose-50 text-slate-900',
    pageOverlay: 'absolute inset-0 bg-gradient-to-br from-white/30 via-white/10 to-white/5 pointer-events-none',
    cardBase: 'relative overflow-hidden border border-amber-100 shadow-md text-[color:var(--color-text-primary)]',
    infoPanel: 'bg-amber-50 border border-amber-200 text-amber-900',
    primaryButton:
      'bg-[color:var(--color-primary)] text-white border border-transparent hover:shadow-md transition',
    secondaryButton:
      'bg-white text-[color:var(--color-primary)] border border-[color:var(--color-primary)] hover:bg-amber-50 transition',
    outlineButton:
      'bg-transparent text-[color:var(--color-primary)] border border-[color:var(--color-primary)] hover:bg-amber-50 transition',
    input:
      'bg-white border border-amber-200 text-slate-900 focus:ring-2 focus:ring-[color:var(--color-primary)]',
    badge: 'bg-amber-100 text-amber-800 border border-amber-200',
    chip: 'bg-amber-50 text-amber-800',
    fontFamily: 'font-serif',
    stepWrapper: 'flex items-center justify-center w-full max-w-2xl mx-auto mb-6 gap-2',
    stepTrack: 'h-1 flex-1 rounded-full bg-amber-100',
    stepThumb: 'h-1 rounded-full bg-[color:var(--color-primary)]',
    stepActive:
      'bg-[color:var(--color-primary)] text-white shadow-sm border border-transparent',
    stepInactive: 'bg-white text-slate-500 border border-amber-100',
    watermark: 'text-slate-500',
  },
  playful_bubble: {
    uiTheme: 'playful_bubble',
    pageBackground:
      'min-h-screen flex flex-col relative overflow-hidden bg-gradient-to-br from-sky-100 via-blue-100 to-indigo-100 text-slate-900',
    pageOverlay: 'absolute inset-0 bg-gradient-to-br from-white/50 via-white/30 to-white/20 pointer-events-none',
    cardBase:
      'relative overflow-hidden backdrop-blur-md border border-sky-100 shadow-xl text-[color:var(--color-text-primary)]',
    infoPanel: 'bg-white/85 border border-sky-100 text-slate-900',
    primaryButton:
      'bg-[color:var(--color-primary)] text-white rounded-full px-5 py-3 transition transform hover:scale-[1.04] hover:shadow-xl',
    secondaryButton:
      'bg-white text-[color:var(--color-primary)] border border-[color:var(--color-primary)] rounded-full px-4 py-2 transition transform hover:-translate-y-[1px]',
    outlineButton:
      'bg-white/70 text-[color:var(--color-primary)] border border-[color:var(--color-primary)] rounded-full transition hover:bg-white',
    input:
      'bg-white border border-sky-100 text-slate-900 rounded-2xl focus:ring-2 focus:ring-[color:var(--color-primary)] shadow-sm',
    badge: 'bg-[color:var(--color-accent)]/15 text-[color:var(--color-primary)] border border-[color:var(--color-primary)]/20 rounded-full',
    chip: 'bg-white text-slate-800 rounded-full',
    fontFamily: 'font-sans',
    stepWrapper: 'flex items-center justify-center w-full max-w-2xl mx-auto mb-6 gap-3',
    stepTrack: 'h-2 flex-1 rounded-full bg-white/60',
    stepThumb: 'h-2 rounded-full bg-[color:var(--color-primary)] shadow-md',
    stepActive:
      'bg-[color:var(--color-primary)] text-white shadow-md border border-transparent animate-pulse',
    stepInactive: 'bg-white text-slate-500 border border-sky-100',
    watermark: 'text-slate-600',
  },
};

const isReservationSetting = (value: any): value is ReservationSetting =>
  value && typeof value === 'object' && 'theme' in value;

export const syncThemeCssVariables = (theme: ReservationThemeTokens) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const entries: Record<string, string> = {
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
  Object.entries(entries).forEach(([key, value]) => {
    root.style.setProperty(`--color-${key}`, value);
  });
};

const radiusFromSetting = (radius?: RadiusKey, fallback?: string) => {
  if (radius && radiusMap[radius]) return radiusMap[radius];
  return fallback || radiusMap.lg;
};

const shadowFromSetting = (elevation?: ElevationKey, fallback?: string) => {
  if (elevation && elevationMap[elevation]) return elevationMap[elevation];
  return fallback || elevationMap.medium;
};

const fontSizeFromSetting = (scale?: TypographyKey, fallback?: string) => {
  if (scale && typographyMap[scale]) return typographyMap[scale];
  return fallback || typographyMap.M;
};

const hexToRgba = (hex: string, alpha: number) => {
  const parsed = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!parsed) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(parsed[1], 16);
  const g = parseInt(parsed[2], 16);
  const b = parseInt(parsed[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const resolveUiTheme = (settings: ReservationSetting | ThemeSettings | null, override?: ReservationSetting['uiTheme']): ReservationUiTheme => {
  const requested = override || (isReservationSetting(settings) ? settings.uiTheme : undefined) || 'minimal_glass';
  return uiThemeAlias[requested] || 'minimal_glass';
};

export const buildReservationTheme = (
  settings: ReservationSetting | ThemeSettings | null,
  uiThemeOverride?: ReservationSetting['uiTheme']
): ReservationThemeTokens => {
  const themeSettings: ThemeSettings = isReservationSetting(settings)
    ? settings.theme || defaultThemeSettings
    : settings || defaultThemeSettings;

  const uiTheme = resolveUiTheme(settings, uiThemeOverride);
  const preset = basePresets[uiTheme];

  const radiusClass = radiusFromSetting(themeSettings.radius, radiusMap.lg);
  const shadowClass = shadowFromSetting(themeSettings.elevation, preset.uiTheme === 'minimal_glass' ? elevationMap.high : elevationMap.medium);
  const fontSizeClass = fontSizeFromSetting(themeSettings.typographyScale, typographyMap.M);

  const colors = {
    primary: themeSettings.primary || defaultThemeSettings.primary,
    accent: themeSettings.accent || defaultThemeSettings.accent,
    background: themeSettings.background || defaultThemeSettings.background,
    surface: themeSettings.surface || defaultThemeSettings.surface,
    textPrimary: themeSettings.textPrimary || defaultThemeSettings.textPrimary,
    textSecondary: themeSettings.textSecondary || defaultThemeSettings.textSecondary,
    success: themeSettings.success || defaultThemeSettings.success,
    danger: themeSettings.danger || defaultThemeSettings.danger,
    highlight: themeSettings.highlight || defaultThemeSettings.highlight!,
  };

  const cardBackground =
    uiTheme === 'minimal_glass'
      ? hexToRgba(
          colors.surface,
          colors.surface.toLowerCase() === colors.background.toLowerCase() ? 0.15 : 0.2
        )
      : uiTheme === 'playful_bubble'
      ? hexToRgba(colors.surface, 0.9)
      : hexToRgba(colors.surface, 0.98);
  const cardBorder = hexToRgba(colors.surface, uiTheme === 'minimal_glass' ? 0.6 : 0.85);

  const gradientOverlay = `linear-gradient(135deg, ${hexToRgba(colors.background, 0.35)}, ${hexToRgba(
    colors.background,
    0.25
  )})`;

  const pageStyle: CSSProperties = themeSettings.backgroundImageUrl
    ? {
        backgroundImage: `url(${themeSettings.backgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: colors.background,
      }
    : {
        backgroundImage: gradientOverlay,
        backgroundColor: colors.background,
      };

  const composedPage = `${preset.pageBackground} ${preset.fontFamily} ${fontSizeClass}`;
  const cardBase = `${preset.cardBase} ${radiusClass} ${shadowClass}`;

  const styles: ReservationThemeStyles = {
    page: composedPage,
    pageInner: 'flex-1 flex flex-col w-full max-w-5xl mx-auto px-4 py-10 gap-6',
    pageOverlay: preset.pageOverlay,
    card: `${cardBase} ${preset.fontFamily}`,
    infoPanel: `${preset.infoPanel} ${radiusClass} ${fontSizeClass} px-4 py-3`,
    primaryButton: `${preset.primaryButton} ${radiusClass} ${fontSizeClass}`,
    secondaryButton: `${preset.secondaryButton} ${radiusClass} ${fontSizeClass}`,
    outlineButton: `${preset.outlineButton} ${radiusClass} ${fontSizeClass}`,
    input: `${preset.input} ${radiusClass} ${fontSizeClass} w-full px-3 py-2 transition`,
    badge: `${preset.badge} ${radiusClass} ${fontSizeClass} inline-flex items-center gap-2 px-3 py-1`,
    chip: `${preset.chip} ${radiusClass} ${fontSizeClass} inline-flex items-center gap-2 px-3 py-1`,
    stepWrapper: `${preset.stepWrapper} ${preset.fontFamily} ${fontSizeClass}`,
    stepTrack: `${preset.stepTrack}`,
    stepThumb: `${preset.stepThumb}`,
    stepActive: `${preset.stepActive} ${radiusClass}`,
    stepInactive: `${preset.stepInactive} ${radiusClass}`,
    watermark: preset.watermark,
  };

  return {
    uiTheme,
    colors,
    radiusClass,
    shadowClass,
    fontSizeClass,
    fontFamilyClass: preset.fontFamily,
    pageStyle,
    cardStyle: {
      backgroundColor: cardBackground,
      borderColor: cardBorder,
      color: colors.textPrimary,
      boxShadow: uiTheme === 'minimal_glass' ? '0 18px 45px rgba(0,0,0,0.25)' : undefined,
    },
    watermarkStyle: {
      color: hexToRgba(colors.textSecondary, 0.8),
      textShadow: uiTheme === 'minimal_glass' ? '0 1px 6px rgba(0,0,0,0.35)' : undefined,
    },
    styles,
  };
};
