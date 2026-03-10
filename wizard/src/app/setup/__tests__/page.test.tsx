import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SetupPage from '../page';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();

  // Default: all fetches return success (for both status restore and step submissions)
  mockFetch.mockResolvedValue({
    json: () => Promise.resolve({ success: true, data: {} }),
  });
});

describe('SetupPage', () => {
  it('renders first step by default', async () => {
    // Status restore returns no position
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false }),
    });

    render(<SetupPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Welcome to openant' })).toBeInTheDocument();
    });
  });

  it('navigates to next step when submit is clicked', async () => {
    const user = userEvent.setup();
    // Status restore fails
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false }),
    });

    render(<SetupPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Welcome to openant' })).toBeInTheDocument();
    });

    // Click "Get Started" — triggers POST + onComplete
    await user.click(screen.getByRole('button', { name: 'Get Started' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Domain Configuration' })).toBeInTheDocument();
    });
  });

  it('navigates back when Back is clicked', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false }),
    });

    render(<SetupPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Welcome to openant' })).toBeInTheDocument();
    });

    // Go to step 2
    await user.click(screen.getByRole('button', { name: 'Get Started' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Domain Configuration' })).toBeInTheDocument();
    });

    // Go back
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Welcome to openant' })).toBeInTheDocument();
  });

  it('does not go below step 0', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false }),
    });

    render(<SetupPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Welcome to openant' })).toBeInTheDocument();
    });

    // Welcome has showBack={false}, so no Back button
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('does not go above last step', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false }),
    });

    render(<SetupPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Welcome to openant' })).toBeInTheDocument();
    });

    // Navigate through all steps to Deploy
    // Welcome → Get Started
    await user.click(screen.getByRole('button', { name: 'Get Started' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Domain Configuration' })).toBeInTheDocument();
    });

    // Domain → Next
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LLM Provider' })).toBeInTheDocument();
    });

    // LLM → Next
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Blog Settings' })).toBeInTheDocument();
    });

    // Blog → Next
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Telegram Bot' })).toBeInTheDocument();
    });

    // Telegram → Next
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Social Distribution' })).toBeInTheDocument();
    });

    // Social → Next
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Review Configuration' })).toBeInTheDocument();
    });

    // Review → Apply Configuration (transitions to Deploy step which auto-starts)
    await user.click(screen.getByRole('button', { name: 'Apply Configuration' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Apply Configuration' })).toBeInTheDocument();
    });
  });

  it('restores position from /api/setup/status', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            currentStep: 'blog',
            steps: {
              welcome: { completed: true },
              domain: { completed: true },
              llm: { completed: true },
              blog: { completed: false },
              social: { completed: false },
              review: { completed: false },
              deploy: { completed: false },
            },
          },
        }),
    });

    render(<SetupPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Blog Settings' })).toBeInTheDocument();
    });
  });

  it('stores token from URL to localStorage', async () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?token=test-token', href: 'http://localhost/setup?token=test-token' },
      writable: true,
    });

    render(<SetupPage />);

    await waitFor(() => {
      expect(localStorage.getItem('setup_token')).toBe('test-token');
    });
  });
});
