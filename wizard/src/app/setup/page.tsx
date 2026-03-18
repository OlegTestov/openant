'use client';

import { useState, useEffect } from 'react';
import { STEPS } from '@/lib/steps';
import { Stepper } from '@/components/Stepper';

import Welcome from './steps/Welcome';
import Domain from './steps/Domain';
import LLM from './steps/LLM';
import Blog from './steps/Blog';
import Telegram from './steps/Telegram';
import Social from './steps/Social';
import Review from './steps/Review';
import Deploy from './steps/Deploy';

const STEP_COMPONENTS = [Welcome, Domain, LLM, Blog, Telegram, Social, Review, Deploy];

export default function SetupPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [savedConfig, setSavedConfig] = useState<Record<string, Record<string, unknown>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [saasMode, setSaasMode] = useState(false);
  const [instanceMode, setInstanceMode] = useState<string>('byok');

  // Filter out LLM step for managed mode (LLM key is pre-configured)
  const isManaged = instanceMode === 'managed';
  const filteredSteps = isManaged ? STEPS.filter((s) => s.id !== 'llm') : STEPS;
  const filteredComponents = isManaged
    ? STEP_COMPONENTS.filter((_, i) => STEPS[i].id !== 'llm')
    : STEP_COMPONENTS;

  useEffect(() => {
    async function fetchInstanceMode() {
      try {
        const res = await fetch('/api/setup/mode');
        const data = await res.json();
        if (data.success) {
          setInstanceMode(data.data.instance_mode || 'byok');
        }
      } catch {
        // If mode fetch fails — default to byok (safe fallback)
      }
    }

    async function restorePosition() {
      try {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token') || localStorage.getItem('setup_token');
        if (token) localStorage.setItem('setup_token', token);

        // Handle reconfigure: reset state before restoring position
        if (params.get('reconfigure') === 'true') {
          await fetch('/api/dashboard/reconfigure', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
          window.history.replaceState({}, '', `/setup${token ? `?token=${token}` : ''}`);
        }

        const res = await fetch('/api/setup/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (data.success) {
          const isSaas = data.data.saas_mode ?? false;
          setSaasMode(isSaas);
          setInstanceMode(data.data.instance_mode || 'byok');

          const completed = new Set<string>();
          for (const [id, info] of Object.entries(data.data.steps)) {
            if ((info as { completed: boolean }).completed) completed.add(id);
          }
          setCompletedSteps(completed);

          setSavedConfig({
            ...(data.data.welcome && { welcome: data.data.welcome }),
            ...(data.data.domain && { domain: data.data.domain }),
            ...(data.data.llm && { llm: data.data.llm }),
            ...(data.data.blog && { blog: data.data.blog }),
            ...(data.data.telegram && { telegram: data.data.telegram }),
            ...(data.data.social && { social: data.data.social }),
          });

          // Resolve step index in filtered steps (managed mode may skip LLM)
          const mode = data.data.instance_mode || 'byok';
          const stepsForIndex = mode === 'managed' ? STEPS.filter((s) => s.id !== 'llm') : STEPS;
          const stepIndex = stepsForIndex.findIndex((s) => s.id === data.data.currentStep);
          if (stepIndex > 1) setCurrentStep(stepIndex);
        } else {
          // Auth failed — still fetch instance mode for correct step filtering
          await fetchInstanceMode();
        }
      } catch {
        await fetchInstanceMode();
      } finally {
        setIsLoading(false);
      }
    }
    restorePosition();
  }, []);

  function handleNext() {
    if (currentStep < filteredSteps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }

  function handleStepComplete(stepId: string, data?: Record<string, unknown>) {
    setCompletedSteps((prev) => new Set([...prev, stepId]));
    if (data) {
      setSavedConfig((prev) => ({ ...prev, [stepId]: data }));
    }

    // Last step (apply configuration) completed → redirect to dashboard
    if (currentStep >= filteredSteps.length - 1) {
      if (saasMode) {
        const saasUrl = process.env.NEXT_PUBLIC_OPENANT_SAAS_URL || 'https://openant.app';
        window.location.href = `${saasUrl}/dashboard?setup_complete=true`;
      } else {
        window.location.href = '/dashboard';
      }
      return;
    }

    handleNext();
  }

  function handleGoToStep(stepIndex: number) {
    setCurrentStep(stepIndex);
  }

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const StepComponent = filteredComponents[currentStep];

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Stepper steps={filteredSteps} currentStep={currentStep} completedSteps={completedSteps} />

        <div className="mt-8">
          <StepComponent
            onComplete={(data?: Record<string, unknown>) =>
              handleStepComplete(filteredSteps[currentStep].id, data)
            }
            onBack={currentStep > 0 ? handleBack : undefined}
            onGoToStep={handleGoToStep}
            initialData={savedConfig[filteredSteps[currentStep].id]}
          />
        </div>
      </div>
    </div>
  );
}
