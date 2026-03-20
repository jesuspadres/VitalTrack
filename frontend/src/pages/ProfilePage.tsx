import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { formatDate } from '@/utils/format';

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const { data: profile, isLoading, isError, error } = useProfile();
  const updateProfile = useUpdateProfile();

  const [displayName, setDisplayName] = useState('');
  const [unitsPreference, setUnitsPreference] = useState<'metric' | 'imperial'>('metric');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? '');
      setUnitsPreference(profile.unitsPreference);
      setNotificationsEnabled(profile.notificationsEnabled);
    }
  }, [profile]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    updateProfile.mutate(
      { displayName: displayName.trim() || undefined, unitsPreference, notificationsEnabled },
      {
        onSuccess: () => {
          setSuccessMessage('Profile updated successfully.');
          setTimeout(() => setSuccessMessage(''), 3000);
        },
      },
    );
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner size="lg" text="Loading profile..." />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm text-red-500">
          {error instanceof Error ? error.message : 'Failed to load profile.'}
        </p>
        <button onClick={() => window.location.reload()} className="btn-secondary text-sm">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-slate-400">Manage your account settings and preferences.</p>
      </div>

      {/* Account info card */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-5">Account Information</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          <div>
            <dt className="text-xs font-medium text-slate-400">Email</dt>
            <dd className="mt-1 text-sm font-medium text-slate-700">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-400">User ID</dt>
            <dd className="mt-1 text-sm font-mono text-slate-600">{user?.userId}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-400">Member Since</dt>
            <dd className="mt-1 text-sm text-slate-700">{profile?.createdAt ? formatDate(profile.createdAt) : '-'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-400">Account Tier</dt>
            <dd className="mt-1.5">
              <span className={
                profile?.tier === 'premium'
                  ? 'inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/15'
                  : 'inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold glass-subtle text-slate-500'
              }>
                {profile?.tier === 'premium' ? 'Premium' : 'Free'}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {/* Settings form */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-5">Settings</h2>

        {successMessage && (
          <div className="mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-700 backdrop-blur-sm">
            {successMessage}
          </div>
        )}

        {updateProfile.isError && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-600 backdrop-blur-sm">
            {updateProfile.error instanceof Error ? updateProfile.error.message : 'Failed to update profile.'}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-slate-600 mb-1.5">
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input-field max-w-md"
              placeholder="Enter your display name"
            />
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-slate-600 mb-2">Units Preference</legend>
            <div className="flex items-center gap-6">
              {(['metric', 'imperial'] as const).map((unit) => (
                <label key={unit} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="unitsPreference"
                    value={unit}
                    checked={unitsPreference === unit}
                    onChange={() => setUnitsPreference(unit)}
                    className="h-4 w-4 border-slate-300 text-primary-500 focus:ring-primary-300"
                  />
                  <span className="text-sm text-slate-600 capitalize">{unit}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center justify-between max-w-md">
            <div>
              <label htmlFor="notifications" className="text-sm font-medium text-slate-600">Notifications</label>
              <p className="text-xs text-slate-400 mt-0.5">Receive email notifications for new insights.</p>
            </div>
            <button
              id="notifications"
              type="button"
              role="switch"
              aria-checked={notificationsEnabled}
              onClick={() => setNotificationsEnabled((prev) => !prev)}
              className={
                notificationsEnabled
                  ? 'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-primary-500 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2'
                  : 'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2'
              }
            >
              <span
                aria-hidden="true"
                className={
                  notificationsEnabled
                    ? 'pointer-events-none inline-block h-5 w-5 translate-x-5 rounded-full bg-white shadow ring-0 transition-transform'
                    : 'pointer-events-none inline-block h-5 w-5 translate-x-0 rounded-full bg-white shadow ring-0 transition-transform'
                }
              />
            </button>
          </div>

          <div className="pt-2">
            <button type="submit" disabled={updateProfile.isPending} className="btn-primary flex items-center justify-center gap-2">
              {updateProfile.isPending ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Sign out */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">Sign Out</h2>
        <p className="text-sm text-slate-400 mb-4">Sign out of your account on this device.</p>
        <button type="button" onClick={handleSignOut} className="btn-danger">
          Sign Out
        </button>
      </div>
    </div>
  );
}
