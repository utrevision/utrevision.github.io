import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * Firebase web config is public by design. Access is limited by Auth and
 * Firestore rules, not by hiding this key.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyCtJHAWaJyZXo8lpaHEowh7BOXa0-5E8Sc',
  authDomain: 'wenyan-quiz-web.firebaseapp.com',
  projectId: 'wenyan-quiz-web',
  storageBucket: 'wenyan-quiz-web.firebasestorage.app',
  messagingSenderId: '215594347562',
  appId: '1:215594347562:web:4a677dd40180c7a480e753',
};

export const app = initializeApp(firebaseConfig);
enableAppCheck();
export const auth = getAuth(app);
auth.languageCode = 'zh-TW';
export const db = getFirestore(app);

export const GOOGLE_PROVIDER_URL =
  'https://console.firebase.google.com/project/wenyan-quiz-web/authentication/providers';

export const AUTHORIZED_DOMAINS_URL =
  'https://console.firebase.google.com/project/wenyan-quiz-web/authentication/settings';

/**
 * App Check is optional until a site key is provided at build time.
 * Firebase AI Logic rejects unprotected clients once enforcement is on.
 */
function enableAppCheck(): void {
  const siteKey = import.meta.env.VITE_APPCHECK_RECAPTCHA_SITE_KEY?.trim();
  if (!siteKey || typeof self === 'undefined') return;

  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN?.trim();
  if (import.meta.env.DEV && debugToken) {
    (self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      debugToken === 'true' ? true : debugToken;
  }

  const provider =
    import.meta.env.VITE_APPCHECK_PROVIDER?.trim() === 'v3'
      ? new ReCaptchaV3Provider(siteKey)
      : new ReCaptchaEnterpriseProvider(siteKey);

  initializeAppCheck(app, {
    provider,
    isTokenAutoRefreshEnabled: true,
  });
}
