import axios, {
  AxiosError,
  AxiosHeaders,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import { useAuthStore } from '../stores/auth.store';
import { ERROR_MESSAGES } from '../types';

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  code?: string;
  message?: string;
  timestamp: string;
};

type RefreshResponse = {
  access_token: string;
  refresh_token: string;
};

type PendingRequest = {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
};

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

let isRefreshing = false;
let pendingRequests: PendingRequest[] = [];

function notifyError(message: string): void {
  window.dispatchEvent(new CustomEvent('app:error', { detail: message }));
}

function processQueue(error: unknown, token: string | null): void {
  pendingRequests.forEach((promise) => {
    if (error) {
      promise.reject(error);
      return;
    }

    if (token) {
      promise.resolve(token);
      return;
    }

    promise.reject(new Error('No token available after refresh'));
  });

  pendingRequests = [];
}

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (!token) {
    return config;
  }

  const headers = config.headers instanceof AxiosHeaders ? config.headers : new AxiosHeaders(config.headers);
  headers.set('Authorization', `Bearer ${token}`);
  config.headers = headers;

  return config;
});

apiClient.interceptors.response.use(
  (response: AxiosResponse<ApiEnvelope<unknown>>) => response,
  async (error: AxiosError) => {
    const originalRequest = (error.config ?? {}) as RetriableRequestConfig;
    const status = error.response?.status;
    const requestUrl = originalRequest.url ?? '';
    const isRefreshRequest = requestUrl.includes('/auth/refresh');

    if (status === 401 && isRefreshRequest) {
      useAuthStore.getState().logout();
      return Promise.reject(error);
    }

    if (status === 401 && !originalRequest._retry) {
      const authStore = useAuthStore.getState();

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingRequests.push({
            resolve: (token: string) => {
              const headers =
                originalRequest.headers instanceof AxiosHeaders
                  ? originalRequest.headers
                  : new AxiosHeaders(originalRequest.headers);
              headers.set('Authorization', `Bearer ${token}`);
              originalRequest.headers = headers;
              resolve(apiClient(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshResponse = await axios.post<ApiEnvelope<RefreshResponse>>(
          `${import.meta.env.VITE_API_URL || '/api/v1'}/auth/refresh`,
          {},
          { timeout: 30000, headers: { 'Content-Type': 'application/json' }, withCredentials: true },
        );

        const refreshed = refreshResponse.data.data;
        useAuthStore.getState().setTokens(refreshed.access_token, refreshed.refresh_token);

        processQueue(null, refreshed.access_token);

        const headers =
          originalRequest.headers instanceof AxiosHeaders
            ? originalRequest.headers
            : new AxiosHeaders(originalRequest.headers);
        headers.set('Authorization', `Bearer ${refreshed.access_token}`);
        originalRequest.headers = headers;

        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (status === 401) {
      useAuthStore.getState().logout();
      return Promise.reject(error);
    }

    if (status === 403) {
      notifyError(ERROR_MESSAGES.AUTH_004 ?? 'Action non autorisee pour votre role');
    } else if (status && status >= 500) {
      notifyError('Erreur serveur inattendue');
    }

    return Promise.reject(error);
  },
);

export default apiClient;
export { apiClient };

export function unwrapApiData<T>(response: AxiosResponse<ApiEnvelope<T> | T>): T {
  const payload = response.data;
  if (
    payload &&
    typeof payload === 'object' &&
    'data' in payload &&
    'success' in payload
  ) {
    return (payload as ApiEnvelope<T>).data;
  }

  return payload as T;
}

export function getApiErrorCode(error: unknown): string | undefined {
  const axiosError = error as AxiosError<{ code?: string }>;
  return axiosError.response?.data?.code;
}
