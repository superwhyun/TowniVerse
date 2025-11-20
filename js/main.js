/**
 * TowniVerse - Isometric Tile Builder
 * 메인 진입점
 */

import { setState } from "./state.js";
import { loadManifestTiles, loadPaletteAndStart, setupUploader, setupExportButton, setupImportButton } from "./tile-manager.js";
import { setupGridSizeToggle, setupSearch, setupPagination, setupPalette } from "./ui.js";
import { loadSavedPlacements } from "./scene.js";

// DOM이 로드되면 초기화
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/**
 * 애플리케이션 초기화
 */
async function init() {
  try {
    console.log("🚀 TowniVerse 초기화 중...");

    // UI 이벤트 리스너 설정
    setupPalette();
    setupGridSizeToggle();
    setupUploader();
    setupExportButton();
    setupImportButton();
    setupSearch();
    setupPagination();
    console.log("✓ UI 설정 완료");

    // 내장 타일 로드
    const builtInTiles = await loadManifestTiles();
    setState('builtInTiles', builtInTiles);
    console.log("✓ 내장 타일 로드 완료");

    // 팔레트 로드 및 게임 시작
    await loadPaletteAndStart();
    console.log("✓ 팔레트 로드 및 게임 시작 완료");

    // 저장된 배치 복원
    await loadSavedPlacements();
    console.log("✓ 저장된 배치 복원 완료");

    console.log("✨ TowniVerse 초기화 완료!");
  } catch (error) {
    console.error("❌ 초기화 중 오류 발생:", error);
    alert("애플리케이션 초기화에 실패했습니다. 콘솔을 확인해주세요.");
  }
}
