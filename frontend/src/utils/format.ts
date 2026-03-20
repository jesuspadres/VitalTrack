/**
 * Converts SNAKE_CASE biomarker type to Title Case.
 * e.g. "LDL_CHOLESTEROL" -> "LDL Cholesterol"
 */
export function formatBiomarkerType(type: string): string {
  return type
    .split('_')
    .map((word) => {
      // Keep common abbreviations uppercase
      if (['LDL', 'HDL', 'TSH', 'HSCRP', 'APOB', 'A1C'].includes(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Formats an ISO date string to "Mar 19, 2026" style.
 */
export function formatDate(isoString: string): string {
  // Handle malformed timestamps like "2026-03-20T02:52:00+00:00.0010"
  // by trimming anything after the timezone offset
  const cleaned = isoString.replace(/([+-]\d{2}:\d{2})\..*$/, '$1');
  const date = new Date(cleaned);
  if (isNaN(date.getTime())) return isoString.slice(0, 10);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats an ISO date string to "Mar 19, 2026, 2:30 PM" style.
 */
export function formatDateTime(isoString: string): string {
  const cleaned = isoString.replace(/([+-]\d{2}:\d{2})\..*$/, '$1');
  const date = new Date(cleaned);
  if (isNaN(date.getTime())) return isoString.slice(0, 10);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Formats a numeric value with its unit.
 * e.g. formatValue(150, "mg/dL") -> "150 mg/dL"
 */
export function formatValue(value: number, unit: string): string {
  return `${value} ${unit}`;
}

/**
 * Returns a Tailwind text color class based on biomarker status.
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'OPTIMAL':
      return 'text-emerald-600';
    case 'NORMAL':
      return 'text-primary-600';
    case 'BORDERLINE':
      return 'text-amber-600';
    case 'OUT_OF_RANGE':
      return 'text-red-500';
    default:
      return 'text-slate-500';
  }
}

/**
 * Returns a Tailwind background color class based on biomarker status.
 */
export function getStatusBgColor(status: string): string {
  switch (status) {
    case 'OPTIMAL':
      return 'bg-emerald-50';
    case 'NORMAL':
      return 'bg-primary-50';
    case 'BORDERLINE':
      return 'bg-amber-50';
    case 'OUT_OF_RANGE':
      return 'bg-red-50';
    default:
      return 'bg-slate-50';
  }
}

/**
 * Returns a Tailwind text color class based on a health score (0-100).
 * >= 80: green, >= 60: amber, < 60: red
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-500';
  if (score >= 60) return 'text-amber-500';
  return 'text-red-500';
}
