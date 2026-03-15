import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AxiosError } from 'axios';
import App from './App';
import { ERROR_MESSAGES, ApiError } from './types';
import './index.css';

function globalErrorHandler(error: unknown): void {
  if (error instanceof AxiosError) {
    const axiosError = error as AxiosError<{ code?: string; message?: string }>;
    const payload = axiosError.response?.data;
    const code = payload?.code;
    const fallbackMessage = payload?.message || 'Erreur serveur inattendue';
    const resolved = code ? ERROR_MESSAGES[code] : undefined;
    if (resolved) {
      window.dispatchEvent(new CustomEvent('app:error', { detail: resolved }));
      return;
    }
    window.dispatchEvent(new CustomEvent('app:error', { detail: fallbackMessage }));
    return;
  }

  const genericError: ApiError = {
    code: 'INTERNAL_ERROR',
    message: 'Erreur serveur inattendue',
  };
  window.dispatchEvent(new CustomEvent('app:error', { detail: genericError.message }));
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error: unknown) => globalErrorHandler(error),
    },
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
