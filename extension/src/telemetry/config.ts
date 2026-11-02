// Injected at build time by esbuild `define` (see build.mjs). Empty string when the
// build was made without SUPABASE_URL / SUPABASE_ANON_KEY, which makes telemetry a no-op.
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;

export const SUPABASE_URL: string = typeof __SUPABASE_URL__ === 'string' ? __SUPABASE_URL__ : '';
export const SUPABASE_ANON_KEY: string = typeof __SUPABASE_ANON_KEY__ === 'string' ? __SUPABASE_ANON_KEY__ : '';
