'use client';

import { useState, useEffect } from 'react';
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

interface InitialDomainData {
  use_domain?: boolean;
  domain?: string;
  ghost_prefix?: string;
  nocodb_prefix?: string;
  n8n_prefix?: string;
  wizard_prefix?: string;
}

export default function Domain({ onComplete, onBack, initialData }: StepProps) {
  const initial = initialData as InitialDomainData | undefined;
  const [useDomain, setUseDomain] = useState(initial?.use_domain ?? false);
  const [domain, setDomain] = useState(initial?.domain ?? '');
  const [ghostPrefix, setGhostPrefix] = useState(initial?.ghost_prefix ?? 'blog');
  const [nocodbPrefix, setNocodbPrefix] = useState(initial?.nocodb_prefix ?? 'table');
  const [n8nPrefix, setN8nPrefix] = useState(initial?.n8n_prefix ?? 'auto');
  const [wizardPrefix, setWizardPrefix] = useState(initial?.wizard_prefix ?? 'setup');
  const [serverIp, setServerIp] = useState<string | null>(null);
  const [dnsResult, setDnsResult] = useState<DnsCheck | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saasMode, setSaasMode] = useState(false);
  const [defaultDomain, setDefaultDomain] = useState<string | null>(null);
  const t = useTranslations();

  useEffect(() => {
    async function loadStatus() {
      try {
        const token = localStorage.getItem('setup_token');
        const res = await fetch('/api/setup/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          setSaasMode(data.data.saas_mode ?? false);
          setDefaultDomain(data.data.default_domain ?? null);
          if (data.data.server_ip) setServerIp(data.data.server_ip);
        }
      } catch {
        // ignore
      }
    }
    loadStatus();
  }, []);

  function resolveServiceDomain(prefix: string): string {
    if (!domain) return '';
    return prefix ? `${prefix}.${domain}` : domain;
  }

  function getDnsRecords(): string[] {
    if (!domain) return [];
    const records = new Set<string>();
    records.add(resolveServiceDomain(ghostPrefix));
    records.add(resolveServiceDomain(nocodbPrefix));
    records.add(resolveServiceDomain(n8nPrefix));
    records.add(resolveServiceDomain(wizardPrefix));
    return Array.from(records);
  }

  async function handleSubmit() {
    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('setup_token');
      const payload: Record<string, unknown> = {
        use_domain: useDomain,
        domain: useDomain ? domain : undefined,
        ghost_prefix: useDomain ? ghostPrefix : undefined,
        nocodb_prefix: useDomain ? nocodbPrefix : undefined,
        n8n_prefix: useDomain ? n8nPrefix : undefined,
        wizard_prefix: useDomain ? wizardPrefix : undefined,
      };

      const res = await fetch('/api/setup/domain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
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

      onComplete({
        use_domain: useDomain,
        domain,
        ghost_prefix: ghostPrefix,
        nocodb_prefix: nocodbPrefix,
        n8n_prefix: n8nPrefix,
        wizard_prefix: wizardPrefix,
      });
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

        {/* SaaS mode: show current auto-domain when toggle is off */}
        {saasMode && !useDomain && defaultDomain && (
          <Alert>
            <AlertDescription>
              <p className="text-sm font-medium">{t.steps.domain.optional}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {t.steps.domain.optionalHint} <code className="font-mono">{defaultDomain}</code>
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Self-hosted: show IP mode when toggle is off */}
        {!saasMode && !useDomain && (
          <Alert>
            <AlertDescription>
              <p>{t.steps.domain.ipMode.replace('{ip}', serverIp || '<SERVER_IP>')}</p>
              <p className="mt-1">{t.steps.domain.noHttps}</p>
            </AlertDescription>
          </Alert>
        )}

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

            {domain && (
              <div className="space-y-3">
                <p className="text-sm font-medium">{t.steps.domain.serviceRouting}</p>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="w-28 shrink-0 text-sm">{t.steps.domain.ghostPrefix}</Label>
                    <Input
                      value={ghostPrefix}
                      onChange={(e) => setGhostPrefix(e.target.value)}
                      placeholder={t.steps.domain.rootDomainHint}
                      className="max-w-32"
                    />
                    <span className="text-muted-foreground text-sm">.{domain}</span>
                  </div>
                  <p className="text-muted-foreground ml-28 pl-2 text-xs">
                    → {resolveServiceDomain(ghostPrefix) || domain}
                  </p>

                  <div className="flex items-center gap-2">
                    <Label className="w-28 shrink-0 text-sm">{t.steps.domain.nocodbPrefix}</Label>
                    <Input
                      value={nocodbPrefix}
                      onChange={(e) => setNocodbPrefix(e.target.value)}
                      className="max-w-32"
                    />
                    <span className="text-muted-foreground text-sm">.{domain}</span>
                  </div>
                  <p className="text-muted-foreground ml-28 pl-2 text-xs">
                    → {resolveServiceDomain(nocodbPrefix)}
                  </p>

                  <div className="flex items-center gap-2">
                    <Label className="w-28 shrink-0 text-sm">{t.steps.domain.n8nPrefix}</Label>
                    <Input
                      value={n8nPrefix}
                      onChange={(e) => setN8nPrefix(e.target.value)}
                      className="max-w-32"
                    />
                    <span className="text-muted-foreground text-sm">.{domain}</span>
                  </div>
                  <p className="text-muted-foreground ml-28 pl-2 text-xs">
                    → {resolveServiceDomain(n8nPrefix)}
                  </p>

                  <div className="flex items-center gap-2">
                    <Label className="w-28 shrink-0 text-sm">{t.steps.domain.wizardPrefix}</Label>
                    <Input
                      value={wizardPrefix}
                      onChange={(e) => setWizardPrefix(e.target.value)}
                      className="max-w-32"
                    />
                    <span className="text-muted-foreground text-sm">.{domain}</span>
                  </div>
                  <p className="text-muted-foreground ml-28 pl-2 text-xs">
                    → {resolveServiceDomain(wizardPrefix)}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">{t.steps.domain.requiredRecords}</p>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="px-3 py-2 text-left font-medium">
                            {t.steps.domain.dnsType}
                          </th>
                          <th className="px-3 py-2 text-left font-medium">
                            {t.steps.domain.dnsName}
                          </th>
                          <th className="px-3 py-2 text-left font-medium">
                            {t.steps.domain.dnsValue}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {getDnsRecords().map((record) => (
                          <tr key={record} className="border-b last:border-b-0">
                            <td className="px-3 py-2 font-mono">A</td>
                            <td className="px-3 py-2 font-mono">{record}</td>
                            <td className="px-3 py-2 font-mono">{serverIp || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

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
      </div>
    </StepLayout>
  );
}
