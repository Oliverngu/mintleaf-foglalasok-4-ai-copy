import { ReservationSetting } from '../models/data';

export type ReservationThemeKey = 'minimal' | 'elegant' | 'bubbly';

export interface ReservationThemeTokens {
  key: ReservationThemeKey;
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  backgroundColor: string;
  textPrimaryColor: string;
  textSecondaryColor: string;
  successColor: string;
  dangerColor: string;
  radiusClass: string;
  shadowClass: string;
  fontClass: string;
  fontSizeScale: number;
  fontBaseClass: string;
  pageWrapperClass: string;
  pageBackgroundClass: string;
  cardClass: string;
  cardBaseClass: string;
  buttonPrimaryClass: string;
  buttonSecondaryClass: string;
  progressWrapperClass: string;
  progressTrackClass: string;
  progressThumbClass: string;
}

const themeKeyMap: Record<string, ReservationThemeKey> = {
  minimal_glass: 'minimal',
  minimal: 'minimal',
  elegant: 'elegant',
  playful_bubbles: 'bubbly',
  bubbly: 'bubbly',
};

const radiusMap: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-2xl',
};

const elevationMap: Record<'low' | 'mid' | 'high', string> = {
  low: 'shadow-sm',
  mid: 'shadow-md',
  high: 'shadow-xl',
};

const typographyScaleMap: Record<'S' | 'M' | 'L', { className: string; scale: number }> = {
  S: { className: 'text-sm', scale: 0.95 },
  M: { className: 'text-base', scale: 1 },
  L: { className: 'text-lg', scale: 1.05 },
};

const baseWrapper = 'min-h-screen flex flex-col px-4 py-6 relative overflow-hidden';

const getBaseTheme = (themeKey: ReservationThemeKey): ReservationThemeTokens => {
  switch (themeKey) {
    case 'elegant':
      return {
        key: 'elegant',
        primaryColor: '#8b5e34',
        accentColor: '#b45309',
        surfaceColor: '#ffffff',
        backgroundColor: '#fef3c7',
        textPrimaryColor: '#1f2937',
        textSecondaryColor: '#4b5563',
        successColor: '#16a34a',
        dangerColor: '#b91c1c',
        radiusClass: 'rounded-xl',
        shadowClass: 'shadow-lg',
        fontClass: 'font-serif',
        fontBaseClass: typographyScaleMap.M.className,
        fontSizeScale: typographyScaleMap.M.scale,
        pageWrapperClass: `${baseWrapper} bg-gradient-to-br from-amber-50 via-amber-100 to-rose-50`,
        pageBackgroundClass: 'bg-gradient-to-br from-amber-50 via-amber-100 to-rose-50',
        cardBaseClass:
          'relative w-full max-w-4xl bg-white border border-amber-100 text-slate-900',
        cardClass: '',
        buttonPrimaryClass:
          'inline-flex items-center justify-center font-semibold text-white px-4 py-2 transition hover:shadow-md border border-transparent bg-[var(--color-primary)]',
        buttonSecondaryClass:
          'inline-flex items-center justify-center font-semibold px-4 py-2 border border-amber-200 text-amber-900 bg-white hover:bg-amber-50 transition',
        progressWrapperClass: 'flex items-center justify-center w-full max-w-2xl mx-auto mb-6 gap-2',
        progressTrackClass: 'h-1 flex-1 rounded-full bg-amber-100',
        progressThumbClass: 'h-1 rounded-full bg-[var(--color-primary)]',
      };
    case 'bubbly':
      return {
        key: 'bubbly',
        primaryColor: '#0ea5e9',
        accentColor: '#22c55e',
        surfaceColor: '#ffffff',
        backgroundColor: '#dbeafe',
        textPrimaryColor: '#0f172a',
        textSecondaryColor: '#475569',
        successColor: '#16a34a',
        dangerColor: '#ef4444',
        radiusClass: 'rounded-3xl',
        shadowClass: 'shadow-2xl',
        fontClass: 'font-sans',
        fontBaseClass: typographyScaleMap.M.className,
        fontSizeScale: typographyScaleMap.M.scale,
        pageWrapperClass: `${baseWrapper} bg-gradient-to-br from-sky-100 via-blue-100 to-indigo-100`,
        pageBackgroundClass: 'bg-gradient-to-br from-sky-100 via-blue-100 to-indigo-100',
        cardBaseClass:
          'relative w-full max-w-4xl bg-white/85 backdrop-blur-md border border-sky-100 text-slate-900',
        cardClass: '',
        buttonPrimaryClass:
          'inline-flex items-center justify-center font-semibold text-white px-5 py-2 transition transform hover:scale-[1.03] hover:shadow-lg bg-[var(--color-primary)]',
        buttonSecondaryClass:
          'inline-flex items-center justify-center font-semibold px-4 py-2 bg-white/80 text-slate-800 hover:bg-white shadow-sm border border-sky-100 transition',
        progressWrapperClass: 'flex items-center justify-center w-full max-w-2xl mx-auto mb-6 gap-3',
        progressTrackClass: 'h-2 flex-1 rounded-full bg-white/60',
        progressThumbClass: 'h-2 rounded-full bg-[var(--color-primary)] shadow-md',
      };
    case 'minimal':
    default:
      return {
        key: 'minimal',
        primaryColor: '#16a34a',
        accentColor: '#22c55e',
        surfaceColor: '#0f172a',
        backgroundColor: '#0b1224',
        textPrimaryColor: '#e2e8f0',
        textSecondaryColor: '#cbd5e1',
        successColor: '#22c55e',
        dangerColor: '#ef4444',
        radiusClass: 'rounded-2xl',
        shadowClass: 'shadow-2xl',
        fontClass: 'font-sans',
        fontBaseClass: typographyScaleMap.M.className,
        fontSizeScale: typographyScaleMap.M.scale,
        pageWrapperClass: `${baseWrapper} bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900`,
        pageBackgroundClass: 'bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900',
        cardBaseClass:
          'relative w-full max-w-4xl bg-white/15 backdrop-blur-xl border border-white/20 text-white',
        cardClass: '',
        buttonPrimaryClass:
          'inline-flex items-center justify-center font-semibold text-white px-4 py-2 transition hover:brightness-110 bg-[var(--color-primary)]',
        buttonSecondaryClass:
          'inline-flex items-center justify-center font-semibold px-4 py-2 bg-white/20 text-white hover:bg-white/30 border border-white/30 transition',
        progressWrapperClass: 'flex items-center justify-center w-full max-w-2xl mx-auto mb-6 gap-2',
        progressTrackClass: 'h-1 flex-1 rounded-full bg-white/20',
        progressThumbClass: 'h-1 rounded-full bg-[var(--color-primary)]',
      };
  }
};

export const resolveReservationTheme = (
  settings: ReservationSetting | null
): ReservationThemeTokens => {
  const requestedKey = settings?.uiTheme
    ? themeKeyMap[settings.uiTheme] || 'minimal'
    : 'minimal';

  const base = getBaseTheme(requestedKey);
  const overrides = settings?.theme;

  const radiusClass = overrides?.radius
    ? radiusMap[overrides.radius]
    : base.radiusClass;
  const shadowClass = overrides?.elevation
    ? elevationMap[overrides.elevation]
    : base.shadowClass;
  const typography = overrides?.typographyScale
    ? typographyScaleMap[overrides.typographyScale]
    : { className: base.fontBaseClass, scale: base.fontSizeScale };

  const primaryColor = overrides?.primary ?? base.primaryColor;
  const accentColor = overrides?.accent ?? base.accentColor;
  const surfaceColor = overrides?.surface ?? base.surfaceColor;
  const backgroundColor = overrides?.background ?? base.backgroundColor;
  const textPrimaryColor = overrides?.textPrimary ?? base.textPrimaryColor;
  const textSecondaryColor = overrides?.textSecondary ?? base.textSecondaryColor;
  const successColor = overrides?.success ?? base.successColor;
  const dangerColor = overrides?.danger ?? base.dangerColor;

  return {
    ...base,
    primaryColor,
    accentColor,
    surfaceColor,
    backgroundColor,
    textPrimaryColor,
    textSecondaryColor,
    successColor,
    dangerColor,
    radiusClass,
    shadowClass,
    fontClass: base.fontClass,
    fontBaseClass: typography.className,
    fontSizeScale: typography.scale,
    cardClass: `${base.cardBaseClass} ${radiusClass} ${shadowClass}`,
    buttonPrimaryClass: `${base.buttonPrimaryClass} ${radiusClass}`,
    buttonSecondaryClass: `${base.buttonSecondaryClass} ${radiusClass}`,
    progressTrackClass: `${base.progressTrackClass} ${radiusClass}`,
    progressThumbClass: `${base.progressThumbClass} ${radiusClass}`,
    pageWrapperClass: `${base.pageWrapperClass} ${base.fontClass}`,
  };
};

