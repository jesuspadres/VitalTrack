import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const { signIn, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const msg = params.get('message');
    if (msg) setSuccessMessage(msg);
  }, [location.search]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const validate = (): string | null => {
    if (!email.trim()) return 'Email is required.';
    if (!password) return 'Password is required.';
    if (password.length < 12) return 'Password must be at least 12 characters.';
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      await signIn(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f9ff] relative">
        <div className="bg-mesh" aria-hidden="true"><div className="bg-orb-center" /></div>
        <div className="animate-pulse text-slate-400 text-sm relative z-10">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f9ff] px-4 relative overflow-hidden">
      {/* Background mesh */}
      <div className="bg-mesh" aria-hidden="true"><div className="bg-orb-center" /></div>

      <div className="w-full max-w-md relative z-10 animate-fade-in-up">
        {/* Branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 opacity-20 blur-md" />
              <svg
                className="relative h-8 w-8 text-primary-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19.5 12.572L12 20l-7.5-7.428A5 5 0 1112 6.006a5 5 0 017.5 6.572" />
                <path d="M4 12h4l2-3 3 6 2-3h5" />
              </svg>
            </div>
            <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">
              VitalTrack
            </span>
          </div>
          <p className="text-sm text-slate-400 font-medium">
            Track your health biomarkers
          </p>
        </div>

        {/* Glass card */}
        <div className="card p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">Sign in to your account</h2>

          {successMessage && (
            <div className="mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-700 backdrop-blur-sm">
              {successMessage}
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-600 backdrop-blur-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-600 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-600 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Footer link */}
        <p className="mt-8 text-center text-sm text-slate-400">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-semibold text-primary-500 hover:text-primary-600 transition-colors">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
