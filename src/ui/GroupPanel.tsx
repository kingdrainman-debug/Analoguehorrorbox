import { useMemo } from 'react';
import { DEFAULTS, Group, ParamValue, Settings } from '../core/params';
import { Timeline, isAnimated, indexAt } from '../core/timeline';
import { ParamControl } from './ParamControl';

interface Props {
  group: Group;
  settings: Settings;
  open: boolean;
  advanced: boolean;
  onToggleOpen(id: string): void;
  onChange(key: string, value: ParamValue): void;
  onReset(id: string): void;
  timeline: Timeline;
  /** Playhead position, so the keyframe marker can show whether one is here. */
  time: number;
  onToggleAnimate(key: string): void;
  onAddKeyframe(key: string): void;
}

export function GroupPanel({
  group,
  settings,
  open,
  advanced,
  onToggleOpen,
  onChange,
  onReset,
  timeline,
  time,
  onToggleAnimate,
  onAddKeyframe,
}: Props) {
  const enableKey = group.enableKey;
  const enabled = enableKey ? settings[enableKey] === true : true;

  const visible = useMemo(
    () => group.params.filter((p) => p.key !== enableKey && (advanced || !p.advanced)),
    [group.params, enableKey, advanced],
  );

  const modified = useMemo(
    () => group.params.some((p) => settings[p.key] !== DEFAULTS[p.key]),
    [group.params, settings],
  );

  const hiddenCount = group.params.length - visible.length - (enableKey ? 1 : 0);

  return (
    <section className={`group${enabled ? '' : ' disabled'}${open ? ' open' : ''}`}>
      <header className="group-head">
        <button className="group-toggle" onClick={() => onToggleOpen(group.id)}>
          <span className="chevron">{open ? '▾' : '▸'}</span>
          <span className="group-title">{group.label}</span>
          {modified && <span className="dot" title="Contains non-default values" />}
        </button>
        <div className="group-actions">
          <button
            className="ghost"
            onClick={() => onReset(group.id)}
            disabled={!modified}
            title="Reset this section"
          >
            ⟲
          </button>
          {enableKey && (
            <label className="switch" title={enabled ? 'Bypass this section' : 'Enable this section'}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => onChange(enableKey, e.target.checked)}
              />
              <span />
            </label>
          )}
        </div>
      </header>

      {open && (
        <div className="group-body">
          {group.hint && <p className="group-hint">{group.hint}</p>}
          {visible.map((p) => (
            <ParamControl
              key={p.key}
              param={p}
              value={settings[p.key]}
              isDefault={settings[p.key] === DEFAULTS[p.key]}
              onChange={onChange}
              animated={isAnimated(timeline, p.key)}
              atKeyframe={
                isAnimated(timeline, p.key) && indexAt(timeline[p.key], time) >= 0
              }
              onToggleAnimate={onToggleAnimate}
              onAddKeyframe={onAddKeyframe}
            />
          ))}
          {hiddenCount > 0 && !advanced && (
            <p className="group-hint muted">
              {hiddenCount} advanced parameter{hiddenCount === 1 ? '' : 's'} hidden.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
