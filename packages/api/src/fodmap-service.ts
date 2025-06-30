import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface FodmapFood {
  id: string;
  name: string;
  rating: 'low' | 'moderate' | 'high';
  safeServing: string;
  tips: string;
  alternatives: string[];
}

export interface FodmapRating {
  food: FodmapFood;
  rating: 'low' | 'moderate' | 'high';
  safeForLowFodmap: boolean;
  recommendation: string;
  safeServing: string;
  tips: string;
  alternatives: string[];
}

class FodmapService {
  private foods: FodmapFood[] = [];
  private initialized = false;

  private initialize() {
    if (this.initialized) return;

    try {
      // Use relative path from the compiled dist folder
      const dataPath = join(__dirname, '../../../data/fodmap-foods.json');
      const data = readFileSync(dataPath, 'utf8');
      this.foods = JSON.parse(data) as FodmapFood[];
      this.initialized = true;
    } catch (error) {
      console.error('Failed to load FODMAP food data:', error);
      this.foods = [];
    }
  }

  searchFoods(query: string): FodmapFood[] {
    this.initialize();

    const searchTerm = query.toLowerCase().trim();
    return this.foods.filter((food) => food.name.toLowerCase().includes(searchTerm)).slice(0, 10); // Limit to top 10 results
  }

  getFoodById(id: string): FodmapFood | undefined {
    this.initialize();
    return this.foods.find((food) => food.id === id);
  }

  getFoodRating(food: FodmapFood): FodmapRating {
    const safeForLowFodmap = food.rating === 'low';

    let recommendation = '';
    if (safeForLowFodmap) {
      recommendation = `✅ Safe to eat in servings of ${food.safeServing}`;
    } else if (food.rating === 'moderate') {
      recommendation = `⚠️ Moderate FODMAP content. ${food.safeServing}`;
    } else {
      recommendation = `❌ High FODMAP content. ${food.safeServing}`;
    }

    return {
      food,
      rating: food.rating,
      safeForLowFodmap,
      recommendation,
      safeServing: food.safeServing,
      tips: food.tips,
      alternatives: food.alternatives,
    };
  }

  getFoodsByRating(rating: 'low' | 'moderate' | 'high'): FodmapFood[] {
    this.initialize();
    return this.foods.filter((food) => food.rating === rating);
  }

  getAllFoods(): FodmapFood[] {
    this.initialize();
    return this.foods;
  }
}

export const fodmapService = new FodmapService();
