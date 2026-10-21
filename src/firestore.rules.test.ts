import { describe, expect, it } from 'vitest';
import rules from '../firestore.rules?raw';

describe('firestore attempt rules', () => {
  it('requires 65 for lianpo and 100 for 8passages', () => {
    expect(rules).toMatch(/quizId == 'lianpo'\s*\?\s*65/);
    expect(rules).toContain("attemptData().quizId == '8passages' ? 100");
    expect(rules).not.toContain('66');
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
});
