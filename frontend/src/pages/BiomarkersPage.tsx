import { useNavigate } from 'react-router-dom';
import { useBiomarkers } from '@/hooks/useBiomarkers';
import { BiomarkerTable } from '@/components/biomarkers/BiomarkerTable';
import { BiomarkerTableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

export default function BiomarkersPage() {
  const { data, isLoading, isError } = useBiomarkers();
  const navigate = useNavigate();

  if (isLoading) {
    return <BiomarkerTableSkeleton />;
  }

  if (isError) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-red-500">
          Failed to load biomarkers. Please try again later.
        </p>
      </div>
    );
  }

  const records = Array.isArray(data) ? data : [];
  const count = records.length;

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="mb-8 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Biomarkers</h1>
        {count > 0 && (
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold glass-teal text-primary-700">
            {count}
          </span>
        )}
      </div>

      {/* Content */}
      {records.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714a2.25 2.25 0 0 0 .659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 0 1-1.591.659H9.061a2.25 2.25 0 0 1-1.591-.659L5 14.5m14 0V17a2.25 2.25 0 0 1-2.25 2.25H7.25A2.25 2.25 0 0 1 5 17v-2.5" />
            </svg>
          }
          title="No biomarkers yet"
          description="Upload a CSV file or manually add your first biomarker reading to get started."
          action={{
            label: 'Upload Biomarkers',
            onClick: () => navigate('/upload'),
          }}
        />
      ) : (
        <BiomarkerTable records={records} />
      )}
    </div>
  );
}
