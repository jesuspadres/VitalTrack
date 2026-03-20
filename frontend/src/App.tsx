import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import NotFoundPage from '@/pages/NotFoundPage';
import DashboardPage from '@/pages/DashboardPage';
import ProfilePage from '@/pages/ProfilePage';
import BiomarkersPage from '@/pages/BiomarkersPage';
import BiomarkerDetailPage from '@/pages/BiomarkerDetailPage';
import UploadPage from '@/pages/UploadPage';
import InsightsPage from '@/pages/InsightsPage';
import InsightDetailPage from '@/pages/InsightDetailPage';

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes (require authentication) */}
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/biomarkers" element={<ProtectedRoute><BiomarkersPage /></ProtectedRoute>} />
      <Route path="/biomarkers/:id" element={<ProtectedRoute><BiomarkerDetailPage /></ProtectedRoute>} />
      <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
      <Route path="/insights" element={<ProtectedRoute><InsightsPage /></ProtectedRoute>} />
      <Route path="/insights/:id" element={<ProtectedRoute><InsightDetailPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

      {/* Root redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
