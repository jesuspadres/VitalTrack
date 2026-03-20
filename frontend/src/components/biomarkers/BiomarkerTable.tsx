import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { BiomarkerRecord, BiomarkerType, BiomarkerStatus } from '@/types/api';
import { BiomarkerTypeEnum, BiomarkerStatusEnum } from '@/types/api';
import { formatBiomarkerType, formatDate, formatValue } from '@/utils/format';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface BiomarkerTableProps {
  records: BiomarkerRecord[];
}

type SortDirection = 'asc' | 'desc';

const sourceLabels: Record<string, string> = {
  MANUAL: 'Manual',
  CSV_UPLOAD: 'CSV Upload',
  API_IMPORT: 'API Import',
};

export function BiomarkerTable({ records }: BiomarkerTableProps) {
  const [typeFilter, setTypeFilter] = useState<BiomarkerType | ''>('');
  const [statusFilter, setStatusFilter] = useState<BiomarkerStatus | ''>('');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const filteredAndSorted = useMemo(() => {
    let result = [...records];
    if (typeFilter) result = result.filter((r) => r.biomarkerType === typeFilter);
    if (statusFilter) result = result.filter((r) => r.status === statusFilter);
    result.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortDirection === 'desc' ? dateB - dateA : dateA - dateB;
    });
    return result;
  }, [records, typeFilter, statusFilter, sortDirection]);

  const toggleSort = () => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));

  const biomarkerTypes = BiomarkerTypeEnum.options;
  const biomarkerStatuses = BiomarkerStatusEnum.options;

  return (
    <div>
      {/* Filter Bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as BiomarkerType | '')}
            className="input-field w-full sm:w-auto"
            aria-label="Filter by biomarker type"
          >
            <option value="">All Types</option>
            {biomarkerTypes.map((type) => (
              <option key={type} value={type}>{formatBiomarkerType(type)}</option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as BiomarkerStatus | '')}
            className="input-field w-full sm:w-auto"
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            {biomarkerStatuses.map((status) => (
              <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-400 font-medium">
          <span>{filteredAndSorted.length} results</span>
        </div>
      </div>

      {filteredAndSorted.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-400">
          No biomarkers match the selected filters.
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block">
            <div className="overflow-x-auto card">
              <table className="min-w-full divide-y divide-white/20">
                <thead>
                  <tr className="border-b border-white/20">
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Type
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Value
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Source
                    </th>
                    <th
                      scope="col"
                      className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors"
                      onClick={toggleSort}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort(); }
                      }}
                    >
                      <span className="inline-flex items-center gap-1">
                        Date
                        <svg
                          className={`h-3.5 w-3.5 transition-transform duration-200 ${sortDirection === 'asc' ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </span>
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {filteredAndSorted.map((record) => (
                    <tr key={record.sk} className="transition-colors hover:bg-white/30">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-700">
                        {formatBiomarkerType(record.biomarkerType)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-slate-600">
                        {formatValue(record.value, record.unit)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge status={record.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                        {sourceLabels[record.source] ?? record.source}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                        {formatDate(record.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Link
                          to={`/biomarkers/${encodeURIComponent(record.sk)}`}
                          className="text-sm font-semibold text-primary-500 hover:text-primary-600 transition-colors"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card List */}
          <div className="flex flex-col gap-3 md:hidden">
            {filteredAndSorted.map((record) => (
              <Link
                key={record.sk}
                to={`/biomarkers/${encodeURIComponent(record.sk)}`}
                className="card block p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      {formatBiomarkerType(record.biomarkerType)}
                    </p>
                    <p className="mt-1 font-mono text-sm text-slate-500">
                      {formatValue(record.value, record.unit)}
                    </p>
                  </div>
                  <StatusBadge status={record.status} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <span>{sourceLabels[record.source] ?? record.source}</span>
                  <span>{formatDate(record.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
