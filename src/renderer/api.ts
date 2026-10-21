import type { VrApi } from '../shared/api';

declare global {
  interface Window {
    api: VrApi;
  }
}

export const api: VrApi = window.api;
