import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QUESTION_FLAG_FIELDS, type QuestionFlagInput } from './lib/questionFlag.ts';
import { QUESTION_FLAGS, submitQuestionFlag } from './questionFlags.ts';

const authState = vi.hoisted(() => ({
  uid: 'student-1' as string | null,
}));

vi.mock('./firebase.ts', () => ({
  auth: {
    authStateReady: async () => undefined,
    get currentUser() {
      if (!authState.uid) return null;
      return {
        uid: authState.uid,
        getIdToken: async () => 'token',
      };
    },
  },
  db: { kind: 'db' },
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(async () => ({ id: 'flag-1' })),
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  serverTimestamp: vi.fn(() => 'server-time'),
  Timestamp: {
    fromDate: (date: Date) => ({ iso: date.toISOString() }),
  },
}));

function input(overrides: Partial<QuestionFlagInput> = {}): QuestionFlagInput {
  return {
    quizId: '8passages',
    quizTitle: '指定文言八篇溫習小測（語譯）',
    itemId: 'gloss:使:臣舍人藺相如可使',
    qNo: '2',
    stem: '臣舍人藺相如可使',
    target: '使',
    studentAnswer: '  出使  ',
    suggestedAnswer: '出使',
    pointsNote: '',
    score: 1,
    max: 1,
    outcome: '對',
    finishedAt: new Date('2026-10-22T01:00:00.000Z'),
    uid: 'student-1',
    displayName: '  陳  同學  ',
    studentEmail: 'student@example.com',
    ...overrides,
  };
}

describe('submitQuestionFlag', () => {
  beforeEach(() => {
    authState.uid = 'student-1';
    vi.mocked(addDoc).mockClear();
    vi.mocked(collection).mockClear();
    vi.mocked(serverTimestamp).mockClear();
    vi.mocked(addDoc).mockResolvedValue({ id: 'flag-1' } as Awaited<ReturnType<typeof addDoc>>);
  });

  it('writes the audit doc even when the email relay fails', async () => {
    const mail = vi.fn(async () => 'failed' as const);
    await expect(submitQuestionFlag(input(), mail)).resolves.toBe('failed');
    expect(mail).toHaveBeenCalledOnce();
    expect(collection).toHaveBeenCalledWith(expect.anything(), QUESTION_FLAGS);
    const payload = vi.mocked(addDoc).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([...QUESTION_FLAG_FIELDS].sort());
    expect(payload).toMatchObject({
      uid: 'student-1',
      displayName: '陳 同學',
      quizId: '8passages',
      studentAnswer: '出使',
      emailStatus: 'failed',
      notifyEmail: 'lkh81397@gmail.com',
      createdAt: 'server-time',
    });
    expect(payload.finishedAt).toEqual({ iso: '2026-10-22T01:00:00.000Z' });
  });

  it('records a skipped email when the relay is not configured', async () => {
    const mail = vi.fn(async () => 'skipped' as const);
    await expect(submitQuestionFlag(input(), mail)).resolves.toBe('skipped');
    expect(vi.mocked(addDoc).mock.calls[0]?.[1]).toMatchObject({ emailStatus: 'skipped' });
  });

  it('does not email or write when the signed-in user does not match', async () => {
    authState.uid = 'someone-else';
    const mail = vi.fn(async () => 'sent' as const);
    await expect(submitQuestionFlag(input(), mail)).rejects.toThrow('沒有權限回報問題');
    expect(mail).not.toHaveBeenCalled();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('keeps the button retryable when the write fails after a send attempt', async () => {
    vi.mocked(addDoc).mockRejectedValue(Object.assign(new Error('nope'), { code: 'permission-denied' }));
    const mail = vi.fn(async () => 'sent' as const);
    await expect(submitQuestionFlag(input(), mail)).rejects.toThrow('沒有權限回報問題');
    expect(mail).toHaveBeenCalledOnce();
  });

  it('maps a timeout and does not write an invalid score', async () => {
    vi.mocked(addDoc).mockRejectedValue(new Error('timeout'));
    await expect(submitQuestionFlag(input(), async () => 'sent')).rejects.toThrow('回報逾時，請再試一次。');

    const mail = vi.fn(async () => 'sent' as const);
    await expect(submitQuestionFlag(input({ score: 0.2 }), mail)).rejects.toThrow('回報未能記下');
    expect(mail).not.toHaveBeenCalled();
  });
});
