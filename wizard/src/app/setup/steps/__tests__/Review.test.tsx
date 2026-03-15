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

const mockPreflight = {
  success: true,
  data: {
    checks: [
      { name: 'services', status: 'pass', detail: 'All services healthy' },
      { name: 'llm', status: 'pass', detail: '200ms' },
      { name: 'telegram', status: 'skip', detail: '' },
      { name: 'webhook', status: 'pass', detail: 'Make.com' },
      { name: 'dns', status: 'pass', detail: '' },
    ],
  },
};

function mockFetchForReview(configOverride?: unknown) {
  mockFetch.mockImplementation((url: string) =>
    Promise.resolve({
      json: () =>
        Promise.resolve(
          typeof url === 'string' && url.includes('/preflight')
            ? mockPreflight
            : (configOverride ?? mockConfig),
        ),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('setup_token', 'test-token');
  mockFetchForReview();
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

  it('shows preflight check results', async () => {
    render(<Review onComplete={vi.fn()} onBack={vi.fn()} onGoToStep={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Pre-flight checks')).toBeInTheDocument();
      expect(screen.getByText('Services')).toBeInTheDocument();
      expect(screen.getByText('LLM connection')).toBeInTheDocument();
    });
  });

  it('shows IP mode when no domain', async () => {
    mockFetchForReview({
      success: true,
      data: { domain: { use_domain: false } },
    });

    render(<Review onComplete={vi.fn()} onBack={vi.fn()} onGoToStep={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('IP mode')).toBeInTheDocument();
    });
  });
});
