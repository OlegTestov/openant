import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { StepLayout } from '../StepLayout';

describe('StepLayout', () => {
  it('renders title and description', () => {
    render(
      <StepLayout title="Test Title" description="Test description">
        <div />
      </StepLayout>,
    );

    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(
      <StepLayout title="Title">
        <p>Child content</p>
      </StepLayout>,
    );

    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('renders Next and Back buttons', () => {
    render(
      <StepLayout title="Title" onNext={() => {}} onBack={() => {}}>
        <div />
      </StepLayout>,
    );

    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('hides Back button when showBack is false', () => {
    render(
      <StepLayout title="Title" onNext={() => {}} onBack={() => {}} showBack={false}>
        <div />
      </StepLayout>,
    );

    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('disables Next when nextDisabled is true', () => {
    render(
      <StepLayout title="Title" onNext={() => {}} nextDisabled>
        <div />
      </StepLayout>,
    );

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('shows spinner when isLoading is true', () => {
    render(
      <StepLayout title="Title" onNext={() => {}} isLoading>
        <div />
      </StepLayout>,
    );

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });

  it('calls onNext when Next button is clicked', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();

    render(
      <StepLayout title="Title" onNext={onNext}>
        <div />
      </StepLayout>,
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('calls onBack when Back button is clicked', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    render(
      <StepLayout title="Title" onBack={onBack}>
        <div />
      </StepLayout>,
    );

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('uses custom nextLabel when provided', () => {
    render(
      <StepLayout title="Title" onNext={() => {}} nextLabel="Deploy">
        <div />
      </StepLayout>,
    );

    expect(screen.getByRole('button', { name: 'Deploy' })).toBeInTheDocument();
  });
});
