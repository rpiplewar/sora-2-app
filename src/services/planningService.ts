import axios from 'axios';
import type { PlannedSegment } from '../types';

const API_BASE = '/api';

export const planningService = {
  /**
   * Generate AI-planned prompts from a base prompt
   * @param apiKey - OpenAI API key
   * @param basePrompt - The base idea/script
   * @param secondsPerSegment - Duration of each segment (4, 8, 12, 16, or 20)
   * @param numGenerations - Number of segments to generate
   * @returns Array of planned segments
   */
  async planPrompts(
    apiKey: string,
    basePrompt: string,
    secondsPerSegment: number,
    numGenerations: number
  ): Promise<PlannedSegment[]> {
    const response = await axios.post(`${API_BASE}/proxy-plan-prompts`, {
      apiKey,
      basePrompt,
      secondsPerSegment,
      numGenerations,
    });
    return response.data.segments;
  },
};
