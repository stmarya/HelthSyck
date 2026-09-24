/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_URL: string;
  readonly VITE_PATIENT_URL: string;
  readonly VITE_CONSULTATION_URL: string;
  readonly VITE_PRESCRIPTION_URL: string;
  readonly VITE_AMBULANCE_URL: string;
  readonly VITE_REFERRAL_URL: string;
  readonly VITE_HOSPITAL_URL: string;
  readonly VITE_PHARMACY_URL: string;
  readonly VITE_NOTIFICATION_URL: string;
  readonly VITE_ALERT_URL: string;
  readonly VITE_IOT_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// CSS Modules
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
