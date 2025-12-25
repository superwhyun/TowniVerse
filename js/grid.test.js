import { describe, it, expect, vi } from 'vitest';

// Mock Phaser before importing grid.js
vi.mock('phaser', () => {
    return {
        default: {
            Math: {
                Vector2: class { constructor(x, y) { this.x = x; this.y = y; } }
            },
            Geom: {
                Polygon: class { setTo() { } static Contains() { return true; } }
            }
        }
    };
});

import { getPlacementBase } from './grid';

describe('grid.js', () => {
    it('getPlacementBase calculates correct base for 1x1', () => {
        const result = getPlacementBase(5, 5, 1, 1);
        expect(result).toEqual({ baseCol: 5, baseRow: 5 });
    });

    it('getPlacementBase calculates correct base for 2x2', () => {
        // 2x2 logic:
        // baseRow = anchorRow - (gridHeight - 1) = 5 - 1 = 4
        // baseCol = anchorCol - Math.round((gridWidth - 1) / 2) = 5 - 0 = 5 ? 
        // Wait, let's verify logic in grid.js
        // baseCol = anchorCol - Math.round((safeWidth - 1) / 2);
        // safeWidth = 2. (2-1)/2 = 0.5. Math.round(0.5) = 1.
        // So 5 - 1 = 4.

        const result = getPlacementBase(5, 5, 2, 2);
        expect(result).toEqual({ baseCol: 4, baseRow: 4 });
    });
});
