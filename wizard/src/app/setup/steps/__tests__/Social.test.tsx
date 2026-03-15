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

  it('shows download Make template button when a toggle is enabled', async () => {
    const user = userEvent.setup();
    render(<Social onComplete={vi.fn()} onBack={vi.fn()} />);

    // Hidden by default
    expect(
      screen.queryByRole('button', { name: 'Download Make.com Template' }),
    ).not.toBeInTheDocument();

    // Enable Pinterest
    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]);

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

  it('shows webhook connected message on successful test', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: { test_result: { connected: true } },
        }),
    });

    render(<Social onComplete={vi.fn()} onBack={vi.fn()} />);

    // Enable Pinterest to show webhook field
    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]);

    await user.type(screen.getByLabelText('Pinterest Board'), 'My Board');
    await user.type(screen.getByLabelText('Make.com Webhook URL'), 'https://hook.make.com/abc');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByText('Webhook connected!')).toBeInTheDocument();
    });
  });

  it('shows error when webhook test fails', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: { test_result: { connected: false, error: 'Webhook returned 500' } },
        }),
    });

    render(<Social onComplete={vi.fn()} onBack={vi.fn()} />);

    // Enable Pinterest
    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]);

    await user.type(screen.getByLabelText('Pinterest Board'), 'My Board');
    await user.type(screen.getByLabelText('Make.com Webhook URL'), 'https://hook.make.com/bad');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByText('Webhook returned 500')).toBeInTheDocument();
    });
  });
});
