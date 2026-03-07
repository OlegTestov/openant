'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ServiceStatus } from '@/components/ServiceStatus';
import { downloadBlueprint } from '@/lib/download';
import { useTranslations } from '@/lib/i18n';

interface CredentialInfo {
  email: string;
  password: string;
  adminUrl?: string;
}

interface DashboardData {
  services: Record<string, 'healthy' | 'unhealthy'>;
  stats: Record<string, number>;
  urls: Record<string, string>;
  credentials: {
    ghost: CredentialInfo;
    nocodb: CredentialInfo;
    n8n?: CredentialInfo;
  } | null;
  saas_mode: boolean;
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold text-${color}-600`}>{value}</div>
      <div className="text-muted-foreground text-sm">{label}</div>
    </div>
  );
}

function CredentialRow({
  label,
  description,
  links,
  credential,
}: {
  label: string;
  description: string;
  links: Array<{ href: string; label: string }>;
  credential: CredentialInfo;
}) {
  return (
    <div className="border-b last:border-b-0 py-3">
      <div className="flex items-start justify-between mb-1">
        <div>
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground text-sm ml-2">{description}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary text-sm underline"
            >
              {link.label} &rarr;
            </a>
          ))}
        </div>
      </div>
      <div className="text-sm text-muted-foreground space-y-0.5">
        <div>
          Email: <code className="bg-muted px-1 rounded">{credential.email}</code>
        </div>
        <div>
          Password: <code className="bg-muted px-1 rounded">{credential.password}</code>
        </div>
      </div>
    </div>
  );
}

async function fetchDashboardData(): Promise<DashboardData> {
  const token =
    new URLSearchParams(window.location.search).get('token') || localStorage.getItem('setup_token');
  if (token) localStorage.setItem('setup_token', token);
  const headers = { Authorization: `Bearer ${token}` };

  const [statusRes, statsRes] = await Promise.all([
    fetch('/api/dashboard/status', { headers }),
    fetch('/api/dashboard/stats', { headers }),
  ]);

  const status = await statusRes.json();
  const stats = await statsRes.json();

  return {
    services: {
      ghost: status.data?.ghost ?? 'unhealthy',
      nocodb: status.data?.nocodb ?? 'unhealthy',
      n8n: status.data?.n8n ?? 'unhealthy',
      caddy: status.data?.caddy ?? 'unhealthy',
    },
    stats: stats.data ?? {},
    urls: status.data?.urls ?? {},
    credentials: status.data?.credentials ?? null,
    saas_mode: status.data?.saas_mode ?? false,
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const mountedRef = useRef(true);
  const t = useTranslations();

  useEffect(() => {
    mountedRef.current = true;

    async function load() {
      const result = await fetchDashboardData();
      if (mountedRef.current) setData(result);
    }

    load();
    const interval = setInterval(load, 30000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  async function handleReconfigure() {
    if (!confirm(t.dashboard.confirmReconfigure)) return;

    const token = localStorage.getItem('setup_token');
    await fetch('/api/dashboard/reconfigure', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    window.location.href = '/setup';
  }

  // In SaaS mode, redirect to the main openant.app dashboard
  useEffect(() => {
    if (data?.saas_mode) {
      const saasUrl = process.env.NEXT_PUBLIC_OPENANT_SAAS_URL || 'https://openant.app';
      window.location.href = `${saasUrl}/dashboard`;
    }
  }, [data?.saas_mode]);

  if (!data || data.saas_mode)
    return <div className="flex h-screen items-center justify-center">{t.common.loading}</div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t.dashboard.title}</h1>
        {data.saas_mode && <Badge variant="secondary">{t.dashboard.managedBySaas}</Badge>}
      </div>

      {/* Service Health */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t.dashboard.services}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <ServiceStatus
              name="Ghost"
              status={data.services.ghost === 'healthy' ? 'healthy' : 'unhealthy'}
            />
            <ServiceStatus
              name="NocoDB"
              status={data.services.nocodb === 'healthy' ? 'healthy' : 'unhealthy'}
            />
            <ServiceStatus
              name="n8n"
              status={data.services.n8n === 'healthy' ? 'healthy' : 'unhealthy'}
            />
            <ServiceStatus
              name="Caddy"
              status={data.services.caddy === 'healthy' ? 'healthy' : 'unhealthy'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Service Access */}
      {data.credentials && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t.dashboard.serviceAccess}</CardTitle>
          </CardHeader>
          <CardContent>
            <CredentialRow
              label={t.services.ghost}
              description={t.services.ghostDesc}
              links={[
                { href: data.urls.blog, label: t.dashboard.openBlog },
                {
                  href: data.credentials.ghost.adminUrl || `${data.urls.blog}/ghost/`,
                  label: t.dashboard.openAdmin,
                },
              ]}
              credential={data.credentials.ghost}
            />
            <CredentialRow
              label={t.services.nocodb}
              description={t.services.nocodbDesc}
              links={[{ href: data.urls.table, label: t.dashboard.openTable }]}
              credential={data.credentials.nocodb}
            />
            {data.credentials.n8n && (
              <CredentialRow
                label={t.services.n8n}
                description={t.services.n8nDesc}
                links={[{ href: data.urls.n8n, label: t.dashboard.openAutomation }]}
                credential={data.credentials.n8n}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Tools */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t.dashboard.tools}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="link" className="h-auto p-0 text-sm" onClick={downloadBlueprint}>
            {t.dashboard.downloadMakeTemplate} &rarr;
          </Button>
        </CardContent>
      </Card>

      {/* Article Statistics */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t.dashboard.articles}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label={t.dashboard.inQueue} value={data.stats.queue ?? 0} color="gray" />
            <StatCard
              label={t.dashboard.published}
              value={data.stats.published ?? 0}
              color="green"
            />
            <StatCard
              label={t.dashboard.completed}
              value={data.stats.completed ?? 0}
              color="blue"
            />
            <StatCard label={t.dashboard.errors} value={data.stats.error ?? 0} color="red" />
          </div>
        </CardContent>
      </Card>

      {/* Reconfigure */}
      <Button variant="outline" onClick={handleReconfigure}>
        {t.dashboard.reconfigure}
      </Button>
    </div>
  );
}
