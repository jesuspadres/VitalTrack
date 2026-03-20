import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/services/api-client';
import type { UserProfile } from '@/types/api';

// ─── Query keys ──────────────────────────────────────────────
export const profileKeys = {
  all: ['profile'] as const,
};

// ─── Mutation input ──────────────────────────────────────────
interface UpdateProfileInput {
  displayName?: string;
  unitsPreference?: 'metric' | 'imperial';
  notificationsEnabled?: boolean;
}

// ─── Hooks ───────────────────────────────────────────────────

/** Fetch the current user's profile. */
export function useProfile() {
  return useQuery({
    queryKey: profileKeys.all,
    queryFn: () => apiClient.get<UserProfile>('/profile'),
  });
}

/** Update the current user's profile. */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      apiClient.put<UserProfile>('/profile', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all });
    },
  });
}
