// lib/transportStore.ts
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

export type TransportEntry = {
  transport: SSEServerTransport;
  endpointId: string;
}

export const transports = new Map<string, TransportEntry>();