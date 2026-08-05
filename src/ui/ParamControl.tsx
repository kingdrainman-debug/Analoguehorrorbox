import { useCallback, useEffect, useRef, useState } from 'react';
import { Param, ParamValue } from '../core/params';

interface Props {
  param: Param;
  value: ParamValue;
  isDefault: boolean;
  onChange(key: string, value: ParamValue): void;
}

/** Logarithmic sliders for frequencies and times, linear for everything else. */
function toSlider(param: Param, value: number): number {
  if (param.type !== 'float' || !param.log) return value;
  const lo = Math.log(Math.max(param.min, 1e-4));
  const hi = Math.log(Math.max(param.max, param.min + 1e-3));
  return (Math.log(Math.max(value, 1e-4)) - lo) / (hi - lo);
}

function fromSlider(param: Param, t: number): number {
  if (param.type !== 'float' || !param.log) return t;
  const lo = Math.log(Math.max(param.min, 1e-4));
  const hi = Math.log(Math.max(param.max, param.min + 1e-3));
  return Math.exp(lo + t * (hi - lo));
}

function format(param: Param, value: number): string {
  if (param.type === 'int') return String(Math.round(value));
  const span = param.type === 'float' ? param.max - param.min : 1;
  const decimals = span >= 1000 ? 0 : span >= 100 ? 1 : span >= 10 ? 2 : 3;
  return value.toFixed(decimals).replace(/\.?0+$/, '') || '0';
}

export function ParamControl({ param, value, isDefault, onChange }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const commitText = useCallback(
    (text: string) => {
      const n = Number(text);
      if (Number.isFinite(n)) onChange(param.key, n);
      setEditing(null);
    },
    [onChange, param.key],
  );

  useEffect(() => {
    if (editing !== null) inputRef.current?.select();
  }, [editing]);

  const reset = () => {
    onChange(param.key, param.def);
  };

  if (param.type === 'bool') {
    return (
      <label className="param param-bool" title={param.hint}>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(param.key, e.target.checked)}
        />
        <span className="param-label">{param.label}</span>
      </label>
    );
  }

  if (param.type === 'enum') {
    return (
      <div className="param param-enum" title={param.hint}>
        <div className="param-head">
          <span className="param-label">{param.label}</span>
          <button className="reset" onClick={reset} disabled={isDefault} title="Reset to default">
            ⟲
          </button>
        </div>
        <select value={String(value)} onChange={(e) => onChange(param.key, e.target.value)}>
          {param.options.map((o) => (
            <option key={o.value} value={o.value} title={o.hint}>
              {o.label}
            </option>
          ))}
        </select>
        {param.options.find((o) => o.value === value)?.hint && (
          <p className="param-hint">{param.options.find((o) => o.value === value)?.hint}</p>
        )}
      </div>
    );
  }

  const numeric = typeof value === 'number' ? value : param.def;
  const isLog = param.type === 'float' && !!param.log;
  const sliderValue = isLog ? toSlider(param, numeric) : numeric;
  const sliderMin = isLog ? 0 : param.min;
  const sliderMax = isLog ? 1 : param.max;
  const sliderStep = isLog ? 0.0005 : param.type === 'int' ? 1 : param.step;

  return (
    <div className={`param param-number${isDefault ? '' : ' modified'}`} title={param.hint}>
      <div className="param-head">
        <span className="param-label">{param.label}</span>
        <span className="param-value">
          {editing !== null ? (
            <input
              ref={inputRef}
              className="param-entry"
              value={editing}
              onChange={(e) => setEditing(e.target.value)}
              onBlur={(e) => commitText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitText((e.target as HTMLInputElement).value);
                if (e.key === 'Escape') setEditing(null);
              }}
            />
          ) : (
            <button className="param-readout" onClick={() => setEditing(format(param, numeric))}>
              {format(param, numeric)}
              {param.unit ? <em>{param.unit}</em> : null}
            </button>
          )}
        </span>
        <button className="reset" onClick={reset} disabled={isDefault} title="Reset to default">
          ⟲
        </button>
      </div>
      <input
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={sliderStep}
        value={sliderValue}
        onChange={(e) => {
          const raw = Number(e.target.value);
          const v = isLog ? fromSlider(param, raw) : raw;
          onChange(param.key, param.type === 'int' ? Math.round(v) : v);
        }}
        onDoubleClick={reset}
      />
    </div>
  );
}
