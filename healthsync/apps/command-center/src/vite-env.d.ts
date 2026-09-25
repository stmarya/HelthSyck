/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAP_PROVIDER?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_MAP_ACCESS_TOKEN?: string;
  readonly VITE_ROUTING_URL?: string;
  readonly VITE_LOCATION_STALE_AFTER_MS?: string;
  readonly VITE_TURN_URL?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
  readonly VITE_AUTH_URL?: string;
  readonly VITE_PATIENT_URL?: string;
  readonly VITE_CONSULTATION_URL?: string;
  readonly VITE_PRESCRIPTION_URL?: string;
  readonly VITE_AMBULANCE_URL?: string;
  readonly VITE_REFERRAL_URL?: string;
  readonly VITE_HOSPITAL_URL?: string;
  readonly VITE_PHARMACY_URL?: string;
  readonly VITE_NOTIFICATION_URL?: string;
  readonly VITE_ALERT_URL?: string;
  readonly VITE_IOT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __HEALTHSYNC_CONFIG__?: Record<string, string | undefined>;
}

// CSS Modules
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
