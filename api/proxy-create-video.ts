export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let apiKey, prompt, seconds, size, model, remixedFromVideoId, inputReference;

    // Handle both JSON and multipart/form-data
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      apiKey = formData.get('apiKey');
      prompt = formData.get('prompt');
      seconds = formData.get('seconds');
      size = formData.get('size');
      model = formData.get('model');
      remixedFromVideoId = formData.get('remixedFromVideoId');
      inputReference = formData.get('inputReference'); // File object
    } else {
      const body = await req.json();
      apiKey = body.apiKey;
      prompt = body.prompt;
      seconds = body.seconds;
      size = body.size;
      model = body.model;
      remixedFromVideoId = body.remixedFromVideoId;
    }

    // Validate API key format
    if (!apiKey || !apiKey.startsWith('sk-')) {
      return new Response(JSON.stringify({ error: 'Invalid API key format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate required fields
    if (!prompt || !seconds || !model) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('[proxy-create-video] Request:', { model, prompt: String(prompt)?.slice(0, 50), seconds: String(seconds), size });

    // Validate seconds value (must be '4', '8', '12', '16', or '20')
    const secondsStr = String(seconds);
    const validSeconds = ['4', '8', '12', '16', '20'];
    if (!validSeconds.includes(secondsStr)) {
      return new Response(JSON.stringify({
        error: `Invalid seconds value: must be one of ${validSeconds.join(', ')}, got '${secondsStr}'`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Pro sizes require sora-2-pro model
    const proSizes = ['1792x1024', '1024x1792', '1920x1080', '1080x1920'];
    if (proSizes.includes(String(size)) && model !== 'sora-2-pro') {
      return new Response(JSON.stringify({
        error: `Pro resolution (${size}) requires model 'sora-2-pro', got '${model}'`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Forward request to OpenAI API
    // If inputReference is provided, use multipart/form-data
    let openaiResponse;
    if (inputReference) {
      const openaiFormData = new FormData();
      openaiFormData.append('model', model);
      openaiFormData.append('prompt', prompt);
      openaiFormData.append('seconds', secondsStr);
      if (size) openaiFormData.append('size', size);
      if (remixedFromVideoId) openaiFormData.append('remixed_from_video_id', remixedFromVideoId);
      openaiFormData.append('input_reference', inputReference);

      openaiResponse = await fetch('https://api.openai.com/v1/videos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: openaiFormData,
      });
    } else {
      openaiResponse = await fetch('https://api.openai.com/v1/videos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          seconds: secondsStr,
          ...(size && { size }),
          ...(remixedFromVideoId && { remixed_from_video_id: remixedFromVideoId })
        }),
      });
    }

    console.log('[proxy-create-video] OpenAI response status:', openaiResponse.status);

    // Check for errors
    if (!openaiResponse.ok) {
      const error = await openaiResponse.json();
      return new Response(
        JSON.stringify({ error: error.error?.message || 'OpenAI API error' }),
        {
          status: openaiResponse.status,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Return OpenAI response
    const data = await openaiResponse.json();
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
