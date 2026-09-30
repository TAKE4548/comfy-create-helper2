import type {
  Collision,
  CollisionDetection,
  DroppableContainer,
  UniqueIdentifier,
} from '@dnd-kit/core';

export interface OverlapCollisionOptions {
  overlapThreshold?: number; // 0.20 (20%)
  epsilonHysteresis?: number; // 0.05 (5%)
}

let lastActiveCollisionId: UniqueIdentifier | null = null;

export const resetCollisionHistory = (): void => {
  lastActiveCollisionId = null;
};

export const getLastActiveCollisionId = (): UniqueIdentifier | null => {
  return lastActiveCollisionId;
};

interface Candidate {
  id: UniqueIdentifier;
  droppableContainer: DroppableContainer;
  score: number;
  maxOverlap: number;
  isPointerInside: boolean;
}

export const createTagChipCollisionDetection = (
  options: OverlapCollisionOptions = {}
): CollisionDetection => {
  const overlapThreshold = options.overlapThreshold ?? 0.20;
  const epsilonHysteresis = options.epsilonHysteresis ?? 0.05;

  return ({
    active,
    collisionRect,
    droppableRects,
    droppableContainers,
    pointerCoordinates,
  }): Collision[] => {
    if (!collisionRect || !droppableContainers || droppableContainers.length === 0) {
      lastActiveCollisionId = null;
      return [];
    }

    const candidates: Candidate[] = [];

    for (const container of droppableContainers) {
      if (container.disabled || container.id === active?.id) {
        continue;
      }

      const targetRect = droppableRects.get(container.id);
      if (!targetRect) {
        continue;
      }

      // AABB intersection calculation
      const w = Math.max(
        0,
        Math.min(collisionRect.right, targetRect.right) -
          Math.max(collisionRect.left, targetRect.left)
      );
      const h = Math.max(
        0,
        Math.min(collisionRect.bottom, targetRect.bottom) -
          Math.max(collisionRect.top, targetRect.top)
      );
      const intersectionArea = w * h;

      const targetArea = targetRect.width * targetRect.height;
      const activeArea = collisionRect.width * collisionRect.height;

      const targetOverlap = targetArea > 0 ? intersectionArea / targetArea : 0;
      const activeOverlap = activeArea > 0 ? intersectionArea / activeArea : 0;
      const maxOverlap = Math.max(targetOverlap, activeOverlap);

      // Pointer inclusion calculation
      let isPointerInside = false;
      if (pointerCoordinates) {
        const { x, y } = pointerCoordinates;
        if (
          x >= targetRect.left &&
          x <= targetRect.right &&
          y >= targetRect.top &&
          y <= targetRect.bottom
        ) {
          isPointerInside = true;
        }
      }

      // Threshold check: pointer inclusion OR overlap >= threshold
      if (!isPointerInside && maxOverlap < overlapThreshold) {
        continue;
      }

      // Base scoring: pointer inclusion bonus (+1.0)
      const score = maxOverlap + (isPointerInside ? 1.0 : 0);

      candidates.push({
        id: container.id,
        droppableContainer: container,
        score,
        maxOverlap,
        isPointerInside,
      });
    }

    if (candidates.length === 0) {
      lastActiveCollisionId = null;
      return [];
    }

    // Sort with hysteresis (chattering suppression)
    const getEffectiveScore = (c: Candidate): number => {
      return c.score + (c.id === lastActiveCollisionId ? epsilonHysteresis : 0);
    };

    candidates.sort((a, b) => {
      const diff = getEffectiveScore(b) - getEffectiveScore(a);
      if (diff !== 0) {
        return diff;
      }
      if (a.id === lastActiveCollisionId) return -1;
      if (b.id === lastActiveCollisionId) return 1;
      return b.score - a.score;
    });

    const topCandidate = candidates[0];
    lastActiveCollisionId = topCandidate.id;

    return candidates.map((candidate) => ({
      id: candidate.id,
      data: {
        droppableContainer: candidate.droppableContainer,
        value: candidate.score,
        maxOverlap: candidate.maxOverlap,
        isPointerInside: candidate.isPointerInside,
      },
    }));
  };
};

const defaultDetection = createTagChipCollisionDetection();

export const tagChipCollisionDetection: CollisionDetection = (args) => {
  return defaultDetection(args);
};
