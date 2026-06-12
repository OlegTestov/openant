// Buffer GraphQL API client (https://developers.buffer.com)
// Used by the Social setup step to validate the API key and let the user
// pick publishing channels (Pinterest board, Instagram, Threads).

const BUFFER_API_URL = 'https://api.buffer.com';

export interface BufferBoard {
  serviceId: string;
  name: string;
}

export interface BufferChannel {
  id: string;
  service: string;
  name: string;
  boards: BufferBoard[];
}

interface GraphQlError {
  message: string;
}

async function bufferGql<T>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(BUFFER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Buffer API returned ${res.status}`);
  }
  const json = (await res.json()) as { data?: T; errors?: GraphQlError[] };
  if (json.errors?.length) {
    throw new Error(`Buffer API: ${json.errors[0].message}`);
  }
  if (!json.data) {
    throw new Error('Buffer API: empty response');
  }
  return json.data;
}

export interface BufferSocialConfig {
  pinterest_enabled?: boolean;
  instagram_enabled?: boolean;
  threads_enabled?: boolean;
  buffer_pinterest_channel_id?: string;
  buffer_pinterest_board_id?: string;
  buffer_instagram_channel_id?: string;
  buffer_threads_channel_id?: string;
}

// Every enabled network must point at a channel (and board, for Pinterest)
// that actually belongs to the account behind the API key — stale ids would
// otherwise fail only inside the n8n workflow after the article is published.
export function bufferSelectionValid(
  channels: BufferChannel[],
  config: BufferSocialConfig,
): boolean {
  const has = (id: string | undefined, service: string): boolean =>
    channels.some((c) => c.id === id && c.service === service);

  if (config.pinterest_enabled) {
    const channel = channels.find(
      (c) => c.id === config.buffer_pinterest_channel_id && c.service === 'pinterest',
    );
    if (!channel?.boards.some((b) => b.serviceId === config.buffer_pinterest_board_id)) {
      return false;
    }
  }
  if (config.instagram_enabled && !has(config.buffer_instagram_channel_id, 'instagram')) {
    return false;
  }
  if (config.threads_enabled && !has(config.buffer_threads_channel_id, 'threads')) {
    return false;
  }
  return true;
}

export async function fetchBufferChannels(apiKey: string): Promise<BufferChannel[]> {
  const orgs = await bufferGql<{ organizations: Array<{ id: string }> }>(
    apiKey,
    'query { organizations { id } }',
  );

  const channels: BufferChannel[] = [];
  for (const org of orgs.organizations) {
    const data = await bufferGql<{
      channels: Array<{
        id: string;
        service: string;
        name?: string | null;
        displayName?: string | null;
        isDisconnected: boolean;
      }>;
    }>(
      apiKey,
      'query GetChannels($input: ChannelsInput!) { channels(input: $input) { id service name displayName isDisconnected } }',
      { input: { organizationId: org.id } },
    );
    for (const ch of data.channels) {
      if (ch.isDisconnected) continue;
      channels.push({
        id: ch.id,
        service: ch.service,
        name: ch.displayName || ch.name || ch.service,
        boards: [],
      });
    }
  }

  // Pinterest boards live on channel metadata — one extra query per Pinterest channel
  for (const ch of channels) {
    if (ch.service !== 'pinterest') continue;
    const data = await bufferGql<{
      channel: { metadata?: { boards?: BufferBoard[] } | null } | null;
    }>(
      apiKey,
      'query GetBoards($input: ChannelInput!) { channel(input: $input) { metadata { ... on PinterestMetadata { boards { serviceId name } } } } }',
      { input: { id: ch.id } },
    );
    ch.boards = data.channel?.metadata?.boards ?? [];
  }

  return channels;
}
