import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Social from '../Social';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('setup_token', 'test-token');
  mockFetch.mockResolvedValue({
    json: () => Promise.resolve({ success: true }),
  });
});

describe('Social', () => {
  it('shows optional step alert', () => {
    render(<Social onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByText('This step is optional')).toBeInTheDocument();
  });

  it('has Pinterest and Threads toggles', () => {
    render(<Social onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByText('Pinterest')).toBeInTheDocument();
    expect(screen.getByText('Threads')).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(2);
  });

  it('can submit with empty form', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    render(<Social onComplete={onComplete} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledOnce();
    });
  });
});
