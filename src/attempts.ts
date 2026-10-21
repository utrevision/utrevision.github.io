import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { QUIZ_TOTALS } from './data/quizzes.ts';
import { auth, db } from './firebase.ts';
import { attemptDurationMs, attemptHitRate, normalizeAttemptScore } from './lib/attemptPayload.ts';
import { compareAttempts, planBestAttemptWrite, selectBestByUser } from './lib/rank.ts';
import type { AttemptRecord, QuizId } from './types.ts';

const ATTEMPTS = 'attempts';

export function attemptDisplayName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '未命名';
  return trimmed.slice(0, 80);
}

export function firestoreErrorMessage(error: unknown, kind: 'save' | 'delete' = 'save'): string {
  if (error instanceof Error && error.message === 'timeout') {
    return kind === 'delete' ? '刪除紀錄逾時，請稍後再試。' : '寫入排行榜逾時。成績仍留在本頁，請稍後再試。';
  }
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  if (code.includes('permission-denied')) {
    return kind === 'delete'
      ? '沒有權限刪除這筆紀錄。'
      : '沒有權限讀寫排行榜。請確認已登入，以及 Firestore 規則已部署。';
  }
  if (code.includes('unavailable') || code.includes('network')) {
    return '網絡連線失敗，請稍後再試。';
  }
  return kind === 'delete' ? '暫時未能刪除紀錄，請再試一次。' : '排行榜暫時未能更新，請再試一次。';
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

function permissionDenied(): Error {
  return Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
}

/** Firestore rejects the call with permission-denied when the ID token is missing. */
async function requireSignedIn(uid?: string): Promise<void> {
  await auth.authStateReady();
  const current = auth.currentUser;
  if (!current || (uid != null && current.uid !== uid)) throw permissionDenied();
  await current.getIdToken();
}

async function ownAttemptDocs(uid: string): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const snapshot = await withTimeout(
    getDocs(query(collection(db, ATTEMPTS), where('uid', '==', uid))),
    12000,
  );
  return snapshot.docs;
}

export async function saveAttempt(input: {
  uid: string;
  displayName: string | null;
  quizId: QuizId;
  score: number;
  total: number;
  durationMs: number;
}): Promise<{ recorded: boolean }> {
  if (
    !Number.isFinite(input.score) ||
    !Number.isFinite(input.durationMs) ||
    input.total !== QUIZ_TOTALS[input.quizId]
  ) {
    throw new Error('成績資料不完整');
  }
  const score = normalizeAttemptScore(input.score, input.total);
  const durationMs = attemptDurationMs(input.durationMs);
  await requireSignedIn(input.uid);

  const ownDocs = await ownAttemptDocs(input.uid);
  const existing = ownDocs
    .filter((docSnap) => docSnap.data().quizId === input.quizId)
    .map((docSnap) => ({
      id: docSnap.id,
      score: Number(docSnap.data().score ?? 0),
      durationMs: Number(docSnap.data().durationMs ?? 0),
    }));
  const plan = planBestAttemptWrite(existing, { score, durationMs });
  if (!plan.recorded && plan.deleteIds.length === 0) {
    return { recorded: false };
  }

  const batch = writeBatch(db);
  if (plan.recorded) {
    const payload = {
      uid: input.uid,
      displayName: attemptDisplayName(input.displayName),
      quizId: input.quizId,
      score,
      total: input.total,
      hitRate: attemptHitRate(score, input.total),
      durationMs,
      finishedAt: serverTimestamp(),
    };
    // set() replaces the document. update() would merge leftover fields and then
    // fail hasOnly() in the rules.
    const ref = plan.updateId ? doc(db, ATTEMPTS, plan.updateId) : doc(collection(db, ATTEMPTS));
    batch.set(ref, payload);
  }
  for (const id of plan.deleteIds) batch.delete(doc(db, ATTEMPTS, id));
  await withTimeout(batch.commit(), 12000);
  return { recorded: plan.recorded };
}

/** Removes every attempt this user stored for one quiz, including older duplicates. */
export async function deleteMyQuizAttempts(quizId: QuizId, uid: string): Promise<void> {
  await requireSignedIn(uid);
  const ids = (await ownAttemptDocs(uid))
    .filter((docSnap) => docSnap.data().quizId === quizId)
    .map((docSnap) => docSnap.id);
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  for (const id of ids) batch.delete(doc(db, ATTEMPTS, id));
  await withTimeout(batch.commit(), 12000);
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

export async function loadLeaderboard(quizId: QuizId): Promise<AttemptRecord[]> {
  await requireSignedIn();
  const snapshot = await withTimeout(
    getDocs(query(collection(db, ATTEMPTS), where('quizId', '==', quizId))),
    12000,
  );
  const rows: AttemptRecord[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.quizId !== quizId) continue;
    rows.push({
      id: doc.id,
      uid: String(data.uid ?? ''),
      displayName: attemptDisplayName(typeof data.displayName === 'string' ? data.displayName : ''),
      quizId,
      score: Number(data.score ?? 0),
      total: Number(data.total ?? 0),
      hitRate: Number(data.hitRate ?? 0),
      durationMs: Number(data.durationMs ?? 0),
      finishedAt: toDate(data.finishedAt),
    });
  }
  return selectBestByUser(rows).sort(compareAttempts);
}
