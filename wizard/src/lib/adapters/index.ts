import type { BlogAdapter, TableAdapter, AutomationAdapter } from './types';
import { createGhostAdapter } from './ghost';
import { createNocoDBAdapter } from './nocodb';
import { createN8nAdapter } from './n8n';

export interface Adapters {
  blog: BlogAdapter;
  table: TableAdapter;
  automation: AutomationAdapter;
}

export function createAdapters(): Adapters {
  return {
    blog: createGhostAdapter(),
    table: createNocoDBAdapter(),
    automation: createN8nAdapter(),
  };
}
