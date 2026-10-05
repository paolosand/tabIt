import { PITCH_NAMES } from './degrees.ts';
import { VIDEO_ID_RE, type GoldFile } from './types.ts';

export type Validation = { ok: true; file: GoldFile } | { ok: false; error: string };

const QUALITIES = new Set(['maj', 'min', 'dom7', 'min7', 'maj7', 'N', 'X']);
const FLAGS = new Set(['sure', 'guess', 'skip']);
const SOURCES = new Set(['confirmed', 'edited', 'manual']);
const MAX_BEATS = 20000;
const MAX_SPANS = 5000;
const MAX_ENGINE = 5000;
const TOL = 1e-6;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate an untrusted body as a GoldFile. `expectedId` (from the URL) must equal `videoId`. */
export function validateGold(input: unknown, expectedId?: string): Validation {
  const fail = (error: string): Validation => ({ ok: false, error });
  if (!isObj(input)) return fail('body must be an object');
  if (input.schemaVersion !== 1) return fail('schemaVersion must be 1');
  if (typeof input.videoId !== 'string' || !VIDEO_ID_RE.test(input.videoId)) return fail('invalid videoId');
  if (expectedId !== undefined && input.videoId !== expectedId) return fail('videoId does not match the URL');
  if (typeof input.title !== 'string' || typeof input.url !== 'string') return fail('title and url must be strings');
  if (!isNum(input.duration) || input.duration <= 0) return fail('duration must be a positive number');
  const duration = input.duration;

  const key = input.key;
  if (!isObj(key) || !(PITCH_NAMES as readonly string[]).includes(String(key.tonic)) ||
      (key.mode !== 'major' && key.mode !== 'minor') || (key.source !== 'engine' && key.source !== 'user')) {
    return fail('invalid key');
  }

  const grid = input.grid;
  if (!isObj(grid) || ![0.5, 1, 2].includes(grid.factor as number) || !isNum(grid.nudgeSec) ||
      !Number.isInteger(grid.beatsPerBar) || (grid.beatsPerBar as number) < 1 || (grid.beatsPerBar as number) > 12 ||
      !Number.isInteger(grid.downbeatBeat) || (grid.downbeatBeat as number) < 0) {
    return fail('invalid grid');
  }

  if (!Array.isArray(input.beats) || input.beats.length > MAX_BEATS || !input.beats.every(isNum)) {
    return fail('invalid beats');
  }

  const engine = input.engine;
  if (!isObj(engine) || typeof engine.version !== 'string' || !Array.isArray(engine.chords) ||
      engine.chords.length > MAX_ENGINE ||
      !engine.chords.every((c) => isObj(c) && isNum(c.start) && isNum(c.end) && typeof c.root === 'string' &&
        typeof c.quality === 'string' && typeof c.label === 'string' && isNum(c.confidence))) {
    return fail('invalid engine snapshot');
  }

  if (typeof input.blind !== 'boolean') return fail('blind must be a boolean');
  if (typeof input.updatedAt !== 'string') return fail('updatedAt must be a string');

  if (!Array.isArray(input.spans) || input.spans.length > MAX_SPANS) return fail('invalid spans');
  let prevEnd = 0;
  for (const [i, s] of input.spans.entries()) {
    const at = `span ${i}`;
    if (!isObj(s)) return fail(`${at} must be an object`);
    if (!isNum(s.start) || !isNum(s.end)) return fail(`${at}: start and end must be numbers`);
    if (s.end <= s.start) return fail(`${at}: end must be after start`);
    if (s.start < prevEnd - TOL) return fail(`${at}: spans must be sorted and must not overlap`);
    if (s.end > duration + TOL) return fail(`${at}: end exceeds the song duration`);
    if (typeof s.quality !== 'string' || !QUALITIES.has(s.quality)) return fail(`${at}: invalid quality`);
    if (typeof s.flag !== 'string' || !FLAGS.has(s.flag)) return fail(`${at}: invalid flag`);
    if (typeof s.source !== 'string' || !SOURCES.has(s.source)) return fail(`${at}: invalid source`);
    if (typeof s.label !== 'string') return fail(`${at}: label must be a string`);
    const isX = s.quality === 'X';
    if (isX !== (s.flag === 'skip') || isX !== (s.root === null) || (!isX && typeof s.root !== 'string')) {
      return fail(`${at}: an X span must have root null and flag skip (and only X spans)`);
    }
    prevEnd = s.end;
  }
  return { ok: true, file: input as unknown as GoldFile };
}
