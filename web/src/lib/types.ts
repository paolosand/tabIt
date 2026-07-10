export interface Source { kind: string; videoId?: string | null; title?: string | null; duration: number; }
export interface Analysis { engineVersion: string; createdAt: string; }
export interface Key { tonic: string; mode: string; confidence: number; }
export interface Scale { name: string; notes: string[]; }
export interface Tempo { bpm: number; }
export interface ChordSegment {
  start: number; end: number; label: string;
  root: string; quality: string; bass: string; confidence: number;
}
export interface Chart {
  schemaVersion: number; source: Source; analysis: Analysis;
  key: Key; scales: Scale[]; tempo: Tempo;
  beats: number[]; sections: unknown[]; chords: ChordSegment[];
}
export type JobState =
  | { status: 'pending' }
  | { status: 'done'; chart: Chart }
  | { status: 'error'; error: string };
