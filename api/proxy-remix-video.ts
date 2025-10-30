// Proxy for OpenAI video remix API
export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { apiKey, videoId, prompt } = await req.json();

    // Validate required fields
    if (!apiKey || !videoId || !prompt) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: apiKey, videoId, prompt' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const response = await fetch(
      `https://api.openai.com/v1/videos/${videoId}/remix`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          // Note: model, size, and seconds are all inherited from original video
          // The remix endpoint only accepts the prompt parameter
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Remix API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to remix video', details: errorText }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const job = await response.json();
    return new Response(JSON.stringify(job), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Remix proxy error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to remix video',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
