import { describe, expect, it } from 'vitest';
import rules from '../firestore.rules?raw';
import {
  MAX_LATEST_ANSWER_ENTRIES,
  MAX_LATEST_ANSWER_KEYS_TEXT_CHARS,
  MAX_LATEST_ANSWERS_TEXT_CHARS,
} from './lib/latestAnswerPayload.ts';

describe('firestore attempt rules', () => {
  it('requires 65 for lianpo, 100 for 8passages, and 30 marks for the long paper', () => {
    expect(rules).toMatch(/quizId == 'lianpo'\s*\?\s*65/);
    expect(rules).toContain("attemptData().quizId == '8passages'");
    expect(rules).toContain('? 100');
    expect(rules).toContain("attemptData().quizId == 'lianpo-longq-1'");
    expect(rules).toContain("attemptData().quizId == 'lianpo-longq-2'");
    expect(rules).toContain("attemptData().quizId == 'lianpo-longq-3'");
    expect(rules).toContain("attemptData().quizId == 'eight-longq-1'");
    expect(rules).toContain('? 30');
    expect(rules).toContain("'lianpo-longq-1'");
    expect(rules).toContain("'lianpo-longq-2'");
    expect(rules).toContain("'lianpo-longq-3'");
    expect(rules).toContain("'eight-longq-1'");
    expect(rules).not.toContain('66');
  });

  it('accepts a real hit rate and the truncating integer quotient', () => {
    expect(rules).toContain('float(attemptData().score) / float(attemptData().total)');
    expect(rules).toContain('math.floor(float(attemptData().score) / float(attemptData().total))');
    expect(rules).not.toContain('attemptData().hitRate == (attemptData().score / attemptData().total)');
  });

  it('lets the owner delete their own attempt', () => {
    expect(rules).toMatch(/allow delete: if isSignedIn\(\) && resource\.data\.uid == request\.auth\.uid/);
  });

  it('lets a signed-in user create their own aiGradeLogs and nothing else', () => {
    expect(rules).toContain('match /aiGradeLogs/{logId}');
    expect(rules).toMatch(/match \/aiGradeLogs\/\{logId\} \{\s*allow create: if isSignedIn\(\) && isValidGradeLog\(\);\s*\}/);
    expect(rules).toContain('gradeLogData().reason.size() > 0');
    expect(rules).toContain('gradeLogData().score == 0 || gradeLogData().score == 1');
    expect(rules).toContain('gradeLogData().uid == request.auth.uid');
    expect(rules).not.toMatch(/match \/aiGradeLogs\/\{logId\} \{[^}]*allow (read|update|delete)/);
  });

  it('lets any signed-in user read latestAnswers and only the owner write their own doc', () => {
    const block = rules.slice(rules.indexOf('match /latestAnswers/{answerId}'));
    const nextMatch = block.indexOf('\n    match ');
    const body = nextMatch === -1 ? block : block.slice(0, nextMatch);
    expect(body).toContain('allow read: if isSignedIn();');
    expect(body).toContain('isValidLatestAnswer()');
    expect(body).toContain("answerId == request.auth.uid + '_' + latestData().quizId");
    expect(body).toContain('latestData().uid == resource.data.uid');
    expect(body).toContain('latestData().quizId == resource.data.quizId');
    expect(body).not.toContain('allow delete');
    const valid = rules.slice(rules.indexOf('function isValidLatestAnswer()'));
    const validBody = valid.slice(0, valid.indexOf('match /latestAnswers/'));
    expect(validBody).toContain('latestData().keys().hasOnly([');
    expect(validBody).toContain("'answers'");
    expect(validBody).not.toContain('hitRate');
    expect(rules).toContain(`latestData().answers.size() <= ${MAX_LATEST_ANSWER_ENTRIES}`);
    expect(rules).toContain(`latestData().answers.keys().join('').size() <= ${MAX_LATEST_ANSWER_KEYS_TEXT_CHARS}`);
    expect(rules).toContain(`latestData().answers.values().join('').size() <= ${MAX_LATEST_ANSWERS_TEXT_CHARS}`);
    expect(rules).toContain('latestData().uid == request.auth.uid');
    expect(rules).toContain("latestData().quizId in ['lianpo', '8passages', 'lianpo-longq-1', 'lianpo-longq-2', 'lianpo-longq-3', 'eight-longq-1']");
  });
});
