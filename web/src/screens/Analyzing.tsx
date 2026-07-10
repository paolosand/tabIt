export default function Analyzing() {
  return (
    <div
      data-screen-label="Analyzing"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        animation: 'tabit-fade-in 0.35s ease-out',
      }}
    >
      <div
        style={{
          fontFamily: "'Fraunces', serif",
          fontStyle: 'italic',
          fontWeight: 600,
          fontSize: 32,
          color: 'oklch(0.28 0.02 70)',
        }}
      >
        tabIt
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          fontSize: 14,
          color: 'oklch(0.52 0.02 70)',
          letterSpacing: '0.02em',
        }}
      >
        <span>Listening for chords, key and scale</span>
        <span style={{ display: 'inline-flex', gap: 3 }}>
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'oklch(0.55 0.02 70)',
              display: 'inline-block',
              animation: 'tabit-pulse 1.1s ease-in-out infinite',
              animationDelay: '0s',
            }}
          />
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'oklch(0.55 0.02 70)',
              display: 'inline-block',
              animation: 'tabit-pulse 1.1s ease-in-out infinite',
              animationDelay: '0.15s',
            }}
          />
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'oklch(0.55 0.02 70)',
              display: 'inline-block',
              animation: 'tabit-pulse 1.1s ease-in-out infinite',
              animationDelay: '0.3s',
            }}
          />
        </span>
      </div>
      <div
        style={{
          width: 220,
          height: 1.5,
          background: 'oklch(0.88 0.015 250)',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 2,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '40%',
            background: 'oklch(0.70 0.10 25 / 0.7)',
            animation: 'tabit-sweep 1.4s ease-in-out infinite',
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: 'oklch(0.52 0.02 70)', letterSpacing: '0.02em' }}>
        first listen takes a minute or two — after that it&apos;s instant
      </div>
    </div>
  );
}
