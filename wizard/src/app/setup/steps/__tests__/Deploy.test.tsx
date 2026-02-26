import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Deploy from '../Deploy';

interface SSEEvent {
  event: string;
  data: unknown;
}

function createMockSSEResponse(events: SSEEvent[]): Response {
  const text = events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function createStepEvents(count: number): SSEEvent[] {
  const labels = [
    'Saving configuration to .env',
    'Generating Caddyfile',
    'Reloading Caddy',
    'Creating Ghost admin account',
    'Configuring Ghost settings',
    'Creating NocoDB table',
    'Creating n8n credentials',
    'Importing n8n workflows',
    'Finalizing setup',
  ];

  const events: SSEEvent[] = [];
  for (let i = 1; i <= count; i++) {
    events.push({
      event: 'step',
      data: { step: i, total: 9, label: labels[i - 1], status: 'running' },
    });
    events.push({
      event: 'step',
      data: { step: i, total: 9, label: labels[i - 1], status: 'completed' },
    });
  }
  return events;
}

const mockCredentials = {
  ghost: {
    email: 'admin@example.com',
    password: 'ghostpass',
    adminUrl: 'https://example.com/ghost/',
  },
  nocodb: { email: 'admin@example.com', password: 'nocopass' },
  n8n: { email: 'admin@example.com', password: 'Nn8npass!' },
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('setup_token', 'test-token');
});

describe('Deploy', () => {
  it('renders Deploy Configuration button initially', () => {
    render(<Deploy onComplete={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Deploy Configuration' })).toBeInTheDocument();
  });

  it('shows progress bar during deployment', async () => {
    const events = [
      ...createStepEvents(2),
      {
        event: 'complete' as const,
        data: {
          success: true,
          urls: { blog: 'https://example.com', table: 'https://table.example.com' },
          credentials: mockCredentials,
        },
      },
    ];
    mockFetch.mockResolvedValueOnce(createMockSSEResponse(events));

    const user = userEvent.setup();
    render(<Deploy onComplete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Deploy Configuration' }));

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  it('shows checkmark for completed steps', async () => {
    const events = [
      ...createStepEvents(9),
      {
        event: 'complete' as const,
        data: {
          success: true,
          urls: {
            blog: 'https://example.com',
            table: 'https://table.example.com',
            n8n: 'https://auto.example.com',
          },
          credentials: mockCredentials,
        },
      },
    ];
    mockFetch.mockResolvedValueOnce(createMockSSEResponse(events));

    const user = userEvent.setup();
    render(<Deploy onComplete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Deploy Configuration' }));

    await waitFor(() => {
      expect(screen.getByText('Setup complete!')).toBeInTheDocument();
    });

    // All 9 step labels should be present
    expect(screen.getByText('Saving configuration to .env')).toBeInTheDocument();
    expect(screen.getByText('Finalizing setup')).toBeInTheDocument();
  });

  it('shows error message on failure', async () => {
    const events = [
      ...createStepEvents(3),
      {
        event: 'step' as const,
        data: { step: 4, total: 9, label: 'Creating Ghost admin account', status: 'running' },
      },
      {
        event: 'error' as const,
        data: {
          step: 4,
          label: 'Creating Ghost admin account',
          error: 'Ghost API unavailable',
          recoverable: true,
        },
      },
    ];
    mockFetch.mockResolvedValueOnce(createMockSSEResponse(events));

    const user = userEvent.setup();
    render(<Deploy onComplete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Deploy Configuration' }));

    await waitFor(() => {
      expect(screen.getByText(/Error at step 4: Ghost API unavailable/)).toBeInTheDocument();
    });
  });

  it('shows Retry button pointing to failed step', async () => {
    const events = [
      ...createStepEvents(3),
      {
        event: 'error' as const,
        data: {
          step: 4,
          label: 'Creating Ghost admin',
          error: 'Connection refused',
          recoverable: true,
        },
      },
    ];
    mockFetch.mockResolvedValueOnce(createMockSSEResponse(events));

    const user = userEvent.setup();
    render(<Deploy onComplete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Deploy Configuration' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Retry from this step' })).toBeInTheDocument();
    });

    // Click retry → fetch with startFrom=4
    const retryEvents = [
      ...createStepEvents(6).map((e) => ({
        ...e,
        data: {
          ...(e.data as Record<string, unknown>),
          step: ((e.data as Record<string, unknown>).step as number) + 3,
        },
      })),
      {
        event: 'complete' as const,
        data: {
          success: true,
          urls: { blog: 'https://example.com' },
          credentials: mockCredentials,
        },
      },
    ];
    mockFetch.mockResolvedValueOnce(createMockSSEResponse(retryEvents));

    await user.click(screen.getByRole('button', { name: 'Retry from this step' }));

    expect(mockFetch).toHaveBeenLastCalledWith(
      '/api/setup/apply?startFrom=4',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows success message and credentials on completion', async () => {
    const events = [
      ...createStepEvents(9),
      {
        event: 'complete' as const,
        data: {
          success: true,
          urls: {
            blog: 'https://example.com',
            table: 'https://table.example.com',
            n8n: 'https://auto.example.com',
          },
          credentials: mockCredentials,
        },
      },
    ];
    mockFetch.mockResolvedValueOnce(createMockSSEResponse(events));

    const user = userEvent.setup();
    render(<Deploy onComplete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Deploy Configuration' }));

    await waitFor(() => {
      expect(screen.getByText('Setup complete!')).toBeInTheDocument();
    });

    expect(screen.getByText('Service Access')).toBeInTheDocument();
    expect(screen.getAllByText('admin@example.com')).toHaveLength(3);
  });

  it('shows Go to Dashboard button after success', async () => {
    const events = [
      ...createStepEvents(9),
      {
        event: 'complete' as const,
        data: {
          success: true,
          urls: { blog: 'https://example.com' },
          credentials: mockCredentials,
        },
      },
    ];
    mockFetch.mockResolvedValueOnce(createMockSSEResponse(events));

    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Deploy onComplete={onComplete} />);

    await user.click(screen.getByRole('button', { name: 'Deploy Configuration' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Go to Dashboard' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Go to Dashboard' }));
    expect(onComplete).toHaveBeenCalled();
  });
});
