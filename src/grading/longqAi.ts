import { getAI, getGenerativeModel, GoogleAIBackend, Schema, ThinkingLevel, type GenerativeModel } from 'firebase/ai';
import { app } from '../firebase.ts';
import { GRADING_MODEL } from './aiPrompt.ts';
import { LONGQ_AI_TIMEOUT_MS, parsePointHits, type PointGradeInput, type PointJudge } from './longq.ts';
import { longqSystemInstruction, longqUserPrompt } from './longqPrompt.ts';

const pointSchema = Schema.object({
  properties: {
    pointHits: Schema.array({
      description: '每一個給分點一筆。不要輸出整題分數。',
      items: Schema.object({
        properties: {
          id: Schema.string({ description: '題目給分點 id。' }),
          hit: Schema.boolean({ description: '該點是否表達到。只能 true 或 false。' }),
          evidence: Schema.string({ description: '學生原文短句。未命中用空字串。' }),
        },
        optionalProperties: ['evidence'],
      }),
    }),
  },
});

let useMinimalThinking = true;
let cached: GenerativeModel | undefined;
let cachedThinking = true;

function pointModel(): GenerativeModel {
  if (cached && cachedThinking === useMinimalThinking) return cached;
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  cached = getGenerativeModel(
    ai,
    {
      model: GRADING_MODEL,
      systemInstruction: longqSystemInstruction(),
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: pointSchema,
        maxOutputTokens: 2048,
        ...(useMinimalThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } : {}),
      },
    },
    { timeout: LONGQ_AI_TIMEOUT_MS },
  );
  cachedThinking = useMinimalThinking;
  return cached;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  return String(error);
}

async function generatePoints(input: PointGradeInput, signal: AbortSignal) {
  const prompt = longqUserPrompt(input);
  try {
    return await pointModel().generateContent(prompt, { signal, timeout: LONGQ_AI_TIMEOUT_MS });
  } catch (error) {
    if (!useMinimalThinking || signal.aborted || !/thinking/i.test(errorText(error))) throw error;
    useMinimalThinking = false;
    cached = undefined;
    return pointModel().generateContent(prompt, { signal, timeout: LONGQ_AI_TIMEOUT_MS });
  }
}

/**
 * Gemini via Firebase AI Logic, same app and model as gloss grading.
 * Returns point hits only. The caller adds the marks.
 */
export const firebasePointJudge: PointJudge = async (input, context) => {
  const result = await generatePoints(input, context.signal);
  const hits = parsePointHits(result.response.text());
  console.info(
    `[長答判分] ${input.questionId} ${hits.map((hit) => `${hit.id}:${hit.hit ? '1' : '0'}`).join(' ')}`,
  );
  return { hits };
};
