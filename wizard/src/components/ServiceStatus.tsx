'use client';

import { cn } from '@/lib/utils';

interface ServiceStatusProps {
  name: string;
  status: 'healthy' | 'unhealthy' | 'checking';
  url?: string;
}

export function ServiceStatus({ name, status, url }: ServiceStatusProps) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'h-2.5 w-2.5 rounded-full',
          status === 'healthy' && 'bg-green-500',
          status === 'unhealthy' && 'bg-red-500',
          status === 'checking' && 'animate-pulse bg-yellow-500',
        )}
        data-testid="status-dot"
      />
      <span className="text-sm font-medium">{name}</span>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary text-xs">
          Open →
        </a>
      )}
    </div>
  );
}
