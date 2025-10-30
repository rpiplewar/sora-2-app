# OpenAI Sora 2 API Reference for SceneBuilder

## Critical API Facts

### Video Expiration Window
- **Documented Standard**: 24 hours from `created_at`
- **User Claim**: May have changed to 1 hour (NO official documentation found)
- **Recommendation**: Keep 24-hour check, but add warning system
- **API Field**: `expires_at` timestamp in response

### Remix API

**Endpoint**: `POST /v1/videos/{video_id}/remix`

**Parameters**:
```typescript
{
  video_id: string,  // Source video ID
  prompt: string,    // Modification instructions
  model: "sora-2" | "sora-2-pro",
  size: "1280x720" | "1792x1024" | "720x1280" | "1024x1792",
  seconds: "4" | "8" | "12"  // MUST be string, not number
}
```

**Time Limits**:
- Can only remix videos within 24 hours of creation
- After `expires_at`, must regenerate from scratch
- Check expiration with: `new Date(expiresAt) < new Date()`

**What Can Be Modified**:
- Camera angles ("same shot, switch to 85 mm")
- Color palette ("Shift colors to teal, sand, and rust")
- Scene elements ("Add a cat taking a bow")
- Lighting ("same lighting, new palette")

### Extend Functionality

**Key Finding**: NO dedicated extend API endpoint exists

**Implementation**: Use image-to-video with last frame as `input_reference`

```typescript
// Step 1: Extract last frame from completed video
const lastFrame = await extractLastFrame(videoBlob);

// Step 2: Create new video with frame continuity
const response = await fetch('/api/proxy-create-video', {
  method: 'POST',
  body: formData.append('input_reference', lastFrame)
});
```

**Advantages Over Remix**:
- No time limits (uses new generation)
- Works after video expiration
- Only requires extracted frame

### API Response Structure

```typescript
interface VideoJob {
  id: string;                    // "video_abc123..."
  object: "video";
  model: "sora-2" | "sora-2-pro";
  status: "queued" | "in_progress" | "completed" | "failed" | "cancelled";
  progress: number;              // 0-100
  created_at: number;            // Unix timestamp
  completed_at: number | null;   // Populated when done
  expires_at: number | null;     // ~24 hours from created_at
  remixed_from_video_id?: string; // Source video if remixed
  size: string;
  seconds: string;
  error?: string;
}
```

### Timestamp/Scene Information

**NOT AVAILABLE**:
- ❌ Frame-level timestamps
- ❌ Scene segmentation data
- ❌ Object detection metadata
- ❌ Keyframe information

**Available Only**:
- ✅ Job-level timestamps (`created_at`, `completed_at`, `expires_at`)
- ✅ Video duration (specified in request)

**Implication**: Cannot implement automatic scene detection from API. Must track scenes manually in application state.

## Implementation Patterns

### Polling Pattern

```typescript
async function pollVideoStatus(videoId: string) {
  const interval = 2000; // 2 seconds
  let attempts = 0;
  const maxAttempts = 180; // 6 minutes max

  while (attempts < maxAttempts) {
    const response = await fetch(`/api/proxy-get-status?videoId=${videoId}`);
    const job = await response.json();

    if (job.status === 'completed') {
      return job;
    } else if (job.status === 'failed') {
      throw new Error(job.error || 'Generation failed');
    }

    await new Promise(resolve => setTimeout(resolve, interval));
    attempts++;
  }

  throw new Error('Polling timeout');
}
```

### Download Pattern

```typescript
async function downloadVideo(videoId: string): Promise<Blob> {
  const response = await fetch(
    `https://api.openai.com/v1/videos/${videoId}/content`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  return response.blob();
}
```

## Critical Constraints

1. **`seconds` parameter MUST be string**: `"4"`, `"8"`, or `"12"` (NOT numbers)
2. **Remix requires unexpired video**: Check `expires_at` before attempting
3. **No scene metadata**: Application must track scene boundaries manually
4. **24-hour download window**: Videos must be stored before expiration

## Documentation Sources

- Azure OpenAI Sora Docs: https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/video-generation
- OpenAI Cookbook: https://github.com/openai/openai-cookbook/tree/main/examples/sora
- Sample App: https://github.com/openai/openai-sora-sample-app
