import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Telegram from '../Telegram';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('setup_token', 'test-token');
  mockFetch.mockResolvedValue({
    json: () => Promise.resolve({ success: true }),
  });
});

describe('Telegram', () => {
  it('shows optional step alert', () => {
    render(<Telegram onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByText('This step is optional')).toBeInTheDocument();
  });

  it('shows bot token and chat id inputs', () => {
    render(<Telegram onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByLabelText('Bot Token')).toBeInTheDocument();
    expect(screen.getByLabelText('Chat ID')).toBeInTheDocument();
  });

  it('shows BotFather link and instructions', () => {
    render(<Telegram onComplete={vi.fn()} onBack={vi.fn()} />);

    const link = screen.getByRole('link', { name: /BotFather/i });
    expect(link).toHaveAttribute('href', 'https://t.me/BotFather');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('/newbot')).toBeInTheDocument();
  });

  it('shows chat id auto-detect hint', () => {
    render(<Telegram onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(
      screen.getByText('Leave empty to auto-detect when you send /start to the bot'),
    ).toBeInTheDocument();
  });

  it('can submit with empty form (skip step)', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    render(<Telegram onComplete={onComplete} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledOnce();
    });
  });

  it('submits with bot token only', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    render(<Telegram onComplete={onComplete} onBack={vi.fn()} />);

    await user.type(screen.getByLabelText('Bot Token'), '123:ABC');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith({
        bot_token: '123:ABC',
        chat_id: '',
      });
    });
  });

  it('submits with bot token and chat id', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    render(<Telegram onComplete={onComplete} onBack={vi.fn()} />);

    await user.type(screen.getByLabelText('Bot Token'), '123:ABC');
    await user.type(screen.getByLabelText('Chat ID'), '999');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith({
        bot_token: '123:ABC',
        chat_id: '999',
      });
    });
  });

  it('restores initial data', () => {
    render(
      <Telegram
        onComplete={vi.fn()}
        onBack={vi.fn()}
        initialData={{ bot_token: 'saved-token', chat_id: '12345' }}
      />,
    );

    expect(screen.getByLabelText('Bot Token')).toHaveValue('saved-token');
    expect(screen.getByLabelText('Chat ID')).toHaveValue('12345');
  });

  it('shows error on API failure', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false, error: 'Server error' }),
    });

    render(<Telegram onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('shows token format error for invalid format', async () => {
    const user = userEvent.setup();

    render(<Telegram onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.type(screen.getByLabelText('Bot Token'), 'not-a-token');

    expect(screen.getByText(/Invalid format/)).toBeInTheDocument();
  });

  it('does not show format error for valid token', async () => {
    const user = userEvent.setup();

    render(<Telegram onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.type(screen.getByLabelText('Bot Token'), '123456:ABC-DEF');

    expect(screen.queryByText(/Invalid format/)).not.toBeInTheDocument();
  });

  it('blocks submit when token format is invalid', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    render(<Telegram onComplete={onComplete} onBack={vi.fn()} />);

    await user.type(screen.getByLabelText('Bot Token'), 'bad');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(onComplete).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalledWith('/api/setup/telegram', expect.anything());
  });

  it('shows test result on successful token verification', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: { test_result: { connected: true, bot_name: '@mybot' } },
        }),
    });

    render(<Telegram onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.type(screen.getByLabelText('Bot Token'), '123:ABC');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByText(/Connected:/)).toBeInTheDocument();
      expect(screen.getByText(/@mybot/)).toBeInTheDocument();
    });
  });

  it('shows error when token verification fails', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: { test_result: { connected: false, error: 'Unauthorized' } },
        }),
    });

    render(<Telegram onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.type(screen.getByLabelText('Bot Token'), '123:ABC');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    });
  });
});
