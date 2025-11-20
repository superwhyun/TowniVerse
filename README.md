# TowniVerse

An isometric tile-based landscape builder powered by Phaser 3. Create and manage custom isometric worlds by uploading images, converting them to tiles, and placing them on an interactive grid.

## Features

### Tile Management
- **Custom Tile Upload**: Upload any image and convert it to an isometric tile
- **4-Point Calibration**: Mark 4 corner points on your image to precisely map it to the diamond-shaped grid
- **WebGL Acceleration**: Uses WebGL shaders for fast image processing and transformation
- **Automatic Perspective Transform**: Uses homography-based transformation to convert arbitrary quadrilaterals to perfect 256×128 diamond tiles
- **Dynamic Origin Calculation**: Automatically calculates the correct origin point for proper grid alignment
- **Tile Export/Import**: Export your custom tile collection as a ZIP file and import it later

### Interactive Grid
- **Pan and Zoom**: Navigate the isometric world with mouse controls
  - Click and drag to pan
  - Mouse wheel to zoom in/out
- **Tile Placement**: Click on the grid to place the selected tile
- **Tile Removal**: Click on an existing tile of the same type to remove it
- **Visual Preview**: See a preview of the selected tile following your cursor

### Data Persistence
- **IndexedDB Storage**: All custom tiles and placements are saved locally in your browser
- **Optimized Storage**: Uses bulk transactions for better performance
- **Auto-save**: Tile placements are automatically saved as you build
- **Persistent State**: Your world remains intact across page reloads

## Technical Stack

- **Phaser 3**: Game engine for rendering and interaction
- **ES Modules**: Modern JavaScript module system for better code organization
- **WebGL**: GPU-accelerated image processing
- **IndexedDB**: Browser-based storage for tiles and placements
- **JSZip**: ZIP file creation for tile export
- **Perspective Transform**: Custom homography implementation for image transformation

## Getting Started

1. Open `index.html` in a modern web browser (Must be served via a local server due to ES Modules CORS policy)
   - You can use `npx serve` or `python -m http.server`
2. Select a tile from the palette on the right
3. Click on the grid to place tiles
4. Use mouse wheel to zoom, click and drag to pan

## Uploading Custom Tiles

1. Click the "이미지 파일 선택" (Select Image File) button
2. Choose an image from your computer
3. The calibration interface will appear
4. Click on the 4 corner points of the object in your image:
   - Top corner
   - Right corner
   - Bottom corner
   - Left corner
5. Enter a label for your tile
6. Click "타일 등록" (Register Tile)
7. Your tile will appear in the palette and can be immediately placed on the grid

## File Structure

```
TowniVerse/
├── index.html          # Main application file
├── js/                 # Application logic
│   ├── main.js         # Entry point
│   ├── state.js        # Global state management
│   ├── store.js        # IndexedDB storage
│   ├── scene.js        # Phaser scene & rendering
│   ├── tile-manager.js # Tile logic & upload
│   ├── calibrator.js   # Image processing (WebGL)
│   ├── ui.js           # UI interactions
│   ├── grid.js         # Grid math utilities
│   └── constants.js    # Configuration
├── tiles/              # Tile assets directory
└── README.md           # This file
```

## License

MIT License
