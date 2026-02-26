import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Welcome from '../Welcome';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('setup_token', 'test-token');
  mockFetch.mockResolvedValue({
    json: () => Promise.resolve({ success: true }),
  });
});

describe('Welcome', () => {
  it('renders language selector', () => {
    render(<Welcome onComplete={vi.fn()} />);

    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('renders Get Started button', () => {
    render(<Welcome onComplete={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Get Started' })).toBeInTheDocument();
  });

  it('calls onComplete after successful submit', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    render(<Welcome onComplete={onComplete} />);

    await user.click(screen.getByRole('button', { name: 'Get Started' }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledOnce();
    });
  });

  it('shows error message on API failure', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false, error: 'Server error' }),
    });

    render(<Welcome onComplete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Get Started' }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });
});
