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
}

/**
 * Render the processed audio deterministically, off the clock.
 *
 * The worklets keep their own media clock, so an offline render produces the
 * same wow, the same crackle and the same hum-bar-linked hum as the realtime
 * preview did — which is the whole reason the DSP is written that way.
 */
export async function renderProcessedAudio(
  file: Blob,
  settings: Settings,
  opts: OfflineAudioOptions,
): Promise<AudioBuffer | null> {
  const sampleRate = opts.sampleRate ?? 48000;
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
  const chain = await buildChain(ctx, source, settings, { seed: opts.seed, withAnalyser: false });
  chain.output.connect(ctx.destination);
  chain.sync(start, true);

  opts.onStage?.('rendering');
  source.start(0, start, durationSec);
  const rendered = await ctx.startRendering();
  opts.onProgress?.(1);
  chain.dispose();
  return rendered;
}
