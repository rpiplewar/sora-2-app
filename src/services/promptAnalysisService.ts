/**
 * Service for analyzing prompt changes and generating instruction-style delta prompts
 * This provides clear, actionable instructions to the remix API about what to change
 */

export interface PromptChange {
  category: 'visual_elements' | 'motion' | 'style' | 'technical';
  type: 'added' | 'removed' | 'modified';
  description: string;
  continuity_safe: boolean;
}

export interface PromptDelta {
  summary: string; // Instruction-style change description for remix API
  changes: PromptChange[];
  preserved: string[];
  remix_type: 'minor_tweak' | 'style_shift' | 'major_rewrite' | 'identical';
  warnings: string[];
  recommendations: {
    use_input_reference: boolean;
    show_warning: boolean;
  };
}

export const promptAnalysisService = {
  /**
   * Analyze the difference between two prompts using specialized delta analysis
   * Returns structured delta with instruction-style summary for remix API
   */
  async analyzePromptChange(
    originalPrompt: string,
    newPrompt: string,
    apiKey: string
  ): Promise<PromptDelta> {
    try {
      const response = await fetch('/api/proxy-prompt-delta', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey,
          originalPrompt,
          newPrompt,
        }),
      });

      if (!response.ok) {
        console.error('Prompt delta analysis failed, using fallback');
        return this.createFallbackDelta(originalPrompt, newPrompt);
      }

      const delta: PromptDelta = await response.json();
      return delta;
    } catch (error) {
      console.error('Prompt analysis error:', error);
      return this.createFallbackDelta(originalPrompt, newPrompt);
    }
  },

  /**
   * Generate remix prompt from delta analysis
   * Uses the instruction-style summary which tells the API what to change
   */
  generateRemixPrompt(delta: PromptDelta): string {
    // Use the instruction-style summary for remix
    // This tells the API specifically what to change rather than providing a full new prompt
    return delta.summary;
  },

  /**
   * Fallback delta when API call fails
   */
  createFallbackDelta(_originalPrompt: string, newPrompt: string): PromptDelta {
    return {
      summary: newPrompt, // Fallback to full new prompt
      changes: [
        {
          category: 'visual_elements',
          type: 'modified',
          description: 'Prompt modified (detailed analysis unavailable)',
          continuity_safe: true,
        },
      ],
      preserved: [],
      remix_type: 'major_rewrite',
      warnings: ['Using full new prompt as fallback'],
      recommendations: {
        use_input_reference: false,
        show_warning: false,
      },
    };
  },
};
