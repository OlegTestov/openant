'use client';

import { Check } from 'lucide-react';
import type { StepDefinition } from '@/lib/steps';
import { cn } from '@/lib/utils';

interface StepperProps {
  steps: StepDefinition[];
  currentStep: number;
  completedSteps: Set<string>;
}

export function Stepper({ steps, currentStep, completedSteps }: StepperProps) {
  return (
    <nav aria-label="Setup progress">
      <ol className="flex items-center justify-between">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className="flex items-center"
            aria-current={index === currentStep ? 'step' : undefined}
          >
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
                index === currentStep && 'bg-primary text-primary-foreground',
                completedSteps.has(step.id) &&
                  index !== currentStep &&
                  'bg-green-100 text-green-700',
                index !== currentStep &&
                  !completedSteps.has(step.id) &&
                  'bg-muted text-muted-foreground',
              )}
            >
              {completedSteps.has(step.id) && index !== currentStep ? (
                <Check className="h-4 w-4" />
              ) : (
                index + 1
              )}
            </div>
            <span className="ml-2 hidden text-sm md:inline">{step.label}</span>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'mx-2 h-0.5 w-8',
                  completedSteps.has(step.id) ? 'bg-green-300' : 'bg-muted',
                )}
              />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
