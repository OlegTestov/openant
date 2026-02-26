import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LLM from '../LLM';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('setup_token', 'test-token');
  mockFetch.mockResolvedValue({
    json: () =>
      Promise.resolve({
        success: true,
        data: { test_result: { connected: true, latency_ms: 200 } },
      }),
  });
});

describe('LLM', () => {
  it('renders provider selector and input fields', () => {
    render(<LLM onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByText('Provider')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('gpt-4o-mini')).toBeInTheDocument();
  });

  it('Test Connection button works', async () => {
    const user = userEvent.setup();
    render(<LLM onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Test Connection/ }));

    await waitFor(() => {
      expect(screen.getByText('Connected!')).toBeInTheDocument();
      expect(screen.getByText(/200ms/)).toBeInTheDocument();
    });
  });

  it('shows error result on failure', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: { test_result: { connected: false, error: 'Invalid API key (401)' } },
        }),
    });

    render(<LLM onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Test Connection/ }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid API key/)).toBeInTheDocument();
    });
  });

  it('calls onComplete after successful submit', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    render(<LLM onComplete={onComplete} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledOnce();
    });
  });
});
