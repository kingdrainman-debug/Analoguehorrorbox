import { useEffect, useState } from 'react';
import { isDesktop } from '../platform/desktop';

export type ExportFormat = 'h264' | 'hevc' | 'prores' | 'gif' | 'webm' | 'pngseq' | 'wav';

export interface ExportSettings {
  format: ExportFormat;
  fps: number;
  quality: number;
  scale: number;
  start: number;
  end: number;
  useSourceRange: boolean;
}

export const DEFAULT_EXPORT: ExportSettings = {
  format: isDesktop ? 'h264' : 'webm',
  fps: 30,
  quality: 18,
  scale: 1,
  start: 0,
  end: 0,
  useSourceRange: true,
};

interface Props {
  value: ExportSettings;
  duration: number;
  busy: boolean;
  progress: number;
  status: string;
  onChange(next: ExportSettings): void;
  onRenderDeterministic(): void;
  onRecordRealtime(): void;
  onSnapshot(): void;
  onCancel(): void;
}

const FORMATS: { value: ExportFormat; label: string; desktopOnly?: boolean; hint: string }[] = [
  { value: 'h264', label: 'H.264 · .mp4', desktopOnly: true, hint: 'Plays everywhere. Muxed with the processed audio.' },
  { value: 'hevc', label: 'HEVC · .mp4', desktopOnly: true, hint: 'Smaller at the same quality; fussier about players.' },
  { value: 'prores', label: 'ProRes 422 HQ · .mov', desktopOnly: true, hint: 'For handing to an edit. Large files, uncompressed audio.' },
  { value: 'gif', label: 'Animated GIF', desktopOnly: true, hint: 'Palette-optimised. No audio, obviously.' },
  { value: 'webm', label: 'WebM · VP9 + Opus', hint: 'Captured in real time from the preview. The only video format a browser tab can write on its own.' },
  { value: 'pngseq', label: 'PNG sequence (.zip)', hint: 'Deterministic frames plus a WAV of the processed audio, zipped.' },
  { value: 'wav', label: 'Audio only · .wav', hint: 'Renders the audio chain offline at 48 kHz / 24-bit.' },
];

export function ExportPanel({
  value,
  duration,
  busy,
  progress,
  status,
  onChange,
  onRenderDeterministic,
  onRecordRealtime,
  onSnapshot,
  onCancel,
}: Props) {
  const [ffmpeg, setFfmpeg] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isDesktop) {
      setFfmpeg(false);
      return;
    }
    window.crtbox?.ffmpegAvailable().then(setFfmpeg).catch(() => setFfmpeg(false));
  }, []);

  const set = <K extends keyof ExportSettings>(key: K, v: ExportSettings[K]) =>
    onChange({ ...value, [key]: v });

  const available = FORMATS.filter((f) => !f.desktopOnly || (isDesktop && ffmpeg !== false));
  const active = FORMATS.find((f) => f.value === value.format);
  const realtime = value.format === 'webm';
  const audioOnly = value.format === 'wav';

  const start = value.useSourceRange ? 0 : value.start;
  const end = value.useSourceRange ? duration : value.end;
  const frames = Math.max(1, Math.round((end - start) * value.fps));

  return (
    <div className="export">
      <div className="row">
        <label className="field">
          <span>Format</span>
          <select
            value={value.format}
            onChange={(e) => set('format', e.target.value as ExportFormat)}
            disabled={busy}
          >
            {available.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        {!audioOnly && (
          <label className="field small">
            <span>FPS</span>
            <input
              type="number"
              min={1}
              max={120}
              value={value.fps}
              onChange={(e) => set('fps', Math.max(1, Math.min(120, Number(e.target.value) || 30)))}
              disabled={busy}
            />
          </label>
        )}

        {!audioOnly && (value.format === 'h264' || value.format === 'hevc') && (
          <label className="field small">
            <span>CRF</span>
            <input
              type="number"
              min={0}
              max={51}
              value={value.quality}
              onChange={(e) => set('quality', Number(e.target.value) || 18)}
              disabled={busy}
            />
          </label>
        )}

        {!audioOnly && (
          <label className="field small">
            <span>Scale</span>
            <select
              value={String(value.scale)}
              onChange={(e) => set('scale', Number(e.target.value))}
              disabled={busy}
            >
              {[0.5, 0.75, 1, 1.5, 2].map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {active && <p className="export-hint">{active.hint}</p>}

      {duration > 0 && !audioOnly && (
        <div className="row">
          <label className="field check">
            <input
              type="checkbox"
              checked={value.useSourceRange}
              onChange={(e) => set('useSourceRange', e.target.checked)}
              disabled={busy}
            />
            <span>Whole clip</span>
          </label>
          {!value.useSourceRange && (
            <>
              <label className="field small">
                <span>In</span>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={duration}
                  value={value.start}
                  onChange={(e) => set('start', Number(e.target.value) || 0)}
                  disabled={busy}
                />
              </label>
              <label className="field small">
                <span>Out</span>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={duration}
                  value={value.end}
                  onChange={(e) => set('end', Number(e.target.value) || 0)}
                  disabled={busy}
                />
              </label>
            </>
          )}
          <span className="frames">{frames} frames</span>
        </div>
      )}

      {isDesktop && ffmpeg === false && (
        <p className="warn">
          ffmpeg was not found, so the .mp4/.mov/.gif targets are hidden. Install the optional
          <code> ffmpeg-static </code> dependency, or set <code>CRTBOX_FFMPEG</code> to a binary.
        </p>
      )}

      <div className="row actions">
        {busy ? (
          <>
            <div className="progress">
              <div style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <button className="danger" onClick={onCancel}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              className="primary"
              onClick={realtime ? onRecordRealtime : onRenderDeterministic}
              disabled={duration <= 0 && !audioOnly}
            >
              {realtime ? 'Record in real time' : audioOnly ? 'Render audio' : 'Render'}
            </button>
            <button onClick={onSnapshot}>Snapshot frame</button>
          </>
        )}
      </div>

      {status && <p className={`status${status.startsWith('Error') ? ' error' : ''}`}>{status}</p>}
    </div>
  );
}
