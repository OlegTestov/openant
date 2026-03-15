'use client';

import { useState } from 'react';
import { StepLayout } from '@/components/StepLayout';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { useTranslations } from '@/lib/i18n';
import type { TelegramTestResult } from '@/lib/test-connections';
import type { StepProps } from '@/types/step-props';

const TELEGRAM_TOKEN_REGEX = /^\d+:[A-Za-z0-9_-]+$/;

export default function Telegram({ onComplete, onBack, initialData }: StepProps) {
  const initial = initialData as
    | {
        bot_token?: string;
        chat_id?: string;
      }
    | undefined;
  const [botToken, setBotToken] = useState(initial?.bot_token ?? '');
  const [chatId, setChatId] = useState(initial?.chat_id ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TelegramTestResult | null>(null);
  const t = useTranslations();

  function handleTokenChange(value: string) {
    setBotToken(value);
    setTestResult(null);
    if (value && !TELEGRAM_TOKEN_REGEX.test(value)) {
      setTokenError(t.steps.telegram.tokenFormatError);
    } else {
      setTokenError(null);
    }
  }

  async function handleSubmit() {
    setError(null);
    setTestResult(null);

    if (tokenError) return;

    setIsLoading(true);

    try {
      const token = localStorage.getItem('setup_token');
      const res = await fetch('/api/setup/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bot_token: botToken,
          chat_id: chatId,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error);
        return;
      }

      if (data.data?.test_result) {
        const result = data.data.test_result as TelegramTestResult;
        setTestResult(result);
        if (!result.connected) {
          setError(result.error ?? 'Connection failed');
          return;
        }
      }

      onComplete({
        bot_token: botToken,
        chat_id: chatId,
      });
    } catch {
      setError(t.common.failedToSave);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <StepLayout
      title={t.steps.telegram.title}
      description={t.steps.telegram.description}
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
            <p className="font-medium">{t.steps.telegram.optional}</p>
            <p className="text-sm">{t.steps.telegram.optionalHint}</p>
          </AlertDescription>
        </Alert>

        <div className="space-y-1">
          <p className="text-sm font-medium">{t.steps.telegram.botTokenInstructions}</p>
          <ol className="text-muted-foreground list-inside list-decimal text-sm">
            <li>
              {t.steps.telegram.botTokenStep1Prefix}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                @BotFather
              </a>
              {t.steps.telegram.botTokenStep1Suffix}
            </li>
            <li>
              {t.steps.telegram.botTokenStep2Prefix}
              <code className="bg-muted rounded px-1">/newbot</code>
              {t.steps.telegram.botTokenStep2Suffix}
            </li>
            <li>{t.steps.telegram.botTokenStep3}</li>
          </ol>
        </div>

        {testResult?.connected && (
          <Alert>
            <AlertDescription>
              {t.steps.telegram.connected} {testResult.bot_name}
            </AlertDescription>
          </Alert>
        )}

        <div>
          <Label htmlFor="bot-token">{t.steps.telegram.botToken}</Label>
          <Input
            id="bot-token"
            className="mt-1"
            value={botToken}
            onChange={(e) => handleTokenChange(e.target.value)}
            placeholder={t.steps.telegram.botTokenPlaceholder}
          />
          {tokenError && <p className="text-destructive mt-1 text-xs">{tokenError}</p>}
        </div>

        <div>
          <Label htmlFor="chat-id">{t.steps.telegram.chatId}</Label>
          <Input
            id="chat-id"
            className="mt-1"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder={t.steps.telegram.chatIdPlaceholder}
            aria-describedby="chat-id-hint"
          />
          <p id="chat-id-hint" className="text-muted-foreground mt-1 text-xs">
            {t.steps.telegram.chatIdHint}
          </p>
        </div>
      </div>
    </StepLayout>
  );
}
