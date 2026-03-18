import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ApiKeyInput } from './components/ApiKeyInput';
import { PromptForm } from './components/PromptForm';
import { PromptPlanner } from './components/PromptPlanner';
import { OverallProgress } from './components/OverallProgress';
import { SegmentProgress } from './components/SegmentProgress';
import { VideoPlayer } from './components/VideoPlayer';
import { ErrorDisplay } from './components/ErrorDisplay';
import { VideoHistoryPanel } from './components/VideoHistoryPanel';
import { useVideoStore } from './stores/videoStore';
import { openaiService } from './services/openaiService';
import { videoService } from './services/videoService';
import { planningService } from './services/planningService';
import { cloudStorageService } from './services/cloudStorageService';
import { extractLastFrame } from './utils/videoFrameExtractor';
import type { PromptFormData, VideoSegment, PlannedSegment } from './types';
import { getModelForSize } from './types';
import type { Scene } from './services/cloudStorageService';
import { SceneBuilder } from './pages/SceneBuilder';

function Home() {
  const {
    apiKey,
    isProcessing,
    setProcessing,
    error,
    setError,
    finalVideoUrl,
    setFinalVideo,
    ffmpegReady,
    setFFmpegReady,
    reset,
  } = useVideoStore();

  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [currentSegment, setCurrentSegment] = useState(0);
  const [totalSegments, setTotalSegments] = useState(0);
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [showMobileWarning, setShowMobileWarning] = useState(false);
  const [plannedSegments, setPlannedSegments] = useState<PlannedSegment[] | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [planConfig, setPlanConfig] = useState<PromptFormData | null>(null);

  // History
  const [historyItems, setHistoryItems] = useState<Scene[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [reuseValues, setReuseValues] = useState<{ prompt: string; seconds: number; size: string } | null>(null);
  const [formKey, setFormKey] = useState(0);

  const loadHistory = async () => {
    try {
      const scenes = await cloudStorageService.listScenes();
      setHistoryItems(scenes);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Initialize FFmpeg on mount
  useEffect(() => {
    const initFFmpeg = async () => {
      try {
        setStatus('Loading FFmpeg.wasm...');
        await videoService.initialize();
        setFFmpegReady(true);
        setStatus('Ready to generate videos');
      } catch (error) {
        console.error('Failed to initialize FFmpeg:', error);
        setError('Failed to load FFmpeg.wasm. Please refresh the page.');
      }
    };

    initFFmpeg();
    loadHistory();

    // Detect mobile browsers
    if (/Mobi|Android/i.test(navigator.userAgent)) {
      setShowMobileWarning(true);
    }
  }, [setFFmpegReady, setError]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (finalVideoUrl) {
        URL.revokeObjectURL(finalVideoUrl);
      }
    };
  }, [finalVideoUrl]);

  const estimateMemoryUsage = (formData: PromptFormData): number => {
    // Estimate ~8MB per second of video
    const bytesPerSecond = 8 * 1024 * 1024;
    return formData.seconds * formData.numSegments * bytesPerSecond;
  };

  const handlePlanWithAI = async (formData: PromptFormData) => {
    if (!apiKey) {
      setError('Please enter your OpenAI API key first');
      return;
    }

    try {
      setIsPlanning(true);
      setError(null);

      const segments = await planningService.planPrompts(
        apiKey,
        formData.prompt,
        formData.seconds,
        formData.numSegments
      );

      setPlannedSegments(segments);
      setPlanConfig(formData);
    } catch (err: any) {
      console.error('Planning error:', err);
      setError(err.message || 'Failed to plan prompts. Please try again.');
    } finally {
      setIsPlanning(false);
    }
  };

  const handleEditPlannedSegment = (index: number, newPrompt: string) => {
    if (!plannedSegments) return;
    const updated = [...plannedSegments];
    updated[index] = { ...updated[index], prompt: newPrompt };
    setPlannedSegments(updated);
  };

  const handleCancelPlan = () => {
    setPlannedSegments(null);
    setPlanConfig(null);
  };

  const handleApprovePlan = async () => {
    if (!plannedSegments || !planConfig || !apiKey) return;

    try {
      setProcessing(true);
      setError(null);
      setProgress(0);
      setCurrentSegment(0);
      setTotalSegments(plannedSegments.length);
      setSegments([]);
      setPlannedSegments(null); // Hide planner

      const videoBlobs: Blob[] = [];
      const segmentList: VideoSegment[] = [];
      let lastFrameBlob: Blob | undefined = undefined;
      let hasFailures = false;
      const capturedPlanConfig = planConfig; // capture before null-check race

      // Generate each segment using planned prompts
      for (let i = 0; i < plannedSegments.length; i++) {
        setCurrentSegment(i + 1);
        setStatus(`Generating segment ${i + 1}/${plannedSegments.length}: ${plannedSegments[i].title}...`);

        const segment: VideoSegment = {
          id: `segment-${i}`,
          prompt: plannedSegments[i].prompt,
          status: 'generating',
          progress: 0,
        };
        segmentList.push(segment);
        setSegments([...segmentList]);

        try {
          console.log(`[Segment ${i + 1}/${plannedSegments.length}] Starting generation...`, {
            prompt: plannedSegments[i].prompt.slice(0, 50),
            seconds: plannedSegments[i].seconds,
            size: planConfig.size,
            model: getModelForSize(planConfig.size),
          });

          // Create video job with frame continuity (if not first segment)
          const job = await openaiService.createVideo({
            apiKey,
            prompt: plannedSegments[i].prompt,
            seconds: String(plannedSegments[i].seconds),
            size: planConfig.size,
            model: getModelForSize(planConfig.size),
            inputReference: lastFrameBlob, // Use last frame from previous video
          });
          console.log(`[Segment ${i + 1}] Job created: ${job.id}`);

          await openaiService.pollUntilComplete(job.id, apiKey, (segmentProgress) => {
            segment.progress = segmentProgress;
            setSegments([...segmentList]);

            const baseProgress = (i / plannedSegments.length) * 80;
            const segmentContribution = (segmentProgress / 100 / plannedSegments.length) * 80;
            setProgress(Math.round(baseProgress + segmentContribution));
          });

          console.log(`[Segment ${i + 1}] Completed, downloading...`);
          setStatus(`Downloading segment ${i + 1}/${plannedSegments.length}...`);
          const blob = await openaiService.downloadVideo(job.id, apiKey);
          console.log(`[Segment ${i + 1}] Downloaded: ${blob.size} bytes`);
          videoBlobs.push(blob);

          segment.status = 'completed';
          segment.progress = 100;
          segment.videoBlob = blob;
          setSegments([...segmentList]);

          // Extract last frame for next segment (if not the last segment)
          if (i < plannedSegments.length - 1) {
            setStatus(`Extracting frame from segment ${i + 1} for continuity...`);
            lastFrameBlob = await extractLastFrame(blob);
          }
        } catch (segmentError: any) {
          console.error(`[Segment ${i + 1}] FAILED:`, segmentError.message);
          segment.status = 'failed';
          segment.error = segmentError.message || 'Failed to generate segment';
          setSegments([...segmentList]);
          hasFailures = true;
          // Continue with remaining segments instead of aborting all
        }
      }

      if (videoBlobs.length === 0) {
        throw new Error('All segments failed to generate. Please try again.');
      }

      if (hasFailures) {
        console.warn(`[Generation] Some segments failed. Proceeding with ${videoBlobs.length}/${plannedSegments.length} successful segments.`);
      }

      // Concatenate videos
      let finalBlob: Blob;
      if (videoBlobs.length > 1) {
        setStatus('Concatenating videos...');
        setProgress(80);

        finalBlob = await videoService.concatenateVideos(videoBlobs, (concatProgress) => {
          setProgress(80 + Math.round(concatProgress * 0.2));
        });
      } else {
        finalBlob = videoBlobs[0];
      }

      const url = URL.createObjectURL(finalBlob);
      setFinalVideo(url);

      setProgress(100);
      setStatus('Complete!');

      // Save to history (best-effort)
      setStatus('Saving to history...');
      const totalSeconds = plannedSegments.reduce((sum, s) => sum + s.seconds, 0);
      const basePrompt = capturedPlanConfig?.prompt || plannedSegments[0]?.prompt || '';
      cloudStorageService.uploadVideo(finalBlob, {
        openaiVideoId: crypto.randomUUID(),
        prompt: basePrompt,
        seconds: totalSeconds,
        size: capturedPlanConfig?.size || '1280x720',
        model: getModelForSize(capturedPlanConfig?.size || '1280x720'),
      }).then(() => loadHistory()).catch((err) => {
        console.error('[History] Failed to save planned video to history:', err);
      }).finally(() => setStatus('Complete!'));
    } catch (err: any) {
      console.error('Generation error:', err);
      setError(err.message || 'Failed to generate video. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleGenerate = async (formData: PromptFormData) => {
    if (!apiKey) {
      setError('Please enter your OpenAI API key first');
      return;
    }

    if (!ffmpegReady) {
      setError('FFmpeg is still loading. Please wait a moment.');
      return;
    }

    // Memory warning
    const estimatedSize = estimateMemoryUsage(formData);
    const maxSize = 1.5 * 1024 * 1024 * 1024; // 1.5GB
    if (estimatedSize > maxSize) {
      const sizeGB = (estimatedSize / (1024 * 1024 * 1024)).toFixed(2);
      if (
        !confirm(
          `Warning: This will generate approximately ${sizeGB}GB of video data, which may cause your browser to freeze or crash on low-memory devices. Continue?`
        )
      ) {
        return;
      }
    }

    try {
      setProcessing(true);
      setError(null);
      setProgress(0);
      setCurrentSegment(0);
      setTotalSegments(formData.numSegments);
      setSegments([]);

      const videoBlobs: Blob[] = [];
      const segmentList: VideoSegment[] = [];
      let lastFrameBlob: Blob | undefined = undefined;
      let hasFailures = false;
      let firstJobId: string | null = null;

      // Generate each segment
      for (let i = 0; i < formData.numSegments; i++) {
        setCurrentSegment(i + 1);
        setStatus(`Generating segment ${i + 1}/${formData.numSegments}...`);

        // Create segment object
        const segment: VideoSegment = {
          id: `segment-${i}`,
          prompt: formData.prompt,
          status: 'generating',
          progress: 0,
        };
        segmentList.push(segment);
        setSegments([...segmentList]);

        try {
          console.log(`[Segment ${i + 1}/${formData.numSegments}] Starting generation...`, {
            prompt: formData.prompt.slice(0, 50),
            seconds: formData.seconds,
            size: formData.size,
            model: getModelForSize(formData.size),
          });

          // Create video job with frame continuity (if not first segment)
          const job = await openaiService.createVideo({
            apiKey,
            prompt: formData.prompt,
            seconds: String(formData.seconds), // Convert to string for OpenAI API
            size: formData.size,
            model: getModelForSize(formData.size),
            inputReference: lastFrameBlob, // Use last frame from previous video
          });
          console.log(`[Segment ${i + 1}] Job created: ${job.id}`);
          if (i === 0) firstJobId = job.id;

          // Poll for completion
          await openaiService.pollUntilComplete(job.id, apiKey, (segmentProgress) => {
            // Update segment progress
            segment.progress = segmentProgress;
            setSegments([...segmentList]);

            // Update overall progress (each segment is worth equal portion)
            const baseProgress = (i / formData.numSegments) * 80;
            const segmentContribution = (segmentProgress / 100 / formData.numSegments) * 80;
            setProgress(Math.round(baseProgress + segmentContribution));
          });

          // Download video
          console.log(`[Segment ${i + 1}] Completed, downloading...`);
          setStatus(`Downloading segment ${i + 1}/${formData.numSegments}...`);
          const blob = await openaiService.downloadVideo(job.id, apiKey);
          console.log(`[Segment ${i + 1}] Downloaded: ${blob.size} bytes`);
          videoBlobs.push(blob);

          // Mark segment as completed
          segment.status = 'completed';
          segment.progress = 100;
          segment.videoBlob = blob;
          setSegments([...segmentList]);

          // Extract last frame for next segment (if not the last segment)
          if (i < formData.numSegments - 1) {
            setStatus(`Extracting frame from segment ${i + 1} for continuity...`);
            lastFrameBlob = await extractLastFrame(blob);
          }
        } catch (segmentError: any) {
          console.error(`[Segment ${i + 1}] FAILED:`, segmentError.message);
          segment.status = 'failed';
          segment.error = segmentError.message || 'Failed to generate segment';
          setSegments([...segmentList]);
          hasFailures = true;
          // Continue with remaining segments instead of aborting all
        }
      }

      if (videoBlobs.length === 0) {
        throw new Error('All segments failed to generate. Please try again.');
      }

      if (hasFailures) {
        console.warn(`[Generation] Some segments failed. Proceeding with ${videoBlobs.length}/${formData.numSegments} successful segments.`);
      }

      // Concatenate videos
      let finalBlob: Blob;
      if (videoBlobs.length > 1) {
        setStatus('Concatenating videos...');
        setProgress(80);

        finalBlob = await videoService.concatenateVideos(videoBlobs, (concatProgress) => {
          setProgress(80 + Math.round(concatProgress * 0.2));
        });
      } else {
        finalBlob = videoBlobs[0];
      }

      // Create object URL
      const url = URL.createObjectURL(finalBlob);
      setFinalVideo(url);

      setProgress(100);
      setStatus('Complete!');

      // Save to history (best-effort — don't block or show errors to user)
      setStatus('Saving to history...');
      const openaiVideoId = formData.numSegments === 1 && firstJobId
        ? firstJobId
        : crypto.randomUUID();
      cloudStorageService.uploadVideo(finalBlob, {
        openaiVideoId,
        prompt: formData.prompt,
        seconds: videoBlobs.length * formData.seconds,
        size: formData.size,
        model: getModelForSize(formData.size),
      }).then(() => loadHistory()).catch((err) => {
        console.error('[History] Failed to save video to history:', err);
      }).finally(() => setStatus('Complete!'));
    } catch (err: any) {
      console.error('Generation error:', err);
      setError(err.message || 'Failed to generate video. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleGenerateNew = () => {
    // Revoke old object URL
    if (finalVideoUrl) {
      URL.revokeObjectURL(finalVideoUrl);
    }
    reset();
    setProgress(0);
    setStatus('');
    setCurrentSegment(0);
    setTotalSegments(0);
    setSegments([]);
  };

  const handleReusePrompt = (item: Scene) => {
    setReuseValues({
      prompt: item.prompt,
      seconds: parseInt(item.parameters.seconds),
      size: item.parameters.size,
    });
    setFormKey((k) => k + 1); // remount PromptForm with new defaults
    // If a video is currently shown, clear it so the form is visible
    if (finalVideoUrl) {
      URL.revokeObjectURL(finalVideoUrl);
      reset();
      setProgress(0);
      setStatus('');
      setSegments([]);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-16">
          <div className="inline-block mb-6">
            <div className="w-16 h-16 mx-auto flex items-center justify-center text-4xl">
              🎬
            </div>
          </div>
          <h1 className="text-7xl font-serif mb-6 text-gray-900 tracking-tight leading-tight" style={{ fontFamily: 'Lora, Georgia, serif' }}>
            Create cinematic videos with natural language
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
            Generate extended AI videos with OpenAI Sora 2. Seamless frame continuity, AI-powered planning, and browser-based processing.
          </p>
          <div className="mt-8">
            <Link
              to="/scene-builder"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Open Scene Builder
            </Link>
          </div>
        </header>

        {showMobileWarning && (
          <div className="bg-amber-50 border border-amber-200 p-6 rounded-lg mb-8 max-w-3xl mx-auto">
            <div className="flex items-start gap-4">
              <span className="text-amber-600 text-xl">⚠️</span>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-amber-900 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Mobile Browser Detected
                </h3>
                <p className="text-sm text-amber-700 leading-relaxed">
                  This application works best on desktop browsers. Mobile devices may have
                  memory limitations that could cause issues with large videos.
                </p>
              </div>
              <button
                onClick={() => setShowMobileWarning(false)}
                className="text-amber-600 hover:text-amber-900 transition-colors text-lg"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-10 max-w-3xl mx-auto">
          <ApiKeyInput />

          {error && <ErrorDisplay error={error} onDismiss={() => setError(null)} />}

          {!ffmpegReady && !error && (
            <div className="text-center py-16">
              <div className="relative inline-block">
                <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 border-t-gray-900 mx-auto mb-6"></div>
              </div>
              <p className="text-gray-900 font-medium text-base mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>Loading FFmpeg.wasm...</p>
              <p className="text-gray-500 text-sm">Preparing video processing engine</p>
            </div>
          )}

          {ffmpegReady && !finalVideoUrl && !plannedSegments && (
            <PromptForm
              key={formKey}
              onSubmit={handleGenerate}
              onPlanWithAI={handlePlanWithAI}
              disabled={isProcessing || isPlanning}
              defaultPrompt={reuseValues?.prompt}
              defaultSeconds={reuseValues?.seconds}
              defaultSize={reuseValues?.size}
            />
          )}

          {plannedSegments && (
            <PromptPlanner
              plannedSegments={plannedSegments}
              onEdit={handleEditPlannedSegment}
              onApprove={handleApprovePlan}
              onCancel={handleCancelPlan}
              isGenerating={isProcessing}
            />
          )}

          {isProcessing && (
            <>
              <OverallProgress
                progress={progress}
                status={status}
                currentSegment={currentSegment}
                totalSegments={totalSegments}
              />

              {segments.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
                  {segments.map((segment, index) => (
                    <SegmentProgress key={segment.id} segment={segment} index={index} />
                  ))}
                </div>
              )}
            </>
          )}

          {finalVideoUrl && <VideoPlayer url={finalVideoUrl} onGenerateNew={handleGenerateNew} />}
        </div>

        <VideoHistoryPanel
          items={historyItems}
          loading={historyLoading}
          onReusePrompt={handleReusePrompt}
        />

        <footer className="text-center mt-20 text-sm text-gray-500">
          <p className="mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            Made with React, TypeScript, Vercel Edge Functions, and FFmpeg.wasm
          </p>
          <p className="text-xs text-gray-400">
            🔒 Your API key and videos never leave your device
          </p>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/scene-builder" element={<SceneBuilder />} />
      </Routes>
    </BrowserRouter>
  );
}
