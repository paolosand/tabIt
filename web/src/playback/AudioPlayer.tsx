import { useEffect, useMemo, useRef } from 'react';
import type { PlaybackSource } from './usePlaybackTime';

export interface AudioPlayerProps {
  file: File;
  onReady: (source: PlaybackSource) => void;
}

export default function AudioPlayer({ file, onReady }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const url = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [url]);

  useEffect(() => {
    onReadyRef.current({
      getCurrentTime: () => audioRef.current?.currentTime ?? 0,
    });
  }, [url]);

  return (
    <div
      style={{
        flex: 'none',
        width: 300,
        aspectRatio: '16/9',
        background: 'oklch(0.988 0.006 85)',
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: '0 6px 18px oklch(0.28 0.02 70 / 0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 16px',
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- local audio has no track to caption */}
      <audio ref={audioRef} controls src={url} style={{ width: '100%' }} />
    </div>
  );
}
