import { HttpRequest, InvocationContext, HttpResponseInit, app } from '@azure/functions';
import { fodmapService } from '../fodmap-service.js';
import { badRequest, ok } from '../http-response.js';

export async function searchFoods(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const rating = url.searchParams.get('rating');
    const id = url.searchParams.get('id');

    context.log(`FODMAP Search - query: ${query}, rating: ${rating}, id: ${id}`);

    // Get food by ID
    if (id) {
      const food = fodmapService.getFoodById(id);
      if (!food) {
        return badRequest('Food not found');
      }

      const rating = fodmapService.getFoodRating(food);
      return ok({ food, rating });
    }

    // Search by rating
    if (rating && ['low', 'moderate', 'high'].includes(rating)) {
      const foods = fodmapService.getFoodsByRating(rating as 'low' | 'moderate' | 'high');
      const results = foods.map((food) => ({
        food,
        rating: fodmapService.getFoodRating(food),
      }));
      return ok({ results, total: results.length });
    }

    // Search by query
    if (query) {
      if (query.length < 2) {
        return badRequest('Query must be at least 2 characters long');
      }

      const foods = fodmapService.searchFoods(query);
      const results = foods.map((food) => ({
        food,
        rating: fodmapService.getFoodRating(food),
      }));
      return ok({ results, total: results.length, query });
    }

    // Get all foods
    const foods = fodmapService.getAllFoods();
    const results = foods.map((food) => ({
      food,
      rating: fodmapService.getFoodRating(food),
    }));
    return ok({ results, total: results.length });
  } catch (_error: unknown) {
    const error = _error as Error;
    context.error(`Error in FODMAP search: ${error.message}`);
    return badRequest('Search failed');
  }
}

app.http('fodmap-search', {
  route: 'fodmap/search',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: searchFoods,
});
