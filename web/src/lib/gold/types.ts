export type GoldQuality = 'maj' | 'min' | 'dom7' | 'min7' | 'maj7';
export type SpanQuality = GoldQuality | 'N' | 'X';
export type Flag = 'sure' | 'guess' | 'skip';
export type Provenance = 'confirmed' | 'edited' | 'manual';
export type Mode = 'major' | 'minor';

/** A placeable chord. root is a sharp-spelled pitch class, 'N' for no chord, null for X (unsure). */
export interface ChordChoice {
  root: string | null;
  quality: SpanQuality;
}

export interface GoldKey {
  tonic: string;
  mode: Mode;
  source: 'engine' | 'user';
}

export interface GoldGrid {
  factor: 0.5 | 1 | 2;
  nudgeSec: number;
  beatsPerBar: number;
  downbeatBeat: number;
}

export interface EngineChord {
  start: number;
  end: number;
  root: string;
  quality: string;
  label: string;
  confidence: number;
}

export interface GoldSpan {
  start: number;
  end: number;
  root: string | null;
  quality: SpanQuality;
  /** Harte label: 'A:min7' | 'N' | 'X'. Derived from root+quality; the .lab export reads this. */
  label: string;
  flag: Flag;
  source: Provenance;
}

export interface GoldFile {
  schemaVersion: 1;
  videoId: string;
  title: string;
  url: string;
  duration: number;
  key: GoldKey;
  grid: GoldGrid;
  /** Engine beat snapshot (raw, seconds). */
  beats: number[];
  engine: { version: string; chords: EngineChord[] };
  blind: boolean;
  spans: GoldSpan[];
  updatedAt: string;
}

export interface GoldSummary {
  videoId: string;
  title: string;
  updatedAt: string;
  labeledSeconds: number;
}

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
