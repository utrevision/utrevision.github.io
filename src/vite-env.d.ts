/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPCHECK_RECAPTCHA_SITE_KEY?: string;
  readonly VITE_APPCHECK_PROVIDER?: string;
  readonly VITE_APPCHECK_DEBUG_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
