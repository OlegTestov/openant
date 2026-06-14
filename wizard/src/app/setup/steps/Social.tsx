'use client';

import { useState } from 'react';
import { StepLayout } from '@/components/StepLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { downloadBlueprint } from '@/lib/download';
import { useTranslations } from '@/lib/i18n';
import type { WebhookTestResult } from '@/lib/test-connections';
import type { BufferChannel } from '@/lib/buffer';
import type { StepProps } from '@/types/step-props';

type PublishMethod = 'buffer' | 'make';

export default function Social({ onComplete, onBack, initialData }: StepProps) {
  const initial = initialData as
    | {
        make_webhook_url?: string;
        pinterest_enabled?: boolean;
        threads_enabled?: boolean;
        instagram_enabled?: boolean;
        linkedin_enabled?: boolean;
        board?: string;
        buffer_api_key?: string;
        buffer_pinterest_channel_id?: string;
        buffer_pinterest_board_id?: string;
        buffer_instagram_channel_id?: string;
        buffer_threads_channel_id?: string;
        buffer_linkedin_channel_id?: string;
        inro_api_key?: string;
        inro_keyword?: string;
        inro_tag_prefix?: string;
      }
    | undefined;
  const [method, setMethod] = useState<PublishMethod>(
    initial?.make_webhook_url && !initial?.buffer_api_key ? 'make' : 'buffer',
  );
  const [pinterest, setPinterest] = useState(initial?.pinterest_enabled ?? false);
  const [instagram, setInstagram] = useState(initial?.instagram_enabled ?? false);
  const [threads, setThreads] = useState(initial?.threads_enabled ?? false);
  const [linkedin, setLinkedin] = useState(initial?.linkedin_enabled ?? false);
  const [webhookUrl, setWebhookUrl] = useState(initial?.make_webhook_url ?? '');
  const [board, setBoard] = useState(initial?.board ?? '');
  const [bufferKey, setBufferKey] = useState(initial?.buffer_api_key ?? '');
  const [channels, setChannels] = useState<BufferChannel[] | null>(null);
  const [pinChannelId, setPinChannelId] = useState(initial?.buffer_pinterest_channel_id ?? '');
  const [pinBoardId, setPinBoardId] = useState(initial?.buffer_pinterest_board_id ?? '');
  const [igChannelId, setIgChannelId] = useState(initial?.buffer_instagram_channel_id ?? '');
  const [threadsChannelId, setThreadsChannelId] = useState(
    initial?.buffer_threads_channel_id ?? '',
  );
  const [linkedinChannelId, setLinkedinChannelId] = useState(
    initial?.buffer_linkedin_channel_id ?? '',
  );
  const [inroKey, setInroKey] = useState(initial?.inro_api_key ?? '');
  const [inroKeyword, setInroKeyword] = useState(initial?.inro_keyword ?? '');
  const [inroTagPrefix, setInroTagPrefix] = useState(initial?.inro_tag_prefix ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);
  const t = useTranslations();

  const anyEnabled = pinterest || instagram || threads || linkedin;
  const pinterestChannels = channels?.filter((c) => c.service === 'pinterest') ?? [];
  const instagramChannels = channels?.filter((c) => c.service === 'instagram') ?? [];
  const threadsChannels = channels?.filter((c) => c.service === 'threads') ?? [];
  const linkedinChannels = channels?.filter((c) => c.service === 'linkedin') ?? [];
  const selectedPinChannel = pinterestChannels.find((c) => c.id === pinChannelId);

  async function handleLoadChannels() {
    setError(null);
    if (!bufferKey.trim()) {
      setError(t.steps.social.bufferKeyRequired);
      return;
    }
    setIsLoadingChannels(true);
    try {
      const token = localStorage.getItem('setup_token');
      const res = await fetch('/api/setup/social/buffer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ api_key: bufferKey.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error);
        return;
      }
      const loaded = (data.data?.channels ?? []) as BufferChannel[];
      setChannels(loaded);
      // Auto-select when there is exactly one channel of a kind
      const pins = loaded.filter((c) => c.service === 'pinterest');
      const igs = loaded.filter((c) => c.service === 'instagram');
      const ths = loaded.filter((c) => c.service === 'threads');
      const lis = loaded.filter((c) => c.service === 'linkedin');
      if (pins.length === 1) {
        setPinChannelId(pins[0].id);
        if (pins[0].boards.length === 1) setPinBoardId(pins[0].boards[0].serviceId);
      }
      if (igs.length === 1) setIgChannelId(igs[0].id);
      if (ths.length === 1) setThreadsChannelId(ths[0].id);
      if (lis.length === 1) setLinkedinChannelId(lis[0].id);
    } catch {
      setError(t.common.failedToSave);
    } finally {
      setIsLoadingChannels(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    setTestResult(null);

    if (anyEnabled && method === 'make') {
      if (instagram || linkedin) {
        setError(t.steps.social.instagramNeedsBuffer);
        return;
      }
      if (!webhookUrl.trim()) {
        setError(t.steps.social.webhookRequired);
        return;
      }
      if (pinterest && !board.trim()) {
        setError(t.steps.social.boardRequired);
        return;
      }
    }
    if (anyEnabled && method === 'buffer') {
      if (!bufferKey.trim()) {
        setError(t.steps.social.bufferKeyRequired);
        return;
      }
      if (
        (pinterest && (!pinChannelId || !pinBoardId)) ||
        (instagram && !igChannelId) ||
        (threads && !threadsChannelId) ||
        (linkedin && !linkedinChannelId)
      ) {
        setError(t.steps.social.bufferChannelsRequired);
        return;
      }
      if (instagram && inroTagPrefix.trim() && !/^[A-Za-z0-9]+$/.test(inroTagPrefix.trim())) {
        setError(t.steps.social.inroTagPrefixInvalid);
        return;
      }
    }

    setIsLoading(true);

    const useBuffer = anyEnabled && method === 'buffer';
    const useMake = anyEnabled && method === 'make';
    const body = {
      pinterest_enabled: pinterest,
      threads_enabled: threads,
      instagram_enabled: instagram,
      linkedin_enabled: linkedin,
      make_webhook_url: useMake ? webhookUrl : '',
      board: useMake ? board : '',
      buffer_api_key: useBuffer ? bufferKey.trim() : '',
      buffer_pinterest_channel_id: useBuffer && pinterest ? pinChannelId : '',
      buffer_pinterest_board_id: useBuffer && pinterest ? pinBoardId : '',
      buffer_instagram_channel_id: useBuffer && instagram ? igChannelId : '',
      buffer_threads_channel_id: useBuffer && threads ? threadsChannelId : '',
      buffer_linkedin_channel_id: useBuffer && linkedin ? linkedinChannelId : '',
      inro_api_key: useBuffer && instagram ? inroKey.trim() : '',
      inro_keyword: useBuffer && instagram ? inroKeyword.trim() : '',
      inro_tag_prefix: useBuffer && instagram ? inroTagPrefix.trim() : '',
    };

    try {
      const token = localStorage.getItem('setup_token');
      const res = await fetch('/api/setup/social', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error);
        return;
      }

      if (data.data?.test_result) {
        const result = data.data.test_result as WebhookTestResult;
        setTestResult(result);
        if (!result.connected) {
          setError(result.error ?? 'Webhook test failed');
          return;
        }
      }

      // Same as the LLM step: never keep the raw key in client-side step data
      onComplete({
        ...body,
        buffer_api_key: body.buffer_api_key ? '***' : '',
        inro_api_key: body.inro_api_key ? '***' : '',
      });
    } catch {
      setError(t.common.failedToSave);
    } finally {
      setIsLoading(false);
    }
  }

  function renderChannelSelect(
    id: string,
    label: string,
    options: BufferChannel[],
    value: string,
    onChange: (v: string) => void,
  ) {
    if (channels !== null && options.length === 0) {
      return (
        <div>
          <Label>{label}</Label>
          <p className="text-muted-foreground mt-1 text-xs">{t.steps.social.noChannelForService}</p>
        </div>
      );
    }
    if (channels === null) return null;
    return (
      <div>
        <Label htmlFor={id}>{label}</Label>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} className="mt-1 w-full">
            <SelectValue placeholder={t.steps.social.selectPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <StepLayout
      title={t.steps.social.title}
      description={t.steps.social.description}
      onNext={handleSubmit}
      onBack={onBack}
      isLoading={isLoading}
    >
      <div className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {testResult?.connected && (
          <Alert>
            <AlertDescription>{t.steps.social.webhookConnected}</AlertDescription>
          </Alert>
        )}

        <Alert>
          <AlertDescription>
            <p className="font-medium">{t.steps.social.optional}</p>
            <p className="text-sm">{t.steps.social.optionalHint}</p>
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="pinterest-toggle">{t.steps.social.pinterest}</Label>
            <Switch id="pinterest-toggle" checked={pinterest} onCheckedChange={setPinterest} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="instagram-toggle">{t.steps.social.instagram}</Label>
            <Switch id="instagram-toggle" checked={instagram} onCheckedChange={setInstagram} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="threads-toggle">{t.steps.social.threads}</Label>
            <Switch id="threads-toggle" checked={threads} onCheckedChange={setThreads} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="linkedin-toggle">{t.steps.social.linkedin}</Label>
            <Switch id="linkedin-toggle" checked={linkedin} onCheckedChange={setLinkedin} />
          </div>
        </div>

        {anyEnabled && (
          <div className="space-y-4">
            <div>
              <Label>{t.steps.social.method}</Label>
              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={method === 'buffer' ? 'default' : 'outline'}
                  onClick={() => setMethod('buffer')}
                >
                  {t.steps.social.methodBuffer}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={method === 'make' ? 'default' : 'outline'}
                  onClick={() => setMethod('make')}
                >
                  {t.steps.social.methodMake}
                </Button>
              </div>
            </div>

            {method === 'buffer' && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="buffer-api-key">{t.steps.social.bufferApiKey}</Label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      id="buffer-api-key"
                      value={bufferKey}
                      onChange={(e) => {
                        setBufferKey(e.target.value);
                        // Selected channels belong to the previous key — force a reload
                        setChannels(null);
                        setPinChannelId('');
                        setPinBoardId('');
                        setIgChannelId('');
                        setThreadsChannelId('');
                        setLinkedinChannelId('');
                      }}
                      placeholder="1/abc..."
                      aria-describedby="buffer-key-hint"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleLoadChannels}
                      disabled={isLoadingChannels}
                    >
                      {isLoadingChannels ? t.common.loading : t.steps.social.loadChannels}
                    </Button>
                  </div>
                  <p id="buffer-key-hint" className="text-muted-foreground mt-1 text-xs">
                    {t.steps.social.bufferApiKeyHint}
                  </p>
                </div>

                {channels !== null && (
                  <Alert>
                    <AlertDescription>{t.steps.social.channelsLoaded}</AlertDescription>
                  </Alert>
                )}

                {pinterest &&
                  renderChannelSelect(
                    'buffer-pinterest-channel',
                    t.steps.social.bufferPinterestChannel,
                    pinterestChannels,
                    pinChannelId,
                    (v) => {
                      setPinChannelId(v);
                      setPinBoardId('');
                    },
                  )}

                {pinterest && selectedPinChannel && (
                  <div>
                    <Label htmlFor="buffer-pinterest-board">{t.steps.social.bufferBoard}</Label>
                    <Select value={pinBoardId} onValueChange={setPinBoardId}>
                      <SelectTrigger id="buffer-pinterest-board" className="mt-1 w-full">
                        <SelectValue placeholder={t.steps.social.selectPlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedPinChannel.boards.map((b) => (
                          <SelectItem key={b.serviceId} value={b.serviceId}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {instagram &&
                  renderChannelSelect(
                    'buffer-instagram-channel',
                    t.steps.social.bufferInstagramChannel,
                    instagramChannels,
                    igChannelId,
                    setIgChannelId,
                  )}

                {instagram && (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{t.steps.social.inroSection}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t.steps.social.inroSectionHint}
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="inro-api-key">{t.steps.social.inroApiKey}</Label>
                      <Input
                        id="inro-api-key"
                        className="mt-1"
                        value={inroKey}
                        onChange={(e) => setInroKey(e.target.value)}
                        placeholder="inro_..."
                        aria-describedby="inro-key-hint"
                      />
                      <p id="inro-key-hint" className="text-muted-foreground mt-1 text-xs">
                        {t.steps.social.inroApiKeyHint}
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="inro-keyword">{t.steps.social.inroKeyword}</Label>
                      <Input
                        id="inro-keyword"
                        className="mt-1"
                        value={inroKeyword}
                        onChange={(e) => setInroKeyword(e.target.value)}
                        placeholder="ХОЧУ"
                        aria-describedby="inro-keyword-hint"
                      />
                      <p id="inro-keyword-hint" className="text-muted-foreground mt-1 text-xs">
                        {t.steps.social.inroKeywordHint}
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="inro-tag-prefix">{t.steps.social.inroTagPrefix}</Label>
                      <Input
                        id="inro-tag-prefix"
                        className="mt-1"
                        value={inroTagPrefix}
                        onChange={(e) => setInroTagPrefix(e.target.value)}
                        placeholder="oa"
                        aria-describedby="inro-tag-prefix-hint"
                      />
                      <p id="inro-tag-prefix-hint" className="text-muted-foreground mt-1 text-xs">
                        {t.steps.social.inroTagPrefixHint}
                      </p>
                    </div>
                  </div>
                )}

                {threads &&
                  renderChannelSelect(
                    'buffer-threads-channel',
                    t.steps.social.bufferThreadsChannel,
                    threadsChannels,
                    threadsChannelId,
                    setThreadsChannelId,
                  )}

                {linkedin &&
                  renderChannelSelect(
                    'buffer-linkedin-channel',
                    t.steps.social.bufferLinkedinChannel,
                    linkedinChannels,
                    linkedinChannelId,
                    setLinkedinChannelId,
                  )}
              </div>
            )}

            {method === 'make' && (
              <div className="space-y-4">
                {instagram && (
                  <Alert variant="destructive">
                    <AlertDescription>{t.steps.social.instagramNeedsBuffer}</AlertDescription>
                  </Alert>
                )}
                {pinterest && (
                  <div className="pl-1">
                    <Label htmlFor="board">{t.steps.social.board}</Label>
                    <Input
                      id="board"
                      className="mt-1"
                      value={board}
                      onChange={(e) => setBoard(e.target.value)}
                      placeholder="My Board Name"
                      aria-describedby="board-hint"
                    />
                    <p id="board-hint" className="text-muted-foreground mt-1 text-xs">
                      {t.steps.social.boardHint}
                    </p>
                  </div>
                )}
                <div>
                  <Button variant="outline" size="sm" type="button" onClick={downloadBlueprint}>
                    {t.steps.social.downloadTemplate}
                  </Button>
                  <p className="text-muted-foreground mt-1 whitespace-pre-line text-xs">
                    {t.steps.social.downloadHint}
                  </p>
                </div>
                <div>
                  <Label htmlFor="webhook-url">{t.steps.social.webhookUrl}</Label>
                  <Input
                    id="webhook-url"
                    className="mt-1"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://hook.make.com/..."
                    aria-describedby="webhook-hint"
                  />
                  <p id="webhook-hint" className="text-muted-foreground mt-1 text-xs">
                    {t.steps.social.webhookHint}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </StepLayout>
  );
}
