import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Blog from '../Blog';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('setup_token', 'test-token');
  mockFetch.mockResolvedValue({
    json: () => Promise.resolve({ success: true }),
  });
});

describe('Blog', () => {
  it('shows preview card updating in real-time', async () => {
    const user = userEvent.setup();
    render(<Blog onComplete={vi.fn()} onBack={vi.fn()} />);

    const titleInput = screen.getByPlaceholderText('My Awesome Blog');
    await user.type(titleInput, 'Test Blog');

    expect(screen.getByText('Test Blog')).toBeInTheDocument();
  });

  it('defaults to 6 hours in the interval input', () => {
    render(<Blog onComplete={vi.fn()} onBack={vi.fn()} />);
    const input = screen.getByLabelText(/Publish Interval/i) as HTMLInputElement;
    expect(input.value).toBe('6');
  });

  it('does not render a unit selector', () => {
    render(<Blog onComplete={vi.fn()} onBack={vi.fn()} />);
    expect(screen.queryByRole('combobox', { name: /minutes|hours/i })).not.toBeInTheDocument();
  });

  it('submits hours converted to minutes (2h → 120)', async () => {
    const user = userEvent.setup();
    render(<Blog onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('My Awesome Blog'), 'Blog');

    const intervalInput = screen.getByLabelText(/Publish Interval/i) as HTMLInputElement;
    await user.clear(intervalInput);
    await user.type(intervalInput, '2');

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.publish_interval_minutes).toBe(120);
    });
  });

  it('uses default 6h when no initialData publish_interval_minutes', async () => {
    const user = userEvent.setup();
    render(<Blog onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('My Awesome Blog'), 'Blog');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.publish_interval_minutes).toBe(360);
    });
  });

  it('rounds legacy 30-minute initialData to 1 hour in the input', () => {
    render(
      <Blog onComplete={vi.fn()} onBack={vi.fn()} initialData={{ publish_interval_minutes: 30 }} />,
    );
    const input = screen.getByLabelText(/Publish Interval/i) as HTMLInputElement;
    expect(input.value).toBe('1');
  });

  it('rounds legacy 90-minute initialData to 2 hours in the input', () => {
    render(
      <Blog onComplete={vi.fn()} onBack={vi.fn()} initialData={{ publish_interval_minutes: 90 }} />,
    );
    const input = screen.getByLabelText(/Publish Interval/i) as HTMLInputElement;
    expect(input.value).toBe('2');
  });

  it('clamps over-max input to 168 on blur', async () => {
    const user = userEvent.setup();
    render(<Blog onComplete={vi.fn()} onBack={vi.fn()} />);

    const intervalInput = screen.getByLabelText(/Publish Interval/i) as HTMLInputElement;
    await user.click(intervalInput);
    await user.clear(intervalInput);
    await user.type(intervalInput, '200');
    await user.tab();

    expect(intervalInput.value).toBe('168');
  });

  it('clamps cleared input to 1 on blur', async () => {
    const user = userEvent.setup();
    render(<Blog onComplete={vi.fn()} onBack={vi.fn()} />);

    const intervalInput = screen.getByLabelText(/Publish Interval/i) as HTMLInputElement;
    await user.click(intervalInput);
    await user.clear(intervalInput);
    await user.tab();

    expect(intervalInput.value).toBe('1');
  });

  it('shows error on API failure', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false, error: 'Title is required' }),
    });

    render(<Blog onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByText('Title is required')).toBeInTheDocument();
    });
  });
});
