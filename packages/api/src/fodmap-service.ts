import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface FodmapFood {
  id: string;
  name: string;
  fodmap: 'low' | 'high';
  category: string;
  qty?: string;
  details: {
    oligos: number;
    fructose: number;
    polyols: number;
    lactose: number;
  };
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

class FodmapService {
  private foods: FodmapFood[] = [];
  private initialized = false;

  private initialize() {
    if (this.initialized) return;

    try {
      // Use relative path from the compiled dist folder
      const dataPath = join(__dirname, '../../data/fodmap-foods.json');
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
    return this.foods
      .filter(
        (food) => food.name.toLowerCase().includes(searchTerm) || food.category.toLowerCase().includes(searchTerm),
      )
      .slice(0, 10); // Limit to top 10 results
  }

  getFoodById(id: string): FodmapFood | undefined {
    this.initialize();
    return this.foods.find((food) => food.id === id);
  }

  getFoodRating(food: FodmapFood): FodmapRating {
    const componentToRating = (value: number): 'low' | 'medium' | 'high' => {
      switch (value) {
        case 0: {
          return 'low';
        }

        case 1: {
          return 'medium';
        }

        case 2: {
          return 'high';
        }

        default: {
          return 'low';
        }
      }
    };

    const components = {
      oligosaccharides: componentToRating(food.details.oligos),
      disaccharides: componentToRating(food.details.lactose),
      monosaccharides: componentToRating(food.details.fructose),
      polyols: componentToRating(food.details.polyols),
    };

    const safeForLowFodmap = food.fodmap === 'low';

    let recommendation = '';
    if (safeForLowFodmap) {
      recommendation = food.qty
        ? `✅ Safe to eat${food.qty ? ` in servings of ${food.qty}` : ''}`
        : '✅ Generally safe for low FODMAP diet';
    } else {
      const highComponents = Object.entries(components)
        .filter(([_, rating]) => rating === 'high' || rating === 'medium')
        .map(([component, _]) => component);

      recommendation =
        highComponents.length > 0
          ? `⚠️ High in ${highComponents.join(', ')}. Avoid or consume very small amounts.`
          : '⚠️ Not recommended for low FODMAP diet';
    }

    return {
      food,
      rating: food.fodmap,
      safeForLowFodmap,
      components,
      recommendation,
    };
  }

  getAllCategories(): string[] {
    this.initialize();
    return [...new Set(this.foods.map((food) => food.category))].sort();
  }

  getFoodsByCategory(category: string): FodmapFood[] {
    this.initialize();
    return this.foods.filter((food) => food.category.toLowerCase() === category.toLowerCase());
  }
}

export const fodmapService = new FodmapService();
