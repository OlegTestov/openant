import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ServiceStatus } from '../ServiceStatus';

describe('ServiceStatus', () => {
  it('shows green dot for healthy status', () => {
    render(<ServiceStatus name="Ghost" status="healthy" />);

    expect(screen.getByTestId('status-dot')).toHaveClass('bg-green-500');
  });

  it('shows red dot for unhealthy status', () => {
    render(<ServiceStatus name="Ghost" status="unhealthy" />);

    expect(screen.getByTestId('status-dot')).toHaveClass('bg-red-500');
  });

  it('shows yellow pulsing dot for checking status', () => {
    render(<ServiceStatus name="Ghost" status="checking" />);

    const dot = screen.getByTestId('status-dot');
    expect(dot).toHaveClass('bg-yellow-500');
    expect(dot).toHaveClass('animate-pulse');
  });

  it('renders service name', () => {
    render(<ServiceStatus name="Ghost" status="healthy" />);

    expect(screen.getByText('Ghost')).toBeInTheDocument();
  });

  it('renders "Open" link when url is provided', () => {
    render(<ServiceStatus name="Ghost" status="healthy" url="http://localhost:2368" />);

    const link = screen.getByText('Open →');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'http://localhost:2368');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('does not render link when url is not provided', () => {
    render(<ServiceStatus name="Ghost" status="healthy" />);

    expect(screen.queryByText('Open →')).not.toBeInTheDocument();
  });
});
