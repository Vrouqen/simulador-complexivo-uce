// Tipos compartidos entre servidor y cliente.

export type Bank = {
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  subjects: string[];
  sizes: number[];
  defaultSize: number;
  total: number;
};

export type AttemptConfig = {
  mode: "normal" | "saved";
  size: number;
  subjects: string[];
  minutesPerQuestion: number; // 0 = sin límite
  shuffleOptions: boolean;
  order: "mix" | "group";
  feedback: boolean;
  preferUnseen: boolean;
};

export type PublicQuestion = {
  index: number;
  id: string;
  subject: string;
  q: string;
  opts: string[];
  level: string | null;
  kind: string | null;
};

export type Graded = {
  correct: number;
  isCorrect: boolean;
  exp: string;
  quote: string | null;
  source: string | null;
  slide: string | null;
  basis: string | null;
};

export type AttemptView = {
  id: string;
  bank: string;
  config: AttemptConfig;
  startedAt: string;
  deadline: string | null;
  serverNow: string;
  questions: PublicQuestion[];
  answers: Record<string, number>;
  flags: number[];
  graded: Record<number, Graded>;
};

export type ReviewItem = PublicQuestion & {
  answer: number | null;
  flagged: boolean;
  saved: boolean;
  correct: number;
  exp: string;
  quote: string | null;
  source: string | null;
  slide: string | null;
  basis: string | null;
};

export type Review = {
  id: string;
  bank: string;
  bankTitle: string;
  mode: string;
  startedAt: string;
  submittedAt: string;
  total: number;
  correct: number;
  answered: number;
  score: number;
  passScore: number;
  bySubject: { subject: string; correct: number; total: number }[];
  items: ReviewItem[];
};

export type BankStats = {
  saved: number;
  seen: number;
  history: { id: string; submitted_at: string; total: number; correct: number; score: number; mode: string }[];
};
