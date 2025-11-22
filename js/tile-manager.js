import { TILE_WIDTH, TILE_HEIGHT, TILES_PER_PAGE } from "./constants.js";
import { state, setState, getState } from "./state.js";
import { tileStore } from "./store.js";
import { createCalibrator, loadImageElement, blobToDataURL } from "./calibrator.js";
import { filterAndRenderPalette, setActiveTile } from "./ui.js";
import { startGame, loadSavedPlacements, refreshSceneView } from "./scene.js";

const calibrator = createCalibrator();



export async function loadManifestTiles() {
  try {
    const existingTiles = await tileStore.getTiles();
    if (existingTiles.length > 0) {
      console.log('기존 타일이 있어서 manifest 로드를 건너뜀');
      return [];
    }

    const response = await fetch('manifest.json');
    if (!response.ok) {
      console.log('manifest.json을 찾을 수 없습니다 - 빈 상태로 시작');
      return [];
    }
    const manifest = await response.json();
    if (!manifest.tiles || !Array.isArray(manifest.tiles)) {
      console.warn('manifest.json에 tiles 배열이 없습니다');
      return [];
    }

    console.log('최초 로드: manifest 타일 로딩 중...', manifest.tiles.length, '개');
    for (const tile of manifest.tiles) {
      const imageUrl = tile.file;
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        console.warn(`이미지를 불러올 수 없습니다: ${imageUrl}`);
        continue;
      }
      const blob = await imageResponse.blob();
      const dataUrl = await blobToDataURL(blob);

      await tileStore.addTileWithKey({
        key: tile.key,
        label: tile.label,
        originY: tile.originY,
        dataUrl: dataUrl,
        displayScale: tile.displayScale ?? 1,
        gridWidth: tile.gridWidth ?? 1,
        gridHeight: tile.gridHeight ?? 1,
        group: tile.group ?? '기본', // Add group from manifest, default to '기본'
      });
    }

    console.log('manifest 타일 로딩 완료');
    return [];
  } catch (error) {
    console.error('manifest 로딩 중 오류:', error);
    return [];
  }
}

export async function loadPaletteAndStart() {
  const customTiles = await tileStore.getTiles();
  console.log("DB에서 로드한 커스텀 타일:", customTiles.length, "개");

  customTiles.forEach(tile => {
    if (!tile.imageBlob && !tile.dataUrl) {
      console.error("imageBlob과 dataUrl이 모두 비어있는 타일:", tile.key, tile.label);
    }
  });

  const runtimeUrls = getState('runtimeUrls');
  runtimeUrls.forEach((url) => URL.revokeObjectURL(url));
  runtimeUrls.clear();

  const builtInTiles = getState('builtInTiles');
  const allTiles = [...builtInTiles, ...customTiles].filter(tile => {
    if (tile.isCustom) {
      return tile.imageBlob || (tile.dataUrl && tile.dataUrl.length > 0);
    } else {
      return tile.url || tile.file;
    }
  });
  setState('palette', allTiles); // Set allTiles to palette
  console.log("타일 로드 완료:", allTiles.length, "개");

  const paletteContainer = document.getElementById("tile-palette");
  if (paletteContainer && !allTiles.length) {
    paletteContainer.textContent = "등록된 타일이 없습니다.";
    return;
  }

  allTiles.forEach((tile) => {
    tile.gridWidth = tile.gridWidth ?? 1;
    tile.gridHeight = tile.gridHeight ?? 1;
    tile.group = tile.group ?? '기본'; // Ensure all tiles have a group

    if (tile.isCustom) {
      if (tile.imageBlob) {
        // Use Blob directly
        const runtime = URL.createObjectURL(tile.imageBlob);
        tile.previewUrl = runtime;
        tile.runtimeUrl = runtime;
        runtimeUrls.set(tile.key, runtime);
      } else if (tile.dataUrl) {
        // Fallback to dataUrl for backward compatibility
        tile.previewUrl = tile.dataUrl;
        const blob = dataURLToBlob(tile.dataUrl);
        const runtime = URL.createObjectURL(blob);
        runtimeUrls.set(tile.key, runtime);
        tile.runtimeUrl = runtime;
      }
      tile.isSvg = false;
    } else {
      const url = tile.url || tile.file;
      tile.previewUrl = url;
      tile.runtimeUrl = url;
      tile.isSvg = url?.toLowerCase().endsWith(".svg");
    }
  });

  const tileDefinitions = new Map(allTiles.map((tile) => [tile.key, tile]));
  setState('tileDefinitions', tileDefinitions);

  let activeTileKey = getState('activeTileKey');
  if (!activeTileKey || !tileDefinitions.has(activeTileKey)) {
    activeTileKey = allTiles[0]?.key; // Use optional chaining in case allTiles is empty
    setState('activeTileKey', activeTileKey);
  }

  // Group-based tab management
  const tabsContainer = document.getElementById('palette-tabs');
  const actualPalette = document.getElementById('palette') || document.getElementById('tile-palette'); // Use 'palette' if it exists, fallback to 'tile-palette'

  if (tabsContainer && actualPalette) {
    const groups = [...new Set(allTiles.map(t => t.group || '기본'))];
    // '기본'이 항상 처음에 오도록 정렬
    groups.sort((a, b) => {
      if (a === '기본') return -1;
      if (b === '기본') return 1;
      return a.localeCompare(b);
    });

    let activeGroup = getState('activeTileGroup') || groups[0];
    if (!groups.includes(activeGroup)) {
      activeGroup = groups[0];
    }
    setState('activeTileGroup', activeGroup);

    const deleteGroup = async (groupToDelete) => {
      if (!confirm(`'${groupToDelete}' 탭과 포함된 모든 타일을 삭제하시겠습니까?\n(배치된 타일도 함께 삭제됩니다)`)) {
        return;
      }

      const tilesInGroup = allTiles.filter(t => t.group === groupToDelete);
      const placedTiles = getState('placedTiles');
      const spriteCache = getState('spriteCache');
      const keysToDelete = [];

      // Collect all placement keys to delete from DB
      for (const tile of tilesInGroup) {
        // Delete tile from store
        await tileStore.deleteTile(tile.key);

        // Remove all placements of this tile type
        placedTiles.forEach((placement, key) => {
          if (placement.tileKey === tile.key) {
            keysToDelete.push(key);

            // Remove sprite if this is a base tile
            if (placement.isBase) {
              const sprite = spriteCache.get(key);
              if (sprite) {
                sprite.destroy();
                spriteCache.delete(key);
              }
            }

            // Remove from placedTiles map
            placedTiles.delete(key);
          }
        });
      }

      // Delete all placements from DB
      if (keysToDelete.length > 0) {
        await tileStore.deletePlacements(keysToDelete);
      }

      // Update palette and re-render
      await loadPaletteAndStart();

      // If the deleted group was active, switch to '기본' or first available
      if (getState('activeTileGroup') === groupToDelete) {
        const newGroups = [...new Set(getState('palette').map(t => t.group || '기본'))];
        setState('activeTileGroup', newGroups[0] || '기본');
      }

      filterAndRenderPalette();

      // Refresh scene to update the view
      const game = getState('game');
      if (game) {
        const activeScene = game.scene.getAt(0);
        if (activeScene) {
          refreshSceneView(activeScene);
        }
      }
    };

    const renderTabs = () => {
      tabsContainer.innerHTML = '';
      groups.forEach(group => {
        const tab = document.createElement('div');
        tab.className = `palette-tab ${group === activeGroup ? 'active' : ''}`;
        tab.textContent = group;
        tab.onclick = () => {
          activeGroup = group;
          setState('activeTileGroup', activeGroup);
          setState('currentPage', 0); // Reset page number when switching tabs
          renderTabs();
          filterAndRenderPalette(); // Re-render palette based on new active group
        };

        // '기본'이 아닌 탭에는 삭제 버튼 추가
        if (group !== '기본') {
          const closeBtn = document.createElement('div');
          closeBtn.className = 'close-btn';
          closeBtn.innerHTML = '×';
          closeBtn.onclick = (e) => {
            e.stopPropagation();
            deleteGroup(group);
          };
          tab.appendChild(closeBtn);
        }

        tabsContainer.appendChild(tab);
      });
    };

    // Initial rendering
    renderTabs();
  }

  const game = getState('game');
  if (!game) {
    await startGame();
  } else {
    await registerMissingTextures();
  }

  // Render palette after textures are loaded
  filterAndRenderPalette();
}

export function setupUploader() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const labelInput = document.getElementById("upload-label");
  const status = document.getElementById("upload-status");
  const groupInput = document.getElementById("upload-group"); // New group input

  if (!dropZone || !fileInput) return;

  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  ["dragenter", "dragover"].forEach((evt) => {
    dropZone?.addEventListener(evt, (event) => {
      stop(event);
      dropZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropZone?.addEventListener(evt, (event) => {
      stop(event);
      dropZone.classList.remove("dragover");
    });
  });

  dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      handleUpload(file);
    }
  });

  dropZone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) {
      handleUpload(file);
      fileInput.value = "";
    }
  });

  async function handleUpload(file) {
    if (!file.type.includes("png")) {
      status.textContent = "PNG 파일만 업로드 가능합니다.";
      return;
    }
    const label = (labelInput?.value || file.name.replace(/\.png$/i, "")).trim();
    const group = (groupInput?.value || '커스텀').trim(); // Get group from input, default to '커스텀'
    const gridWidth = getState('selectedGridSize');
    const gridHeight = gridWidth;
    status.textContent = "이미지 준비...";

    try {
      const basePreview = await resizePngBlob(file, TILE_WIDTH * 4);
      status.textContent = "보정 준비...";
      const calibration = await calibrator.open(basePreview, gridWidth, gridHeight);

      const finalBlob = calibration?.blob || basePreview;
      const dataUrl = await blobToDataURL(finalBlob);

      const usedCalibration = !!calibration;
      const displayScale = usedCalibration ? 0.5 : 1;
      const heightScale = usedCalibration ? 2 : 1;

      const img = await loadImageElement(dataUrl);
      const diamondCenterFromBottom = TILE_HEIGHT * heightScale / 2;
      const calculatedOriginY = (img.height - diamondCenterFromBottom) / img.height;

      const savedTile = await tileStore.addTile({
        label,
        originY: calculatedOriginY,
        dataUrl,
        displayScale,
        gridWidth,
        gridHeight,
        group, // Save the group
      });
      status.textContent = "업로드 완료! 팔레트를 갱신합니다.";

      // Switch active group to the uploaded tile's group
      setState('activeTileGroup', group);

      await loadPaletteAndStart();

      status.textContent = "텍스처 로딩 중...";
      await registerMissingTextures();

      const filteredPalette = getState('filteredPalette');
      const tileIndex = filteredPalette.findIndex(t => t.key === savedTile.key);
      if (tileIndex >= 0) {
        const currentPage = Math.floor(tileIndex / TILES_PER_PAGE);
        setState('currentPage', currentPage);
        filterAndRenderPalette();
      }

      setActiveTile(savedTile.key);

      status.textContent = "새 타일이 추가되었습니다. 클릭하여 배치하세요!";
    } catch (error) {
      status.textContent = "업로드 실패: " + error;
    }
  }
}

export function setupExportButton() {
  const exportButton = document.getElementById("export-btn");
  if (!exportButton) return;
  exportButton.addEventListener("click", async () => {
    exportButton.disabled = true;
    const originalText = exportButton.textContent;
    exportButton.textContent = "내보내는 중...";
    try {
      await exportProject();
    } catch (error) {
      alert("내보내기 실패: " + error);
    } finally {
      exportButton.disabled = false;
      exportButton.textContent = originalText;
    }
  });
}

export async function clearAllData() {
  await tileStore.clearAll();

  setState('palette', []);
  getState('placedTiles').clear();

  const spriteCache = getState('spriteCache');
  spriteCache.forEach(sprite => sprite.destroy());
  spriteCache.clear();

  const runtimeUrls = getState('runtimeUrls');
  runtimeUrls.forEach(url => URL.revokeObjectURL(url));
  runtimeUrls.clear();
}

export function setupImportButton() {
  const importButton = document.getElementById("import-btn");
  if (!importButton) return;

  const modal = document.getElementById("import-modal");
  const urlInput = document.getElementById("import-url-input");
  const confirmBtn = document.getElementById("import-confirm");
  const cancelBtn = document.getElementById("import-cancel");
  const mergeCheckbox = document.getElementById("import-merge");

  importButton.addEventListener("click", () => {
    const baseUrl = `${window.location.protocol}//${window.location.host}/tilesets/`;
    urlInput.value = baseUrl;
    modal.classList.add("visible");

    // 타일셋 목록 불러오기 (디렉토리 파싱)
    const listContainer = document.getElementById("tileset-list");
    if (listContainer) {
      listContainer.innerHTML = '<div style="color: rgba(255,255,255,0.5); font-size: 0.85rem;">목록 불러오는 중...</div>';
      fetch('tilesets/?t=' + Date.now())
        .then(res => res.text())
        .then(html => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const links = Array.from(doc.querySelectorAll('a'));

          const allFiles = links
            .map(link => link.getAttribute('href'))
            .filter(Boolean)
            .map(href => {
              // URL 디코딩 및 파일명만 추출 (./gundams.png -> gundams.png)
              try {
                return decodeURIComponent(href).split('/').pop();
              } catch (e) {
                return href.split('/').pop();
              }
            })
            .filter(f => f && f !== '..' && f !== '.'); // 상위/현재 디렉토리 제외

          const zipFiles = allFiles.filter(f => f.toLowerCase().endsWith('.zip'));
          const imageFiles = new Set(allFiles.filter(f => /\.(png|jpg|jpeg)$/i.test(f)));

          const tilesets = zipFiles.map(zipFile => {
            const fileName = zipFile;
            const name = fileName.replace(/\.zip$/i, '');

            // 이미지 찾기: 같은 이름의 png, jpg, jpeg
            let imageFile = null;
            if (imageFiles.has(name + '.png')) imageFile = name + '.png';
            else if (imageFiles.has(name + '.jpg')) imageFile = name + '.jpg';
            else if (imageFiles.has(name + '.jpeg')) imageFile = name + '.jpeg';

            return {
              name: name,
              file: fileName,
              image: imageFile
            };
          });

          listContainer.innerHTML = '';
          if (tilesets.length > 0) {
            tilesets.forEach(ts => {
              const item = document.createElement('div');
              item.style.cssText = `
                display: flex;
                align-items: center;
                gap: 0.8rem;
                padding: 0.6rem;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
              `;

              let imageHtml = '';
              if (ts.image) {
                imageHtml = `<img src="tilesets/${ts.image}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 4px; background: rgba(0,0,0,0.2);" />`;
              } else {
                imageHtml = `<div style="width: 48px; height: 48px; border-radius: 4px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">📦</div>`;
              }

              item.innerHTML = `
                ${imageHtml}
                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${ts.name}</div>
                  <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${ts.file}</div>
                </div>
              `;
              item.onmouseover = () => {
                item.style.background = 'rgba(255,255,255,0.1)';
                item.style.borderColor = 'rgba(255,255,255,0.3)';
              };
              item.onmouseout = () => {
                item.style.background = 'rgba(255,255,255,0.05)';
                item.style.borderColor = 'rgba(255,255,255,0.1)';
              };
              item.onclick = () => {
                urlInput.value = `${baseUrl}${ts.file}`;
                // 시각적 피드백
                Array.from(listContainer.children).forEach(c => c.style.borderColor = 'rgba(255,255,255,0.1)');
                item.style.borderColor = '#ffe29a';
              };
              listContainer.appendChild(item);
            });
          } else {
            listContainer.innerHTML = '<div style="color: rgba(255,255,255,0.5); font-size: 0.85rem;">사용 가능한 타일셋이 없습니다.</div>';
          }
        })
        .catch(err => {
          console.error('타일셋 목록 로드 실패:', err);
          listContainer.innerHTML = '<div style="color: #ff7171; font-size: 0.85rem;">목록을 불러올 수 없습니다.</div>';
        });
    }

    setTimeout(() => {
      urlInput.focus();
      // urlInput.setSelectionRange(urlInput.value.length, urlInput.value.length);
    }, 100);
  });

  cancelBtn.addEventListener("click", () => {
    modal.classList.remove("visible");
  });

  confirmBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) return;

    modal.classList.remove("visible");

    importButton.disabled = true;
    const originalText = importButton.textContent;
    importButton.textContent = "추가하는 중...";
    try {
      // Always merge mode (do not delete existing data)
      // const shouldMerge = mergeCheckbox?.checked;
      // if (!shouldMerge) {
      //   await clearAllData();
      // }

      if (url.toLowerCase().endsWith('.zip')) {
        await importFromZipUrl(url);
      } else {
        await importFromUrl(url);
      }
      alert("타일셋이 추가되었습니다!");
    } catch (error) {
      alert("가져오기 실패: " + error.message);
    } finally {
      importButton.disabled = false;
      importButton.textContent = originalText;
    }
  });

  urlInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      confirmBtn.click();
    }
  });

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      modal.classList.remove("visible");
    }
  });
}

async function exportProject() {
  if (!window.JSZip) throw new Error("JSZip을 불러오지 못했습니다.");

  // Smart export: export only custom tiles that are currently placed
  const placedTiles = getState('placedTiles');
  const placedTileKeys = new Set(placedTiles.map(t => t.tileKey));

  const allStoredTiles = await tileStore.getTiles(); // Get all custom tiles from store

  const tilesToExport = allStoredTiles.filter(tile => placedTileKeys.has(tile.key));

  if (tilesToExport.length === 0) {
    alert("내보낼 커스텀 타일이 없습니다. (배치된 커스텀 타일만 내보내집니다)");
    return;
  }

  const zip = new JSZip();
  const manifest = {
    tiles: []
  };

  for (const tile of tilesToExport) {
    const ext = tile.isSvg ? ".svg" : ".png";
    const filename = `tiles/${tile.key}${ext}`;
    const blob = dataURLToBlob(tile.dataUrl); // Assuming custom tiles have dataUrl
    zip.file(filename, blob);

    manifest.tiles.push({
      key: tile.key,
      label: tile.label,
      originY: tile.originY,
      displayScale: tile.displayScale,
      gridWidth: tile.gridWidth ?? 1,
      gridHeight: tile.gridHeight ?? 1,
      group: tile.group ?? '커스텀', // Include group information
      file: filename,
    });
  }

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `TowniVerse-${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importFromZipUrl(zipUrl) {
  if (!window.JSZip) throw new Error("JSZip을 불러오지 못했습니다.");

  console.log('Fetching ZIP from:', zipUrl);

  const response = await fetch(zipUrl);
  if (!response.ok) {
    throw new Error(`ZIP 파일을 불러올 수 없습니다 (${response.status})`);
  }

  const zipBlob = await response.blob();
  const zip = await JSZip.loadAsync(zipBlob);

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('ZIP 파일에 manifest.json이 없습니다');
  }

  const manifestText = await manifestFile.async('text');
  const manifest = JSON.parse(manifestText);

  if (!manifest.tiles || !Array.isArray(manifest.tiles)) {
    throw new Error('잘못된 manifest 형식입니다');
  }

  const existingTiles = await tileStore.getTiles();
  const existingLabels = new Set(existingTiles.map(t => t.label));

  let importedCount = 0;
  let skippedCount = 0;
  // 타일셋 이름을 기본 그룹명으로 사용
  const tilesetName = zipUrl.split('/').pop().replace(/\.zip$/i, '');
  let importedGroup = tilesetName;

  for (const tileEntry of manifest.tiles) {
    try {
      if (existingLabels.has(tileEntry.label)) {
        console.log(`타일 건너뛰기 (이미 존재함): ${tileEntry.label}`);
        skippedCount++;
        continue;
      }

      const imageFile = zip.file(tileEntry.file);
      if (!imageFile) {
        console.warn(`이미지 파일을 찾을 수 없습니다: ${tileEntry.file}`);
        continue;
      }

      // Determine MIME type from file extension
      const ext = tileEntry.file.split('.').pop().toLowerCase();
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';

      // Read as Uint8Array and create Blob with correct MIME type
      const imageArray = await imageFile.async('uint8array');
      const imageBlob = new Blob([imageArray], { type: mimeType });
      const dataUrl = await blobToDataURL(imageBlob);

      if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        console.error(`Invalid dataUrl generated for ${tileEntry.label}:`, dataUrl ? dataUrl.substring(0, 50) : dataUrl);
        continue;
      }

      // 실제 저장될 그룹명 결정
      importedGroup = tileEntry.group || tilesetName;

      await tileStore.addTileWithKey({
        key: tileEntry.key,
        label: tileEntry.label,
        originY: tileEntry.originY,
        dataUrl: dataUrl,
        displayScale: tileEntry.displayScale ?? 1,
        gridWidth: tileEntry.gridWidth ?? 1,
        gridHeight: tileEntry.gridHeight ?? 1,
        group: importedGroup
      });

      importedCount++;
    } catch (error) {
      console.error(`타일 가져오기 실패 (${tileEntry.label}):`, error);
    }
  }

  console.log(`가져오기 완료: ${importedCount}개 추가, ${skippedCount}개 건너뜀`);

  if (importedCount === 0) {
    throw new Error('가져온 타일이 없습니다');
  }

  // Wait a bit to ensure IndexedDB transaction is fully committed
  await new Promise(resolve => setTimeout(resolve, 100));

  // Switch active group to the actual imported group
  setState('activeTileGroup', importedGroup);

  await loadPaletteAndStart(); // This already calls registerMissingTextures internally
  await loadSavedPlacements();
}

async function importFromUrl(baseUrl) {
  const normalizedUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const manifestUrl = normalizedUrl + 'manifest.json';
  console.log('Fetching manifest from:', manifestUrl);

  let manifestResponse;
  try {
    manifestResponse = await fetch(manifestUrl);
  } catch (error) {
    throw new Error(`네트워크 오류: ${error.message}\n\nCORS 설정을 확인하거나 로컬 서버를 사용하세요.`);
  }

  if (!manifestResponse.ok) {
    throw new Error(`manifest.json을 찾을 수 없습니다 (${manifestResponse.status})\n\nURL: ${manifestUrl}\n\n확인사항:\n- URL이 정확한가요?\n- manifest.json 파일이 해당 위치에 있나요?\n- 서버의 CORS 설정이 되어있나요?`);
  }

  const manifest = await manifestResponse.json();
  if (!manifest.tiles || !Array.isArray(manifest.tiles)) {
    throw new Error('잘못된 manifest 형식입니다');
  }

  const existingTiles = await tileStore.getTiles();
  const existingLabels = new Set(existingTiles.map(t => t.label));

  let importedCount = 0;
  let skippedCount = 0;
  for (const tileEntry of manifest.tiles) {
    try {
      if (existingLabels.has(tileEntry.label)) {
        console.log(`타일 건너뛰기 (이미 존재함): ${tileEntry.label}`);
        skippedCount++;
        continue;
      }

      const imageUrl = normalizedUrl + tileEntry.file;
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        console.warn(`이미지를 불러올 수 없습니다: ${imageUrl}`);
        continue;
      }

      const blob = await imageResponse.blob();
      const dataUrl = await blobToDataURL(blob);

      await tileStore.addTileWithKey({
        key: tileEntry.key,
        label: tileEntry.label,
        originY: tileEntry.originY,
        dataUrl: dataUrl,
        displayScale: tileEntry.displayScale ?? 1,
        gridWidth: tileEntry.gridWidth ?? 1,
        gridHeight: tileEntry.gridHeight ?? 1,
      });

      importedCount++;
    } catch (error) {
      console.error(`타일 가져오기 실패 (${tileEntry.label}):`, error);
    }
  }

  console.log(`가져오기 완료: ${importedCount}개 추가, ${skippedCount}개 건너뜀`);

  if (importedCount === 0) {
    throw new Error('가져온 타일이 없습니다');
  }

  await loadPaletteAndStart();
  await registerMissingTextures();
  await loadSavedPlacements();
}

async function getTileBlob(tile) {
  if (tile.isCustom && tile.dataUrl) {
    return dataURLToBlob(tile.dataUrl);
  }
  const response = await fetch(tile.runtimeUrl || tile.url);
  if (!response.ok) throw new Error(`파일을 읽을 수 없습니다: ${tile.url}`);
  return await response.blob();
}

async function resizePngBlob(file, targetWidth) {
  const bitmap = await createImageBitmap(file);
  const ratio = targetWidth / bitmap.width;
  const targetHeight = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("리사이즈 실패"));
    }, "image/png");
  });
}

function dataURLToBlob(dataUrl) {
  const [meta, content] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] || "image/png";
  const binary = atob(content);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

export async function registerMissingTextures() {
  const game = getState('game');
  if (!game) return;
  const palette = getState('palette');
  const promises = [];

  palette.forEach((tile) => {
    if (game.textures.exists(tile.key)) {
      tile.loaded = true;
      return;
    }
    if (tile.isCustom) {
      if (!tile.dataUrl) {
        // console.warn("Skipping custom tile with missing dataUrl:", tile.key);
        return;
      }

      promises.push(
        new Promise(async (resolve) => {
          try {
            const dataUrl = tile.dataUrl;

            if (!dataUrl.startsWith('data:image/')) {
              console.error("Invalid dataUrl format for tile:", tile.key);
              resolve();
              return;
            }

            // Create an image element to preload the image
            const img = new Image();
            img.onload = () => {
              // Once image is loaded, add it to Phaser
              const onTextureAdded = (key) => {
                if (key === tile.key) {
                  tile.loaded = true;
                  game.textures.off('addtexture', onTextureAdded);
                  resolve();
                }
              };
              game.textures.on('addtexture', onTextureAdded);

              game.textures.addBase64(tile.key, dataUrl);

              // Check if it was added synchronously
              setTimeout(() => {
                if (game.textures.exists(tile.key)) {
                  tile.loaded = true;
                  game.textures.off('addtexture', onTextureAdded);
                  resolve();
                } else {
                  // Wait a bit more
                  setTimeout(() => {
                    if (game.textures.exists(tile.key)) {
                      tile.loaded = true;
                    }
                    game.textures.off('addtexture', onTextureAdded);
                    resolve();
                  }, 1000);
                }
              }, 100);
            };
            img.onerror = () => {
              console.error("Failed to load image for tile:", tile.key);
              resolve();
            };
            img.src = dataUrl;
          } catch (error) {
            console.error("Error loading texture:", tile.key, error);
            resolve();
          }
        })
      );
    } else if (tile.runtimeUrl || tile.url) {
      const source = tile.runtimeUrl || tile.url;
      promises.push(
        fetchAsDataURL(source).then((dataUrl) => {
          return new Promise((resolve) => {
            try {
              const onTextureAdded = (key) => {
                if (key === tile.key) {
                  tile.loaded = true;
                  game.textures.off('addtexture', onTextureAdded);
                  resolve();
                }
              };
              game.textures.on('addtexture', onTextureAdded);

              game.textures.addBase64(tile.key, dataUrl);

              // Check immediately in case it was synchronous or already exists
              if (game.textures.exists(tile.key)) {
                tile.loaded = true;
                game.textures.off('addtexture', onTextureAdded);
                resolve();
              }

              setTimeout(() => {
                if (!tile.loaded) {
                  if (game.textures.exists(tile.key)) {
                    tile.loaded = true;
                    resolve();
                  } else {
                    // Force resolve to avoid hanging, but log warning
                    console.warn("Texture load timeout:", tile.key);
                    resolve();
                  }
                  game.textures.off('addtexture', onTextureAdded);
                }
              }, 2000); // Increased timeout
            } catch (error) {
              console.error("Error loading texture:", tile.key, error);
              resolve();
            }
          });
        }).catch((error) => {
          console.error("Error fetching texture:", tile.key, error);
        })
      );
    }
  });
  await Promise.all(promises);

  // Check loaded status
  const loadedCount = palette.filter(t => t.loaded).length;
  console.log(`텍스처 로드 완료: ${loadedCount}/${palette.length}개 로드됨`);

  palette.forEach(tile => {
    if (!tile.loaded) {
      console.warn(`텍스처 로드 실패:`, tile.key);
    }
  });

  // Refresh the scene to render newly loaded textures
  if (game) {
    const activeScene = game.scene.getAt(0);
    if (activeScene) {
      refreshSceneView(activeScene);
    }
  }
}

async function fetchAsDataURL(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("텍스처를 불러오지 못했습니다: " + url);
  const blob = await response.blob();
  return await blobToDataURL(blob);
}
