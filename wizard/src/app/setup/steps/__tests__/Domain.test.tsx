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
});
