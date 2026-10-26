import { generate } from './generation';
import type {
  AIResponse,
  ExamplesRequest,
  ExplainRequest,
  HintRequest,
  SimplifyRequest,
} from '../types';

export const aiApi = {
  explain: (data: ExplainRequest) => generate<AIResponse>('/ai/explain', data),

  hint: (data: HintRequest) => generate<AIResponse>('/ai/hint', data),

  examples: (data: ExamplesRequest) => generate<AIResponse>('/ai/examples', data),

  simplify: (data: SimplifyRequest) => generate<AIResponse>('/ai/simplify', data),
};
