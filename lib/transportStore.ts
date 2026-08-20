// lib/transportStore.ts
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

export const transports = new Map<string, SSEServerTransport>();