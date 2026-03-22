import { useQueries, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/services/api-client';
import type { PresignResponse } from '@/types/api';

// ─── Response types ──────────────────────────────────────────
export interface BatchStatusResponse {
  batchId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  recordCount?: number;
  errorCount?: number;
  errorMessage?: string;
}

// ─── Query keys ──────────────────────────────────────────────
export const uploadKeys = {
  batchStatus: (batchId: string) => ['upload', 'batch', batchId] as const,
};

// ─── Hooks ───────────────────────────────────────────────────

/** Request a presigned S3 URL for CSV upload. */
export function usePresignUrl() {
  return useMutation({
    mutationFn: (input: { fileName: string; contentType: string }) =>
      apiClient.post<PresignResponse>('/upload/presign', input),
  });
}

/** Poll multiple batch statuses in parallel. */
export function useBatchStatuses(batchIds: string[]) {
  return useQueries({
    queries: batchIds.map((id) => ({
      queryKey: uploadKeys.batchStatus(id),
      queryFn: () =>
        apiClient.get<BatchStatusResponse>(
          `/upload/${encodeURIComponent(id)}/status`,
        ),
      enabled: !!id,
      refetchInterval: (query: { state: { data?: BatchStatusResponse } }) => {
        const status = query.state.data?.status;
        if (status === 'COMPLETED' || status === 'FAILED') return false;
        return 3000;
      },
    })),
  });
}
