import { useState, useRef, useCallback, useEffect, type DragEvent, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { toast } from 'sonner';
import { usePresignUrl, useBatchStatuses } from '@/hooks/useUpload';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 20;

const CSV_TEMPLATE = `biomarkerType,value,unit,measuredDate
LDL_CHOLESTEROL,110,mg/dL,2025-09-15
HDL_CHOLESTEROL,55,mg/dL,2025-09-15
TOTAL_CHOLESTEROL,195,mg/dL,2025-09-15
TRIGLYCERIDES,120,mg/dL,2025-09-15
HEMOGLOBIN_A1C,5.4,%,2025-09-15
FASTING_GLUCOSE,92,mg/dL,2025-09-15
HSCRP,0.8,mg/L,2025-09-15
TSH,2.1,mIU/L,2025-09-15
VITAMIN_D,45,ng/mL,2025-09-15
FERRITIN,80,ng/mL,2025-09-15`;

interface FileEntry {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'polling' | 'completed' | 'failed';
  batchId: string | null;
  error: string | null;
  recordCount: number | null;
}

type PageStep = 'SELECT' | 'PROCESSING' | 'DONE';

export default function UploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState<PageStep>('SELECT');

  const presignMutation = usePresignUrl();

  // Collect batchIds that are actively polling
  const pollingBatchIds = files
    .filter((f) => f.status === 'polling' && f.batchId)
    .map((f) => f.batchId!);

  const batchResults = useBatchStatuses(pollingBatchIds);

  // Sync batch poll results back into file entries
  useEffect(() => {
    if (pollingBatchIds.length === 0) return;

    let changed = false;
    const updated = files.map((entry) => {
      if (entry.status !== 'polling' || !entry.batchId) return entry;
      const idx = pollingBatchIds.indexOf(entry.batchId);
      if (idx === -1) return entry;
      const result = batchResults[idx];
      if (!result?.data) return entry;

      if (result.data.status === 'COMPLETED') {
        changed = true;
        return { ...entry, status: 'completed' as const, recordCount: result.data.recordCount ?? null };
      }
      if (result.data.status === 'FAILED') {
        changed = true;
        return { ...entry, status: 'failed' as const, error: result.data.errorMessage ?? 'Processing failed.' };
      }
      return entry;
    });

    if (changed) setFiles(updated);
  }, [batchResults, files, pollingBatchIds]);

  // Check if all files are done (completed or failed)
  const allDone = step === 'PROCESSING' && files.length > 0 && files.every((f) => f.status === 'completed' || f.status === 'failed');

  useEffect(() => {
    if (!allDone) return;
    const succeeded = files.filter((f) => f.status === 'completed');
    const failed = files.filter((f) => f.status === 'failed');
    const totalRecords = succeeded.reduce((sum, f) => sum + (f.recordCount ?? 0), 0);

    if (failed.length === 0) {
      toast.success(`All ${succeeded.length} file${succeeded.length === 1 ? '' : 's'} processed — ${totalRecords} record${totalRecords === 1 ? '' : 's'} imported.`);
    } else if (succeeded.length === 0) {
      toast.error(`All ${failed.length} file${failed.length === 1 ? '' : 's'} failed to process.`);
    } else {
      toast.warning(`${succeeded.length} succeeded, ${failed.length} failed — ${totalRecords} record${totalRecords === 1 ? '' : 's'} imported.`);
    }
    setStep('DONE');
  }, [allDone, files]);

  const validateFile = useCallback((f: File): string | null => {
    if (!f.name.toLowerCase().endsWith('.csv')) return `${f.name}: Only CSV files are accepted.`;
    if (f.size > MAX_FILE_SIZE) return `${f.name}: File must be smaller than 5 MB.`;
    return null;
  }, []);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const incoming = Array.from(newFiles);
    const errors: string[] = [];
    const valid: FileEntry[] = [];

    for (const f of incoming) {
      const err = validateFile(f);
      if (err) {
        errors.push(err);
        continue;
      }
      valid.push({
        id: crypto.randomUUID(),
        file: f,
        status: 'pending',
        batchId: null,
        error: null,
        recordCount: null,
      });
    }

    if (errors.length > 0) {
      toast.error(errors.join('\n'));
    }

    setFiles((prev) => {
      const combined = [...prev, ...valid];
      if (combined.length > MAX_FILES) {
        toast.error(`Maximum ${MAX_FILES} files allowed. Extra files were ignored.`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  }, [validateFile]);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);
  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addFiles]);

  const handleUploadAll = useCallback(async () => {
    if (files.length === 0) return;
    setStep('PROCESSING');

    // Upload each file sequentially (presign → S3 PUT → set to polling)
    for (const entry of files) {
      setFiles((prev) => prev.map((f) => f.id === entry.id ? { ...f, status: 'uploading' } : f));

      try {
        const presignData = await presignMutation.mutateAsync({
          fileName: entry.file.name,
          contentType: 'text/csv',
        });
        const uploadRes = await fetch(presignData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/csv' },
          body: entry.file,
        });
        if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);

        setFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id ? { ...f, status: 'polling', batchId: presignData.batchId } : f,
          ),
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id
              ? { ...f, status: 'failed', error: err instanceof Error ? err.message : 'Upload failed.' }
              : f,
          ),
        );
      }
    }
  }, [files, presignMutation]);

  const handleReset = useCallback(() => {
    setFiles([]);
    setStep('SELECT');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleDownloadTemplate = useCallback(() => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'vitaltrack_csv_template.csv'; a.click();
    URL.revokeObjectURL(url);
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const completedCount = files.filter((f) => f.status === 'completed').length;
  const failedCount = files.filter((f) => f.status === 'failed').length;
  const totalRecords = files.reduce((sum, f) => sum + (f.recordCount ?? 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Upload Biomarkers</h1>
          <p className="mt-1 text-sm text-slate-400">Upload one or more CSV files containing your biomarker data</p>
        </div>
        <button type="button" className="btn-secondary flex items-center gap-2" onClick={handleDownloadTemplate}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
          </svg>
          Download CSV Template
        </button>
      </div>

      {/* Upload Card */}
      <div className="card p-6">
        {step === 'SELECT' && (
          <>
            <div
              className={clsx(
                'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-300 cursor-pointer',
                isDragging
                  ? 'border-primary-400 bg-primary-500/5 shadow-glow-teal'
                  : 'border-slate-200/60 hover:border-primary-300 hover:bg-white/30',
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
              aria-label="Drop CSV files here or click to select"
            >
              <div className="rounded-2xl p-3 glass-teal mb-4">
                <svg className="h-8 w-8 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-600">Drag &amp; drop your CSV files here</p>
              <p className="mt-1 text-xs text-slate-400">or click to select — multiple files supported</p>
              <p className="mt-2 text-xs text-slate-300">CSV files only, max 5 MB each, up to {MAX_FILES} files</p>
              <input ref={fileInputRef} type="file" accept=".csv" multiple className="hidden" onChange={handleFileChange} aria-hidden="true" />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-600">{files.length} file{files.length === 1 ? '' : 's'} selected</p>
                  <button type="button" className="text-xs text-slate-400 hover:text-red-500 transition-colors" onClick={() => setFiles([])}>
                    Clear all
                  </button>
                </div>
                {files.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-xl glass-subtle px-4 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <svg className="h-5 w-5 flex-shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{entry.file.name}</p>
                        <p className="text-xs text-slate-400">{formatFileSize(entry.file.size)}</p>
                      </div>
                    </div>
                    <button type="button" className="ml-2 flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors" onClick={() => removeFile(entry.id)} aria-label={`Remove ${entry.file.name}`}>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {files.length > 0 && (
              <div className="mt-4 flex justify-end">
                <button type="button" className="btn-primary flex items-center gap-2" onClick={handleUploadAll}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Upload {files.length} File{files.length === 1 ? '' : 's'}
                </button>
              </div>
            )}
          </>
        )}

        {step === 'PROCESSING' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700">Processing Files</h3>
              <span className="text-xs text-slate-400">
                {completedCount + failedCount} / {files.length} complete
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-500 transition-all duration-500"
                style={{ width: `${((completedCount + failedCount) / files.length) * 100}%` }}
              />
            </div>

            {/* Per-file status */}
            <div className="mt-4 space-y-2">
              {files.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between rounded-xl glass-subtle px-4 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileStatusIcon status={entry.status} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{entry.file.name}</p>
                      {entry.status === 'completed' && entry.recordCount != null && (
                        <p className="text-xs text-emerald-500">{entry.recordCount} record{entry.recordCount === 1 ? '' : 's'} imported</p>
                      )}
                      {entry.status === 'failed' && (
                        <p className="text-xs text-red-500 truncate">{entry.error}</p>
                      )}
                      {(entry.status === 'uploading' || entry.status === 'polling') && (
                        <p className="text-xs text-slate-400">
                          {entry.status === 'uploading' ? 'Uploading...' : 'Processing...'}
                        </p>
                      )}
                      {entry.status === 'pending' && (
                        <p className="text-xs text-slate-400">Waiting...</p>
                      )}
                    </div>
                  </div>
                  <FileStatusBadge status={entry.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'DONE' && (
          <div className="flex flex-col items-center py-12 animate-scale-in">
            <div className={clsx(
              'flex h-16 w-16 items-center justify-center rounded-full',
              failedCount === 0 ? 'bg-emerald-500/10 shadow-glow-teal' : 'bg-amber-500/10',
            )}>
              {failedCount === 0 ? (
                <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              )}
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-800">
              {failedCount === 0 ? 'All Uploads Complete' : 'Uploads Finished'}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              {completedCount} file{completedCount === 1 ? '' : 's'} succeeded
              {failedCount > 0 && `, ${failedCount} failed`}
              {totalRecords > 0 && ` — ${totalRecords} total record${totalRecords === 1 ? '' : 's'} imported`}
            </p>

            {/* Per-file summary */}
            {files.length > 1 && (
              <div className="mt-4 w-full max-w-md space-y-1.5">
                {files.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-xs">
                    <span className="text-slate-600 truncate mr-2">{entry.file.name}</span>
                    {entry.status === 'completed' ? (
                      <span className="flex-shrink-0 text-emerald-500 font-medium">{entry.recordCount} records</span>
                    ) : (
                      <span className="flex-shrink-0 text-red-500 font-medium">Failed</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <Link to="/biomarkers" className="btn-primary">View Biomarkers</Link>
              <button type="button" className="btn-secondary" onClick={handleReset}>Upload More</button>
            </div>
          </div>
        )}
      </div>

      {/* Format info */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-slate-700">CSV Format Requirements</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-500">
          {[
            'Required columns: biomarkerType, value, unit',
            'Optional column: measuredDate (e.g. 2025-09-15) — defaults to today if omitted',
            'Supported types: LDL_CHOLESTEROL, HDL_CHOLESTEROL, TOTAL_CHOLESTEROL, TRIGLYCERIDES, and more',
            'Maximum file size: 5 MB each, up to 20 files per batch',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Status sub-components ───────────────────────────────────

function FileStatusIcon({ status }: { status: FileEntry['status'] }) {
  switch (status) {
    case 'pending':
      return (
        <div className="h-5 w-5 rounded-full border-2 border-slate-200 flex-shrink-0" />
      );
    case 'uploading':
    case 'polling':
      return <LoadingSpinner size="sm" />;
    case 'completed':
      return (
        <svg className="h-5 w-5 flex-shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      );
    case 'failed':
      return (
        <svg className="h-5 w-5 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
  }
}

function FileStatusBadge({ status }: { status: FileEntry['status'] }) {
  const config = {
    pending: { label: 'Queued', classes: 'bg-slate-100 text-slate-500' },
    uploading: { label: 'Uploading', classes: 'bg-blue-50 text-blue-600' },
    polling: { label: 'Processing', classes: 'bg-primary-50 text-primary-600' },
    completed: { label: 'Done', classes: 'bg-emerald-50 text-emerald-600' },
    failed: { label: 'Failed', classes: 'bg-red-50 text-red-600' },
  }[status];

  return (
    <span className={clsx('flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', config.classes)}>
      {config.label}
    </span>
  );
}
