/**
 * IndexedDB를 사용한 타일 및 배치 데이터 저장소
 */

const DB_NAME = "TowniVerseLocal";
const DB_VERSION = 2;
const TILES_STORE = "tiles";
const PLACEMENTS_STORE = "placements";

export function createTileStore() {
  // DB 연결 프로미스
  const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      // 타일 저장소
      if (!db.objectStoreNames.contains(TILES_STORE)) {
        db.createObjectStore(TILES_STORE, { keyPath: "id", autoIncrement: true });
      }

      // 배치 저장소
      if (!db.objectStoreNames.contains(PLACEMENTS_STORE)) {
        db.createObjectStore(PLACEMENTS_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  /**
   * 트랜잭션 헬퍼
   */
  async function tx(storeName, mode) {
    const db = await dbPromise;
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  return {
    /**
     * 모든 타일 가져오기
     */
    async getTiles() {
      const store = await tx(TILES_STORE, "readonly");
      return await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const tiles = request.result
            .map((entry) => ({
              key: entry.key,
              label: entry.label,
              originY: entry.originY,
              displayScale: entry.displayScale ?? 1,
              gridWidth: entry.gridWidth ?? 1,
              gridHeight: entry.gridHeight ?? 1,
              imageBlob: entry.imageBlob, // Store Blob instead of dataUrl
              dataUrl: entry.dataUrl, // Keep for backward compatibility
              isCustom: true,
              createdAt: entry.createdAt || 0,
              group: entry.group || '커스텀',
              isHD: !!entry.isHD,
              id: entry.id,
            }))
            .sort((a, b) => (a.id || 0) - (b.id || 0));
          resolve(tiles);
        };
        request.onerror = () => reject(request.error);
      });
    },

    /**
     * 새 타일 추가 (자동 키 생성)
     */
    async addTile({ label, originY, dataUrl, imageBlob, displayScale = 1, gridWidth = 1, gridHeight = 1, group = '커스텀', isHD = false }) {
      const key = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const entry = {
        key,
        label,
        originY,
        imageBlob: imageBlob || null, // Prefer Blob
        dataUrl: imageBlob ? null : dataUrl, // Only use dataUrl if no Blob
        displayScale,
        gridWidth,
        gridHeight,
        group,
        isHD,
        createdAt: Date.now(),
      };

      const store = await tx(TILES_STORE, "readwrite");
      await new Promise((resolve, reject) => {
        const request = store.add(entry);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      return { ...entry, isCustom: true };
    },

    /**
     * 타일 추가 (키 지정)
     */
    async addTileWithKey({ key, label, originY, dataUrl, imageBlob, displayScale = 1, gridWidth = 1, gridHeight = 1, group = '커스텀', isHD = false }) {
      const entry = {
        key,
        label,
        originY,
        imageBlob: imageBlob || null, // Prefer Blob
        dataUrl: imageBlob ? null : dataUrl, // Only use dataUrl if no Blob
        displayScale,
        gridWidth,
        gridHeight,
        group,
        isHD,
        createdAt: Date.now(),
      };

      const db = await dbPromise;
      const transaction = db.transaction(TILES_STORE, "readwrite");
      const store = transaction.objectStore(TILES_STORE);

      await new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);

        const request = store.add(entry);
        request.onerror = () => reject(request.error);
      });

      return { ...entry, isCustom: true };
    },

    /**
     * 타일 삭제
     */
    async deleteTile(key) {
      const store = await tx(TILES_STORE, "readwrite");
      await new Promise((resolve, reject) => {
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return resolve();
          if (cursor.value.key === key) {
            cursor.delete();
            resolve();
          } else {
            cursor.continue();
          }
        };
        request.onerror = () => reject(request.error);
      });
    },

    /**
     * 단일 배치 저장
     */
    async savePlacement(key, tileKey, col, row) {
      const db = await dbPromise;
      const store = db.transaction(PLACEMENTS_STORE, "readwrite").objectStore(PLACEMENTS_STORE);
      await new Promise((resolve, reject) => {
        const request = store.put({ key, tileKey, col, row });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },

    /**
     * 여러 배치 일괄 저장 (트랜잭션 최적화)
     */
    async savePlacements(placements) {
      const db = await dbPromise;
      const transaction = db.transaction(PLACEMENTS_STORE, "readwrite");
      const store = transaction.objectStore(PLACEMENTS_STORE);

      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);

        placements.forEach(({ key, tileKey, col, row }) => {
          store.put({ key, tileKey, col, row });
        });
      });
    },

    /**
     * 단일 배치 삭제
     */
    async deletePlacement(key) {
      const db = await dbPromise;
      const store = db.transaction(PLACEMENTS_STORE, "readwrite").objectStore(PLACEMENTS_STORE);
      await new Promise((resolve, reject) => {
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },

    /**
     * 여러 배치 일괄 삭제 (트랜잭션 최적화)
     */
    async deletePlacements(keys) {
      const db = await dbPromise;
      const transaction = db.transaction(PLACEMENTS_STORE, "readwrite");
      const store = transaction.objectStore(PLACEMENTS_STORE);

      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);

        keys.forEach(key => {
          store.delete(key);
        });
      });
    },

    /**
     * 모든 배치 가져오기
     */
    async getPlacements() {
      const db = await dbPromise;
      const store = db.transaction(PLACEMENTS_STORE, "readonly").objectStore(PLACEMENTS_STORE);
      return await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },

    /**
     * 모든 데이터 삭제
     */
    async clearAll() {
      const db = await dbPromise;

      // 타일 삭제
      const tilesTx = db.transaction(TILES_STORE, "readwrite");
      await new Promise((resolve, reject) => {
        const request = tilesTx.objectStore(TILES_STORE).clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // 배치 삭제
      const placementsTx = db.transaction(PLACEMENTS_STORE, "readwrite");
      await new Promise((resolve, reject) => {
        const request = placementsTx.objectStore(PLACEMENTS_STORE).clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
  };
}

export const tileStore = createTileStore();
