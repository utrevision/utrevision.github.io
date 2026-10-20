export type QuizId = 'lianpo' | '8passages';

export type QuizItem = {
  stem: string;
  target: string;
  answers: string[];
  accept1?: string[];
  accept05?: string[];
};

export type Quiz = {
  id: QuizId;
  title: string;
  items: QuizItem[];
};

export type Score = 0 | 0.5 | 1;

export type AttemptRecord = {
  id: string;
  uid: string;
  displayName: string;
  quizId: QuizId;
  score: number;
  total: number;
  hitRate: number;
  durationMs: number;
  finishedAt: Date | null;
};
