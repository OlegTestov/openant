import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Review from '../Review';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockConfig = {
  success: true,
  data: {
    domain: { use_domain: true, domain: 'example.com' },
    llm: {
      provider: 'openai',
      api_url: 'https://api.openai.com/v1',
      api_key: '***',
      model: 'gpt-4o-mini',
    },
    blog: {
      title: 'My Blog',
      description: 'A great blog',
      language: 'en',
      tone: 'professional',
      publish_interval_minutes: 60,
    },
    social: {
      make_webhook_url: 'https://hook.make.com/abc',
      pinterest_enabled: true,
      threads_enabled: false,
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('setup_token', 'test-token');
  mockFetch.mockResolvedValue({
    json: () => Promise.resolve(mockConfig),
  });
});

describe('Review', () => {
  it('displays all configuration sections', async () => {
    render(<Review onComplete={vi.fn()} onBack={vi.fn()} onGoToStep={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('example.com')).toBeInTheDocument();
      expect(screen.getByText(/openai \/ gpt-4o-mini/)).toBeInTheDocument();
      expect(screen.getByText(/My Blog/)).toBeInTheDocument();
      expect(screen.getByText(/Webhook/)).toBeInTheDocument();
    });
  });

  it('Edit rows navigate to correct steps', async () => {
    const user = userEvent.setup();
    const onGoToStep = vi.fn();

    render(<Review onComplete={vi.fn()} onBack={vi.fn()} onGoToStep={onGoToStep} />);

    await waitFor(() => {
      expect(screen.getByText('example.com')).toBeInTheDocument();
    });

    const editLinks = screen.getAllByText('Edit');
    await user.click(editLinks[0]); // Domain
    expect(onGoToStep).toHaveBeenCalledWith(1);

    await user.click(editLinks[1]); // LLM
    expect(onGoToStep).toHaveBeenCalledWith(2);
  });

  it('shows IP mode when no domain', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: { domain: { use_domain: false } },
        }),
    });

    render(<Review onComplete={vi.fn()} onBack={vi.fn()} onGoToStep={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('IP mode')).toBeInTheDocument();
    });
  });
});
