import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { usePresignUrl, useBatchStatus } from '@/hooks/useUpload';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const CSV_TEMPLATE = `biomarkerType,value,unit,referenceRangeLow,referenceRangeHigh
LDL_CHOLESTEROL,110,mg/dL,0,100
HDL_CHOLESTEROL,55,mg/dL,40,60
TOTAL_CHOLESTEROL,195,mg/dL,0,200
TRIGLYCERIDES,120,mg/dL,0,150
HEMOGLOBIN_A1C,5.4,%,0,5.7
FASTING_GLUCOSE,92,mg/dL,70,100
HSCRP,0.8,mg/L,0,1
TSH,2.1,mIU/L,0.4,4
VITAMIN_D,45,ng/mL,30,100
FERRITIN,80,ng/mL,20,200`;

type UploadStep = 'SELECT' | 'UPLOADING' | 'POLLING' | 'DONE' | 'ERROR';

export default function UploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState<UploadStep>('SELECT');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const presignMutation = usePresignUrl();
  const { data: batchStatus } = useBatchStatus(step === 'POLLING' ? batchId : null);

  if (step === 'POLLING' && batchStatus) {
    if (batchStatus.status === 'COMPLETED') {
      setStep('DONE');
    } else if (batchStatus.status === 'FAILED') {
      setErrorMessage(batchStatus.errorMessage ?? 'Processing failed. Please try again.');
      setStep('ERROR');
    }
  }

  const validateFile = useCallback((f: File): string | null => {
    if (!f.name.toLowerCase().endsWith('.csv')) return 'Only CSV files are accepted.';
    if (f.size > MAX_FILE_SIZE) return 'File must be smaller than 5 MB.';
    return null;
  }, []);

  const handleFile = useCallback((f: File) => {
    const validationError = validateFile(f);
    if (validationError) { setErrorMessage(validationError); setStep('ERROR'); return; }
    setFile(f); setErrorMessage(''); setStep('SELECT');
  }, [validateFile]);

  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
  }, [handleFile]);
  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
  }, [handleFile]);

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setStep('UPLOADING'); setErrorMessage('');
    try {
      const presignData = await presignMutation.mutateAsync({ fileName: file.name, contentType: 'text/csv' });
      const uploadRes = await fetch(presignData.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/csv' }, body: file });
      if (!uploadRes.ok) throw new Error(`Upload failed with status ${uploadRes.status}`);
      setBatchId(presignData.batchId); setStep('POLLING');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred during upload.');
      setStep('ERROR');
    }
  }, [file, presignMutation]);

  const handleReset = useCallback(() => {
    setFile(null); setBatchId(null); setStep('SELECT'); setErrorMessage('');
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Upload Biomarkers</h1>
          <p className="mt-1 text-sm text-slate-400">Upload a CSV file containing your biomarker data</p>
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
              aria-label="Drop CSV file here or click to select"
            >
              <div className="rounded-2xl p-3 glass-teal mb-4">
                <svg className="h-8 w-8 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-600">Drag &amp; drop your CSV file here</p>
              <p className="mt-1 text-xs text-slate-400">or click to select</p>
              <p className="mt-2 text-xs text-slate-300">CSV files only, max 5 MB</p>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} aria-hidden="true" />
            </div>

            {file && (
              <div className="mt-4 flex items-center justify-between rounded-xl glass-teal px-4 py-3">
                <div className="flex items-center gap-3">
                  <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{file.name}</p>
                    <p className="text-xs text-slate-400">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <button type="button" className="text-slate-400 hover:text-slate-600 transition-colors" onClick={(e) => { e.stopPropagation(); handleReset(); }} aria-label="Remove file">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {file && (
              <div className="mt-4 flex justify-end">
                <button type="button" className="btn-primary flex items-center gap-2" onClick={handleUpload}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Upload
                </button>
              </div>
            )}
          </>
        )}

        {step === 'UPLOADING' && (
          <div className="flex flex-col items-center py-12">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-sm font-medium text-slate-600">Uploading {file?.name}...</p>
            <div className="mt-4 w-full max-w-xs">
              <div className="h-1.5 overflow-hidden rounded-full bg-primary-100">
                <div className="h-full w-1/3 animate-[indeterminate_1.5s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-primary-400 to-primary-500" />
              </div>
            </div>
          </div>
        )}

        {step === 'POLLING' && (
          <div className="flex flex-col items-center py-12">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-sm font-medium text-slate-600">Processing your biomarker data...</p>
            <div className="mt-3">
              <span className={clsx(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur-sm',
                batchStatus?.status === 'PENDING' && 'bg-slate-500/10 text-slate-500',
                batchStatus?.status === 'PROCESSING' && 'bg-primary-500/10 text-primary-600',
              )}>
                <span className={clsx(
                  'inline-block h-1.5 w-1.5 rounded-full',
                  batchStatus?.status === 'PENDING' && 'bg-slate-400',
                  batchStatus?.status === 'PROCESSING' && 'bg-primary-500 animate-pulse',
                )} aria-hidden="true" />
                {batchStatus?.status === 'PENDING' && 'Queued'}
                {batchStatus?.status === 'PROCESSING' && 'Processing'}
                {!batchStatus?.status && 'Waiting'}
              </span>
            </div>
          </div>
        )}

        {step === 'DONE' && (
          <div className="flex flex-col items-center py-12 animate-scale-in">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 shadow-glow-teal">
              <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-800">Upload Complete</h3>
            <p className="mt-1 text-sm text-slate-400">
              {batchStatus?.recordCount != null
                ? `${batchStatus.recordCount} biomarker record${batchStatus.recordCount === 1 ? '' : 's'} processed successfully.`
                : 'Your biomarker data has been processed successfully.'}
            </p>
            <div className="mt-6 flex gap-3">
              <Link to="/biomarkers" className="btn-primary">View Biomarkers</Link>
              <button type="button" className="btn-secondary" onClick={handleReset}>Upload Another</button>
            </div>
          </div>
        )}

        {step === 'ERROR' && (
          <div className="flex flex-col items-center py-12 animate-scale-in">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
              <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-800">Upload Failed</h3>
            <p className="mt-1 max-w-sm text-center text-sm text-slate-400">{errorMessage}</p>
            <button type="button" className="btn-primary mt-6" onClick={handleReset}>Try Again</button>
          </div>
        )}
      </div>

      {/* Format info */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-slate-700">CSV Format Requirements</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-500">
          {['Headers: biomarkerType, value, unit, referenceRangeLow, referenceRangeHigh',
            'Supported types: LDL_CHOLESTEROL, HDL_CHOLESTEROL, TOTAL_CHOLESTEROL, TRIGLYCERIDES, and more',
            'Maximum file size: 5 MB'].map((item) => (
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
