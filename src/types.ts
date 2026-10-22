export type QuizId = 'lianpo' | '8passages' | 'lianpo-longq-1' | 'lianpo-longq-2' | 'lianpo-longq-3' | 'eight-longq-1';

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

export type Score = 0 | 1;

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
