export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const videoId = url.searchParams.get('videoId');
  const apiKey = req.headers.get('x-api-key');

  if (!videoId || !apiKey) {
    return new Response(
      JSON.stringify({ error: 'Missing videoId or API key' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // Validate API key format
  if (!apiKey.startsWith('sk-')) {
    return new Response(
      JSON.stringify({ error: 'Invalid API key format' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    const response = await fetch(
      `https://api.openai.com/v1/videos/${videoId}`,
      {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return new Response(
        JSON.stringify({ error: error.error?.message || 'API error' }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const data = await response.json();
    console.log('[proxy-get-status] Job', videoId, ':', data.status, (data.progress ?? '?') + '%');
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
