import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBufferChannels, bufferSelectionValid } from '../buffer';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function gqlResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve({ data }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('bufferSelectionValid', () => {
  const channels = [
    {
      id: 'ch-pin',
      service: 'pinterest',
      name: 'My Pinterest',
      boards: [{ serviceId: 'b1', name: 'Recipes' }],
    },
    { id: 'ch-ig', service: 'instagram', name: 'My IG', boards: [] },
  ];

  it('accepts a fully matching selection', () => {
    expect(
      bufferSelectionValid(channels, {
        pinterest_enabled: true,
        instagram_enabled: true,
        buffer_pinterest_channel_id: 'ch-pin',
        buffer_pinterest_board_id: 'b1',
        buffer_instagram_channel_id: 'ch-ig',
      }),
    ).toBe(true);
  });

  it('accepts when no networks are enabled', () => {
    expect(bufferSelectionValid(channels, {})).toBe(true);
  });

  it('rejects a channel from another account', () => {
    expect(
      bufferSelectionValid(channels, {
        pinterest_enabled: true,
        buffer_pinterest_channel_id: 'ch-other',
        buffer_pinterest_board_id: 'b1',
      }),
    ).toBe(false);
  });

  it('rejects a board that is not on the selected channel', () => {
    expect(
      bufferSelectionValid(channels, {
        pinterest_enabled: true,
        buffer_pinterest_channel_id: 'ch-pin',
        buffer_pinterest_board_id: 'wrong-board',
      }),
    ).toBe(false);
  });

  it('rejects a channel id pointing at the wrong service', () => {
    expect(
      bufferSelectionValid(channels, {
        instagram_enabled: true,
        buffer_instagram_channel_id: 'ch-pin',
      }),
    ).toBe(false);
  });

  it('rejects an enabled network with no channel selected', () => {
    expect(
      bufferSelectionValid(channels, {
        threads_enabled: true,
      }),
    ).toBe(false);
  });
});

describe('fetchBufferChannels', () => {
  it('fetches channels across organizations with Pinterest boards', async () => {
    mockFetch
      .mockResolvedValueOnce(gqlResponse({ account: { organizations: [{ id: 'org-1' }] } }))
      .mockResolvedValueOnce(
        gqlResponse({
          channels: [
            {
              id: 'ch-pin',
              service: 'pinterest',
              name: 'pin-handle',
              displayName: 'My Pinterest',
              isDisconnected: false,
            },
            {
              id: 'ch-ig',
              service: 'instagram',
              name: 'ig-handle',
              displayName: null,
              isDisconnected: false,
            },
            {
              id: 'ch-dead',
              service: 'threads',
              name: 'dead',
              displayName: 'Dead',
              isDisconnected: true,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        gqlResponse({
          channel: { metadata: { boards: [{ serviceId: 'b1', name: 'Recipes' }] } },
        }),
      );

    const channels = await fetchBufferChannels('1/key');

    expect(channels).toHaveLength(2);
    expect(channels[0]).toEqual({
      id: 'ch-pin',
      service: 'pinterest',
      name: 'My Pinterest',
      boards: [{ serviceId: 'b1', name: 'Recipes' }],
    });
    // displayName null falls back to name
    expect(channels[1].name).toBe('ig-handle');
    expect(channels[1].boards).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) });

    await expect(fetchBufferChannels('1/key')).rejects.toThrow('Buffer API returned 500');
  });

  it('throws on GraphQL error message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ errors: [{ message: 'Invalid token' }] }),
    });

    await expect(fetchBufferChannels('1/bad')).rejects.toThrow('Buffer API: Invalid token');
  });
});
