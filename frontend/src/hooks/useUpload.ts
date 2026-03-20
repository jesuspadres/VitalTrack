import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/services/api-client';
import type { PresignResponse } from '@/types/api';

// ─── Response types ──────────────────────────────────────────
interface BatchStatusResponse {
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

/** Poll batch processing status. Stops when status is COMPLETED or FAILED. */
export function useBatchStatus(batchId: string | null) {
  return useQuery({
    queryKey: uploadKeys.batchStatus(batchId ?? ''),
    queryFn: () =>
      apiClient.get<BatchStatusResponse>(
        `/upload/${encodeURIComponent(batchId!)}/status`,
      ),
    enabled: !!batchId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'COMPLETED' || status === 'FAILED') return false;
      return 3000;
    },
  });
}
