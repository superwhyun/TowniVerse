import { TILES_PER_PAGE } from "./constants.js";
import { state, setState, getState } from "./state.js";
import { tileStore } from "./store.js";
import { loadPaletteAndStart } from "./tile-manager.js";

/**
 * 타일 팔레트 이벤트 설정
 */
export function setupPalette() {
  const paletteContainer = document.getElementById("palette");
  if (!paletteContainer) return;

  paletteContainer.addEventListener("click", (event) => {
    const button = event.target.closest(".tile-swatch");
    if (!button) return;
    setActiveTile(button.dataset.tileKey);
  });
}

/**
 * 타일 팔레트 렌더링
 */
export function renderPalette() {
  const paletteContainer = document.getElementById("palette");
  if (!paletteContainer) return;
  paletteContainer.innerHTML = "";

  const currentPage = getState('currentPage');
  const filteredPalette = getState('filteredPalette');
  const activeTileKey = getState('activeTileKey');
  const searchQuery = getState('searchQuery');

  const startIdx = currentPage * TILES_PER_PAGE;
  const endIdx = startIdx + TILES_PER_PAGE;
  const tilesToShow = filteredPalette.slice(startIdx, endIdx);

  if (tilesToShow.length === 0) {
    paletteContainer.textContent = searchQuery ? "검색 결과가 없습니다." : "등록된 타일이 없습니다.";
    return;
  }

  tilesToShow.forEach((tile) => {
    const button = document.createElement("button");
    button.className = "tile-swatch" + (tile.key === activeTileKey ? " active" : "");
    button.type = "button";
    button.dataset.tileKey = tile.key;

    const preview = document.createElement("img");
    preview.src = tile.previewUrl;
    preview.alt = tile.label;
    preview.loading = "lazy";
    preview.decoding = "async";
    preview.draggable = false;

    button.appendChild(preview);

    const sizeLabel = document.createElement("span");
    sizeLabel.className = "tile-size";
    const gridWidth = tile.gridWidth || 1;
    const gridHeight = tile.gridHeight || 1;
    const size = gridWidth; // 1x1 -> "1", 2x2 -> "2"
    sizeLabel.textContent = size.toString();
    sizeLabel.dataset.size = size.toString();
    button.appendChild(sizeLabel);

    if (tile.isCustom) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "tile-remove";
      removeBtn.textContent = "×";
      removeBtn.title = "타일 삭제";
      removeBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        await tileStore.deleteTile(tile.key);
        if (activeTileKey === tile.key) {
          const palette = getState('palette');
          setState('activeTileKey', palette[0]?.key || null);
        }
        await loadPaletteAndStart();
      });
      button.appendChild(removeBtn);
    }
    paletteContainer.appendChild(button);
  });
}

/**
 * 활성 타일 설정
 */
export function setActiveTile(tileKey) {
  const tileDefinitions = getState('tileDefinitions');
  if (!tileDefinitions.has(tileKey)) return;
  setState('activeTileKey', tileKey);
  document
    .querySelectorAll(".tile-swatch")
    .forEach((el) => el.classList.toggle("active", el.dataset.tileKey === tileKey));
}

/**
 * 타일 필터링 및 렌더링
 */
export function filterAndRenderPalette() {
  const searchQuery = getState('searchQuery');
  const palette = getState('palette');

  const activeGroup = getState('activeTileGroup') || '기본';

  // 1. 그룹 필터링
  let filteredByGroup = palette.filter(tile => (tile.group || '기본') === activeGroup);

  // 2. 검색 필터링
  let filteredPalette;
  if (searchQuery) {
    filteredPalette = filteredByGroup.filter(tile =>
      tile.label.toLowerCase().includes(searchQuery) ||
      tile.key.toLowerCase().includes(searchQuery)
    );
  } else {
    filteredPalette = filteredByGroup;
  }
  setState('filteredPalette', filteredPalette);

  renderPalette();
  updatePaginationInfo();
}

/**
 * 페이지네이션 정보 업데이트
 */
export function updatePaginationInfo() {
  const pageInfo = document.getElementById("page-info");
  const prevBtn = document.getElementById("prev-page");
  const nextBtn = document.getElementById("next-page");

  const filteredPalette = getState('filteredPalette');
  const currentPage = getState('currentPage');
  const totalPages = Math.ceil(filteredPalette.length / TILES_PER_PAGE);

  if (totalPages === 0) {
    pageInfo.textContent = "타일 없음";
    prevBtn.disabled = true;
    nextBtn.disabled = true;
  } else {
    pageInfo.textContent = `${currentPage + 1} / ${totalPages}`;
    prevBtn.disabled = currentPage === 0;
    nextBtn.disabled = currentPage >= totalPages - 1;
  }

  prevBtn.style.opacity = prevBtn.disabled ? "0.3" : "1";
  nextBtn.style.opacity = nextBtn.disabled ? "0.3" : "1";
  prevBtn.style.cursor = prevBtn.disabled ? "not-allowed" : "pointer";
  nextBtn.style.cursor = nextBtn.disabled ? "not-allowed" : "pointer";
}

/**
 * 검색 기능 설정
 */
export function setupSearch() {
  const searchInput = document.getElementById("tile-search");
  if (!searchInput) return;

  searchInput.addEventListener("input", (e) => {
    setState('searchQuery', e.target.value.toLowerCase());
    setState('currentPage', 0);
    filterAndRenderPalette();
  });
}

/**
 * 페이지네이션 버튼 설정
 */
export function setupPagination() {
  const prevBtn = document.getElementById("prev-page");
  const nextBtn = document.getElementById("next-page");

  if (!prevBtn || !nextBtn) return;

  prevBtn.addEventListener("click", () => {
    const currentPage = getState('currentPage');
    if (currentPage > 0) {
      setState('currentPage', currentPage - 1);
      filterAndRenderPalette();
    }
  });

  nextBtn.addEventListener("click", () => {
    const currentPage = getState('currentPage');
    const filteredPalette = getState('filteredPalette');
    const totalPages = Math.ceil(filteredPalette.length / TILES_PER_PAGE);
    if (currentPage < totalPages - 1) {
      setState('currentPage', currentPage + 1);
      filterAndRenderPalette();
    }
  });
}

/**
 * 그리드 크기 토글 버튼 설정
 */
export function setupGridSizeToggle() {
  const buttons = document.querySelectorAll('.size-btn');
  if (!buttons.length) return;

  buttons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      buttons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      setState('selectedGridSize', parseInt(button.dataset.size));
    });
  });
}
