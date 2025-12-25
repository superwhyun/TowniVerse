import fs from 'fs';
import path from 'path';

const TILESETS_DIR = 'tilesets';
const OUTPUT_FILE = 'public/tilesets.json';

// Ensure public directory exists
if (!fs.existsSync('public')) {
    fs.mkdirSync('public');
}

// Ensure output file exists or create empty one if no tilesets
const tilesets = [];

if (fs.existsSync(TILESETS_DIR)) {
    const files = fs.readdirSync(TILESETS_DIR);

    // Get all zip files
    const zipFiles = files.filter(file => file.toLowerCase().endsWith('.zip'));
    const imageFiles = new Set(files.filter(file => /\.(png|jpg|jpeg)$/i.test(file)));

    zipFiles.forEach(zipFile => {
        const name = zipFile.replace(/\.zip$/i, '');
        let imageFile = null;

        // Check for matching image
        if (imageFiles.has(name + '.png')) imageFile = name + '.png';
        else if (imageFiles.has(name + '.jpg')) imageFile = name + '.jpg';
        else if (imageFiles.has(name + '.jpeg')) imageFile = name + '.jpeg';

        tilesets.push({
            name: name,
            file: zipFile,
            image: imageFile
        });
    });
}

const output = {
    generatedAt: new Date().toISOString(),
    tilesets: tilesets
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
console.log(`Generated ${OUTPUT_FILE} with ${tilesets.length} tilesets.`);
