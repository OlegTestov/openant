'use client';

import { useState } from 'react';
import { StepLayout } from '@/components/StepLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { downloadBlueprint } from '@/lib/download';
import { useTranslations } from '@/lib/i18n';
import type { StepProps } from '@/types/step-props';

export default function Social({ onComplete, onBack, initialData }: StepProps) {
  const initial = initialData as
    | {
        make_webhook_url?: string;
        pinterest_enabled?: boolean;
        threads_enabled?: boolean;
        board?: string;
      }
    | undefined;
  const [webhookUrl, setWebhookUrl] = useState(initial?.make_webhook_url ?? '');
  const [pinterest, setPinterest] = useState(initial?.pinterest_enabled ?? false);
  const [threads, setThreads] = useState(initial?.threads_enabled ?? false);
  const [board, setBoard] = useState(initial?.board ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations();

  async function handleSubmit() {
    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('setup_token');
      const res = await fetch('/api/setup/social', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          make_webhook_url: webhookUrl,
          pinterest_enabled: pinterest,
          threads_enabled: threads,
          board,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error);
        return;
      }

      onComplete({
        make_webhook_url: webhookUrl,
        pinterest_enabled: pinterest,
        threads_enabled: threads,
        board,
      });
    } catch {
      setError(t.common.failedToSave);
    } finally {
      setIsLoading(false);
    }
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
          <div className="flex items-center justify-between">
            <Label htmlFor="threads-toggle">{t.steps.social.threads}</Label>
            <Switch id="threads-toggle" checked={threads} onCheckedChange={setThreads} />
          </div>
        </div>

        {(pinterest || threads) && (
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
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              type="button"
              onClick={downloadBlueprint}
            >
              {t.steps.social.downloadTemplate}
            </Button>
            <p className="text-muted-foreground mt-1 whitespace-pre-line text-xs">
              {t.steps.social.downloadHint}
            </p>
          </div>
        )}
      </div>
    </StepLayout>
  );
}
