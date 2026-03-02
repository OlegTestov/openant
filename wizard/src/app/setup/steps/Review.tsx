'use client';

import { useState, useEffect } from 'react';
import { StepLayout } from '@/components/StepLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranslations } from '@/lib/i18n';
import type { StepProps } from '@/types/step-props';

interface ReviewConfig {
  domain?: { use_domain: boolean; domain?: string };
  llm?: { provider: string; api_url: string; api_key: string; model: string; image_model?: string };
  blog?: {
    title: string;
    description?: string;
    language: string;
    tone: string;
    publish_interval_minutes: number;
  };
  social?: { make_webhook_url?: string; pinterest_enabled: boolean; threads_enabled: boolean };
  saas_mode?: boolean;
  default_domain?: string | null;
  instance_mode?: string;
}

function formatInterval(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours}h`;
  }
  return `${minutes}m`;
}

export default function Review({ onComplete, onBack, onGoToStep }: StepProps) {
  const [config, setConfig] = useState<ReviewConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations();

  useEffect(() => {
    async function loadConfig() {
      try {
        const token = localStorage.getItem('setup_token');
        const res = await fetch('/api/setup/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (data.success) {
          setConfig(data.data);
        } else {
          setError(t.common.failedToSave);
        }
      } catch {
        setError(t.common.failedToSave);
      } finally {
        setIsLoading(false);
      }
    }
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isManaged = config?.instance_mode === 'managed';

  if (isLoading) {
    return (
      <StepLayout title={t.steps.review.title} onBack={onBack}>
        <p className="text-muted-foreground">{t.common.loading}</p>
      </StepLayout>
    );
  }

  return (
    <StepLayout
      title={t.steps.review.title}
      description={t.steps.review.description}
      onNext={onComplete}
      onBack={onBack}
      nextLabel={t.steps.review.applyConfiguration}
    >
      <div className="divide-border divide-y rounded-lg border">
        {error && (
          <div className="p-3">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        <div
          className="hover:bg-muted/50 flex cursor-pointer items-center justify-between px-4 py-3 transition-colors"
          onClick={() => onGoToStep?.(1)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onGoToStep?.(1)}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">{t.steps.review.domain}</p>
            <p className="text-muted-foreground text-sm">
              {config?.domain?.use_domain
                ? config.domain.domain
                : config?.saas_mode && config?.default_domain
                  ? config.default_domain
                  : t.steps.review.ipMode}
            </p>
          </div>
          <span className="text-muted-foreground ml-4 text-sm">{t.steps.review.edit}</span>
        </div>

        {!isManaged && (
          <div
            className="hover:bg-muted/50 flex cursor-pointer items-center justify-between px-4 py-3 transition-colors"
            onClick={() => onGoToStep?.(2)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onGoToStep?.(2)}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{t.steps.review.llm}</p>
              {config?.llm ? (
                <p className="text-muted-foreground text-sm">
                  {config.llm.provider} / {config.llm.model}
                  {config.llm.image_model ? ` / ${config.llm.image_model}` : ''}
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">{t.steps.review.notConfigured}</p>
              )}
            </div>
            <span className="text-muted-foreground ml-4 text-sm">{t.steps.review.edit}</span>
          </div>
        )}

        <div
          className="hover:bg-muted/50 flex cursor-pointer items-center justify-between px-4 py-3 transition-colors"
          onClick={() => onGoToStep?.(isManaged ? 2 : 3)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onGoToStep?.(isManaged ? 2 : 3)}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">{t.steps.review.blog}</p>
            {config?.blog ? (
              <p className="text-muted-foreground truncate text-sm">
                {config.blog.title} &middot; {config.blog.language} / {config.blog.tone} /{' '}
                {formatInterval(config.blog.publish_interval_minutes)}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">{t.steps.review.notConfigured}</p>
            )}
          </div>
          <span className="text-muted-foreground ml-4 text-sm">{t.steps.review.edit}</span>
        </div>

        <div
          className="hover:bg-muted/50 flex cursor-pointer items-center justify-between px-4 py-3 transition-colors"
          onClick={() => onGoToStep?.(isManaged ? 3 : 4)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onGoToStep?.(isManaged ? 3 : 4)}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">{t.steps.review.social}</p>
            {config?.social ? (
              <p className="text-muted-foreground text-sm">
                {config.social.make_webhook_url ? t.steps.review.webhook : t.steps.review.noWebhook}
                {config.social.pinterest_enabled ? ' · Pinterest' : ''}
                {config.social.threads_enabled ? ' · Threads' : ''}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">{t.steps.review.notConfigured}</p>
            )}
          </div>
          <span className="text-muted-foreground ml-4 text-sm">{t.steps.review.edit}</span>
        </div>
      </div>
    </StepLayout>
  );
}
