import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(
      <EmptyState
        title="No biomarkers yet"
        description="Upload your lab results to start tracking."
      />,
    );

    expect(screen.getByText('No biomarkers yet')).toBeInTheDocument();
    expect(screen.getByText('Upload your lab results to start tracking.')).toBeInTheDocument();
  });

  it('renders optional icon', () => {
    render(
      <EmptyState
        icon={<svg data-testid="test-icon" />}
        title="Empty"
        description="Nothing here."
      />,
    );

    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('renders action button and fires onClick', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(
      <EmptyState
        title="No data"
        description="Get started."
        action={{ label: 'Upload Now', onClick: handleClick }}
      />,
    );

    const button = screen.getByRole('button', { name: 'Upload Now' });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('does not render action button when action prop is absent', () => {
    render(<EmptyState title="Empty" description="No action." />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
