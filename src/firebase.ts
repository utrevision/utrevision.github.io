import { initializeApp } from 'firebase/app';
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
export const auth = getAuth(app);
auth.languageCode = 'zh-TW';
export const db = getFirestore(app);

export const GOOGLE_PROVIDER_URL =
  'https://console.firebase.google.com/project/wenyan-quiz-web/authentication/providers';

export const AUTHORIZED_DOMAINS_URL =
  'https://console.firebase.google.com/project/wenyan-quiz-web/authentication/settings';
