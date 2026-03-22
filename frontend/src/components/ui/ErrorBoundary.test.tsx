import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';

// Suppress React error boundary console.error noise in test output
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalError;
});

function ThrowingComponent({ message }: { message: string }): never {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <p>Hello world</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="Test crash" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test crash')).toBeInTheDocument();
  });

  it('shows Reload Page and Go to Dashboard buttons', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="Oops" />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('button', { name: 'Reload Page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to Dashboard' })).toBeInTheDocument();
  });

  it('calls window.location.reload on Reload click', async () => {
    const user = userEvent.setup();
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowingComponent message="crash" />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole('button', { name: 'Reload Page' }));
    expect(reloadMock).toHaveBeenCalled();
  });
});
