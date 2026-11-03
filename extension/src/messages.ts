import type { Chart } from '../../web/src/lib/types';

export type ReportReason = 'chords' | 'key' | 'tempo' | 'other';

export interface GetChartRequest { type: 'GET_CHART'; videoId: string; }

export type GetChartResponse =
  | { status: 'done'; chart: Chart }
  | { status: 'pending'; step?: string }
  | { status: 'offline' }
  | { status: 'error'; error: string };

export interface GetHelperStatusRequest { type: 'GET_HELPER_STATUS'; }

export type HelperStatusResponse =
  | { state: 'up'; tooOld: boolean }
  | { state: 'down'; everSeen: boolean };

export interface ReportRequest { type: 'REPORT_BAD_TRANSCRIPTION'; chart: Chart; reportId: string; }
export interface ReportDetailsRequest { type: 'REPORT_DETAILS'; reportId: string; reason: ReportReason; note: string; }
export interface OkResponse { ok: boolean; }

export interface GetSharingRequest { type: 'GET_SHARING'; }
export interface SetSharingRequest { type: 'SET_SHARING'; shareUsage: boolean; }
export interface SharingResponse { shareUsage: boolean; }
/** Answer when the stored value cannot be read or written; the UI must not guess. */
export interface SharingErrorResponse { error: 'unavailable'; }
