import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Skeleton,
  DashboardSkeleton,
  BiomarkerTableSkeleton,
  ProfileSkeleton,
  BiomarkerDetailSkeleton,
} from './Skeleton';

describe('Skeleton', () => {
  it('renders with aria-hidden for accessibility', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('applies animate-pulse class', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('animate-pulse');
  });

  it('merges custom className', () => {
    const { container } = render(<Skeleton className="h-10 w-full" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('h-10');
    expect(el.className).toContain('w-full');
  });
});

describe('DashboardSkeleton', () => {
  it('renders multiple skeleton blocks matching dashboard layout', () => {
    const { container } = render(<DashboardSkeleton />);
    // Should have card elements (glass surfaces)
    const cards = container.querySelectorAll('.card');
    expect(cards.length).toBeGreaterThanOrEqual(1);
    // Should have the sparkline grid (6 skeleton cards)
    const pulseElements = container.querySelectorAll('[aria-hidden="true"]');
    expect(pulseElements.length).toBeGreaterThan(10);
  });
});

describe('BiomarkerTableSkeleton', () => {
  it('renders filter bar and table row skeletons', () => {
    const { container } = render(<BiomarkerTableSkeleton />);
    const cards = container.querySelectorAll('.card');
    expect(cards.length).toBeGreaterThanOrEqual(1);
  });
});

describe('ProfileSkeleton', () => {
  it('renders multiple card sections', () => {
    const { container } = render(<ProfileSkeleton />);
    const cards = container.querySelectorAll('.card');
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });
});

describe('BiomarkerDetailSkeleton', () => {
  it('renders detail layout with chart placeholder', () => {
    const { container } = render(<BiomarkerDetailSkeleton />);
    const cards = container.querySelectorAll('.card');
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });
});
