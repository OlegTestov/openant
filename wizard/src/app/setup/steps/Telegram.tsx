'use client';

import { useState } from 'react';
import { StepLayout } from '@/components/StepLayout';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { useTranslations } from '@/lib/i18n';
import type { StepProps } from '@/types/step-props';

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
  const t = useTranslations();

  async function handleSubmit() {
    setError(null);
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
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {t.steps.telegram.botTokenStep1}
              </a>
            </li>
            <li>{t.steps.telegram.botTokenStep2}</li>
            <li>{t.steps.telegram.botTokenStep3}</li>
          </ol>
        </div>

        <div>
          <Label htmlFor="bot-token">{t.steps.telegram.botToken}</Label>
          <Input
            id="bot-token"
            className="mt-1"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder={t.steps.telegram.botTokenPlaceholder}
          />
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
