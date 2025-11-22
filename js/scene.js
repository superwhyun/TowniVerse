import { TILE_WIDTH, TILE_HEIGHT, WORLD_BOUNDS, GRID_BUFFER } from "./constants.js";
import { state, getState, setState } from "./state.js";
import { tileStore } from "./store.js";
import {
  diamondPoints,
  gridToScreen,
  screenToGrid,
  getPlacementBase,
  getVisibleBounds,
  isWithinBounds
} from "./grid.js";

export async function loadSavedPlacements() {
  try {
    const placements = await tileStore.getPlacements();
    const tileDefinitions = getState('tileDefinitions');
    const placedTiles = getState('placedTiles');

    const tileGroups = new Map();

    placements.forEach(({ key, tileKey, col, row }) => {
      if (!tileGroups.has(tileKey)) {
        tileGroups.set(tileKey, []);
      }
      tileGroups.get(tileKey).push({ key, col, row });
    });

    const processedCells = new Set();

    placements.forEach(({ key, tileKey, col, row }) => {
      if (processedCells.has(key)) return;

      const tileDef = tileDefinitions.get(tileKey);
      const gridWidth = tileDef?.gridWidth || 1;
      const gridHeight = tileDef?.gridHeight || 1;

      const connectedCells = [];
      for (let r = 0; r < gridHeight; r++) {
        for (let c = 0; c < gridWidth; c++) {
          const testKey = `${col + c}-${row + r}`;
          const testPlacement = placements.find(p => p.key === testKey && p.tileKey === tileKey);
          if (testPlacement) {
            connectedCells.push(testPlacement);
          }
        }
      }

      if (connectedCells.length === gridWidth * gridHeight) {
        const baseCol = col;
        const baseRow = row;

        connectedCells.forEach(({ key: cellKey, col: cellCol, row: cellRow }) => {
          processedCells.add(cellKey);
          placedTiles.set(cellKey, {
            tileKey,
            grid: { col: cellCol, row: cellRow },
            isBase: cellCol === baseCol && cellRow === baseRow,
            baseCol,
            baseRow,
            gridWidth,
            gridHeight,
          });
        });
      }
    });

    console.log(`Loaded ${placements.length} placements from storage`);

    const game = getState('game');
    if (game) {
      const activeScene = game.scene.getAt(0);
      if (activeScene) {
        refreshSceneView(activeScene);
      }
    }
  } catch (error) {
    console.error("Failed to load placements:", error);
  }
}

export function startGame() {
  const game = getState('game');
  if (game) {
    return;
  }

  const scene = {
    preload: preloadScene,
    create: createScene,
    update: updateScene,
  };

  const config = {
    type: Phaser.AUTO,
    parent: "game-wrapper",
    width: 1600,
    height: 900,
    backgroundColor: "rgba(0,0,0,0)",
    transparent: true,
    scene,
    pixelArt: true,
    scale: {
      parent: "game-wrapper",
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
    },
  };
  const newGame = new Phaser.Game(config);
  setState('game', newGame);
}

export function preloadScene() {
  const palette = getState('palette');
  palette.forEach((tile) => {
    const textureScale = tile.textureScale ?? tile.scale ?? 1;
    const assetUrl = tile.runtimeUrl;
    if (tile.isSvg && this.load.svg) {
      this.load.svg(tile.key, assetUrl, { scale: textureScale });
    } else {
      this.load.image(tile.key, assetUrl);
    }
  });
}

export function createScene() {
  this.cameras.main.setBounds(
    -WORLD_BOUNDS,
    -WORLD_BOUNDS,
    WORLD_BOUNDS * 2,
    WORLD_BOUNDS * 2
  );
  this.cameras.main.setZoom(1);
  this.cameras.main.setBackgroundColor("rgba(0,0,0,0)");
  this.cameras.main.centerOn(0, 0);

  this.gridGraphics = this.add.graphics();
  this.gridGraphics.setDepth(-1000);
  this.previewGraphics = this.add.graphics();
  this.previewGraphics.setDepth(10000);

  const palette = getState('palette');
  palette.forEach((tile) => {
    if (this.textures.exists(tile.key)) {
      tile.loaded = true;
    }
  });

  let resizeDebounceTimer = null;
  this.scale.on("resize", () => {
    if (resizeDebounceTimer) {
      clearTimeout(resizeDebounceTimer);
    }
    resizeDebounceTimer = setTimeout(() => {
      refreshSceneView(this);
      updateDepths(this.cameras.main);
      resizeDebounceTimer = null;
    }, 100);
  });

  this.cursors = this.input.keyboard.createCursorKeys();

  this.input.on("wheel", (pointer, gameObjects, deltaX, deltaY, deltaZ, event) => {
    const cam = this.cameras.main;
    const zoomAmount = deltaY > 0 ? -0.02 : 0.02;
    const newZoom = Phaser.Math.Clamp(cam.zoom + zoomAmount, 0.3, 3);
    cam.setZoom(newZoom);
    refreshSceneView(this);
    updateDepths(cam);
    event?.preventDefault();
  });

  this.isDragging = false;
  this.dragStartX = 0;
  this.dragStartY = 0;

  this.input.on("pointerdown", (pointer) => {
    if (pointer.leftButtonDown()) {
      this.isDragging = true;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
    }
  });

  this.input.on("pointerup", (pointer) => {
    this.isDragging = false;
  });

  this.input.on("pointermove", (pointer) => {
    if (this.isDragging) {
      const cam = this.cameras.main;
      const deltaX = (pointer.x - this.dragStartX) / cam.zoom;
      const deltaY = (pointer.y - this.dragStartY) / cam.zoom;
      cam.scrollX -= deltaX;
      cam.scrollY -= deltaY;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      refreshSceneView(this);
      updateDepths(cam);
      return;
    }

    const activeTileKey = getState('activeTileKey');
    if (!activeTileKey) {
      this.previewGraphics.clear();
      return;
    }
    const worldPoint = pointer.positionToCamera(this.cameras.main);
    const gridPoint = screenToGrid(worldPoint.x, worldPoint.y);
    if (!gridPoint) {
      this.previewGraphics.clear();
      return;
    }

    const tileDefinitions = getState('tileDefinitions');
    const tileDef = tileDefinitions.get(activeTileKey);
    if (!tileDef) return;

    const gridWidth = tileDef.gridWidth || 1;
    const gridHeight = tileDef.gridHeight || 1;
    const { baseCol, baseRow } = getPlacementBase(
      gridPoint.col,
      gridPoint.row,
      gridWidth,
      gridHeight
    );

    this.previewGraphics.clear();
    this.previewGraphics.lineStyle(3, 0xff0000, 0.8);

    for (let r = 0; r < gridHeight; r++) {
      for (let c = 0; c < gridWidth; c++) {
        const pos = gridToScreen(baseCol + c, baseRow + r);
        const diamond = [
          { x: pos.x, y: pos.y - TILE_HEIGHT / 2 },
          { x: pos.x + TILE_WIDTH / 2, y: pos.y },
          { x: pos.x, y: pos.y + TILE_HEIGHT / 2 },
          { x: pos.x - TILE_WIDTH / 2, y: pos.y },
        ];
        this.previewGraphics.beginPath();
        this.previewGraphics.moveTo(diamond[0].x, diamond[0].y);
        for (let i = 1; i < diamond.length; i++) {
          this.previewGraphics.lineTo(diamond[i].x, diamond[i].y);
        }
        this.previewGraphics.closePath();
        this.previewGraphics.strokePath();
      }
    }
  });

  this.clickStartTime = 0;
  this.clickStartPos = { x: 0, y: 0 };

  this.input.on("pointerdown", async (pointer) => {
    if (pointer.leftButtonDown()) {
      this.clickStartTime = Date.now();
      this.clickStartPos = { x: pointer.x, y: pointer.y };
    }
  });

  this.input.on("pointerup", async (pointer) => {
    const worldPoint = pointer.positionToCamera(this.cameras.main);
    const gridPoint = screenToGrid(worldPoint.x, worldPoint.y);

    if (pointer.leftButtonReleased()) {
      const clickDuration = Date.now() - this.clickStartTime;
      const distance = Phaser.Math.Distance.Between(
        this.clickStartPos.x, this.clickStartPos.y,
        pointer.x, pointer.y
      );

      if (clickDuration < 200 && distance < 5 && gridPoint) {
        const activeTileKey = getState('activeTileKey');
        if (!activeTileKey) return;

        const tileDefinitions = getState('tileDefinitions');
        const tileDef = tileDefinitions.get(activeTileKey);
        if (!tileDef) return;

        const gridWidth = tileDef.gridWidth || 1;
        const gridHeight = tileDef.gridHeight || 1;
        const { baseCol, baseRow } = getPlacementBase(
          gridPoint.col,
          gridPoint.row,
          gridWidth,
          gridHeight
        );
        const baseKey = `${baseCol}-${baseRow}`;

        const placedTiles = getState('placedTiles');
        const spriteCache = getState('spriteCache');
        const existing = placedTiles.get(baseKey);

        if (existing && existing.tileKey === activeTileKey && existing.isBase) {
          const gw = existing.gridWidth || 1;
          const gh = existing.gridHeight || 1;
          for (let r = 0; r < gh; r++) {
            for (let c = 0; c < gw; c++) {
              const key = `${baseCol + c}-${baseRow + r}`;
              placedTiles.delete(key);
              await tileStore.deletePlacement(key);
            }
          }
          const sprite = spriteCache.get(baseKey);
          if (sprite) {
            sprite.destroy();
            spriteCache.delete(baseKey);
          }
          refreshSceneView(this);
          return;
        }

        for (let r = 0; r < gridHeight; r++) {
          for (let c = 0; c < gridWidth; c++) {
            const key = `${baseCol + c}-${baseRow + r}`;
            if (placedTiles.has(key)) {
              console.log("충돌: 이미 타일이 배치되어 있습니다.");
              return;
            }
          }
        }

        // 일괄 저장을 위한 배열
        const placementsToSave = [];

        for (let r = 0; r < gridHeight; r++) {
          for (let c = 0; c < gridWidth; c++) {
            const key = `${baseCol + c}-${baseRow + r}`;
            placedTiles.set(key, {
              tileKey: activeTileKey,
              grid: { col: baseCol + c, row: baseRow + r },
              isBase: r === 0 && c === 0,
              baseCol,
              baseRow,
              gridWidth,
              gridHeight,
            });
            placementsToSave.push({
              key,
              tileKey: activeTileKey,
              col: baseCol + c,
              row: baseRow + r
            });
          }
        }

        // 트랜잭션 최적화: 한 번에 저장
        await tileStore.savePlacements(placementsToSave);

        refreshSceneView(this);
      }
    }

    if (pointer.rightButtonReleased() && gridPoint) {
      const clickedKey = `${gridPoint.col}-${gridPoint.row}`;
      const placedTiles = getState('placedTiles');
      const clickedTile = placedTiles.get(clickedKey);

      if (clickedTile) {
        const baseKey = `${clickedTile.baseCol}-${clickedTile.baseRow}`;
        const baseTile = placedTiles.get(baseKey);

        if (baseTile) {
          const gw = baseTile.gridWidth || 1;
          const gh = baseTile.gridHeight || 1;
          const spriteCache = getState('spriteCache');

          // 일괄 삭제를 위한 키 배열
          const keysToDelete = [];

          for (let r = 0; r < gh; r++) {
            for (let c = 0; c < gw; c++) {
              const key = `${clickedTile.baseCol + c}-${clickedTile.baseRow + r}`;
              placedTiles.delete(key);
              keysToDelete.push(key);
            }
          }

          // 트랜잭션 최적화: 한 번에 삭제
          await tileStore.deletePlacements(keysToDelete);

          const sprite = spriteCache.get(baseKey);
          if (sprite) {
            sprite.destroy();
            spriteCache.delete(baseKey);
          }

          refreshSceneView(this);
        }
      }
    }
  });

  this.input.mouse.disableContextMenu();

  refreshSceneView(this);
}

export function updateScene(_, delta) {
  if (!this.cursors) return;
  const cam = this.cameras.main;
  const speed = 0.25 * delta;
  let moved = false;

  if (this.cursors.left.isDown) {
    cam.scrollX -= speed;
    moved = true;
  } else if (this.cursors.right.isDown) {
    cam.scrollX += speed;
    moved = true;
  }

  if (this.cursors.up.isDown) {
    cam.scrollY -= speed;
    moved = true;
  } else if (this.cursors.down.isDown) {
    cam.scrollY += speed;
    moved = true;
  }

  if (moved) {
    refreshSceneView(this);
    updateDepths(cam);
  }
}

export function refreshSceneView(scene) {
  const bounds = getVisibleBounds(scene.cameras.main, GRID_BUFFER);
  drawWireGrid(scene, bounds);
  syncVisibleTiles(scene, bounds);
}

function updateDepths(camera) {
  const offset = camera.scrollY;
  const spriteCache = getState('spriteCache');
  spriteCache.forEach((sprite) => {
    sprite.setDepth(sprite.y - offset);
  });
}

function syncVisibleTiles(scene, bounds) {
  const spriteCache = getState('spriteCache');
  const placedTiles = getState('placedTiles');
  const tileDefinitions = getState('tileDefinitions');

  spriteCache.forEach((sprite, key) => {
    const data = placedTiles.get(key);
    if (!data || !data.isBase || !isWithinBounds(data.grid, bounds)) {
      sprite.destroy();
      spriteCache.delete(key);
    }
  });

  placedTiles.forEach((data, key) => {
    if (!data.isBase) return;
    if (!isWithinBounds(data.grid, bounds)) return;

    if (!tileDefinitions.get(data.tileKey)?.loaded) {
      return;
    }

    let sprite = spriteCache.get(key);
    if (!sprite) {
      const tileDef = tileDefinitions.get(data.tileKey);
      if (!tileDef) return;

      const gridWidth = data.gridWidth || 1;
      const gridHeight = data.gridHeight || 1;
      const baseCol = data.baseCol ?? data.grid.col;
      const baseRow = data.baseRow ?? data.grid.row;

      const rowAdjustment = (gridWidth === 2 && gridHeight === 2) ? 0.75 : 0;
      const colAdjustment = (gridWidth === 2 && gridHeight === 2) ? -0.75 : 0;

      const bottomLeft = gridToScreen(baseCol, baseRow + gridHeight - 1 + rowAdjustment);
      const bottomRight = gridToScreen(
        baseCol + gridWidth - 1 + rowAdjustment,
        baseRow + gridHeight - 1 + colAdjustment
      );
      const world = {
        x: (bottomLeft.x + bottomRight.x) / 2,
        y: (bottomLeft.y + bottomRight.y) / 2,
      };
      sprite = scene.add.image(world.x, world.y, data.tileKey);
      sprite.setOrigin(0.5, tileDef.originY ?? 0.5);
      const targetWidth = tileDef.fitWidth ?? TILE_WIDTH;
      const autoScale = sprite.width ? targetWidth / sprite.width : 1;
      const scale = tileDef.displayScale ?? autoScale;
      if (scale && Math.abs(scale - 1) > 0.001) {
        sprite.setScale(scale);
      }
      spriteCache.set(key, sprite);
      sprite.setDepth(sprite.y - scene.cameras.main.scrollY);
    }
  });
}

function drawWireGrid(scene, bounds) {
  if (!scene.gridGraphics) return;
  scene.gridGraphics.clear();

  const placedTiles = getState('placedTiles');

  for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
    for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
      const center = gridToScreen(col, row);
      const diamond = diamondPoints(center.x, center.y);

      const cellKey = `${col}-${row}`;
      const isPlaced = placedTiles.has(cellKey);

      if (isPlaced) {
        scene.gridGraphics.fillStyle(0xffffff, 0.15);
        scene.gridGraphics.fillPoints(diamond, true);
      }

      scene.gridGraphics.lineStyle(1.5, 0xffffff, 0.22);
      scene.gridGraphics.strokePoints(diamond, true);
    }
  }
}
