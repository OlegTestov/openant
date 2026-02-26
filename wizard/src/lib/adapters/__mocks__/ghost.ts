import type { BlogAdapter } from '../types';

export function createMockGhostAdapter(): BlogAdapter {
  return {
    async healthCheck() {
      return true;
    },
    async setup() {
      return {
        adminApiKey: 'mock-admin-key-id:mock-admin-key-secret',
        contentApiKey: 'mock-content-key',
      };
    },
    async publishPost() {
      return {
        id: 'mock-post-id',
        url: 'https://blog.example.com/mock-post/',
        slug: 'mock-post',
      };
    },
    async getPostUrl() {
      return 'https://blog.example.com/mock-post/';
    },
  };
}
