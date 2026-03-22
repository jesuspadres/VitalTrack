import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders OPTIMAL status with correct text', () => {
    render(<StatusBadge status="OPTIMAL" />);
    expect(screen.getByText('Optimal')).toBeInTheDocument();
  });

  it('renders NORMAL status', () => {
    render(<StatusBadge status="NORMAL" />);
    expect(screen.getByText('Normal')).toBeInTheDocument();
  });

  it('renders BORDERLINE status', () => {
    render(<StatusBadge status="BORDERLINE" />);
    expect(screen.getByText('Borderline')).toBeInTheDocument();
  });

  it('renders OUT_OF_RANGE as "Out of Range"', () => {
    render(<StatusBadge status="OUT_OF_RANGE" />);
    expect(screen.getByText('Out of Range')).toBeInTheDocument();
  });

  it('applies glass styling with backdrop-blur', () => {
    const { container } = render(<StatusBadge status="OPTIMAL" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('backdrop-blur');
  });
});
