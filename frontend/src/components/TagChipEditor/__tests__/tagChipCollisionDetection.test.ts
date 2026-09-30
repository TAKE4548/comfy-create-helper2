import { describe, it, expect, beforeEach } from 'vitest';
import type { ClientRect, DroppableContainer, UniqueIdentifier } from '@dnd-kit/core';
import {
  tagChipCollisionDetection,
  resetCollisionHistory,
  getLastActiveCollisionId,
  createTagChipCollisionDetection,
} from '../tagChipCollisionDetection';

const createRect = (left: number, top: number, width: number, height: number): ClientRect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

const createContainer = (id: UniqueIdentifier, disabled = false): DroppableContainer => ({
  id,
  key: id,
  data: {},
  disabled,
  node: { current: null },
  rect: { current: null },
});

describe('tagChipCollisionDetection', () => {
  beforeEach(() => {
    resetCollisionHistory();
  });

  it('20% 重複で中心点到達前でも衝突検知されること', () => {
    // Target 1: [100, 200] x [0, 40] (center: x=150)
    const target1 = createContainer('target-1');
    const target1Rect = createRect(100, 0, 100, 40);

    // Active chip: [20, 120] x [0, 40] (center: x=70, overlap width = 20, 20% of 100)
    const active = createContainer('active-chip');
    const activeRect = createRect(20, 0, 100, 40);

    const droppableContainers = [target1];
    const droppableRects = new Map<UniqueIdentifier, ClientRect>([['target-1', target1Rect]]);

    const collisions = tagChipCollisionDetection({
      active,
      collisionRect: activeRect,
      droppableContainers,
      droppableRects,
      pointerCoordinates: { x: 70, y: 20 },
    });

    expect(collisions.length).toBe(1);
    expect(collisions[0].id).toBe('target-1');
    expect(collisions[0].data?.maxOverlap).toBeCloseTo(0.20);
    expect(getLastActiveCollisionId()).toBe('target-1');
  });

  it('ポインタが相手領域に入った瞬間に衝突検知されること', () => {
    // Target 1: [100, 200] x [0, 40]
    const target1 = createContainer('target-1');
    const target1Rect = createRect(100, 0, 100, 40);

    // Active chip: [0, 50] x [0, 40] (0% overlap with target 1)
    const active = createContainer('active-chip');
    const activeRect = createRect(0, 0, 50, 40);

    const droppableContainers = [target1];
    const droppableRects = new Map<UniqueIdentifier, ClientRect>([['target-1', target1Rect]]);

    // Pointer is inside target-1 (x=110, y=20)
    const collisions = tagChipCollisionDetection({
      active,
      collisionRect: activeRect,
      droppableContainers,
      droppableRects,
      pointerCoordinates: { x: 110, y: 20 },
    });

    expect(collisions.length).toBe(1);
    expect(collisions[0].id).toBe('target-1');
    expect(collisions[0].data?.isPointerInside).toBe(true);
    expect(collisions[0].data?.value).toBeGreaterThanOrEqual(1.0);
  });

  it('5% 未満の角微小接触で衝突が弾かれること', () => {
    // Target 1: [100, 200] x [0, 40] (area = 4000)
    const target1 = createContainer('target-1');
    const target1Rect = createRect(100, 0, 100, 40);

    // Active chip: [4, 104] x [35, 75] (area = 4000)
    // Intersection: [100, 104] x [35, 40] -> w=4, h=5, area=20 (0.5% overlap < 5%)
    const active = createContainer('active-chip');
    const activeRect = createRect(4, 35, 100, 40);

    const droppableContainers = [target1];
    const droppableRects = new Map<UniqueIdentifier, ClientRect>([['target-1', target1Rect]]);

    const collisions = tagChipCollisionDetection({
      active,
      collisionRect: activeRect,
      droppableContainers,
      droppableRects,
      pointerCoordinates: { x: 50, y: 55 },
    });

    expect(collisions).toEqual([]);
    expect(getLastActiveCollisionId()).toBeNull();
  });

  it('境界線上でのヒステリシスによるチャタリング抑止の検証', () => {
    // Target A: [100, 200] x [0, 40]
    // Target B: [200, 300] x [0, 40]
    const targetA = createContainer('target-a');
    const targetARect = createRect(100, 0, 100, 40);
    const targetB = createContainer('target-b');
    const targetBRect = createRect(200, 0, 100, 40);

    const droppableContainers = [targetA, targetB];
    const droppableRects = new Map<UniqueIdentifier, ClientRect>([
      ['target-a', targetARect],
      ['target-b', targetBRect],
    ]);

    const active = createContainer('active-chip');

    // Step 1: Active chip overlaps Target A by 50% (left 150, right 250 -> A: 50%, B: 50%)
    // Let's position active at [130, 230]:
    // A intersection: [130, 200] -> w=70, 70%
    // B intersection: [200, 230] -> w=30, 30%
    const rectStep1 = createRect(130, 0, 100, 40);
    const res1 = tagChipCollisionDetection({
      active,
      collisionRect: rectStep1,
      droppableContainers,
      droppableRects,
      pointerCoordinates: null,
    });

    expect(res1.length).toBe(2);
    expect(res1[0].id).toBe('target-a');
    expect(getLastActiveCollisionId()).toBe('target-a');

    // Step 2: Active shifts slightly towards B: [159, 259]
    // A intersection: [159, 200] -> w=41, overlap = 41%
    // B intersection: [200, 259] -> w=59, overlap = 59%? Wait!
    // We want a difference < epsilon (0.05):
    // If Active is at [151, 251]:
    // A intersection: [151, 200] -> w=49, overlap = 49%
    // B intersection: [200, 251] -> w=51, overlap = 51%
    // Difference is B(0.51) - A(0.49) = 0.02, which is < epsilon (0.05).
    // Because Target A was lastActiveCollisionId, Target A must be kept as top candidate!
    const rectStep2 = createRect(151, 0, 100, 40);
    const res2 = tagChipCollisionDetection({
      active,
      collisionRect: rectStep2,
      droppableContainers,
      droppableRects,
      pointerCoordinates: null,
    });

    expect(res2[0].id).toBe('target-a');
    expect(getLastActiveCollisionId()).toBe('target-a');

    // Step 3: Active shifts significantly towards B: [160, 260]
    // A intersection: [160, 200] -> w=40, overlap = 40%
    // B intersection: [200, 260] -> w=60, overlap = 60%
    // Difference is B(0.60) - A(0.40) = 0.20 > 0.05.
    // Now Target B should overcome hysteresis and win!
    const rectStep3 = createRect(160, 0, 100, 40);
    const res3 = tagChipCollisionDetection({
      active,
      collisionRect: rectStep3,
      droppableContainers,
      droppableRects,
      pointerCoordinates: null,
    });

    expect(res3[0].id).toBe('target-b');
    expect(getLastActiveCollisionId()).toBe('target-b');
  });

  it('完全に領域外へ出た場合に空配列 [] が返却され、履歴がリセットされること', () => {
    const target1 = createContainer('target-1');
    const target1Rect = createRect(100, 0, 100, 40);
    const droppableContainers = [target1];
    const droppableRects = new Map<UniqueIdentifier, ClientRect>([['target-1', target1Rect]]);
    const active = createContainer('active-chip');

    // First, cause a collision so lastActiveCollisionId is set
    tagChipCollisionDetection({
      active,
      collisionRect: createRect(100, 0, 100, 40),
      droppableContainers,
      droppableRects,
      pointerCoordinates: null,
    });
    expect(getLastActiveCollisionId()).toBe('target-1');

    // Move completely outside: [500, 600] x [0, 40]
    const outsideRect = createRect(500, 0, 100, 40);
    const collisions = tagChipCollisionDetection({
      active,
      collisionRect: outsideRect,
      droppableContainers,
      droppableRects,
      pointerCoordinates: { x: 550, y: 20 },
    });

    expect(collisions).toEqual([]);
    expect(getLastActiveCollisionId()).toBeNull();
  });

  it('active 自身や disabled なコンテナを無視すること', () => {
    const active = createContainer('chip-1');
    const disabled = createContainer('chip-disabled', true);
    const valid = createContainer('chip-valid');

    const rect = createRect(0, 0, 100, 40);
    const droppableRects = new Map<UniqueIdentifier, ClientRect>([
      ['chip-1', rect],
      ['chip-disabled', rect],
      ['chip-valid', rect],
    ]);

    const collisions = tagChipCollisionDetection({
      active,
      collisionRect: rect,
      droppableContainers: [active, disabled, valid],
      droppableRects,
      pointerCoordinates: null,
    });

    expect(collisions.length).toBe(1);
    expect(collisions[0].id).toBe('chip-valid');
  });

  it('collisionRect や droppableContainers が不正な場合は空配列を返却すること', () => {
    const valid = createContainer('chip-valid');
    const droppableRects = new Map<UniqueIdentifier, ClientRect>();

    expect(
      tagChipCollisionDetection({
        active: null,
        collisionRect: null,
        droppableContainers: [valid],
        droppableRects,
        pointerCoordinates: null,
      })
    ).toEqual([]);

    expect(
      tagChipCollisionDetection({
        active: null,
        collisionRect: createRect(0, 0, 100, 40),
        droppableContainers: [],
        droppableRects,
        pointerCoordinates: null,
      })
    ).toEqual([]);
  });

  it('カスタムオプションで閾値を変更できること', () => {
    const customDetection = createTagChipCollisionDetection({
      overlapThreshold: 0.50,
      epsilonHysteresis: 0.10,
    });

    const target = createContainer('target');
    const targetRect = createRect(100, 0, 100, 40);
    const droppableRects = new Map<UniqueIdentifier, ClientRect>([['target', targetRect]]);

    // 40% overlap (between default 20% and custom 50%)
    const activeRect = createRect(40, 0, 100, 40);
    const res = customDetection({
      active: null,
      collisionRect: activeRect,
      droppableContainers: [target],
      droppableRects,
      pointerCoordinates: null,
    });

    expect(res).toEqual([]);
  });

  it('CASE-RED-03: 横幅 40px の極小タグと横幅 400px の極長タグで、20%面積を満たさなくてもポインタ侵入または activeOverlap で即座に検知されること', () => {
    const longTarget = createContainer('long-target');
    const longTargetRect = createRect(100, 0, 400, 40);

    const active = createContainer('active-small');
    const activeRect = createRect(70, 0, 40, 40);

    const droppableContainers = [longTarget];
    const droppableRects = new Map<UniqueIdentifier, ClientRect>([['long-target', longTargetRect]]);

    const resOverlap = tagChipCollisionDetection({
      active,
      collisionRect: activeRect,
      droppableContainers,
      droppableRects,
      pointerCoordinates: null,
    });
    expect(resOverlap.length).toBe(1);
    expect(resOverlap[0].id).toBe('long-target');

    const resPointer = tagChipCollisionDetection({
      active,
      collisionRect: createRect(65, 0, 40, 40),
      droppableContainers,
      droppableRects,
      pointerCoordinates: { x: 102, y: 20 },
    });
    expect(resPointer.length).toBe(1);
    expect(resPointer[0].id).toBe('long-target');
    expect(resPointer[0].data?.isPointerInside).toBe(true);
  });
});
