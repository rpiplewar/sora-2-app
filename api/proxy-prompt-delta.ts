export const config = {
  runtime: 'edge',
};

const DELTA_SYSTEM_PROMPT = `
You are a video prompt comparison specialist for Sora 2 video generation.

Analyze the differences between two prompts and categorize changes by:
- Visual elements (subjects, environment, colors, lighting)
- Motion (camera movement, subject actions)
- Style (mood, cinematography, atmosphere)
- Technical (framing, composition, timing)

Output JSON:
{
  "summary": "Instruction-style remix prompt (e.g., 'Change the nationality from American to Brazilian')",
  "changes": [
    {
      "category": "visual_elements|motion|style|technical",
      "type": "added|removed|modified",
      "description": "Specific change description",
      "continuity_safe": true|false
    }
  ],
  "preserved": ["Elements that stayed the same"],
  "remix_type": "minor_tweak|style_shift|major_rewrite",
  "warnings": ["Any continuity concerns"]
}

IMPORTANT: The "summary" field must be a concise INSTRUCTION for the remix API, not a description.
Examples:
- Good: "Change the boy's nationality from American to Brazilian"
- Good: "Add sunset lighting and warm color grading"
- Bad: "The main change is the nationality of the boy"
- Bad: "The lighting has been modified to be warmer"

Focus on semantic differences that affect visual output, not linguistic variations.
`.trim();

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { apiKey, originalPrompt, newPrompt } = await req.json();

    if (!apiKey?.startsWith('sk-')) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Pre-check: identical prompts
    if (originalPrompt === newPrompt) {
      return new Response(JSON.stringify({
        summary: 'No changes detected',
        changes: [],
        preserved: [originalPrompt],
        remix_type: 'identical',
        warnings: []
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Call OpenAI for delta analysis
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DELTA_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `ORIGINAL PROMPT:\n${originalPrompt}\n\nNEW PROMPT:\n${newPrompt}`
          }
        ],
        max_tokens: 1000
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return new Response(
        JSON.stringify({ error: error.error?.message || 'Delta analysis failed' }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const deltaContent = data.choices[0]?.message?.content || '{}';
    const delta = JSON.parse(deltaContent);

    // Add continuity recommendations
    const hasBreakingChanges = delta.changes?.some((c: any) => !c.continuity_safe);

    return new Response(JSON.stringify({
      ...delta,
      recommendations: {
        use_input_reference: delta.remix_type !== 'major_rewrite',
        show_warning: hasBreakingChanges
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Delta extraction error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
