import axios from 'axios';
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
  timeout: 20000,
});
api.interceptors.response.use(
  (r) => r,
  (error) => {
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
export async function downloadFile(path, name) {
  const { data } = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
