import { getAI, getGenerativeModel, GoogleAIBackend, Schema, ThinkingLevel, type GenerativeModel } from 'firebase/ai';
import { app } from '../firebase.ts';
import { GRADING_MODEL, AI_GRADE_TIMEOUT_MS, gradingSystemInstruction, gradingUserPrompt } from './aiPrompt.ts';
import { parseAiVerdict, type AiGradeRequest, type AiJudge, type AiJudgeContext } from './resolveGrade.ts';

const verdictSchema = Schema.object({
  properties: {
    score: Schema.enumString({
      enum: ['0', '1'],
      description: '1 只代表與某個滿分答案同義。其餘一律 0。沒有 0.5。',
    }),
    reason: Schema.string({
      description: '一句中文理由，不超過 40 字，供除錯。',
    }),
  },
  optionalProperties: ['reason'],
});

let useMinimalThinking = true;
let cached: GenerativeModel | undefined;
let cachedThinking = true;

function gradingModel(): GenerativeModel {
  if (cached && cachedThinking === useMinimalThinking) return cached;
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  cached = getGenerativeModel(
    ai,
    {
      model: GRADING_MODEL,
      systemInstruction: gradingSystemInstruction(),
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: verdictSchema,
        maxOutputTokens: 1024,
        ...(useMinimalThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } : {}),
      },
    },
    { timeout: AI_GRADE_TIMEOUT_MS },
  );
  cachedThinking = useMinimalThinking;
  return cached;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  return String(error);
}

async function generateVerdict(input: AiGradeRequest, context: AiJudgeContext) {
  try {
    return await gradingModel().generateContent(gradingUserPrompt(input), {
      signal: context.signal,
      timeout: AI_GRADE_TIMEOUT_MS,
    });
  } catch (error) {
    if (!useMinimalThinking || context.signal.aborted || !/thinking/i.test(errorText(error))) {
      throw error;
    }
    useMinimalThinking = false;
    cached = undefined;
    return gradingModel().generateContent(gradingUserPrompt(input), {
      signal: context.signal,
      timeout: AI_GRADE_TIMEOUT_MS,
    });
  }
}

/** Gemini Developer API via Firebase AI Logic. Call only after the student is signed in. */
export const firebaseAiJudge: AiJudge = async (input, context) => {
  const result = await generateVerdict(input, context);
  const verdict = parseAiVerdict(result.response.text());
  if (verdict.reason) {
    console.info(`[智能判分] ${input.target}／${input.student} → ${verdict.score} ${verdict.reason}`);
  }
  return verdict;
};
