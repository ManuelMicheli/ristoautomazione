import { useAuthStore } from '@/stores/auth-store';
import type { ApiResponse, ApiErrorResponse } from '@/types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

/**
 * Custom error class for API errors with structured error data.
 */
export class ApiError extends Error {
  public statusCode: number;
  public details?: Record<string, string[]>;

  constructor(response: ApiErrorResponse) {
    super(response.message || response.error);
    this.name = 'ApiError';
    this.statusCode = response.statusCode;
    this.details = response.details;
  }
}

/**
 * Attempt to refresh the access token using the refresh token.
 * Returns true if refresh succeeded, false otherwise.
 */
async function tryRefreshToken(): Promise<boolean> {
  const { refreshToken, setTokens, logout } = useAuthStore.getState();

  if (!refreshToken) {
    logout();
    return false;
  }

  try {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      logout();
      return false;
    }

    const data = (await response.json()) as {
      data: { accessToken: string; refreshToken: string };
    };
    setTokens(data.data.accessToken, data.data.refreshToken);
    return true;
  } catch {
    logout();
    return false;
  }
}

/**
 * Core fetch wrapper with auth injection and token refresh.
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  retry: boolean = true
): Promise<ApiResponse<T>> {
  const { token } = useAuthStore.getState();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 - try refresh token once
  if (response.status === 401 && retry) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return request<T>(endpoint, options, false);
    }
    throw new ApiError({
      error: 'Unauthorized',
      message: 'Sessione scaduta. Effettua nuovamente il login.',
      statusCode: 401,
    });
  }

  // Parse response body
  const body = await response.json().catch(() => null);

  // Handle error responses
  if (!response.ok) {
    const errorResponse: ApiErrorResponse = body ?? {
      error: response.statusText,
      message: `Request failed with status ${response.status}`,
      statusCode: response.status,
    };
    throw new ApiError(errorResponse);
  }

  return body as ApiResponse<T>;
}

/**
 * Typed API client with convenience methods.
 */
export const apiClient = {
  /**
   * GET request.
   * Usage: const { data } = await apiClient.get<User[]>('/users');
   */
  get<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<ApiResponse<T>> {
    let url = endpoint;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }
    return request<T>(url, { method: 'GET' });
  },

  /**
   * POST request.
   * Usage: const { data } = await apiClient.post<User>('/users', { name: 'John' });
   */
  post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  /**
   * PUT request.
   * Usage: const { data } = await apiClient.put<User>('/users/1', { name: 'Jane' });
   */
  put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  /**
   * DELETE request.
   * Usage: await apiClient.del<void>('/users/1');
   */
  del<T>(endpoint: string): Promise<ApiResponse<T>> {
    return request<T>(endpoint, { method: 'DELETE' });
  },

  /**
   * Upload file with multipart/form-data.
   * Usage: await apiClient.upload<Invoice>('/invoices/upload', formData);
   */
  upload<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
    const { token } = useAuthStore.getState();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Don't set Content-Type for FormData - browser sets it with boundary
    return request<T>(endpoint, {
      method: 'POST',
      headers,
      body: formData as unknown as string,
    });
  },
};
