import type { AutomationAdapter } from '../types';

export function createMockN8nAdapter(): AutomationAdapter {
  return {
    async healthCheck() {
      return true;
    },
    async setup() {
      return { apiKey: 'mock-api-key' };
    },
    async createCredential() {
      return 'mock-credential-id';
    },
    async importWorkflow() {
      return 'mock-workflow-id';
    },
    async activateWorkflow() {},
  };
}
