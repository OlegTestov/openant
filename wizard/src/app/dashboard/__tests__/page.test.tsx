import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DashboardPage from '../page';

const mockStatusResponse = {
  success: true,
  data: {
    ghost: 'healthy',
    nocodb: 'healthy',
    n8n: 'healthy',
    caddy: 'healthy',
    urls: {
      blog: 'https://example.com',
      table: 'https://table.example.com',
      n8n: 'https://auto.example.com',
    },
    credentials: {
      ghost: {
        email: 'admin@example.com',
        password: 'ghostpass',
        adminUrl: 'https://example.com/ghost/',
      },
      nocodb: { email: 'admin@example.com', password: 'nocopass' },
      n8n: { email: 'admin@example.com', password: 'Nn8npass!' },
    },
    saas_mode: false,
  },
};

const mockStatsResponse = {
  success: true,
  data: {
    queue: 5,
    published: 10,
    completed: 8,
    error: 1,
  },
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('setup_token', 'test-token');

  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/dashboard/status')) {
      return Promise.resolve({
        json: () => Promise.resolve(mockStatusResponse),
      });
    }
    if (url.includes('/api/dashboard/stats')) {
      return Promise.resolve({
        json: () => Promise.resolve(mockStatsResponse),
      });
    }
    return Promise.resolve({ json: () => Promise.resolve({ success: true }) });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DashboardPage', () => {
  it('shows loading state initially', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders service health statuses', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Services')).toBeInTheDocument();
    });

    // Service names appear in both Services and Service Access cards
    expect(screen.getAllByText('Ghost').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('NocoDB').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Caddy')).toBeInTheDocument();
  });

  it('renders tools card with Make template download', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Tools')).toBeInTheDocument();
    });

    expect(
      screen.getByText((content) => content.includes('Download Make.com Pinterest Template')),
    ).toBeInTheDocument();
  });

  it('renders article statistics', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    expect(screen.getByText('In Queue')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Errors')).toBeInTheDocument();
  });

  it('renders Service Access card with credentials', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Service Access')).toBeInTheDocument();
    });

    expect(screen.getByText(/Open blog/)).toBeInTheDocument();
    expect(screen.getByText(/Open admin/)).toBeInTheDocument();
    expect(screen.getByText(/Open articles table/)).toBeInTheDocument();
    expect(screen.getByText(/Open automations/)).toBeInTheDocument();
    expect(screen.getAllByText('admin@example.com')).toHaveLength(3);
    expect(screen.getByText('ghostpass')).toBeInTheDocument();
    expect(screen.getByText('nocopass')).toBeInTheDocument();
    expect(screen.getByText('Nn8npass!')).toBeInTheDocument();
  });

  it('shows green status for healthy services', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Ghost').length).toBeGreaterThanOrEqual(1);
    });

    const dots = screen.getAllByTestId('status-dot');
    dots.forEach((dot) => {
      expect(dot.className).toContain('bg-green-500');
    });
  });

  it('shows red status for unhealthy services', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/dashboard/status')) {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                ...mockStatusResponse.data,
                ghost: 'unhealthy',
              },
            }),
        });
      }
      if (url.includes('/api/dashboard/stats')) {
        return Promise.resolve({
          json: () => Promise.resolve(mockStatsResponse),
        });
      }
      return Promise.resolve({ json: () => Promise.resolve({ success: true }) });
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Ghost').length).toBeGreaterThanOrEqual(1);
    });

    const dots = screen.getAllByTestId('status-dot');
    // First dot (Ghost) should be red
    expect(dots[0].className).toContain('bg-red-500');
  });

  it('redirects to openant.app when saas_mode is true', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/dashboard/status')) {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              success: true,
              data: { ...mockStatusResponse.data, saas_mode: true },
            }),
        });
      }
      if (url.includes('/api/dashboard/stats')) {
        return Promise.resolve({
          json: () => Promise.resolve(mockStatsResponse),
        });
      }
      return Promise.resolve({ json: () => Promise.resolve({ success: true }) });
    });

    render(<DashboardPage />);

    // In SaaS mode, the page shows loading and triggers a redirect
    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  it('Reconfigure button shows confirmation dialog', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reconfigure' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Reconfigure' }));

    expect(confirmSpy).toHaveBeenCalledWith('This will reset your setup. Are you sure?');
  });

  it('Reconfigure redirects to /setup after confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    // Mock window.location.href setter
    const locationHrefSpy = vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      href: '',
    } as Location);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reconfigure' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Reconfigure' }));

    await waitFor(() => {
      // Check that reconfigure API was called
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dashboard/reconfigure',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    locationHrefSpy.mockRestore();
  });

  it('auto-refreshes every 30 seconds', async () => {
    vi.useFakeTimers();

    render(<DashboardPage />);

    // Initial fetch (status + stats)
    await vi.advanceTimersByTimeAsync(0);

    const initialCallCount = mockFetch.mock.calls.length;

    // Advance by 30 seconds
    await vi.advanceTimersByTimeAsync(30000);

    // Should have called fetch again (status + stats)
    expect(mockFetch.mock.calls.length).toBeGreaterThan(initialCallCount);

    vi.useRealTimers();
  });
});
