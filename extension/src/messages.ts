import type { Chart } from '../../web/src/lib/types';

export interface GetChartRequest { type: 'GET_CHART'; videoId: string; }

export type GetChartResponse =
  | { status: 'done'; chart: Chart }
  | { status: 'pending'; step?: string }
  | { status: 'offline' }
  | { status: 'error'; error: string };
