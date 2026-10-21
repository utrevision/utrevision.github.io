import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { canonicalQuizTotal } from './data/quizzes.ts';
import { db } from './firebase.ts';
import { withCanonicalTotal } from './lib/canonicalAttempt.ts';
import { compareAttempts } from './lib/rank.ts';
import type { AttemptRecord, QuizId } from './types.ts';

const ATTEMPTS = 'attempts';

export function attemptDisplayName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '未命名';
  return trimmed.slice(0, 80);
}

export function firestoreErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'timeout') {
    return '寫入排行榜逾時。成績仍留在本頁，請稍後再試。';
  }
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  if (code.includes('permission-denied')) {
    return '沒有權限讀寫排行榜。請確認已登入，以及 Firestore 規則已部署。';
  }
  if (code.includes('unavailable') || code.includes('network')) {
    return '網絡連線失敗，請稍後再試。';
  }
  return '排行榜暫時未能更新，請再試一次。';
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

export async function saveAttempt(input: {
  uid: string;
  displayName: string | null;
  quizId: QuizId;
  score: number;
  total: number;
  durationMs: number;
}): Promise<void> {
  const durationMs = Math.round(input.durationMs);
  const total = canonicalQuizTotal(input.quizId);
  if (input.total !== total || !Number.isFinite(input.score) || input.score < 0 || input.score > total || durationMs < 0) {
    throw new Error('成績資料不完整');
  }
  await withTimeout(addDoc(collection(db, ATTEMPTS), {
    uid: input.uid,
    displayName: attemptDisplayName(input.displayName),
    quizId: input.quizId,
    score: input.score,
    total,
    hitRate: input.score / total,
    durationMs,
    finishedAt: serverTimestamp(),
  }), 12000);
}

export async function deleteAttempt(id: string): Promise<void> {
  const attemptId = id.trim();
  if (!attemptId) throw new Error('缺少紀錄編號');
  await withTimeout(deleteDoc(doc(db, ATTEMPTS, attemptId)), 12000);
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

export async function loadLeaderboard(quizId: QuizId): Promise<AttemptRecord[]> {
  const snapshot = await withTimeout(
    getDocs(query(collection(db, ATTEMPTS), where('quizId', '==', quizId))),
    12000,
  );
  const rows: AttemptRecord[] = [];
  for (const entry of snapshot.docs) {
    const data = entry.data();
    if (data.quizId !== quizId) continue;
    rows.push(withCanonicalTotal({
      id: entry.id,
      uid: String(data.uid ?? ''),
      displayName: attemptDisplayName(typeof data.displayName === 'string' ? data.displayName : ''),
      quizId,
      score: Number(data.score ?? 0),
      total: Number(data.total ?? 0),
      hitRate: Number(data.hitRate ?? 0),
      durationMs: Number(data.durationMs ?? 0),
      finishedAt: toDate(data.finishedAt),
    }));
  }
  return rows.sort(compareAttempts);
}
