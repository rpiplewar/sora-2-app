import { openaiService } from './openaiService';
import { promptAnalysisService } from './promptAnalysisService';

export interface RemixParameters {
  model: string;
  size: string;
  seconds: string;
}

export interface RemixOptions {
  analyzePromptChanges?: boolean; // Enable prompt delta analysis
  originalPrompt?: string; // Required if analyzePromptChanges is true
}

export const remixService = {
  /**
   * Automatically remix video when prompt changes
   * Note: Remix inherits model, size, and seconds from the original video
   * Only the prompt can be changed
   */
  async autoRemix(
    openaiVideoId: string,
    newPrompt: string,
    _parameters: RemixParameters, // Kept for compatibility, but not sent to API
    apiKey: string,
    options: RemixOptions = {}
  ) {
    let finalPrompt = newPrompt;

    // Analyze prompt changes if requested
    if (options.analyzePromptChanges && options.originalPrompt) {
      try {
        const delta = await promptAnalysisService.analyzePromptChange(
          options.originalPrompt,
          newPrompt,
          apiKey
        );
        console.log('Prompt delta analysis:', delta);
        console.log('Remix instruction:', delta.summary);
        finalPrompt = promptAnalysisService.generateRemixPrompt(delta);
      } catch (error) {
        console.error('Prompt analysis failed, using original prompt:', error);
        // Fallback to original prompt
        finalPrompt = newPrompt;
      }
    }

    // Call OpenAI remix API directly via our proxy
    // Note: Only prompt is sent - model/size/seconds are inherited from original
    const response = await fetch('/api/proxy-remix-video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey,
        videoId: openaiVideoId,
        prompt: finalPrompt,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Remix failed');
    }

    const job = await response.json();

    // Poll until complete
    return await openaiService.pollUntilComplete(job.id, apiKey);
  },
};
