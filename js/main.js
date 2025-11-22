/**
 * TowniVerse - Isometric Tile Builder
 * 메인 진입점
 */

import { setState } from "./state.js";
import { loadManifestTiles, loadPaletteAndStart, setupUploader, setupExportButton, setupImportButton, importFromZipUrl, clearAllData } from "./tile-manager.js";
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

    // URL 파라미터 확인
    const urlParams = new URLSearchParams(window.location.search);
    const tilesetName = urlParams.get('tileset');

    if (tilesetName) {
      console.log(`📦 URL 타일셋 로드 중: ${tilesetName}`);
      try {
        // URL 파라미터로 로드 시 모든 데이터 초기화
        await clearAllData();

        // tilesets 폴더에서 zip 파일 로드
        const zipUrl = `tilesets/${tilesetName}.zip`;
        await importFromZipUrl(zipUrl);
        console.log("✓ URL 타일셋 로드 완료");
      } catch (error) {
        console.error("URL 타일셋 로드 실패:", error);
        alert(`타일셋 '${tilesetName}'을(를) 불러올 수 없습니다.\n기본 타일로 시작합니다.`);
        const builtInTiles = await loadManifestTiles();
        setState('builtInTiles', builtInTiles);
        // 실패 시에는 저장된 배치 복원 시도
        await loadSavedPlacements();
      }
    } else {
      // 내장 타일 로드 (기본 동작)
      const builtInTiles = await loadManifestTiles();
      setState('builtInTiles', builtInTiles);
      console.log("✓ 내장 타일 로드 완료");

      // 팔레트 로드 및 게임 시작
      await loadPaletteAndStart();
      console.log("✓ 팔레트 로드 및 게임 시작 완료");

      // 저장된 배치 복원 (URL 파라미터 없을 때만)
      await loadSavedPlacements();
      console.log("✓ 저장된 배치 복원 완료");
    }

    console.log("✨ TowniVerse 초기화 완료!");
  } catch (error) {
    console.error("❌ 초기화 중 오류 발생:", error);
    alert("애플리케이션 초기화에 실패했습니다. 콘솔을 확인해주세요.");
  }
}
