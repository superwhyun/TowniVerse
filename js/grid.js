import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT, gridOrigin } from "./constants.js";

/**
 * 다이아몬드 모양의 격자 꼭짓점 반환
 */
export function diamondPoints(x, y) {
  return diamondPointsScaled(x, y);
}

/**
 * 크기가 조정된 다이아몬드 꼭짓점 반환
 */
export function diamondPointsScaled(x, y, width = TILE_WIDTH, height = TILE_HEIGHT) {
  return [
    new Phaser.Math.Vector2(x, y - height / 2),
    new Phaser.Math.Vector2(x + width / 2, y),
    new Phaser.Math.Vector2(x, y + height / 2),
    new Phaser.Math.Vector2(x - width / 2, y),
  ];
}

/**
 * 그리드 좌표를 화면 좌표로 변환
 */
export function gridToScreen(col, row) {
  return {
    x: gridOrigin.x + (col - row) * (TILE_WIDTH / 2),
    y: gridOrigin.y + (col + row) * (TILE_HEIGHT / 2),
  };
}

// 재사용 가능한 폴리곤 객체 (성능 최적화)
const reusablePolygon = new Phaser.Geom.Polygon();

/**
 * 화면 좌표를 그리드 좌표로 변환 (반올림)
 */
export function screenToGrid(x, y) {
  const grid = screenToGridFloat(x, y);
  const col = Math.round(grid.col);
  const row = Math.round(grid.row);

  const world = gridToScreen(col, row);
  const diamond = diamondPoints(world.x, world.y);

  reusablePolygon.setTo(diamond);

  if (!Phaser.Geom.Polygon.Contains(reusablePolygon, x, y)) {
    return null;
  }
  return { col, row };
}

/**
 * 화면 좌표를 그리드 좌표로 변환 (소수점)
 */
export function screenToGridFloat(x, y) {
  const cx = x - gridOrigin.x;
  const cy = y - gridOrigin.y;
  const col = (cx / (TILE_WIDTH / 2) + cy / (TILE_HEIGHT / 2)) / 2;
  const row = (cy / (TILE_HEIGHT / 2) - cx / (TILE_WIDTH / 2)) / 2;
  return { col, row };
}

/**
 * 배치할 타일의 기준점(좌상단) 계산
 */
export function getPlacementBase(anchorCol, anchorRow, gridWidth = 1, gridHeight = 1) {
  const safeWidth = Math.max(1, gridWidth);
  const safeHeight = Math.max(1, gridHeight);
  const baseRow = anchorRow - (safeHeight - 1);
  const baseCol = anchorCol - Math.round((safeWidth - 1) / 2);
  return { baseCol, baseRow };
}

/**
 * 카메라 뷰포트 내 보이는 그리드 범위 계산
 */
export function getVisibleBounds(camera, padding = 0) {
  const view = camera.worldView;
  const corners = [
    { x: view.left, y: view.top },
    { x: view.right, y: view.top },
    { x: view.right, y: view.bottom },
    { x: view.left, y: view.bottom },
  ];
  const cols = [];
  const rows = [];
  corners.forEach((corner) => {
    const grid = screenToGridFloat(corner.x, corner.y);
    cols.push(grid.col);
    rows.push(grid.row);
  });

  const minCol = Math.floor(Math.min(...cols)) - padding;
  const maxCol = Math.ceil(Math.max(...cols)) + padding;
  const minRow = Math.floor(Math.min(...rows)) - padding;
  const maxRow = Math.ceil(Math.max(...rows)) + padding;
  return { minCol, maxCol, minRow, maxRow };
}

/**
 * 그리드 좌표가 범위 내에 있는지 확인
 */
export function isWithinBounds(grid, bounds) {
  return (
    grid.col >= bounds.minCol &&
    grid.col <= bounds.maxCol &&
    grid.row >= bounds.minRow &&
    grid.row <= bounds.maxRow
  );
}
