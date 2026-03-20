import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/services/api-client';
import type { BiomarkerRecord } from '@/types/api';

// ─── Response types ──────────────────────────────────────────

interface CreateBiomarkerInput {
  biomarkerType: string;
  value: number;
  unit: string;
  referenceRangeLow: number;
  referenceRangeHigh: number;
  source?: string;
}

interface UpdateBiomarkerInput {
  sk: string;
  value: number;
  unit: string;
  referenceRangeLow: number;
  referenceRangeHigh: number;
}

// ─── Query keys ──────────────────────────────────────────────
export const biomarkerKeys = {
  all: ['biomarkers'] as const,
  detail: (sk: string) => ['biomarkers', sk] as const,
};

// ─── Hooks ───────────────────────────────────────────────────

/** Fetch all biomarkers for the current user. */
export function useBiomarkers() {
  return useQuery({
    queryKey: biomarkerKeys.all,
    queryFn: () => apiClient.get<BiomarkerRecord[]>('/biomarkers'),
  });
}

/** Fetch a single biomarker by sort key. */
export function useBiomarker(sk: string) {
  return useQuery({
    queryKey: biomarkerKeys.detail(sk),
    queryFn: () => apiClient.get<BiomarkerRecord>(`/biomarkers/${encodeURIComponent(sk)}`),
    enabled: !!sk,
  });
}

/** Create a new biomarker record. */
export function useCreateBiomarker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBiomarkerInput) =>
      apiClient.post<BiomarkerRecord>('/biomarkers', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: biomarkerKeys.all });
    },
  });
}

/** Update an existing biomarker record. */
export function useUpdateBiomarker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sk, ...body }: UpdateBiomarkerInput) =>
      apiClient.put<BiomarkerRecord>(`/biomarkers/${encodeURIComponent(sk)}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: biomarkerKeys.all });
    },
  });
}

/** Delete a biomarker record by sort key. */
export function useDeleteBiomarker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sk: string) =>
      apiClient.delete<{ deleted: true }>(`/biomarkers/${encodeURIComponent(sk)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: biomarkerKeys.all });
    },
  });
}
