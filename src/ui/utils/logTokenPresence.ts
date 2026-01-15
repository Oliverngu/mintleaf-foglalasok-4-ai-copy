export const logTokenPresence = (token?: string | null): 'present' | 'none' =>
  token ? 'present' : 'none';
