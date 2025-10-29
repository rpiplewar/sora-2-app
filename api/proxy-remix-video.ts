export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { apiKey, videoId, prompt, inputReference } = await req.json();

    // Validate API key
    if (!apiKey?.startsWith('sk-')) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate required fields
    if (!videoId || !prompt) {
      return new Response(
        JSON.stringify({ error: 'videoId and prompt are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build remix endpoint URL
    const remixUrl = `https://api.openai.com/v1/videos/${videoId}/remix`;

    let response;

    if (inputReference) {
      // Use FormData for input reference
      const formData = new FormData();
      formData.append('prompt', prompt);
      formData.append('input_reference', inputReference);

      response = await fetch(remixUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });
    } else {
      // Use JSON for prompt only
      response = await fetch(remixUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });
    }

    if (!response.ok) {
      const error = await response.json();
      return new Response(
        JSON.stringify({ error: error.error?.message || 'Remix failed' }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Remix error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
