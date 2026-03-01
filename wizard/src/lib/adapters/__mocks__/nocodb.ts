import type { TableAdapter, ArticleStatus } from '../types';

export function createMockNocoDBAdapter(): TableAdapter {
  return {
    async healthCheck() {
      return true;
    },
    async setup() {
      return {
        authToken: 'mock-nocodb-token',
        projectId: 'mock-project-id',
        tableId: 'mock-table-id',
        promptsTableId: 'mock-prompts-table-id',
      };
    },
    async getNextQueued() {
      return null;
    },
    async updateStatus() {},
    async getStats() {
      return {
        queue: 0,
        generating: 0,
        publishing: 0,
        published: 0,
        promoting: 0,
        completed: 0,
        error: 0,
      } satisfies Record<ArticleStatus, number>;
    },
  };
}
