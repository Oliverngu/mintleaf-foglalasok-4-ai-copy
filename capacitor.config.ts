import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'hu.mintleaf.app',
  appName: 'Mintleaf',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
