import axios from 'axios';
import { retryDelay, shouldRetry } from './retry';
import { connection, isNetworkFailure } from './connection';

const wasCancelled = (error) => axios.isCancel(error) || !!error.config?.signal?.aborted;
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
  timeout: 20000,
});
api.interceptors.response.use(
  (r) => {
    connection.requestSucceeded();
    return r;
  },
  async (error) => {
    // A cancelled request is neither an error to show nor a network failure.
    if (wasCancelled(error)) return Promise.reject(error);
    if (shouldRetry(error)) {
      const attempt = error.config.__attempt || 0;
      error.config.__attempt = attempt + 1;
      await new Promise((resolve) => setTimeout(resolve, retryDelay(error, attempt)));
      if (wasCancelled(error)) return Promise.reject(new axios.CanceledError('canceled', error.config));
      return api(error.config);
    }
    // Final failure point: no retries left (no response, or the host's 502/503/504).
    if (isNetworkFailure(error.response?.status)) connection.requestFailed();
    if (!error.config?.quiet)
      window.dispatchEvent(
        new CustomEvent('srgop:error', {
          detail: {
            message:
              error.response?.data?.message ||
              'Não foi possível conectar ao servidor. Verifique sua conexão e a disponibilidade da API.',
            origin: error.response?.data?.origin || `Conexão / ${error.config?.url || 'API'}`,
            status: error.response?.status,
          },
        }),
      );
    return Promise.reject(error);
  },
);
// Lightweight liveness check the connection monitor uses to clear a stale failure.
export const probeApi = () =>
  api.get('/health/live', { quiet: true, retry: false }).catch(() => {});
connection.setProbe(probeApi);
export async function downloadFile(path, name) {
  const { data } = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
