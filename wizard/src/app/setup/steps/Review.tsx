'use client';

import { useState, useEffect } from 'react';
import { StepLayout } from '@/components/StepLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';
import { normalizeDomain } from '@/lib/normalize-domain';
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
  telegram?: { bot_token?: string; chat_id?: string };
  social?: {
    make_webhook_url?: string;
    buffer_api_key?: string;
    inro_api_key?: string;
    pinterest_enabled: boolean;
    threads_enabled: boolean;
    instagram_enabled?: boolean;
    linkedin_enabled?: boolean;
  };
  saas_mode?: boolean;
  default_domain?: string | null;
  instance_mode?: string;
}

interface PreflightCheck {
  name: string;
  status: 'pass' | 'fail' | 'skip' | 'checking';
  detail: string;
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
  const [checks, setChecks] = useState<PreflightCheck[]>([]);
  const t = useTranslations();

  useEffect(() => {
    const token = localStorage.getItem('setup_token');
    const headers = { Authorization: `Bearer ${token}` };

    async function loadConfig() {
      try {
        const res = await fetch('/api/setup/status', { headers });
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

    async function runPreflight() {
      setChecks([
        { name: 'services', status: 'checking', detail: '' },
        { name: 'llm', status: 'checking', detail: '' },
        { name: 'telegram', status: 'checking', detail: '' },
        { name: 'webhook', status: 'checking', detail: '' },
        { name: 'dns', status: 'checking', detail: '' },
      ]);
      try {
        const res = await fetch('/api/setup/preflight', { method: 'POST', headers });
        const data = await res.json();
        if (data.success && data.data?.checks) {
          setChecks(data.data.checks);
        }
      } catch {
        // Preflight failure is non-blocking
      }
    }

    loadConfig();
    runPreflight();
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
      {(() => {
        const visibleChecks = checks.filter((c) => c.status !== 'skip');
        if (visibleChecks.length === 0) return null;
        return (
          <div className="mb-4 rounded-lg border p-4">
            <p className="mb-2 text-sm font-medium">{t.steps.review.preflight}</p>
            <div className="space-y-1.5">
              {visibleChecks.map((check) => {
                const labelMap: Record<string, string> = {
                  services: t.steps.review.preflightServices,
                  llm: t.steps.review.preflightLlm,
                  telegram: t.steps.review.preflightTelegram,
                  webhook: t.steps.review.preflightWebhook,
                  dns: t.steps.review.preflightDns,
                };
                const label = labelMap[check.name] ?? check.name;
                return (
                  <div key={check.name} className="flex items-center gap-2">
                    <div
                      className={cn(
                        'h-2 w-2 rounded-full',
                        check.status === 'pass' && 'bg-green-500',
                        check.status === 'fail' && 'bg-red-500',
                        check.status === 'checking' && 'animate-pulse bg-yellow-500',
                      )}
                    />
                    <span className="text-sm">{label}</span>
                    {check.detail && (
                      <span className="text-muted-foreground text-xs">{check.detail}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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
              {config?.domain?.use_domain && config.domain.domain
                ? (() => {
                    const r = normalizeDomain(config.domain.domain);
                    return r.ok ? r.value : config.domain.domain;
                  })()
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
            <p className="text-sm font-medium">{t.steps.review.telegram}</p>
            {config?.telegram?.bot_token ? (
              <p className="text-muted-foreground text-sm">
                {config.telegram.bot_token}
                {' · '}
                {config.telegram.chat_id || t.steps.review.telegramAutoDetect}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">{t.steps.review.notConfigured}</p>
            )}
          </div>
          <span className="text-muted-foreground ml-4 text-sm">{t.steps.review.edit}</span>
        </div>

        <div
          className="hover:bg-muted/50 flex cursor-pointer items-center justify-between px-4 py-3 transition-colors"
          onClick={() => onGoToStep?.(isManaged ? 4 : 5)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onGoToStep?.(isManaged ? 4 : 5)}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">{t.steps.review.social}</p>
            {config?.social ? (
              <p className="text-muted-foreground text-sm">
                {config.social.buffer_api_key
                  ? t.steps.review.buffer
                  : config.social.make_webhook_url
                    ? t.steps.review.webhook
                    : t.steps.review.noWebhook}
                {config.social.pinterest_enabled ? ' · Pinterest' : ''}
                {config.social.instagram_enabled ? ' · Instagram' : ''}
                {config.social.threads_enabled ? ' · Threads' : ''}
                {config.social.linkedin_enabled ? ' · LinkedIn' : ''}
                {config.social.inro_api_key ? ` · ${t.steps.review.inroDm}` : ''}
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
