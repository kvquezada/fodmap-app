import { Readable } from 'node:stream';
import { HttpRequest, InvocationContext, HttpResponseInit, app } from '@azure/functions';
import { AIChatCompletionRequest, AIChatCompletionDelta } from '@microsoft/ai-chat-protocol';
import { AzureChatOpenAI } from '@langchain/openai';
import { AzureCosmsosDBNoSQLChatMessageHistory } from '@langchain/azure-cosmosdb';
import { FileSystemChatMessageHistory } from '@langchain/community/stores/message/file_system';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { RunnableWithMessageHistory } from '@langchain/core/runnables';
import { ChatOllama } from '@langchain/ollama';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';
import { badRequest, data, serviceUnavailable, ok, notFound } from '../http-response.js';
import { ollamaChatModel } from '../constants.js';
import { getAzureOpenAiTokenProvider, getCredentials, getUserId } from '../security.js';
import { fodmapService, FodmapFood, FodmapRating } from '../fodmap-service.js';

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

const titleSystemPrompt = `Create a title for this FODMAP chat session, based on the user question. The title should be less than 32 characters and relate to FODMAP foods or shopping. Do NOT use double-quotes.`;

export async function fodmapChat(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const azureOpenAiEndpoint = process.env.AZURE_OPENAI_API_ENDPOINT;

  try {
    const requestBody = (await request.json()) as AIChatCompletionRequest;
    const { messages, context: chatContext } = requestBody;
    const userId = getUserId(request, requestBody);

    if (!messages || messages.length === 0 || !messages.at(-1)?.content) {
      return badRequest('Invalid or missing messages in the request body');
    }

    let model: BaseChatModel;
    let chatHistory;
    const sessionId = ((chatContext as any)?.sessionId as string) || uuidv4();
    context.log(`FODMAP Chat - userId: ${userId}, sessionId: ${sessionId}`);

    if (azureOpenAiEndpoint) {
      const credentials = getCredentials();
      const azureADTokenProvider = getAzureOpenAiTokenProvider();

      model = new AzureChatOpenAI({
        temperature: 0.3, // Lower temperature for more consistent food advice
        azureADTokenProvider,
      });

      chatHistory = new AzureCosmsosDBNoSQLChatMessageHistory({
        sessionId,
        userId,
        credentials,
      });
    } else {
      context.log('No Azure OpenAI endpoint set, using Ollama models');
      model = new ChatOllama({
        temperature: 0.3,
        model: ollamaChatModel,
      });
      chatHistory = new FileSystemChatMessageHistory({
        sessionId,
        userId,
      });
    }

    const question = messages.at(-1)!.content;

    // Search for foods mentioned in the question
    const searchResults = fodmapService.searchFoods(question);
    let contextInfo = '';

    if (searchResults.length > 0) {
      contextInfo = 'FODMAP FOOD INFORMATION:\n';
      for (const food of searchResults) {
        const rating = fodmapService.getFoodRating(food);
        contextInfo += `${food.name}: ${rating.rating.toUpperCase()} FODMAP - Safe serving: ${food.safeServing}\n`;
        contextInfo += `Tips: ${food.tips}\n`;
        if (food.alternatives.length > 0) {
          contextInfo += `Alternatives: ${food.alternatives.join(', ')}\n`;
        }

        contextInfo += `Recommendation: ${rating.recommendation}\n\n`;
      }
    }

    // Create the chat chain with FODMAP context
    const fodmapChain = ChatPromptTemplate.fromMessages([
      ['system', fodmapSystemPrompt + (contextInfo ? `\n\nCurrent food context:\n${contextInfo}` : '')],
      ['human', '{input}'],
    ]).pipe(model);

    // Handle chat history
    const fodmapChainWithHistory = new RunnableWithMessageHistory({
      runnable: fodmapChain,
      inputMessagesKey: 'input',
      historyMessagesKey: 'chat_history',
      getMessageHistory: async () => chatHistory,
    });

    // Use invoke instead of stream for simpler implementation
    const response = await fodmapChainWithHistory.invoke({ input: question }, { configurable: { sessionId } });
    console.log('RAW LLM RESPONSE:', JSON.stringify(response, null, 2)); // Debug log

    // Convert response to streaming format
    async function* createResponseStream(): AsyncIterable<string> {
      let responseText = '';
      try {
        if (typeof response === 'string') {
          responseText = response;
        } else if (response && typeof response.content === 'string') {
          responseText = response.content;
        } else if (response && Array.isArray(response.content)) {
          responseText = response.content
            .map((part) =>
              typeof part === 'string' ? part : 'text' in part && typeof part.text === 'string' ? part.text : '',
            )
            .join('');
        }
      } catch {
        responseText = 'Unable to process response';
      }

      console.log('STREAMED RESPONSE TEXT:', JSON.stringify(responseText)); // Debug log
      yield responseText;
    }

    const jsonStream = Readable.from(createJsonStream(createResponseStream(), sessionId, searchResults));

    // Create a short title for this chat session
    const { title } = await chatHistory.getContext();
    if (!title) {
      const response = await ChatPromptTemplate.fromMessages([
        ['system', titleSystemPrompt],
        ['human', '{input}'],
      ])
        .pipe(model)
        .invoke({ input: question });
      context.log(`Title for session: ${response.content as string}`);
      chatHistory.setContext({ title: response.content });
    }

    return data(jsonStream, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
    });
  } catch (_error: unknown) {
    const error = _error as Error;
    context.error(`Error when processing FODMAP chat request: ${error.message}`);

    return serviceUnavailable('Service temporarily unavailable. Please try again later.');
  }
}

// Transform the response chunks into a JSON stream with FODMAP context
async function* createJsonStream(chunks: AsyncIterable<string>, sessionId: string, foodResults: FodmapFood[]) {
  for await (const chunk of chunks) {
    if (!chunk) continue;

    const responseChunk: AIChatCompletionDelta = {
      delta: {
        content: chunk,
        role: 'assistant',
      },
      context: {
        sessionId,
        foodResults:
          foodResults.length > 0
            ? foodResults.map((food) => ({
                id: food.id,
                name: food.name,
                rating: food.rating,
                safeServing: food.safeServing,
                tips: food.tips,
                alternatives: food.alternatives,
              }))
            : undefined,
      },
    };

    yield JSON.stringify(responseChunk) + '\n';
  }
}

// Add GET handlers for chat history
export async function fodmapChatHistory(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const { sessionId } = request.params;
  const userId = getUserId(request);

  if (!userId) {
    return badRequest('Invalid or missing userId in the request');
  }

  try {
    let chatHistory;
    const azureOpenAiEndpoint = process.env.AZURE_OPENAI_API_ENDPOINT;
    if (azureOpenAiEndpoint) {
      const credentials = getCredentials();
      chatHistory = new AzureCosmsosDBNoSQLChatMessageHistory({
        sessionId,
        userId,
        credentials,
      });
    } else {
      chatHistory = new FileSystemChatMessageHistory({
        sessionId,
        userId,
      });
    }

    if (sessionId) {
      const messages = await chatHistory.getMessages();
      const chatMessages = messages.map((message) => ({
        role: message.getType() === 'human' ? 'user' : 'assistant',
        content: message.content,
      }));
      return ok(chatMessages);
    }

    const sessions = await chatHistory.getAllSessions();
    const chatSessions = sessions.map((session) => ({
      id: session.id,
      title: session.context?.title,
    }));
    return ok(chatSessions);
  } catch (_error: unknown) {
    const error = _error as Error;
    context.error(`Error when processing fodmap-chat history request: ${error.message}`);
    return notFound('Session not found');
  }
}

// Streaming chat endpoint for /api/fodmap/chat/stream
export async function fodmapChatStream(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const azureOpenAiEndpoint = process.env.AZURE_OPENAI_API_ENDPOINT;

  try {
    const requestBody = (await request.json()) as AIChatCompletionRequest;
    const { messages, context: chatContext } = requestBody;
    const userId = getUserId(request, requestBody);

    if (!messages || messages.length === 0 || !messages.at(-1)?.content) {
      return badRequest('Invalid or missing messages in the request body');
    }

    let model: BaseChatModel;
    let chatHistory;
    const sessionId = ((chatContext as any)?.sessionId as string) || uuidv4();
    context.log(`FODMAP Chat Stream - userId: ${userId}, sessionId: ${sessionId}`);

    if (azureOpenAiEndpoint) {
      const credentials = getCredentials();
      const azureADTokenProvider = getAzureOpenAiTokenProvider();

      model = new AzureChatOpenAI({
        temperature: 0.3,
        azureADTokenProvider,
      });

      chatHistory = new AzureCosmsosDBNoSQLChatMessageHistory({
        sessionId,
        userId,
        credentials,
      });
    } else {
      context.log('No Azure OpenAI endpoint set, using Ollama models');
      model = new ChatOllama({
        temperature: 0.3,
        model: ollamaChatModel,
      });
      chatHistory = new FileSystemChatMessageHistory({
        sessionId,
        userId,
      });
    }

    const question = messages.at(-1)!.content;
    const searchResults = fodmapService.searchFoods(question);
    let contextInfo = '';
    if (searchResults.length > 0) {
      contextInfo = 'FODMAP FOOD INFORMATION:\n';
      for (const food of searchResults) {
        const rating = fodmapService.getFoodRating(food);
        contextInfo += `${food.name}: ${rating.rating.toUpperCase()} FODMAP - Safe serving: ${food.safeServing}\n`;
        contextInfo += `Tips: ${food.tips}\n`;
        if (food.alternatives.length > 0) {
          contextInfo += `Alternatives: ${food.alternatives.join(', ')}\n`;
        }

        contextInfo += `Recommendation: ${rating.recommendation}\n\n`;
      }
    }

    const fodmapChain = ChatPromptTemplate.fromMessages([
      ['system', fodmapSystemPrompt + (contextInfo ? `\n\nCurrent food context:\n${contextInfo}` : '')],
      ['human', '{input}'],
    ]).pipe(model);

    const fodmapChainWithHistory = new RunnableWithMessageHistory({
      runnable: fodmapChain,
      inputMessagesKey: 'input',
      historyMessagesKey: 'chat_history',
      getMessageHistory: async () => chatHistory,
    });

    const response = await fodmapChainWithHistory.invoke({ input: question }, { configurable: { sessionId } });
    let responseText = '';
    if (typeof response === 'string') {
      responseText = response;
    } else if (response && typeof response.content === 'string') {
      responseText = response.content;
    } else if (response && Array.isArray(response.content)) {
      responseText = response.content
        .map((part) =>
          typeof part === 'string' ? part : 'text' in part && typeof part.text === 'string' ? part.text : '',
        )
        .join('');
    }

    async function* createStreamedChunks() {
      const words = responseText.split(/(\s+)/);
      for (const word of words) {
        const delta: AIChatCompletionDelta = {
          delta: {
            content: word,
            role: 'assistant',
          },
          context: {
            sessionId,
            foodResults:
              searchResults.length > 0
                ? searchResults.map((food) => ({
                    id: food.id,
                    name: food.name,
                    rating: food.rating,
                    safeServing: food.safeServing,
                    tips: food.tips,
                    alternatives: food.alternatives,
                  }))
                : undefined,
          },
        };
        yield JSON.stringify(delta) + '\n';
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      // Final completion marker
      const finalDelta = {
        delta: {
          content: '',
          role: 'assistant',
        },
        context: {
          sessionId,
          foodResults:
            searchResults.length > 0
              ? searchResults.map((food) => ({
                  id: food.id,
                  name: food.name,
                  rating: food.rating,
                  safeServing: food.safeServing,
                  tips: food.tips,
                  alternatives: food.alternatives,
                }))
              : undefined,
        },
        finish_reason: 'stop',
      };
      yield JSON.stringify(finalDelta) + '\n';
    }

    const jsonStream = Readable.from(createStreamedChunks());
    return data(jsonStream, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
    });
  } catch (_error: unknown) {
    const error = _error as Error;
    context.error(`Error when processing FODMAP chat stream request: ${error.message}`);
    return serviceUnavailable('Service temporarily unavailable. Please try again later.');
  }
}

app.setup({ enableHttpStream: true });
app.http('fodmap-chat', {
  route: 'fodmap/chat',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: fodmapChat,
});

// Register GET endpoints for chat history
app.http('fodmap-chat-history', {
  route: 'fodmap/chat/{sessionId?}',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: fodmapChatHistory,
});

// Register the streaming endpoint
app.http('fodmap-chat-stream', {
  route: 'fodmap/chat/stream',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: fodmapChatStream,
});
