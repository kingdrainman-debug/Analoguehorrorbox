import { Settings } from '../core/params';
import { buildChain } from '../audio/engine';

export interface OfflineAudioOptions {
  seed: number;
  sampleRate?: number;
  /** Clip range in seconds. Omit for the whole file. */
  start?: number;
  end?: number;
  onProgress?: (fraction: number) => void;
  /** Coarse progress reporting, for batch renders with no UI. */
  onStage?: (stage: string) => void;
  /**
   * Clip length to render when there is no source file — a still image being
   * rendered as a video. The chain still produces the whole noise bed, so the
   * result is a television with nothing playing rather than silence.
   */
  duration?: number;
}

/**
 * Render the processed audio deterministically, off the clock.
 *
 * The worklets keep their own media clock, so an offline render produces the
 * same wow, the same crackle and the same hum-bar-linked hum as the realtime
 * preview did — which is the whole reason the DSP is written that way.
 */
export async function renderProcessedAudio(
  file: Blob | null,
  settings: Settings,
  opts: OfflineAudioOptions,
): Promise<AudioBuffer | null> {
  const sampleRate = opts.sampleRate ?? 48000;

  // No file: a still image. Run silence through the chain for the requested
  // length so the export still carries hum, hiss, whine and crackle.
  if (!file) {
    const durationSec = Math.max(0.1, opts.duration ?? 0);
    if (durationSec <= 0) return null;
    opts.onStage?.('rendering ambience');
    const ctx = new OfflineAudioContext(2, Math.ceil(durationSec * sampleRate), sampleRate);
    const silence = ctx.createBufferSource();
    silence.buffer = ctx.createBuffer(2, Math.ceil(durationSec * sampleRate), sampleRate);
    const chain = await buildChain(ctx, silence, settings, {
      seed: opts.seed,
      withAnalyser: false,
      gateOnPause: false,
    });
    chain.output.connect(ctx.destination);
    chain.sync(0, true);
    silence.start(0);
    const rendered = await ctx.startRendering();
    opts.onProgress?.(1);
    chain.dispose();
    return rendered;
  }

  const raw = await file.arrayBuffer();
  opts.onStage?.('decoding');

  // A short-lived context purely for decoding; OfflineAudioContext can decode
  // too, but a mismatched rate would resample twice.
  const decodeCtx = new (window.AudioContext || (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(raw);
  } catch {
    // Plenty of video files have no audio track at all, and some containers
    // cannot be decoded by decodeAudioData even when they play fine in a
    // <video>. Neither is an error worth stopping an export for.
    await decodeCtx.close().catch(() => undefined);
    return null;
  }
  await decodeCtx.close().catch(() => undefined);

  const start = Math.max(0, opts.start ?? 0);
  const end = Math.min(decoded.duration, opts.end ?? decoded.duration);
  const durationSec = Math.max(0.01, end - start);
  const frames = Math.ceil(durationSec * sampleRate);

  const ctx = new OfflineAudioContext(2, frames, sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = decoded;

  opts.onStage?.('building chain');
  const chain = await buildChain(ctx, source, settings, {
    seed: opts.seed,
    withAnalyser: false,
    gateOnPause: false,
  });
  chain.output.connect(ctx.destination);
  chain.sync(start, true);

  opts.onStage?.('rendering');
  source.start(0, start, durationSec);
  const rendered = await ctx.startRendering();
  opts.onProgress?.(1);
  chain.dispose();
  return rendered;
}
