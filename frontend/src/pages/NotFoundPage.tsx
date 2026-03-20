import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="text-center max-w-md">
        <p className="text-6xl font-bold text-primary-500 mb-4">404</p>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Page Not Found</h1>
        <p className="text-gray-500 mb-8">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link to="/dashboard" className="btn-primary inline-block">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
