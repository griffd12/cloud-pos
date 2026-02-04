import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cloudpos.app',
  appName: 'Cloud POS',
  webDir: 'dist/public',
  server: {
    // Default to cloud backend - update for production deployment
    url: process.env.CAPACITOR_SERVER_URL || 'https://bf45f44b-03bc-427b-ac1c-2f61e2b72052-00-3jaa279qam2p9.janeway.replit.dev',
    cleartext: true,
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      signingType: 'apksigner',
    },
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1a1a2e',
      showSpinner: false,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#1a1a2e',
    },
  },
};

export default config;
