/// <reference types="vite/client" />

declare global {
  interface Window {
    soilData?: {
      N: any;
      P: any;
      K: any;
      Moisture: any;
      pH: any;
      EC: any;
      Temperature: any;
      timestamp?: any;
    };
  }
}
