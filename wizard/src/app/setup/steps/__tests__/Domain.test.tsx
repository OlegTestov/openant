import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Domain from '../Domain';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('setup_token', 'test-token');
  mockFetch.mockResolvedValue({
    json: () =>
      Promise.resolve({
        success: true,
        data: { server_ip: '1.2.3.4' },
      }),
  });
});

describe('Domain', () => {
  it('shows domain input when toggle is on', async () => {
    const user = userEvent.setup();
    render(<Domain onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getByRole('switch'));

    expect(screen.getByPlaceholderText('example.com')).toBeInTheDocument();
  });

  it('hides domain input when toggle is off', () => {
    render(<Domain onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(screen.queryByPlaceholderText('example.com')).not.toBeInTheDocument();
  });

  it('shows IP mode info when toggle is off', () => {
    render(<Domain onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByText(/HTTPS will not be available/)).toBeInTheDocument();
  });

  it('calls onComplete after successful submit', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    render(<Domain onComplete={onComplete} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledOnce();
    });
  });

  it('strips https:// scheme from preview and DNS records', async () => {
    const user = userEvent.setup();
    render(<Domain onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getByRole('switch'));
    await user.type(screen.getByPlaceholderText('example.com'), 'https://example.com');

    expect(screen.getByText('blog.example.com')).toBeInTheDocument();
    expect(screen.queryByText(/blog\.https:/)).not.toBeInTheDocument();
  });

  it('disables Next and shows error on path-bearing input', async () => {
    const user = userEvent.setup();
    render(<Domain onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getByRole('switch'));
    await user.type(screen.getByPlaceholderText('example.com'), 'example.com/blog');

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Remove the path/);
  });

  it('sends normalized domain in payload, not raw input', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Domain onComplete={onComplete} onBack={vi.fn()} />);

    await user.click(screen.getByRole('switch'));
    await user.type(screen.getByPlaceholderText('example.com'), 'HTTPS://Example.COM/');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/setup/domain',
        expect.objectContaining({
          body: expect.stringContaining('"domain":"example.com"'),
        }),
      );
    });
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ domain: 'example.com' }));
  });
});
