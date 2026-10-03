/** Client configuration from Vite env (VITE_* only; never put secrets here). */
export const config = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:4000',
  realtimeUrl: `${import.meta.env.VITE_REALTIME_URL ?? 'ws://localhost:4001'}/ws`,
};
