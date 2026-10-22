/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPCHECK_RECAPTCHA_SITE_KEY?: string;
  readonly VITE_APPCHECK_PROVIDER?: string;
  readonly VITE_APPCHECK_DEBUG_TOKEN?: string;
  /** Teacher inbox named in the flag email. Defaults to lkh81397@gmail.com. */
  readonly VITE_FLAG_NOTIFY_EMAIL?: string;
  /** Formspree form id, or the full https://formspree.io/f/<id> URL. Public in the built site. */
  readonly VITE_FLAG_FORMSPREE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
