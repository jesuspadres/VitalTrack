import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#f0f9ff] flex items-center justify-center px-4 relative">
      {/* Background mesh */}
      <div className="bg-mesh" aria-hidden="true">
        <div className="bg-orb-center" />
      </div>

      <div className="relative z-10 text-center max-w-md animate-fade-in">
        <p className="text-7xl font-bold text-primary-500/30 mb-4">404</p>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
          Page Not Found
        </h1>
        <p className="text-sm text-slate-400 mb-8 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link to="/dashboard" className="btn-primary inline-block">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
