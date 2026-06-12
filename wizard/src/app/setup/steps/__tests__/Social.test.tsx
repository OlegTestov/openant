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

  it('has Pinterest, Instagram and Threads toggles', () => {
    render(<Social onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByText('Pinterest')).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('Threads')).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(3);
  });

  it('defaults to Buffer method and shows API key field', async () => {
    const user = userEvent.setup();

    render(<Social onComplete={vi.fn()} onBack={vi.fn()} />);

    // No method UI until a network is enabled
    expect(screen.queryByLabelText('Buffer API Key')).not.toBeInTheDocument();

    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]); // Pinterest

    expect(screen.getByLabelText('Buffer API Key')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load channels' })).toBeInTheDocument();
  });

  it('requires Buffer API key on submit when method is Buffer', async () => {
    const user = userEvent.setup();

    render(<Social onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getAllByRole('switch')[0]); // Pinterest
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Buffer API key is required')).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('loads Buffer channels and shows channel selects', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            channels: [
              {
                id: 'ch-pin',
                service: 'pinterest',
                name: 'My Pinterest',
                boards: [{ serviceId: 'b1', name: 'Board One' }],
              },
              { id: 'ch-ig', service: 'instagram', name: 'My IG', boards: [] },
            ],
          },
        }),
    });

    render(<Social onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getAllByRole('switch')[0]); // Pinterest
    await user.type(screen.getByLabelText('Buffer API Key'), '1/key');
    await user.click(screen.getByRole('button', { name: 'Load channels' }));

    await waitFor(() => {
      expect(screen.getByText('Channels loaded!')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Pinterest channel')).toBeInTheDocument();
    expect(screen.getByLabelText('Pinterest board')).toBeInTheDocument();
  });

  it('shows error when Instagram is enabled with Make method', async () => {
    const user = userEvent.setup();

    render(<Social onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getAllByRole('switch')[1]); // Instagram
    await user.click(screen.getByRole('button', { name: 'Make.com' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(
      screen.getAllByText('Instagram publishing is only available via Buffer').length,
    ).toBeGreaterThan(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows board input when Pinterest is enabled with Make method', async () => {
    const user = userEvent.setup();

    render(<Social onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(screen.queryByPlaceholderText('My Board Name')).not.toBeInTheDocument();

    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]); // Pinterest
    await user.click(screen.getByRole('button', { name: 'Make.com' }));

    expect(screen.getByPlaceholderText('My Board Name')).toBeInTheDocument();
  });

  it('shows download Make template button with Make method', async () => {
    const user = userEvent.setup();
    render(<Social onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: 'Download Make.com Template' }),
    ).not.toBeInTheDocument();

    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]);
    await user.click(screen.getByRole('button', { name: 'Make.com' }));

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

    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]); // Pinterest
    await user.click(screen.getByRole('button', { name: 'Make.com' }));

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

    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]); // Pinterest
    await user.click(screen.getByRole('button', { name: 'Make.com' }));

    await user.type(screen.getByLabelText('Pinterest Board'), 'My Board');
    await user.type(screen.getByLabelText('Make.com Webhook URL'), 'https://hook.make.com/bad');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByText('Webhook returned 500')).toBeInTheDocument();
    });
  });
});
