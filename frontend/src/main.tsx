import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import './config/amplify';
import { AuthProvider } from './hooks/useAuth';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: 'glass-heavy !rounded-xl !text-sm !text-slate-700 !border-white/30',
              duration: 4000,
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
