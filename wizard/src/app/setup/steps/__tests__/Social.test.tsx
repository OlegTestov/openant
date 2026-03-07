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

  it('shows board input when Pinterest is enabled', async () => {
    const user = userEvent.setup();

    render(<Social onComplete={vi.fn()} onBack={vi.fn()} />);

    // Board input should not be visible initially
    expect(screen.queryByPlaceholderText('My Board Name')).not.toBeInTheDocument();

    // Enable Pinterest
    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]); // Pinterest toggle is first

    // Board input should now be visible
    expect(screen.getByPlaceholderText('My Board Name')).toBeInTheDocument();
  });

  it('shows download Make template button', () => {
    render(<Social onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Download Make.com Template' })).toBeInTheDocument();
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
