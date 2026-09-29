import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import { labeledSeconds, toLab } from '../src/lib/gold/lab.ts';
import { VIDEO_ID_RE, type GoldFile, type GoldSummary } from '../src/lib/gold/types.ts';
import { validateGold } from '../src/lib/gold/validate.ts';

export const MAX_BODY_BYTES = 2 * 1024 * 1024;

export type WriteResult = { ok: true } | { ok: false; status: number; error: string };

/** Stable key order (and no unknown keys) so saved JSON diffs cleanly in git. */
function canonical(f: GoldFile): GoldFile {
  return {
    schemaVersion: f.schemaVersion,
    videoId: f.videoId,
    title: f.title,
    url: f.url,
    duration: f.duration,
    key: { tonic: f.key.tonic, mode: f.key.mode, source: f.key.source },
    grid: {
      factor: f.grid.factor, nudgeSec: f.grid.nudgeSec,
      beatsPerBar: f.grid.beatsPerBar, downbeatBeat: f.grid.downbeatBeat,
    },
    beats: f.beats,
    engine: {
      version: f.engine.version,
      chords: f.engine.chords.map((c) => ({
        start: c.start, end: c.end, root: c.root, quality: c.quality, label: c.label, confidence: c.confidence,
      })),
    },
    blind: f.blind,
    spans: f.spans.map((s) => ({
      start: s.start, end: s.end, root: s.root, quality: s.quality, label: s.label, flag: s.flag, source: s.source,
    })),
    updatedAt: f.updatedAt,
  };
}

export function createGoldStore(dir: string) {
  const atomicWrite = (target: string, text: string) => {
    const tmp = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, target);
  };
  return {
    list(): GoldSummary[] {
      if (!fs.existsSync(dir)) return [];
      const out: GoldSummary[] = [];
      for (const name of fs.readdirSync(dir)) {
        const m = /^([A-Za-z0-9_-]{11})\.json$/.exec(name);
        if (!m) continue;
        try {
          const f = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as GoldFile;
          out.push({ videoId: m[1], title: f.title, updatedAt: f.updatedAt, labeledSeconds: labeledSeconds(f.spans) });
        } catch {
          // skip an unreadable or hand-broken file rather than failing the whole list
        }
      }
      return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    read(id: string): string | null {
      if (!VIDEO_ID_RE.test(id)) return null;
      try {
        return fs.readFileSync(path.join(dir, `${id}.json`), 'utf8');
      } catch {
        return null;
      }
    },
    write(id: string, body: unknown): WriteResult {
      if (!VIDEO_ID_RE.test(id)) return { ok: false, status: 400, error: 'invalid video id' };
      const v = validateGold(body, id);
      if (!v.ok) return { ok: false, status: 400, error: v.error };
      const file = canonical(v.file);
      fs.mkdirSync(dir, { recursive: true });
      // .lab files first, JSON (the source of truth) last
      atomicWrite(path.join(dir, `${id}.lab`), toLab(file, 'labeled'));
      atomicWrite(path.join(dir, `${id}.sure.lab`), toLab(file, 'sure'));
      atomicWrite(path.join(dir, `${id}.json`), JSON.stringify(file, null, 2) + '\n');
      return { ok: true };
    },
  };
}
export type GoldStore = ReturnType<typeof createGoldStore>;

export function goldHandler(store: GoldStore) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    };
    const id = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/^\/+/, '');

    if (req.method === 'GET') {
      if (id === '') return send(200, store.list());
      const text = store.read(id);
      if (text === null) return send(404, { error: 'not found' });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return void res.end(text);
    }

    if (req.method === 'PUT' && id !== '') {
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
        return send(415, { error: 'expected application/json' });
      }
      const chunks: Buffer[] = [];
      let size = 0;
      let tooBig = false;
      req.on('data', (chunk: Buffer) => {
        if (tooBig) return;
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          tooBig = true;
          send(413, { error: 'body too large' });
          req.resume(); // drain the rest so the connection stays healthy
        } else {
          chunks.push(chunk);
        }
      });
      req.on('end', () => {
        if (tooBig) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return send(400, { error: 'invalid JSON' });
        }
        const r = store.write(id, parsed);
        if (r.ok) send(200, { ok: true });
        else send(r.status, { error: r.error });
      });
      return;
    }

    send(405, { error: 'method not allowed' });
  };
}

/** Dev-server-only: exists under `vite dev`, never in a production build. */
export function goldPlugin(dir: string): Plugin {
  const handler = goldHandler(createGoldStore(dir));
  return {
    name: 'tabit-gold',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__gold', handler);
    },
  };
}
