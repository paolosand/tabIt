import type { Chart } from './types';

export type Override = { root: string; quality: string; bass: string };
export type Overrides = Record<number, Override>;

export function chartKey(chart: Chart): string {
  return chart.source.videoId ?? `${chart.source.title ?? 'file'}:${chart.source.duration}`;
}

export function loadOverrides(key: string): Overrides {
  try {
    return JSON.parse(localStorage.getItem(`tabit:overrides:${key}`) ?? '{}');
  } catch {
    return {};
  }
}

export function saveOverrides(key: string, overrides: Overrides): void {
  localStorage.setItem(`tabit:overrides:${key}`, JSON.stringify(overrides));
}
