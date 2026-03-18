# OpenAI Sora 2 Video API Reference

> Sourced from OpenAI docs and community research (March 2026)

## Endpoint: Create Video

```
POST https://api.openai.com/v1/videos
```

### Request Parameters

| Parameter | Type | Required | Valid Values | Notes |
|---|---|---|---|---|
| `model` | string | yes | `"sora-2"`, `"sora-2-pro"` | Use `sora-2-pro` for 1080p resolutions |
| `prompt` | string | yes | Any string | Controls visual style, camera, motion |
| `seconds` | string | yes | `"4"`, `"8"`, `"12"`, `"16"`, `"20"` | NEW: 16 and 20 added March 2026 |
| `size` | string | yes | See table below | Model-dependent |
| `remixed_from_video_id` | string | no | Video ID | Remix existing video |
| `input_reference` | file | no | JPEG, PNG, WebP image | For frame continuity; must be EXACT pixel dimensions matching `size` |

### Supported `size` Values by Model

| `size` value | Aspect Ratio | Resolution | Model Required |
|---|---|---|---|
| `"1280x720"` | 16:9 | 720p HD Landscape | `sora-2` or `sora-2-pro` |
| `"720x1280"` | 9:16 | 720p HD Portrait | `sora-2` or `sora-2-pro` |
| `"1920x1080"` | 16:9 | 1080p Full HD Landscape | `sora-2-pro` ONLY |
| `"1080x1920"` | 9:16 | 1080p Full HD Portrait | `sora-2-pro` ONLY |

**CRITICAL**: `1920x1080` and `1080x1920` require `model: "sora-2-pro"`. Using them with `sora-2` will cause a validation error from the OpenAI API.

**CRITICAL**: `input_reference` image dimensions must EXACTLY match the `size` parameter in pixels — even 1 pixel off causes an error.

### Response

```json
{
  "id": "video_abc123",
  "status": "queued",
  "created_at": 1234567890,
  "progress": 0
}
```

---

## Endpoint: Get Video Status

```
GET https://api.openai.com/v1/videos/{video_id}
```

### Response Status Values

| Status | Meaning |
|---|---|
| `"queued"` | Job is waiting to start |
| `"in_progress"` | Job is actively generating |
| `"completed"` | Done — content can be downloaded |
| `"failed"` | Generation failed |

**Known Bug (affects ~5-7% of jobs)**: Jobs can get stuck in `in_progress` for 7+ hours or at 99% progress indefinitely. Implement a **20-minute timeout** before treating job as failed.

### Recommended Polling Strategy
- Poll every **10–20 seconds** (not 2 seconds — too aggressive)
- Implement **exponential backoff**
- Set **20-minute absolute timeout**
- On timeout: surface error to user and allow retry

---

## Endpoint: Download Video Content

```
GET https://api.openai.com/v1/videos/{video_id}/content?variant=video
```

Headers: `Authorization: Bearer {api_key}`

Returns raw MP4 binary (video blob).

---

## Endpoint: Remix Video

```
POST https://api.openai.com/v1/videos/{video_id}/remix
```

Body: `{ "prompt": "new prompt" }` — model/size/seconds are inherited from original.

---

## Generation Time Estimates

| Duration | Approx Generation Time |
|---|---|
| 4s (720p) | ~25 seconds |
| 8s (720p) | ~45 seconds |
| 10s (1080p) | ~78 seconds |
| 15s (1080p) | ~105 seconds |
| 20s (1080p) | ~142 seconds |

Times can vary ±20% based on server load.

---

## Key Changes: March 2026 (NEW)

- **20-second clips** now supported (was max 12 seconds)
- **16-second** clips now supported
- Both `sora-2` and `sora-2-pro` support 16 and 20 seconds
- Video continuation/extension supported up to 6 times (max 120s total)
- Batch job API available

## Common Errors

- `"Invalid seconds value"` — Passing a value not in `['4', '8', '12', '16', '20']`
- `"Model does not support this size"` — Using `1920x1080` with `sora-2`
- `"Inpaint image must match"` — `input_reference` image dimensions don't exactly match `size`
- `"Your organization must be verified"` — Organization needs verification at platform.openai.com
- `"processing_error – We're under heavy load"` — Server overload or IP flagging; retry after delay

## Sources

- https://platform.openai.com/docs/guides/video-generation
- https://platform.openai.com/docs/api-reference/videos
- https://community.openai.com/t/sora-2-api-video-generation-stuck-in-in-progress-state/1361307
- https://x.com/OpenAIDevs/status/2032142448970121468 (March 2026 announcement)
