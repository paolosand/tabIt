import type { CSSProperties } from 'react';

export interface EditPopoverProps {
  label: string;
  edited: boolean;
  onRootUp: () => void;
  onRootDown: () => void;
  onQuality: (quality: string) => void;
  onReset: () => void;
  onClose: () => void;
}

// Displayed vs. stored value per task brief / engine schema (dom7 -> "7", min7 -> "m7").
const QUALITY_OPTIONS: { display: string; value: string }[] = [
  { display: 'maj', value: 'maj' },
  { display: 'min', value: 'min' },
  { display: '7', value: 'dom7' },
  { display: 'maj7', value: 'maj7' },
  { display: 'm7', value: 'min7' },
  { display: 'sus2', value: 'sus2' },
  { display: 'sus4', value: 'sus4' },
];

const rootBtnStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  border: '1.5px solid oklch(0.52 0.02 70 / 0.4)',
  background: 'none',
  cursor: 'pointer',
  fontSize: 14,
};

export default function EditPopover({
  label,
  edited,
  onRootUp,
  onRootDown,
  onQuality,
  onReset,
  onClose,
}: EditPopoverProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginTop: 6,
        zIndex: 20,
        background: 'oklch(0.988 0.006 85)',
        borderRadius: 4,
        boxShadow: '0 4px 14px oklch(0.28 0.02 70 / 0.22)',
        padding: '12px 14px',
        width: 220,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'oklch(0.52 0.02 70)',
          }}
        >
          Fix this chord
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ border: 'none', background: 'none', color: 'oklch(0.52 0.02 70)', fontSize: 14, cursor: 'pointer', lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 10 }}>
        <button className="round-btn" onClick={onRootDown} aria-label="Root down" style={rootBtnStyle}>
          –
        </button>
        <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 20, minWidth: 64, textAlign: 'center' }}>
          {label}
        </span>
        <button className="round-btn" onClick={onRootUp} aria-label="Root up" style={rootBtnStyle}>
          +
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
        {QUALITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className="quality-btn"
            onClick={() => onQuality(opt.value)}
            style={{
              fontSize: 11,
              padding: '5px 8px',
              borderRadius: 2,
              border: '1px solid oklch(0.52 0.02 70 / 0.35)',
              background: 'none',
              cursor: 'pointer',
              color: 'oklch(0.28 0.02 70)',
            }}
          >
            {opt.display}
          </button>
        ))}
      </div>
      {edited && (
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <button
            onClick={onReset}
            style={{ fontSize: 11, color: 'oklch(0.52 0.02 70)', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}
          >
            reset to detected
          </button>
        </div>
      )}
    </div>
  );
}
