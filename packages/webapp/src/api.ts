import { AIChatMessage, AIChatCompletionDelta, AIChatProtocolClient } from '@microsoft/ai-chat-protocol';

export const apiBaseUrl: string = import.meta.env.VITE_API_URL || '';

export type ChatRequestOptions = {
  messages: AIChatMessage[];
  context?: Record<string, unknown>;
  chunkIntervalMs: number;
  apiUrl: string;
};

export async function* getCompletion(options: ChatRequestOptions) {
  const apiUrl = options.apiUrl || apiBaseUrl || 'http://localhost:7071';
  console.log('API URL:', apiUrl);
  const client = new AIChatProtocolClient(`${apiUrl}/api/fodmap/chat`);
  console.log(client);
  const result = await client.getStreamedCompletion(options.messages, { context: options.context });

  for await (const response of result) {
    if (!response.delta) {
      continue;
    }

    yield new Promise<AIChatCompletionDelta>((resolve) => {
      setTimeout(() => {
        resolve(response);
      }, options.chunkIntervalMs);
    });
  }
}

// FODMAP-specific API functions
export interface FodmapFood {
  id: string;
  name: string;
  fodmap: 'low' | 'high';
  category: string;
  qty?: string;
}

export interface FodmapRating {
  food: FodmapFood;
  rating: 'low' | 'high';
  safeForLowFodmap: boolean;
  components: {
    oligosaccharides: 'low' | 'medium' | 'high';
    disaccharides: 'low' | 'medium' | 'high';
    monosaccharides: 'low' | 'medium' | 'high';
    polyols: 'low' | 'medium' | 'high';
  };
  recommendation: string;
}

export async function searchFodmapFoods(
  query: string,
): Promise<{ results: Array<{ food: FodmapFood; rating: FodmapRating }> }> {
  const apiUrl = apiBaseUrl;
  const response = await fetch(`${apiUrl}/api/fodmap/search?q=${encodeURIComponent(query)}`);
  return response.json();
}

export async function getFodmapCategories(): Promise<{ categories: string[] }> {
  const apiUrl = apiBaseUrl;
  const response = await fetch(`${apiUrl}/api/fodmap/search`);
  return response.json();
}

export function getCitationUrl(citation: string): string {
  return `${apiBaseUrl}/api/documents/${citation}`;
}
