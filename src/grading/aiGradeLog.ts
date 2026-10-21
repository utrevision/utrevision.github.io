import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.ts';
import type { QuizId } from '../types.ts';
import type { AiGradeRequest, AiScore, AiVerdict } from './resolveGrade.ts';

export const AI_GRADE_LOGS = 'aiGradeLogs';

export type AiGradeLogInput = {
  uid: string;
  quizId: QuizId;
  stem: string;
  target: string;
  student: string;
  score: AiScore;
  reason: string;
};

/**
 * A log row only when Gemini returned a non-empty reason.
 * Blank answers and literal grades never reach this helper.
 */
export function aiGradeLogInput(
  request: AiGradeRequest,
  verdict: AiVerdict,
  meta: { uid?: string; quizId?: QuizId },
): AiGradeLogInput | null {
  const reason = verdict.reason?.trim().slice(0, 80) ?? '';
  const uid = meta.uid?.trim() ?? '';
  if (!reason || !uid || !meta.quizId) return null;
  if (verdict.score !== 0 && verdict.score !== 1) return null;
  const stem = request.stem.trim();
  const target = request.target.trim();
  const student = request.student.trim().slice(0, 80);
  if (!stem || !target || !student) return null;
  return {
    uid,
    quizId: meta.quizId,
    stem,
    target,
    student,
    score: verdict.score,
    reason,
  };
}

export async function saveAiGradeLog(entry: AiGradeLogInput): Promise<void> {
  await addDoc(collection(db, AI_GRADE_LOGS), {
    uid: entry.uid,
    quizId: entry.quizId,
    stem: entry.stem,
    target: entry.target,
    student: entry.student,
    score: entry.score,
    reason: entry.reason,
    createdAt: serverTimestamp(),
  });
}
