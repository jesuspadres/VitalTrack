import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE = `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')}/v1`;

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Array<{ field: string; issue: string }>;
  };
  meta: {
    requestId: string;
    timestamp: string;
    pagination?: { nextToken: string | null; limit: number };
  };
}

class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public details?: Array<{ field: string; issue: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getAuthToken(): Promise<string> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? '';
  } catch {
    return '';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  requireAuth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (requireAuth) {
    const token = await getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json: ApiResponse<T> = await res.json();

  if (!json.success || json.error) {
    throw new ApiError(
      json.error?.code ?? 'UNKNOWN_ERROR',
      json.error?.message ?? 'An unexpected error occurred',
      res.status,
      json.error?.details,
    );
  }

  return json.data as T;
}

export const apiClient = {
  get: <T>(path: string, requireAuth = true) => request<T>('GET', path, undefined, requireAuth),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export { ApiError };
