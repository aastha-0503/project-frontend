import React from 'react';

/* =========================================================================
   Donut chart
   ========================================================================= */
export const Donut = ({ value, max = 100, size = 130, stroke = 12, label, sublabel, color }) => {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, (max > 0 ? value / max : 0)));
  const dash = circumference * pct;
  const c = color || 'var(--primary)';
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-block' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
                stroke="var(--bg-subtle)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
                stroke={c} strokeWidth={stroke} strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference}`}
                transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
          {label}
        </div>
        {sublabel && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sublabel}</div>
        )}
      </div>
    </div>
  );
};

/* =========================================================================
   Funnel chart — accepts an array of {label, value, max}
   ========================================================================= */
export const Funnel = ({ data }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        const totalPct = data[0].value > 0 ? Math.round((d.value / data[0].value) * 100) : 0;
        return (
          <div key={i} className="funnel-stage">
            <div className="funnel-label">{d.label}</div>
            <div className="funnel-bar" style={{ width: `${Math.max(8, pct)}%` }}>
              {d.value}
            </div>
            <div className="funnel-pct">{totalPct}%</div>
          </div>
        );
      })}
    </div>
  );
};

/* =========================================================================
   Histogram (vertical bars)
   ========================================================================= */
export const Histogram = ({ buckets, height = 140 }) => {
  const max = Math.max(...buckets.map(b => b.count), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height, padding: '8px 0 0' }}>
      {buckets.map((b, i) => {
        const h = (b.count / max) * (height - 36);
        return (
          <div key={i} className="histogram-bar">
            <div className="count">{b.count}</div>
            <div className={`bar ${b.tone || ''}`} style={{ height: `${Math.max(2, h)}px` }} />
            <div className="label">{b.label}</div>
          </div>
        );
      })}
    </div>
  );
};

/* =========================================================================
   Horizontal bar list — for skill demand etc.
   ========================================================================= */
export const HorizontalBars = ({ items, max }) => {
  const m = max || Math.max(...items.map(i => i.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it, idx) => {
        const pct = (it.value / m) * 100;
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 110, fontSize: '0.82rem', color: 'var(--text-main)', textAlign: 'right' }}>
              {it.label}
            </div>
            <div style={{ flex: 1, background: 'var(--bg-subtle)', borderRadius: 4, height: 14, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: it.color || 'linear-gradient(90deg, var(--primary), var(--accent))',
                borderRadius: 4,
                transition: 'width 0.4s',
              }} />
            </div>
            <div style={{ width: 30, fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'right' }}>
              {it.value}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* =========================================================================
   Sparkline
   ========================================================================= */
export const Sparkline = ({ values, width = 120, height = 32, color = 'var(--primary)' }) => {
  if (!values || values.length === 0) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const step = width / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / Math.max(max - min, 1)) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
};
