import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/services/api-client';
import type { InsightRecord } from '@/types/api';

// ─── Response types ──────────────────────────────────────────
interface InsightsResponse {
  insights: InsightRecord[];
  count: number;
}

// ─── Query keys ──────────────────────────────────────────────
export const insightKeys = {
  all: ['insights'] as const,
  detail: (insightId: string) => ['insights', insightId] as const,
};

// ─── Hooks ───────────────────────────────────────────────────

/** Fetch all insights for the current user. */
export function useInsights() {
  return useQuery({
    queryKey: insightKeys.all,
    queryFn: () => apiClient.get<InsightsResponse>('/insights'),
  });
}

/** Fetch a single insight by ID. */
export function useInsight(insightId: string) {
  return useQuery({
    queryKey: insightKeys.detail(insightId),
    queryFn: () =>
      apiClient.get<InsightRecord>(`/insights/${encodeURIComponent(insightId)}`),
    enabled: !!insightId,
  });
}

/** Trigger AI insight generation. */
export function useTriggerInsight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post<InsightRecord>('/insights/generate', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insightKeys.all });
    },
  });
}
