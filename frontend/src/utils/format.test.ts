import { describe, it, expect } from 'vitest';
import {
  formatBiomarkerType,
  formatDate,
  formatDateTime,
  formatValue,
  getStatusColor,
  getStatusBgColor,
  getScoreColor,
} from './format';

describe('formatBiomarkerType', () => {
  it('converts snake_case to title case', () => {
    expect(formatBiomarkerType('FASTING_GLUCOSE')).toBe('Fasting Glucose');
  });

  it('preserves known abbreviations', () => {
    expect(formatBiomarkerType('LDL_CHOLESTEROL')).toBe('LDL Cholesterol');
    expect(formatBiomarkerType('HDL_CHOLESTEROL')).toBe('HDL Cholesterol');
    expect(formatBiomarkerType('HEMOGLOBIN_A1C')).toBe('Hemoglobin A1C');
    expect(formatBiomarkerType('HSCRP')).toBe('HSCRP');
    expect(formatBiomarkerType('TSH')).toBe('TSH');
    expect(formatBiomarkerType('APOB')).toBe('APOB');
  });

  it('handles single-word types', () => {
    expect(formatBiomarkerType('FERRITIN')).toBe('Ferritin');
  });
});

describe('formatDate', () => {
  it('formats ISO date strings', () => {
    const result = formatDate('2026-03-19T12:00:00Z');
    expect(result).toContain('Mar');
    expect(result).toContain('19');
    expect(result).toContain('2026');
  });

  it('handles malformed timestamps with extra precision', () => {
    const result = formatDate('2026-03-20T02:52:00+00:00.0010');
    expect(result).toContain('Mar');
    expect(result).toContain('20');
    expect(result).toContain('2026');
  });

  it('falls back to ISO substring for invalid dates', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDateTime', () => {
  it('includes time in output', () => {
    const result = formatDateTime('2026-03-19T14:30:00Z');
    expect(result).toContain('Mar');
    expect(result).toContain('19');
    expect(result).toContain('2026');
  });

  it('handles malformed timestamps', () => {
    const result = formatDateTime('2026-03-20T02:52:00+00:00.0010');
    expect(result).toContain('2026');
  });
});

describe('formatValue', () => {
  it('combines value and unit', () => {
    expect(formatValue(150, 'mg/dL')).toBe('150 mg/dL');
  });

  it('handles decimal values', () => {
    expect(formatValue(5.4, '%')).toBe('5.4 %');
  });
});

describe('getStatusColor', () => {
  it('returns emerald for OPTIMAL', () => {
    expect(getStatusColor('OPTIMAL')).toBe('text-emerald-600');
  });

  it('returns primary for NORMAL', () => {
    expect(getStatusColor('NORMAL')).toBe('text-primary-600');
  });

  it('returns amber for BORDERLINE', () => {
    expect(getStatusColor('BORDERLINE')).toBe('text-amber-600');
  });

  it('returns red for OUT_OF_RANGE', () => {
    expect(getStatusColor('OUT_OF_RANGE')).toBe('text-red-500');
  });

  it('returns slate for unknown status', () => {
    expect(getStatusColor('UNKNOWN')).toBe('text-slate-500');
  });
});

describe('getStatusBgColor', () => {
  it('maps each status to correct bg class', () => {
    expect(getStatusBgColor('OPTIMAL')).toBe('bg-emerald-50');
    expect(getStatusBgColor('NORMAL')).toBe('bg-primary-50');
    expect(getStatusBgColor('BORDERLINE')).toBe('bg-amber-50');
    expect(getStatusBgColor('OUT_OF_RANGE')).toBe('bg-red-50');
    expect(getStatusBgColor('UNKNOWN')).toBe('bg-slate-50');
  });
});

describe('getScoreColor', () => {
  it('returns emerald for scores >= 80', () => {
    expect(getScoreColor(80)).toBe('text-emerald-500');
    expect(getScoreColor(100)).toBe('text-emerald-500');
  });

  it('returns amber for scores 60-79', () => {
    expect(getScoreColor(60)).toBe('text-amber-500');
    expect(getScoreColor(79)).toBe('text-amber-500');
  });

  it('returns red for scores < 60', () => {
    expect(getScoreColor(59)).toBe('text-red-500');
    expect(getScoreColor(0)).toBe('text-red-500');
  });
});
