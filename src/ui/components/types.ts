export interface ThemeStyles {
  glassContainer: string;
  glassPanel: string;
  radius: string;
  headingFont: string;
  headingColor: string;
  bodyFont: string;
  textColor: string;
  mutedColor: string;
  divider: string;
  accentBg: string;
  accentColor: string;
  buttonPrimary: string;
  buttonSecondary: string;
  input: string;
}

export interface Theme {
  styles: ThemeStyles;
}

export interface ReservationData {
  name: string;
  date: string;
  time: string;
  guests: number;
  email: string;
  phone: string;
  notes?: string;
}
