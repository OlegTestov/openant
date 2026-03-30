'use client';

import { useState } from 'react';
import { StepLayout } from '@/components/StepLayout';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranslations } from '@/lib/i18n';
import type { StepProps } from '@/types/step-props';

export default function Welcome({ onComplete, initialData }: StepProps) {
  const initial = initialData as { language?: string } | undefined;
  const [language, setLanguage] = useState(initial?.language ?? 'en');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations();

  async function handleSubmit() {
    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('setup_token');
      const res = await fetch('/api/setup/welcome', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ language }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error);
        return;
      }

      localStorage.setItem('language', language);
      onComplete({ language });
    } catch {
      setError(t.common.failedToSave);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <StepLayout
      title={t.steps.welcome.title}
      onNext={handleSubmit}
      showBack={false}
      nextLabel={t.steps.welcome.getStarted}
      isLoading={isLoading}
    >
      <div className="space-y-6 text-center">
        <h1 className="text-4xl font-bold">openant</h1>
        <p className="text-muted-foreground">{t.steps.welcome.description}</p>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Select
          value={language}
          onValueChange={(value) => {
            setLanguage(value);
            localStorage.setItem('language', value);
            document.documentElement.lang = value;
          }}
        >
          <SelectTrigger className="mx-auto w-48" aria-label={t.steps.welcome.selectLanguage}>
            <SelectValue placeholder={t.steps.welcome.selectLanguage} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="ru">Русский</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </StepLayout>
  );
}
