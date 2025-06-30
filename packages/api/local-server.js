#!/usr/bin/env node

// Local development server for FODMAP API (bypasses Azure Functions Node.js version check)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { AzureChatOpenAI } from '@langchain/openai';
import { fodmapService } from './dist/src/fodmap-service.js';
import { getAzureOpenAiTokenProvider } from './dist/src/security.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 7071;

// Initialize Azure OpenAI if configured
let azureOpenAI = null;
const azureOpenAiEndpoint = process.env.AZURE_OPENAI_API_ENDPOINT;

if (azureOpenAiEndpoint) {
  try {
    const azureADTokenProvider = getAzureOpenAiTokenProvider();
    azureOpenAI = new AzureChatOpenAI({
      temperature: 0.3,
      azureADTokenProvider,
      modelName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME || 'gpt-4o-mini',
    });
    console.log('✅ Azure OpenAI initialized:', process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME);
  } catch (error) {
    console.warn('⚠️ Azure OpenAI initialization failed:', error.message);
    console.log('📝 Falling back to mock responses');
  }
} else {
  console.log('📝 No Azure OpenAI endpoint configured, using mock responses');
}

// FODMAP system prompt
const fodmapSystemPrompt = `You are a helpful FODMAP diet assistant helping people grocery shop and make food choices. You provide clear, simple ratings for everyday foods based on the FODMAP database.

Your role:
- Help users find FODMAP-friendly foods while grocery shopping
- Provide simple, clear ratings (✅ Low FODMAP, ⚠️ High FODMAP)
- Offer practical grocery shopping advice
- Be encouraging and supportive about the low FODMAP journey
- Keep responses conversational and friendly

When users ask about foods:
1. Search the FODMAP database for the food
2. If found, provide the rating with a brief explanation
3. If not found, suggest similar foods or ask for clarification
4. Always include practical tips for grocery shopping

Response format:
- Start with the food rating (✅ or ⚠️)
- Give a brief explanation
- Add practical shopping tips when relevant
- Suggest 2-3 follow-up questions in double angle brackets

Example response format:
"✅ Bananas are LOW FODMAP when ripe! Great choice for a quick snack. Look for yellow bananas with just a few brown spots - they're perfect for low FODMAP.

<<What about strawberries?>>
<<Are there any low FODMAP breakfast cereals?>>
<<What snacks can I grab from the produce section?>>"

Keep responses under 200 words and focus on being helpful for grocery shopping.`;

// Middleware
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-ms-useragent',
      'x-ms-client-request-id',
      'x-ms-return-client-request-id',
      'x-ms-correlation-request-id',
      'Accept',
      'Accept-Encoding',
      'Cache-Control',
      'User-Agent',
    ],
  }),
);
app.use(express.json());

// Handle preflight requests for specific endpoints
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type,Authorization,x-ms-useragent,x-ms-client-request-id,x-ms-return-client-request-id,x-ms-correlation-request-id,Accept,Accept-Encoding,Cache-Control,User-Agent',
};

app.options('/api/fodmap/chat/stream', (request, response) => {
  for (const key of Object.keys(corsHeaders)) {
    response.header(key, corsHeaders[key]);
  }

  response.sendStatus(200);
});

app.options('/api/fodmap/chat', (request, response) => {
  for (const key of Object.keys(corsHeaders)) {
    response.header(key, corsHeaders[key]);
  }

  response.sendStatus(200);
});

app.options('/api/chats', (request, response) => {
  for (const key of Object.keys(corsHeaders)) {
    response.header(key, corsHeaders[key]);
  }

  response.sendStatus(200);
});

// Log requests
app.use((request, response, next) => {
  console.log(`${new Date().toISOString()} ${request.method} ${request.path}`);
  next();
});

// FODMAP Chat endpoint (streaming version for AIChatProtocolClient)
app.post('/api/fodmap/chat/stream', async (request, response) => {
  try {
    const { messages } = request.body;
    const lastMessage = messages?.[messages.length - 1]?.content || '';

    console.log('Streaming chat request:', lastMessage);

    // Search for foods in the message
    const searchResults = fodmapService.searchFoods(lastMessage);
    let contextInfo = '';

    if (searchResults.length > 0) {
      contextInfo = 'FODMAP FOOD INFORMATION:\n';
      for (const food of searchResults) {
        const rating = fodmapService.getFoodRating(food);
        contextInfo += `${food.name}: ${rating.rating.toUpperCase()} FODMAP (${food.category})${food.qty ? ` - Safe serving: ${food.qty}` : ''}\n`;
        contextInfo += `Recommendation: ${rating.recommendation}\n`;
      }
    }

    let aiResponse = '';

    if (azureOpenAI) {
      // Use Azure OpenAI for intelligent responses
      try {
        const fullPrompt =
          fodmapSystemPrompt +
          (contextInfo ? `\n\nCurrent food context:\n${contextInfo}` : '') +
          `\n\nUser question: ${lastMessage}`;

        const aiResponseResult = await azureOpenAI.invoke([
          { role: 'system', content: fullPrompt },
          { role: 'user', content: lastMessage },
        ]);

        aiResponse = aiResponseResult.content || 'Sorry, I could not generate a response.';
        console.log(aiResponse);
      } catch (aiError) {
        console.error('Azure OpenAI error:', aiError.message);
        aiResponse = generateMockResponse(lastMessage, searchResults);
      }
    } else {
      aiResponse = generateMockResponse(lastMessage, searchResults);
    }

    // Stream the response in AIChatProtocol format
    response.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'Content-Type,Authorization,x-ms-useragent,x-ms-client-request-id,x-ms-return-client-request-id,x-ms-correlation-request-id,Accept,Accept-Encoding,Cache-Control,User-Agent',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    });

    const words = aiResponse.split(/(\s+)/);
    const promises = words.map(async (word) => {
      // Always send, even if it's just whitespace
      const delta = {
        delta: {
          content: word,
          role: 'assistant',
        },
        context: {
          sessionId: 'local-session',
          foodResults: searchResults.length > 0 ? searchResults.slice(0, 3) : undefined,
        },
      };

      response.write(JSON.stringify(delta) + '\n');
      await new Promise((resolve) => {
        setTimeout(resolve, 30);
      });
    });

    await Promise.all(promises);

    // Send final completion marker
    const finalDelta = {
      delta: {
        content: '',
        role: 'assistant',
      },
      context: {
        sessionId: 'local-session',
        foodResults: searchResults.length > 0 ? searchResults.slice(0, 3) : undefined,
      },
      finishReason: 'stop',
    };

    response.write(JSON.stringify(finalDelta) + '\n');
    response.end();
  } catch (error) {
    console.error('Streaming chat error:', error);
    response.status(500).json({ error: 'Chat service unavailable' });
  }
});

// FODMAP Chat endpoint (non-streaming version)
app.post('/api/fodmap/chat', async (request, response) => {
  try {
    const { messages } = request.body;
    const lastMessage = messages?.[messages.length - 1]?.content || '';

    console.log('Chat request:', lastMessage);

    // Search for foods in the message
    const searchResults = fodmapService.searchFoods(lastMessage);
    let contextInfo = '';

    if (searchResults.length > 0) {
      contextInfo = 'FODMAP FOOD INFORMATION:\n';
      for (const food of searchResults) {
        const rating = fodmapService.getFoodRating(food);
        contextInfo += `${food.name}: ${rating.rating.toUpperCase()} FODMAP (${food.category})${food.qty ? ` - Safe serving: ${food.qty}` : ''}\n`;
        contextInfo += `Recommendation: ${rating.recommendation}\n`;
      }
    }

    let aiResponse = '';

    if (azureOpenAI) {
      // Use Azure OpenAI for intelligent responses
      try {
        const fullPrompt =
          fodmapSystemPrompt +
          (contextInfo ? `\n\nCurrent food context:\n${contextInfo}` : '') +
          `\n\nUser question: ${lastMessage}`;

        const aiResponseResult = await azureOpenAI.invoke([
          { role: 'system', content: fullPrompt },
          { role: 'user', content: lastMessage },
        ]);

        aiResponse = aiResponseResult.content || 'Sorry, I could not generate a response.';
        console.log('✅ Azure OpenAI response generated');
      } catch (aiError) {
        console.error('❌ Azure OpenAI error:', aiError.message);
        // Fall back to mock response
        aiResponse = generateMockResponse(lastMessage, searchResults);
      }
    } else {
      // Use mock response
      aiResponse = generateMockResponse(lastMessage, searchResults);
    }

    // Stream the response
    const chunks = aiResponse.split(/(\s+)/);

    response.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Access-Control-Allow-Origin': '*',
    });

    const chunkPromises = chunks.map(async (chunk) => {
      if (chunk.trim()) {
        const responseChunk = {
          delta: {
            content: chunk,
            role: 'assistant',
          },
          context: {
            sessionId: 'local-session',
            foodResults: searchResults.length > 0 ? searchResults.slice(0, 3) : undefined,
          },
        };

        response.write(JSON.stringify(responseChunk) + '\n');
        await new Promise((resolve) => {
          setTimeout(resolve, 30); // Simulate streaming
        });
      }
    });

    await Promise.all(chunkPromises);

    response.end();
  } catch (error) {
    console.error('Chat error:', error);
    response.status(500).json({ error: 'Chat service unavailable' });
  }
});

// Helper function for mock responses
function generateMockResponse(question, searchResults) {
  if (searchResults.length === 0) {
    return `I couldn't find any FODMAP information for "${question}". Try asking about specific foods like "banana", "apple", "bread", or "milk".

<<What about strawberries?>>
<<Are there any low FODMAP breakfast cereals?>>
<<Can I eat pasta on the low FODMAP diet?>>`;
  }

  const food = searchResults[0];
  const rating = fodmapService.getFoodRating(food);
  const emoji = rating.safeForLowFodmap ? '✅' : rating.rating === 'moderate' ? '⚠️' : '❌';

  return `${emoji} ${food.name} is ${food.rating.toUpperCase()} FODMAP!

${rating.recommendation}

Safe serving size: ${food.safeServing}

💡 Tips: ${food.tips}

${food.alternatives.length > 0 ? `🔄 Alternatives: ${food.alternatives.join(', ')}` : ''}

<<What about other fruits?>>
<<Can I eat this every day?>>
<<What snacks are safe for me?>>`;
}

// FODMAP Search endpoint
app.get('/api/fodmap/search', (request, response) => {
  try {
    const { q: query, rating, id } = request.query;

    if (id) {
      const food = fodmapService.getFoodById(id);
      if (!food) {
        return response.status(404).json({ error: 'Food not found' });
      }

      const rating = fodmapService.getFoodRating(food);
      return response.json({ food, rating });
    }

    if (rating && ['low', 'moderate', 'high'].includes(rating)) {
      const foods = fodmapService.getFoodsByRating(rating);
      const results = foods.map((food) => ({
        food,
        rating: fodmapService.getFoodRating(food),
      }));
      return response.json({ results, total: results.length });
    }

    if (query) {
      if (query.length < 2) {
        return response.status(400).json({ error: 'Query must be at least 2 characters long' });
      }

      const foods = fodmapService.searchFoods(query);
      const results = foods.map((food) => ({
        food,
        rating: fodmapService.getFoodRating(food),
      }));
      return response.json({ results, total: results.length, query });
    }

    const foods = fodmapService.getAllFoods();
    const results = foods.map((food) => ({
      food,
      rating: fodmapService.getFoodRating(food),
    }));
    response.json({ results, total: results.length });
  } catch (error) {
    console.error('Search error:', error);
    response.status(500).json({ error: 'Search service unavailable' });
  }
});

// Standard AI Chat Protocol endpoint (what AIChatProtocolClient expects)
app.post('/api/chats', async (request, response) => {
  console.log('Standard chat endpoint called, forwarding to FODMAP chat');

  // Forward the request to our FODMAP chat handler with the same logic
  try {
    const { messages } = request.body;
    const lastMessage = messages?.[messages.length - 1]?.content || '';

    console.log('Chat request:', lastMessage);

    // Search for foods in the message
    const searchResults = fodmapService.searchFoods(lastMessage);
    let contextInfo = '';

    if (searchResults.length > 0) {
      contextInfo = 'FODMAP FOOD INFORMATION:\n';
      for (const food of searchResults) {
        const rating = fodmapService.getFoodRating(food);
        contextInfo += `${food.name}: ${rating.rating.toUpperCase()} FODMAP (${food.category})${food.qty ? ` - Safe serving: ${food.qty}` : ''}\n`;
        contextInfo += `Recommendation: ${rating.recommendation}\n`;
      }
    }

    let aiResponse = '';

    if (azureOpenAI) {
      // Use Azure OpenAI for intelligent responses
      try {
        const fullPrompt =
          fodmapSystemPrompt +
          (contextInfo ? `\n\nCurrent food context:\n${contextInfo}` : '') +
          `\n\nUser question: ${lastMessage}`;

        const aiResponseResult = await azureOpenAI.invoke([
          { role: 'system', content: fullPrompt },
          { role: 'user', content: lastMessage },
        ]);

        aiResponse = aiResponseResult.content || 'Sorry, I could not generate a response.';
        console.log('✅ Azure OpenAI response generated');
      } catch (aiError) {
        console.error('❌ Azure OpenAI error:', aiError.message);
        aiResponse = generateMockResponse(lastMessage, searchResults);
      }
    } else {
      aiResponse = generateMockResponse(lastMessage, searchResults);
    }

    // Return complete response for standard endpoint (not streaming)
    response.json({
      id: 'local-session',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: aiResponse,
          },
          finishReason: 'stop',
        },
      ],
      usage: {
        promptTokens: lastMessage.length,
        completionTokens: aiResponse.length,
        totalTokens: lastMessage.length + aiResponse.length,
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    response.status(500).json({ error: 'Chat service unavailable' });
  }
});

// Health check
app.get('/api/health', (request, response) => {
  response.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    foodsLoaded: true,
  });
});

app.listen(PORT, () => {
  console.log(`🥬 FODMAP API Server running on http://localhost:${PORT}`);
  console.log('📍 Endpoints:');
  console.log('  POST /api/fodmap/chat/stream - FODMAP chat (streaming)');
  console.log('  POST /api/fodmap/chat - FODMAP chat (standard)');
  console.log('  POST /api/chats - AI Chat Protocol compatibility');
  console.log('  GET  /api/fodmap/search - Food search');
  console.log('  GET  /api/health - Health check');
  console.log('');
  console.log('✅ Ready to serve FODMAP requests!');
});
