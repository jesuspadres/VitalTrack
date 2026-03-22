import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useBiomarker, useBiomarkers, useDeleteBiomarker } from '@/hooks/useBiomarkers';
import { BiomarkerChart } from '@/components/biomarkers/BiomarkerChart';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BiomarkerDetailSkeleton } from '@/components/ui/Skeleton';
import {
  formatBiomarkerType,
  formatDate,
  formatValue,
} from '@/utils/format';

export default function BiomarkerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const decodedSk = id ? decodeURIComponent(id) : '';

  const {
    data: biomarker,
    isLoading: biomarkerLoading,
    isError: biomarkerError,
  } = useBiomarker(decodedSk);

  const { data: allBiomarkers } = useBiomarkers();
  const deleteMutation = useDeleteBiomarker();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  if (biomarkerLoading) {
    return <BiomarkerDetailSkeleton />;
  }

  if (biomarkerError || !biomarker) {
    return (
      <div className="py-20 text-center animate-fade-in">
        <p className="text-6xl font-bold text-slate-200 mb-4">404</p>
        <h1 className="text-xl font-semibold text-slate-800 mb-2">
          Biomarker Not Found
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          The biomarker record you are looking for does not exist or has been removed.
        </p>
        <Link to="/biomarkers" className="btn-primary inline-block">
          Back to Biomarkers
        </Link>
      </div>
    );
  }

  const historyData = (Array.isArray(allBiomarkers) ? allBiomarkers : [])
    .filter((r) => r.biomarkerType === biomarker.biomarkerType)
    .map((r) => ({ value: r.value, createdAt: r.createdAt, status: r.status }));

  const sourceLabels: Record<string, string> = {
    MANUAL: 'Manual Entry',
    CSV_UPLOAD: 'CSV Upload',
    API_IMPORT: 'API Import',
  };

  const handleDelete = () => {
    deleteMutation.mutate(decodedSk, {
      onSuccess: () => {
        toast.success('Biomarker deleted successfully.');
        navigate('/biomarkers', { replace: true });
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to delete biomarker.');
      },
    });
  };

  return (
    <div className="animate-fade-in">
      {/* Back link */}
      <Link
        to="/biomarkers"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Biomarkers
      </Link>

      {/* Page Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            {formatBiomarkerType(biomarker.biomarkerType)}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Recorded on {formatDate(biomarker.createdAt)}
          </p>
        </div>
        <button
          type="button"
          className="btn-danger inline-flex items-center gap-1.5"
          onClick={() => setShowDeleteDialog(true)}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
      </div>

      {/* Info Card */}
      <div className="card mb-6 p-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Details
        </h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-xs text-slate-400 font-medium">Value</p>
            <p className="mt-1 font-mono text-lg font-bold text-slate-800">
              {formatValue(biomarker.value, biomarker.unit)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Status</p>
            <div className="mt-1.5">
              <StatusBadge status={biomarker.status} />
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Reference Range</p>
            <p className="mt-1 font-mono text-sm text-slate-600">
              {biomarker.referenceRangeLow} &ndash; {biomarker.referenceRangeHigh} {biomarker.unit}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Source</p>
            <p className="mt-1 text-sm text-slate-600">
              {sourceLabels[biomarker.source] ?? biomarker.source}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Date Created</p>
            <p className="mt-1 text-sm text-slate-600">
              {formatDate(biomarker.createdAt)}
            </p>
          </div>
          {biomarker.batchId && (
            <div>
              <p className="text-xs text-slate-400 font-medium">Batch ID</p>
              <p className="mt-1 truncate font-mono text-sm text-slate-600">
                {biomarker.batchId}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="card p-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          History &mdash; {formatBiomarkerType(biomarker.biomarkerType)}
        </h2>
        {historyData.length > 1 ? (
          <>
            <BiomarkerChart
              data={historyData}
              referenceRangeLow={biomarker.referenceRangeLow}
              referenceRangeHigh={biomarker.referenceRangeHigh}
              unit={biomarker.unit}
            />
            <p className="mt-3 text-center text-xs text-slate-400">
              Shaded band indicates the reference range ({biomarker.referenceRangeLow}
              &ndash;{biomarker.referenceRangeHigh} {biomarker.unit})
            </p>
          </>
        ) : (
          <div className="flex h-[200px] items-center justify-center text-sm text-slate-400">
            Add more readings to see trend data over time.
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm px-4"
          onClick={() => setShowDeleteDialog(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div
            className="card w-full max-w-sm p-6 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-dialog-title" className="text-lg font-semibold text-slate-800">
              Delete Biomarker
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Are you sure you want to delete this{' '}
              {formatBiomarkerType(biomarker.biomarkerType)} record? This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowDeleteDialog(false)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
