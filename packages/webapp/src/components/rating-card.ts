import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

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

/**
 * A rating card component that displays FODMAP information for foods.
 * Shows clear visual indicators for low/high FODMAP foods with recommendations.
 * @element fodmap-rating-card
 */
@customElement('fodmap-rating-card')
export class RatingCardComponent extends LitElement {
  @property({ type: Object }) rating!: FodmapRating;
  @property({ type: Boolean }) compact = false;

  static override styles = css`
    :host {
      display: block;
      margin: 16px 0;
    }

    .rating-card {
      border: 2px solid;
      border-radius: 12px;
      padding: 16px;
      background: white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      transition:
        transform 0.2s ease,
        box-shadow 0.2s ease;
    }

    .rating-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    }

    .rating-card.low-fodmap {
      border-color: #22c55e;
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
    }

    .rating-card.moderate-fodmap {
      border-color: #f59e0b;
      background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
    }

    .rating-card.high-fodmap {
      border-color: #ef4444;
      background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
    }

    .food-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .food-name {
      font-size: 1.25rem;
      font-weight: 600;
      color: #1f2937;
      margin: 0;
    }

    .rating-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 0.875rem;
      text-transform: uppercase;
    }

    .rating-badge.low {
      background: #22c55e;
      color: white;
    }

    .rating-badge.moderate {
      background: #f59e0b;
      color: white;
    }

    .rating-badge.high {
      background: #ef4444;
      color: white;
    }

    .rating-icon {
      font-size: 1.2em;
    }

    .serving-size {
      background: #f3f4f6;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      color: #374151;
      display: inline-block;
      margin-bottom: 12px;
    }

    .recommendation {
      background: rgba(255, 255, 255, 0.8);
      padding: 12px;
      border-radius: 8px;
      font-size: 0.9rem;
      line-height: 1.4;
      margin-bottom: 12px;
    }

    .tips {
      background: rgba(255, 255, 255, 0.8);
      padding: 12px;
      border-radius: 8px;
      font-size: 0.9rem;
      line-height: 1.4;
      margin-bottom: 12px;
      border-left: 4px solid #3b82f6;
    }

    .alternatives {
      background: rgba(255, 255, 255, 0.8);
      padding: 12px;
      border-radius: 8px;
      font-size: 0.9rem;
      line-height: 1.4;
      margin-bottom: 12px;
      border-left: 4px solid #10b981;
    }

    .alternatives-list {
      margin: 8px 0 0 0;
      padding-left: 16px;
    }

    .alternatives-list li {
      margin-bottom: 4px;
    }

    .compact .tips,
    .compact .alternatives {
      display: none;
    }

    .compact .recommendation {
      margin-bottom: 0;
    }

    @media (max-width: 768px) {
      .food-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
    }
  `;

  override render() {
    const { rating } = this;
    if (!rating) return html``;

    const cardClass =
      rating.rating === 'low' ? 'low-fodmap' : rating.rating === 'moderate' ? 'moderate-fodmap' : 'high-fodmap';
    const ratingClass = rating.rating;
    const ratingIcon = rating.safeForLowFodmap ? '✅' : rating.rating === 'moderate' ? '⚠️' : '❌';

    return html`
      <div class="rating-card ${cardClass} ${this.compact ? 'compact' : ''}">
        <div class="food-header">
          <h3 class="food-name">${rating.food.name}</h3>
          <div class="rating-badge ${ratingClass}">
            <span class="rating-icon">${ratingIcon}</span>
            <span>${rating.rating} FODMAP</span>
          </div>
        </div>

        <div class="serving-size">Safe serving: ${rating.food.safeServing}</div>

        <div class="recommendation">${rating.recommendation}</div>

        ${this.compact
          ? ''
          : html`
              <div class="tips"><strong>💡 Tips:</strong> ${rating.food.tips}</div>
              ${rating.food.alternatives.length > 0
                ? html`
                    <div class="alternatives">
                      <strong>🔄 Alternatives:</strong>
                      <ul class="alternatives-list">
                        ${rating.food.alternatives.map((alt) => html`<li>${alt}</li>`)}
                      </ul>
                    </div>
                  `
                : ''}
            `}
      </div>
    `;
  }
}
