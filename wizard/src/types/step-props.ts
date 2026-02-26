export interface StepProps {
  onComplete: (savedData?: Record<string, unknown>) => void;
  onBack?: () => void;
  onGoToStep?: (stepIndex: number) => void;
  initialData?: Record<string, unknown>;
}
