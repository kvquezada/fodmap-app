import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

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

/**
 * A rating card component that displays FODMAP information for foods.
 * Shows clear visual indicators for low/high FODMAP foods with recommendations.
 * @element fodmap-rating-card
 */
@customElement('fodmap-rating-card')
export class RatingCardComponent extends LitElement {
  @property({ type: Object }) rating!: FodmapRating;
  @property({ type: Boolean }) compact = false;

  static styles = css`
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

    .rating-badge.high {
      background: #ef4444;
      color: white;
    }

    .rating-icon {
      font-size: 1.2em;
    }

    .food-category {
      color: #6b7280;
      font-size: 0.875rem;
      margin-bottom: 8px;
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

    .components {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-top: 12px;
    }

    .component {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 8px;
      background: rgba(255, 255, 255, 0.6);
      border-radius: 6px;
      font-size: 0.8rem;
    }

    .component-level {
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .component-level.low {
      background: #dcfce7;
      color: #166534;
    }

    .component-level.medium {
      background: #fef3c7;
      color: #92400e;
    }

    .component-level.high {
      background: #fee2e2;
      color: #991b1b;
    }

    .compact .components {
      display: none;
    }

    .compact .recommendation {
      margin-bottom: 0;
    }

    @media (max-width: 768px) {
      .components {
        grid-template-columns: 1fr;
      }

      .food-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
    }
  `;

  render() {
    const { rating } = this;
    if (!rating) return html``;

    const cardClass = rating.safeForLowFodmap ? 'low-fodmap' : 'high-fodmap';
    const ratingClass = rating.rating;
    const ratingIcon = rating.safeForLowFodmap ? '✅' : '⚠️';

    return html`
      <div class="rating-card ${cardClass} ${this.compact ? 'compact' : ''}">
        <div class="food-header">
          <h3 class="food-name">${rating.food.name}</h3>
          <div class="rating-badge ${ratingClass}">
            <span class="rating-icon">${ratingIcon}</span>
            <span>${rating.rating} FODMAP</span>
          </div>
        </div>

        <div class="food-category">${rating.food.category}</div>

        ${rating.food.qty ? html` <div class="serving-size">Safe serving: ${rating.food.qty}</div> ` : ''}

        <div class="recommendation">${rating.recommendation}</div>

        ${this.compact
          ? ''
          : html`
              <div class="components">
                <div class="component">
                  <span>Oligosaccharides</span>
                  <span class="component-level ${rating.components.oligosaccharides}">
                    ${rating.components.oligosaccharides}
                  </span>
                </div>
                <div class="component">
                  <span>Disaccharides</span>
                  <span class="component-level ${rating.components.disaccharides}">
                    ${rating.components.disaccharides}
                  </span>
                </div>
                <div class="component">
                  <span>Monosaccharides</span>
                  <span class="component-level ${rating.components.monosaccharides}">
                    ${rating.components.monosaccharides}
                  </span>
                </div>
                <div class="component">
                  <span>Polyols</span>
                  <span class="component-level ${rating.components.polyols}"> ${rating.components.polyols} </span>
                </div>
              </div>
            `}
      </div>
    `;
  }
}
