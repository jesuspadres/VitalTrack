import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

type Step = 'register' | 'verify';

const PASSWORD_RULES = [
  { test: (pw: string) => pw.length >= 12, label: 'At least 12 characters' },
  { test: (pw: string) => /[A-Z]/.test(pw), label: 'One uppercase letter' },
  { test: (pw: string) => /[a-z]/.test(pw), label: 'One lowercase letter' },
  { test: (pw: string) => /[0-9]/.test(pw), label: 'One number' },
  { test: (pw: string) => /[^A-Za-z0-9]/.test(pw), label: 'One symbol' },
];

export default function RegisterPage() {
  const { signUp, confirmSignUp, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const validateRegistration = (): boolean => {
    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = 'Email is required.';
    const failedRules = PASSWORD_RULES.filter((rule) => !rule.test(password));
    if (!password) {
      errors.password = 'Password is required.';
    } else if (failedRules.length > 0) {
      errors.password = `Password must have: ${failedRules.map((r) => r.label.toLowerCase()).join(', ')}.`;
    }
    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password.';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateRegistration()) return;
    setIsSubmitting(true);
    try {
      await signUp(email, password);
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!verificationCode.trim()) {
      setError('Please enter the verification code.');
      return;
    }
    setIsSubmitting(true);
    try {
      await confirmSignUp(email, verificationCode);
      navigate('/login?message=Account verified successfully. Please sign in.', { replace: true });
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
    <div className="min-h-screen flex items-center justify-center bg-[#f0f9ff] px-4 py-8 relative overflow-hidden">
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
          {step === 'register' ? (
            <>
              <h2 className="text-xl font-semibold text-slate-800 mb-6">Create your account</h2>

              {error && (
                <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-600 backdrop-blur-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleRegister} noValidate className="space-y-5">
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
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, email: '' }));
                    }}
                    className={`input-field ${fieldErrors.email ? '!border-red-400/60' : ''}`}
                    placeholder="you@example.com"
                  />
                  {fieldErrors.email && (
                    <p className="mt-1.5 text-xs text-red-500">{fieldErrors.email}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-600 mb-1.5">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, password: '' }));
                    }}
                    className={`input-field ${fieldErrors.password ? '!border-red-400/60' : ''}`}
                    placeholder="Create a password"
                  />
                  {fieldErrors.password && (
                    <p className="mt-1.5 text-xs text-red-500">{fieldErrors.password}</p>
                  )}

                  {/* Live password strength indicators */}
                  {password.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {PASSWORD_RULES.map((rule) => {
                        const passed = rule.test(password);
                        return (
                          <li
                            key={rule.label}
                            className={`text-xs flex items-center gap-1.5 transition-colors duration-200 ${passed ? 'text-emerald-500' : 'text-slate-300'}`}
                          >
                            {passed ? (
                              <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <circle cx="12" cy="12" r="9" />
                              </svg>
                            )}
                            {rule.label}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-600 mb-1.5">
                    Confirm password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
                    }}
                    className={`input-field ${fieldErrors.confirmPassword ? '!border-red-400/60' : ''}`}
                    placeholder="Confirm your password"
                  />
                  {fieldErrors.confirmPassword && (
                    <p className="mt-1.5 text-xs text-red-500">{fieldErrors.confirmPassword}</p>
                  )}
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
                      Creating account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-slate-800 mb-2">Verify your email</h2>
              <p className="text-sm text-slate-400 mb-6">
                We sent a verification code to{' '}
                <span className="font-medium text-slate-600">{email}</span>
              </p>

              {error && (
                <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-600 backdrop-blur-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleVerify} noValidate className="space-y-5">
                <div>
                  <label htmlFor="code" className="block text-sm font-medium text-slate-600 mb-1.5">
                    Verification code
                  </label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={verificationCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setVerificationCode(val);
                    }}
                    className="input-field text-center tracking-[0.3em] font-mono text-lg"
                    placeholder="000000"
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
                      Verifying...
                    </>
                  ) : (
                    'Verify'
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={() => { setStep('register'); setError(''); setVerificationCode(''); }}
                className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                Back to registration
              </button>
            </>
          )}
        </div>

        {/* Footer link */}
        <p className="mt-8 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-primary-500 hover:text-primary-600 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
