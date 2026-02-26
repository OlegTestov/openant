'use client';

import { useState } from 'react';
import { StepLayout } from '@/components/StepLayout';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useTranslations } from '@/lib/i18n';
import type { StepProps } from '@/types/step-props';

interface DnsCheck {
  resolved: boolean;
  ip?: string;
  matches_server: boolean;
}

export default function Domain({ onComplete, onBack, initialData }: StepProps) {
  const initial = initialData as { use_domain?: boolean; domain?: string } | undefined;
  const [useDomain, setUseDomain] = useState(initial?.use_domain ?? false);
  const [domain, setDomain] = useState(initial?.domain ?? '');
  const [serverIp, setServerIp] = useState<string | null>(null);
  const [dnsResult, setDnsResult] = useState<DnsCheck | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations();

  async function handleSubmit() {
    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('setup_token');
      const res = await fetch('/api/setup/domain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ use_domain: useDomain, domain: useDomain ? domain : undefined }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error);
        return;
      }

      if (data.data?.server_ip) {
        setServerIp(data.data.server_ip);
      }

      if (data.data?.dns_check) {
        setDnsResult(data.data.dns_check);
      }

      onComplete({ use_domain: useDomain, domain });
    } catch {
      setError(t.common.failedToSave);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <StepLayout
      title={t.steps.domain.title}
      description={t.steps.domain.description}
      onNext={handleSubmit}
      onBack={onBack}
      isLoading={isLoading}
    >
      <div className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="flex items-center gap-2">
          <Switch id="use-domain" checked={useDomain} onCheckedChange={setUseDomain} />
          <Label htmlFor="use-domain">{t.steps.domain.hasDomain}</Label>
        </div>

        {useDomain && (
          <>
            <Input
              id="domain"
              placeholder={t.steps.domain.enterDomain}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              aria-label={t.steps.domain.title}
            />
            <Alert>
              <AlertDescription>
                <p>
                  {t.steps.domain.pointDns}{' '}
                  <code className="font-mono">{serverIp || '<SERVER_IP>'}</code>
                </p>
                <p className="mt-1">{t.steps.domain.subdomains}</p>
              </AlertDescription>
            </Alert>

            {dnsResult && (
              <div>
                {dnsResult.matches_server ? (
                  <Badge>{t.steps.domain.dnsOk}</Badge>
                ) : dnsResult.resolved ? (
                  <Badge variant="destructive">
                    {t.steps.domain.dnsWrong
                      .replace('{ip}', dnsResult.ip || '')
                      .replace('{serverIp}', serverIp || '')}
                  </Badge>
                ) : (
                  <Badge variant="destructive">{t.steps.domain.dnsNoResolve}</Badge>
                )}
              </div>
            )}
          </>
        )}

        {!useDomain && (
          <Alert>
            <AlertDescription>
              <p>{t.steps.domain.ipMode.replace('{ip}', serverIp || '<SERVER_IP>')}</p>
              <p className="mt-1">{t.steps.domain.noHttps}</p>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </StepLayout>
  );
}
