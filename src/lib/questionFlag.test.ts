import { describe, expect, it, vi } from 'vitest';
import { getLongQuiz } from '../data/longQuizzes.ts';
import {
  DEFAULT_FLAG_NOTIFY_EMAIL,
  FLAG_LIMITS,
  QUESTION_FLAG_FIELDS,
  clipFlagText,
  flagEmailMessage,
  flagNotifyEmail,
  formspreeFormId,
  glossFlagQuestion,
  longFlagQuestion,
  normalizeQuestionFlag,
  questionFlagDocument,
  sendFlagEmail,
  type QuestionFlagInput,
} from './questionFlag.ts';

const finishedAt = new Date('2026-10-22T00:43:00.000Z');

function input(overrides: Partial<QuestionFlagInput> = {}): QuestionFlagInput {
  return {
    quizId: 'lianpo',
    quizTitle: '《廉頗藺相如列傳》溫習小測（語譯）',
    itemId: 'gloss:束:而束君歸趙矣',
    qNo: '3',
    stem: '而束君歸趙矣',
    target: '束',
    studentAnswer: '綁住',
    suggestedAnswer: '束縛、綁',
    pointsNote: '',
    score: 0,
    max: 1,
    outcome: '錯',
    finishedAt,
    uid: 'student-1',
    displayName: '陳同學',
    studentEmail: 'student@example.com',
    ...overrides,
  };
}

describe('question flag payload', () => {
  it('names the default teacher inbox and accepts a valid override', () => {
    expect(DEFAULT_FLAG_NOTIFY_EMAIL).toBe('lkh81397@gmail.com');
    expect(flagNotifyEmail(undefined)).toBe(DEFAULT_FLAG_NOTIFY_EMAIL);
    expect(flagNotifyEmail('')).toBe(DEFAULT_FLAG_NOTIFY_EMAIL);
    expect(flagNotifyEmail('not-an-email')).toBe(DEFAULT_FLAG_NOTIFY_EMAIL);
    expect(flagNotifyEmail(' teacher@example.com ')).toBe('teacher@example.com');
  });

  it('reads a Formspree id from a bare id or an endpoint URL', () => {
    expect(formspreeFormId(' abcd1234 ')).toBe('abcd1234');
    expect(formspreeFormId('https://formspree.io/f/mwkgyldj')).toBe('mwkgyldj');
    expect(formspreeFormId('https://formspree.io/f/mwkgyldj/')).toBe('mwkgyldj');
    expect(formspreeFormId('')).toBe('');
  });

  it('clips long text and keeps a blank display name readable', () => {
    expect(clipFlagText('  綁住  ', 10)).toBe('綁住');
    expect(clipFlagText('甲'.repeat(FLAG_LIMITS.stem + 5), FLAG_LIMITS.stem)).toHaveLength(FLAG_LIMITS.stem);
    expect(clipFlagText('甲'.repeat(20), 4).endsWith('…')).toBe(true);

    const draft = normalizeQuestionFlag(
      input({
        displayName: '   ',
        studentEmail: 'not an email',
        studentAnswer: '',
        stem: '句'.repeat(FLAG_LIMITS.stem + 8),
      }),
    );
    expect(draft.displayName).toBe('未命名');
    expect(draft.studentEmail).toBe('');
    expect(draft.studentAnswer).toBe('');
    expect(draft.stem).toHaveLength(FLAG_LIMITS.stem);
    expect(draft.notifyEmail).toBe(DEFAULT_FLAG_NOTIFY_EMAIL);
  });

  it('rejects a score that is not a half-point step', () => {
    expect(() => normalizeQuestionFlag(input({ score: 0.2 }))).toThrow('回報未能記下');
  });

  it('puts a short notice in the email and keeps the full audit document', () => {
    const draft = normalizeQuestionFlag(input());
    expect(flagEmailMessage(draft)).toBe(
      [
        '文言溫習小測：有學生在結算頁回報題目，請檢視是否需要修訂。',
        '',
        '小測：《廉頗藺相如列傳》溫習小測（語譯）',
        '題號：3',
        '題號是這一次結算表上的次序（語譯題目有打亂），請以題幹和考查字認題。',
        '題幹：而束君歸趙矣',
        '考查：束',
        '學生答案：綁住',
        '建議答案：束縛、綁',
        '結果：錯（0／1）',
        '學生：陳同學',
        '學生電郵：student@example.com',
      ].join('\n'),
    );

    const blank = flagEmailMessage(
      normalizeQuestionFlag(input({ studentAnswer: '', target: '', studentEmail: '  ', pointsNote: '對 廷見（1／1）' })),
    );
    expect(blank).toContain('學生答案：（空白）');
    expect(blank).toContain('考查：（無）');
    expect(blank).not.toContain('學生電郵');
    expect(blank).not.toContain('quizId');
    expect(blank).not.toContain('題目 id');
    expect(blank).not.toContain('uid');
    expect(blank).not.toContain('按點');
    expect(blank).not.toContain('廷見');
    expect(blank).not.toContain('完成時間');
    expect(blank).not.toContain('通知信箱');
    expect(blank).not.toContain('lkh81397@gmail.com');
    expect(blank).not.toContain('student-1');

    const document = questionFlagDocument(draft, 'skipped', { finishedAt: 'finish', createdAt: 'created' });
    expect(Object.keys(document).sort()).toEqual([...QUESTION_FLAG_FIELDS].sort());
    expect(document).toMatchObject({
      quizId: 'lianpo',
      itemId: 'gloss:束:而束君歸趙矣',
      uid: 'student-1',
      pointsNote: '',
      studentEmail: 'student@example.com',
      emailStatus: 'skipped',
      notifyEmail: DEFAULT_FLAG_NOTIFY_EMAIL,
      finishedAt: 'finish',
      createdAt: 'created',
      studentAnswer: '綁住',
    });
  });

  it('builds gloss and long-paper questions from the settlement row', () => {
    expect(glossFlagQuestion({ stem: '而束君歸趙矣', target: '束', raw: '綁住', score: 0.5, suggested: '束縛' }, 2)).toMatchObject({
      qNo: '3',
      outcome: '半分',
      max: 1,
      itemId: 'gloss:束:而束君歸趙矣',
    });

    const paper = getLongQuiz('lianpo-longq-2');
    const item = paper?.items.find((entry) => entry.id === 'q5');
    const question = longFlagQuestion(
      {
        itemId: 'q5',
        qNo: '5',
        title: '5　句譯',
        yours: '',
        suggested: '終於在朝廷上接見',
        score: 1,
        max: 3,
        aiUnavailable: true,
        points: [{ id: 'p1', desc: '廷見', max: 1, hit: true, awarded: 1, evidence: '朝廷' }],
      },
      item,
    );
    expect(question.stem).toContain('卒廷見相如');
    expect(question.outcome).toBe('半分');
    expect(question.pointsNote).toContain('對 廷見（1／1）');
    expect(question.pointsNote).toContain('證據：朝廷');
    expect(question.pointsNote).toContain('未能完成智能評分');
    const longDraft = normalizeQuestionFlag({ ...input(), ...question, quizId: 'lianpo-longq-2' });
    const longMessage = flagEmailMessage(longDraft);
    expect(longMessage).toContain('題號：5');
    expect(longMessage).toContain('題號是卷面題號');
    expect(longMessage).not.toContain('語譯題目有打亂');
    expect(longMessage).not.toContain('按點');
    expect(longMessage).not.toContain('對 廷見');
    expect(longMessage).not.toContain('證據：朝廷');
    expect(longMessage).not.toContain('未能完成智能評分');
    expect(longMessage).not.toContain('lianpo-longq-2');
    expect(questionFlagDocument(longDraft, 'sent', { finishedAt: 'finish', createdAt: 'created' }).pointsNote).toContain(
      '對 廷見（1／1）',
    );
  });
});

describe('formspree relay', () => {
  it('skips the network when no form id is configured', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const status = await sendFlagEmail(normalizeQuestionFlag(input()), { formId: '', fetchImpl });
    expect(status).toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not call a non-Formspree address', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const status = await sendFlagEmail(normalizeQuestionFlag(input()), {
      formId: 'https://evil.example/f/abcd1234',
      fetchImpl,
    });
    expect(status).toBe('failed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts the revision email and reports failure without throwing', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const draft = normalizeQuestionFlag(input());
    const sent = await sendFlagEmail(draft, { formId: 'mwkgyldj', fetchImpl });
    expect(sent).toBe('sent');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://formspree.io/f/mwkgyldj');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    expect(body._subject).toBe('題目回報｜《廉頗藺相如列傳》溫習小測（語譯）｜第3題');
    expect(body.message).toContain('學生：陳同學');
    expect(body.message).toContain('學生電郵：student@example.com');
    expect(body.message).not.toContain('uid');
    expect(body.message).not.toContain('通知信箱');
    expect(body._replyto).toBe('student@example.com');
    expect(body._gotcha).toBe('');

    const anonymous = await sendFlagEmail(normalizeQuestionFlag(input({ studentEmail: '' })), {
      formId: 'mwkgyldj',
      fetchImpl,
    });
    expect(anonymous).toBe('sent');
    const anonymousBody = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body)) as Record<string, string>;
    expect(anonymousBody.message).not.toContain('學生電郵');
    expect(anonymousBody._replyto).toBeUndefined();

    fetchImpl.mockResolvedValueOnce(new Response('no', { status: 422 }));
    await expect(sendFlagEmail(draft, { formId: 'mwkgyldj', fetchImpl })).resolves.toBe('failed');
    fetchImpl.mockRejectedValueOnce(new Error('network'));
    await expect(sendFlagEmail(draft, { formId: 'mwkgyldj', fetchImpl })).resolves.toBe('failed');
  });
});
