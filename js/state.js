// 애플리케이션 전역 상태 관리
export const state = {
  // 타일 관련
  palette: [],
  filteredPalette: [],
  tileDefinitions: new Map(),
  activeTileKey: null,

  // 배치 및 캐시
  placedTiles: new Map(),
  spriteCache: new Map(),
  runtimeUrls: new Map(),

  // UI 상태
  currentPage: 0,
  searchQuery: "",
  selectedGridSize: 1,

  // 게임 인스턴스
  game: null,

  // 내장 타일
  builtInTiles: [],
};

export function setState(key, value) {
  state[key] = value;
}

export function getState(key) {
  return state[key];
}
