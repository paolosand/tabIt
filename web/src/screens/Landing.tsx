import type { KeyboardEvent } from 'react';

interface LandingProps {
  value: string;
  onChange: (value: string) => void;
  onSubmitUrl: (url: string) => void;
  onSubmitFile: (file: File) => void;
  error?: string | null;
}

export default function Landing({ value, onChange, onSubmitUrl, onSubmitFile, error }: LandingProps) {
  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onSubmitUrl(trimmed);
  };

  const onUrlKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit();
  };

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onSubmitFile(file);
  };

  return (
    <div
      data-screen-label="Landing"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        animation: 'tabit-fade-in 0.4s ease-out',
      }}
    >
      <div
        style={{
          fontFamily: "'Fraunces', serif",
          fontStyle: 'italic',
          fontWeight: 600,
          fontSize: 56,
          color: 'oklch(0.28 0.02 70)',
          letterSpacing: '-0.01em',
          marginBottom: 6,
        }}
      >
        tabIt
      </div>
      <div
        style={{
          fontSize: 14,
          color: 'oklch(0.52 0.02 70)',
          letterSpacing: '0.02em',
          marginBottom: 44,
          textAlign: 'center',
        }}
      >
        paste a song, follow the chords, play along
      </div>

      {error && (
        <div
          style={{
            width: '100%',
            maxWidth: 560,
            marginBottom: 16,
            fontSize: 13,
            color: 'oklch(0.55 0.12 25)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Couldn&apos;t analyze that — {error}. Try again, or drop an audio file instead.
        </div>
      )}

      <div
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'oklch(0.988 0.006 85)',
          borderRadius: 3,
          padding: '36px 32px 28px',
          position: 'relative',
          boxShadow: '0 1px 2px oklch(0.28 0.02 70 / 0.06), 0 8px 24px oklch(0.28 0.02 70 / 0.06)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 44,
            top: 0,
            bottom: 0,
            width: 1.5,
            background: 'oklch(0.70 0.10 25 / 0.55)',
          }}
        />

        <div style={{ paddingLeft: 28 }}>
          <label
            style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'oklch(0.52 0.02 70)',
              marginBottom: 10,
            }}
          >
            YouTube link
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onUrlKeyDown}
            placeholder="https://www.youtube.com/watch?v=..."
            style={{
              width: '100%',
              border: 'none',
              borderBottom: '1.5px solid oklch(0.88 0.015 250)',
              background: 'transparent',
              fontFamily: "'Fraunces', serif",
              fontSize: 20,
              color: 'oklch(0.28 0.02 70)',
              padding: '6px 2px 12px',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22 }}>
            <button
              className="btn-primary"
              onClick={submit}
              style={{
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'oklch(0.988 0.006 85)',
                background: 'oklch(0.28 0.02 70)',
                border: 'none',
                borderRadius: 2,
                padding: '12px 22px',
                cursor: 'pointer',
              }}
            >
              Find the chords
            </button>
            <span style={{ fontSize: 12, color: 'oklch(0.52 0.02 70)' }}>
              no account, no clutter — paste and go
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              margin: '22px 0 4px',
              color: 'oklch(0.52 0.02 70)',
            }}
          >
            <div style={{ flex: 1, height: 1, background: 'oklch(0.88 0.015 250)' }} />
            <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'oklch(0.88 0.015 250)' }} />
          </div>

          <label
            className="drop-label"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              border: '1.5px dashed oklch(0.55 0.02 70 / 0.45)',
              borderRadius: 3,
              padding: 14,
              fontSize: 13,
              color: 'oklch(0.52 0.02 70)',
              cursor: 'pointer',
            }}
          >
            <span>drop an audio file, or click to choose one</span>
            <input
              type="file"
              accept="audio/*"
              onChange={onFileChosen}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
