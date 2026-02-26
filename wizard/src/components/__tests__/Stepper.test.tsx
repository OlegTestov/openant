import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Stepper } from '../Stepper';
import { STEPS } from '@/lib/steps';

describe('Stepper', () => {
  it('renders all step labels', () => {
    render(<Stepper steps={STEPS} currentStep={0} completedSteps={new Set()} />);

    for (const step of STEPS) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    }
  });

  it('highlights current step with primary color', () => {
    render(<Stepper steps={STEPS} currentStep={2} completedSteps={new Set()} />);

    const circles = screen.getAllByText(/^[1-7]$/);
    const currentCircle = circles[2];
    expect(currentCircle.closest('div')).toHaveClass('bg-primary');
  });

  it('shows checkmark for completed steps', () => {
    render(
      <Stepper steps={STEPS} currentStep={2} completedSteps={new Set(['welcome', 'domain'])} />,
    );

    const svgs = document.querySelectorAll('svg.lucide-check');
    expect(svgs).toHaveLength(2);
  });

  it('shows step number for incomplete steps', () => {
    render(<Stepper steps={STEPS} currentStep={0} completedSteps={new Set()} />);

    for (let i = 0; i < STEPS.length; i++) {
      expect(screen.getByText(String(i + 1))).toBeInTheDocument();
    }
  });

  it('renders connector lines between steps', () => {
    const { container } = render(
      <Stepper steps={STEPS} currentStep={0} completedSteps={new Set()} />,
    );

    const connectors = container.querySelectorAll('.h-0\\.5');
    expect(connectors).toHaveLength(STEPS.length - 1);
  });
});
