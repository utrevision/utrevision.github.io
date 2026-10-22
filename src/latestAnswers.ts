import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase.ts';
import { LATEST_ANSWERS, planLatestAnswerWrite } from './lib/latestAnswerPayload.ts';
import type { QuizId } from './types.ts';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(id);
        resolve(value);
      },
      (caught: unknown) => {
        clearTimeout(id);
        reject(caught);
      },
    );
  });
}

function permissionDenied(): Error {
  return Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
}

/** Firestore rejects the call with permission-denied when the ID token is missing. */
async function requireSignedIn(uid: string): Promise<void> {
  await auth.authStateReady();
  const current = auth.currentUser;
  if (!current || current.uid !== uid) throw permissionDenied();
  await current.getIdToken();
}

/**
 * Overwrite this user's one answer snapshot for the quiz.
 * Called on every successful finish, including when `saveAttempt` keeps the
 * previous best score. `setDoc` replaces the document so `hasOnly` still holds.
 */
export async function saveLatestAnswers(input: {
  uid: string;
  displayName: string | null;
  quizId: QuizId;
  score: number;
  total: number;
  durationMs: number;
  answers: Readonly<Record<string, string>>;
}): Promise<void> {
  const planned = planLatestAnswerWrite(input);
  await requireSignedIn(planned.data.uid);
  await withTimeout(
    setDoc(doc(db, LATEST_ANSWERS, planned.id), {
      ...planned.data,
      finishedAt: serverTimestamp(),
    }),
    12000,
  );
}
