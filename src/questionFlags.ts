import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { auth, db } from './firebase.ts';
import {
  normalizeQuestionFlag,
  questionFlagDocument,
  sendFlagEmail,
  type FlagEmailStatus,
  type NormalizedQuestionFlag,
  type QuestionFlagInput,
} from './lib/questionFlag.ts';

export const QUESTION_FLAGS = 'questionFlags';

const WRITE_TIMEOUT_MS = 12_000;

function permissionDenied(): Error {
  return Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
}

async function requireSignedIn(uid: string): Promise<void> {
  await auth.authStateReady();
  const current = auth.currentUser;
  if (!current || current.uid !== uid) throw permissionDenied();
  await current.getIdToken();
}

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

function toFlagError(error: unknown): Error {
  if (error instanceof Error && error.message === 'timeout') {
    return new Error('回報逾時，請再試一次。');
  }
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code: unknown }).code)
      : error instanceof Error
        ? error.message
        : '';
  if (code.includes('permission-denied')) {
    return new Error('沒有權限回報題目。請確認已登入，以及 Firestore 規則已部署。');
  }
  if (code.includes('unavailable') || code.includes('network')) {
    return new Error('網絡連線失敗，請稍後再試。');
  }
  return new Error('回報未能記下，請再試一次。');
}

/**
 * Saves a question flag for the signed-in student, then returns whether the
 * teacher email was sent. Email failure still keeps the Firestore audit doc.
 * The button should stay enabled only when this function throws.
 */
export async function submitQuestionFlag(
  input: QuestionFlagInput,
  mail: (draft: NormalizedQuestionFlag) => Promise<FlagEmailStatus> = sendFlagEmail,
): Promise<FlagEmailStatus> {
  const draft = normalizeQuestionFlag(input);
  try {
    await requireSignedIn(draft.uid);
    const emailStatus = await mail(draft);
    await withTimeout(
      addDoc(
        collection(db, QUESTION_FLAGS),
        questionFlagDocument(draft, emailStatus, {
          finishedAt: Timestamp.fromDate(draft.finishedAt),
          createdAt: serverTimestamp(),
        }),
      ),
      WRITE_TIMEOUT_MS,
    );
    return emailStatus;
  } catch (error) {
    throw toFlagError(error);
  }
}
