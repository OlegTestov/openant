'use client';

import { useState, useCallback, useEffect } from 'react';
import { Check, Loader2, X, Circle } from 'lucide-react';
import { StepLayout } from '@/components/StepLayout';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranslations } from '@/lib/i18n';
import type { StepProps } from '@/types/step-props';

interface DeployStep {
  step: number;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'error';
}

interface CredentialInfo {
  email: string;
  password: string;
  adminUrl?: string;
}

interface DeployCredentials {
  ghost: CredentialInfo;
  nocodb: CredentialInfo;
  n8n?: CredentialInfo;
}

const DEPLOY_STEP_LABELS = [
  'Saving configuration to .env',
  'Generating Caddyfile',
  'Checking services',
  'Reloading Caddy',
  'Creating Ghost admin account',
  'Uploading custom theme',
  'Configuring Ghost settings',
  'Creating NocoDB table',
  'Setting up n8n',
  'Creating n8n credentials',
  'Importing n8n workflows',
  'Finalizing setup',
];

function parseSSEEvents(buffer: string, onEvent: (event: string, data: unknown) => void): string {
  const blocks = buffer.split('\n\n');
  const remaining = blocks.pop() || '';

  for (const block of blocks) {
    const eventMatch = block.match(/^event: (.+)$/m);
    const dataMatch = block.match(/^data: (.+)$/m);
    if (eventMatch && dataMatch) {
      onEvent(eventMatch[1], JSON.parse(dataMatch[1]));
    }
  }

  return remaining;
}

function ServiceAccessRow({
  label,
  description,
  url,
  credential,
}: {
  label: string;
  description: string;
  url: string;
  credential: CredentialInfo;
}) {
  return (
    <div className="border-b last:border-b-0 py-2">
      <div className="flex items-center justify-between mb-1">
        <div>
          <span className="font-medium text-sm">{label}</span>
          <span className="text-muted-foreground text-xs ml-2">{description}</span>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary text-sm underline"
        >
          Open &rarr;
        </a>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
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

export default function Deploy({ onComplete }: StepProps) {
  const [isDeploying, setIsDeploying] = useState(false);
  const [steps, setSteps] = useState<DeployStep[]>([]);
  const [error, setError] = useState<{ step: number; message: string } | null>(null);
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const [credentials, setCredentials] = useState<DeployCredentials | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const t = useTranslations();

  const startDeploy = useCallback(
    (startFrom = 1) => {
      setIsDeploying(true);
      setError(null);

      const initialSteps: DeployStep[] = DEPLOY_STEP_LABELS.map((label, i) => ({
        step: i + 1,
        label,
        status: i + 1 < startFrom ? 'completed' : 'pending',
      }));
      setSteps(initialSteps);

      const token =
        localStorage.getItem('setup_token') ||
        new URLSearchParams(window.location.search).get('token');

      if (!token) {
        setError({ step: 0, message: t.steps.deploy.tokenNotFound });
        setIsDeploying(false);
        return;
      }

      function handleSSEEvent(event: string, data: unknown) {
        const d = data as Record<string, unknown>;

        switch (event) {
          case 'step':
            setSteps((prev) =>
              prev.map((s) =>
                s.step === (d.step as number)
                  ? { ...s, status: d.status as DeployStep['status'] }
                  : s,
              ),
            );
            break;

          case 'error':
            setError({ step: d.step as number, message: d.error as string });
            setSteps((prev) =>
              prev.map((s) => (s.step === (d.step as number) ? { ...s, status: 'error' } : s)),
            );
            setIsDeploying(false);
            break;

          case 'complete':
            setUrls((d as { urls: Record<string, string> }).urls);
            setCredentials((d as { credentials: DeployCredentials }).credentials ?? null);
            setIsCompleted(true);
            setIsDeploying(false);
            break;
        }
      }

      fetch(`/api/setup/apply?startFrom=${startFrom}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (response) => {
          if (!response.ok) {
            setError({ step: 0, message: `${response.status} ${response.statusText}` });
            setIsDeploying(false);
            return;
          }

          const reader = response.body?.getReader();
          if (!reader) return;

          const decoder = new TextDecoder();
          let buffer = '';

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            buffer = parseSSEEvents(buffer, handleSSEEvent);
          }
        })
        .catch((err) => {
          setError({ step: 0, message: err.message });
          setIsDeploying(false);
        });
    },
    [t],
  );

  useEffect(() => {
    startDeploy();
  }, [startDeploy]);

  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const totalSteps = DEPLOY_STEP_LABELS.length;
  const showProgress = isDeploying || isCompleted || error;

  return (
    <StepLayout title={t.steps.deploy.title} showBack={false} showNext={false}>
      {showProgress && (
        <div className="space-y-4">
          <Progress value={(completedCount / totalSteps) * 100} />

          <div className="space-y-2">
            {steps.map((step) => (
              <div key={step.step} className="flex items-center gap-2 text-sm">
                {step.status === 'completed' && <Check className="h-4 w-4 text-green-600" />}
                {step.status === 'running' && <Loader2 className="h-4 w-4 animate-spin" />}
                {step.status === 'error' && <X className="h-4 w-4 text-red-600" />}
                {step.status === 'pending' && <Circle className="h-4 w-4 text-muted-foreground" />}
                <span className={step.status === 'pending' ? 'text-muted-foreground' : ''}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>
            <p>
              {t.steps.deploy.errorAt
                .replace('{step}', String(error.step))
                .replace('{message}', error.message)}
            </p>
            <Button variant="outline" className="mt-2" onClick={() => startDeploy(error.step)}>
              {t.steps.deploy.retry}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isCompleted && urls && (
        <div className="border-t pt-4 space-y-4">
          <p className="text-lg font-bold text-green-600">{t.steps.deploy.complete}</p>

          {credentials && (
            <div className="rounded-md border p-3">
              <p className="font-medium text-sm mb-2">{t.steps.deploy.serviceAccess}</p>
              <ServiceAccessRow
                label={t.services.ghost}
                description={t.services.ghostDesc}
                url={credentials.ghost.adminUrl || `${urls.blog}/ghost/`}
                credential={credentials.ghost}
              />
              <ServiceAccessRow
                label={t.services.nocodb}
                description={t.services.nocodbDesc}
                url={urls.table}
                credential={credentials.nocodb}
              />
              {credentials.n8n && (
                <ServiceAccessRow
                  label={t.services.n8n}
                  description={t.services.n8nDesc}
                  url={urls.n8n}
                  credential={credentials.n8n}
                />
              )}
            </div>
          )}

          <Button className="mt-3" onClick={() => onComplete()}>
            {t.steps.deploy.goToDashboard}
          </Button>
        </div>
      )}
    </StepLayout>
  );
}
