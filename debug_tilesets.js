async function debugTilesets() {
    try {
        const response = await fetch('tilesets/');
        const text = await response.text();
        console.log('--- Tilesets Directory HTML ---');
        console.log(text);
        console.log('-------------------------------');
    } catch (e) {
        console.error('Failed to fetch tilesets:', e);
    }
}
debugTilesets();
