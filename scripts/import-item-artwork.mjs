// Import color-keyed imagegen artwork, then pack the game's 32px RGBA atlas.
// node scripts/import-item-artwork.mjs <directory of named source PNGs>
// Originals are preserved; --pack-only repacks the checked-in individual icons.
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

export const ICON_NAMES = [
    'repair-kit', 'forest-resin', 'mooncap-mushroom', 'sea-salt',
    'desert-spice', 'imported-silk', 'incense', 'blood-reliquary',
    'shadow-amber', 'oil-can', 'oil-lamp', 'sword-manual', 'rune-stone',
];
const root = resolve(import.meta.dirname, '..');
const outputDir = join(root, 'public/assets/images/items/supplemental');
const packOnly = process.argv[2] === '--pack-only';
const sourceDir = process.argv[2];
if (!sourceDir) throw new Error('Supply the generated source directory or --pack-only.');
await mkdir(outputDir, { recursive: true });

const manifest = [];
for (const [col, name] of ICON_NAMES.entries()) {
    const output = join(outputDir, `${name}.png`);
    if (!packOnly) {
        const source = await readFile(join(resolve(sourceDir), `${name}.png`));
        const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const queue = new Int32Array(info.width * info.height);
        let read = 0, write = 0;
        for (let index = 0; index < queue.length; index++) {
            const p = index * 4;
            const [r, g, b] = data.subarray(p, p + 3);
            if (data[p + 3] === 0 || (r > 90 && b > 90 && g < 85 && r - g > 70 && b - g > 70)) {
                data[p + 3] = 0;
                queue[write++] = index;
            }
        }
        // Remove darker export-key fringes only when connected to background.
        // Purple detail enclosed inside an object's dark outline is preserved.
        while (read < write) {
            const index = queue[read++];
            const x = index % info.width;
            const neighbors = [index - info.width, index + info.width];
            if (x > 0) neighbors.push(index - 1);
            if (x + 1 < info.width) neighbors.push(index + 1);
            for (const neighbor of neighbors) {
                if (neighbor < 0 || neighbor >= queue.length) continue;
                const p = neighbor * 4;
                if (!data[p + 3]) continue;
                const [r, g, b] = data.subarray(p, p + 3);
                if (r > 70 && b > 45 && g < 110 && r - g > 45 && b - g > 35) {
                    data[p + 3] = 0;
                    queue[write++] = neighbor;
                }
            }
        }
        let left = info.width, top = info.height, right = -1, bottom = -1;
        for (let y = 0; y < info.height; y++) {
            for (let x = 0; x < info.width; x++) {
                const p = (y * info.width + x) * 4;
                // Generated images use a magenta export key, never an opaque
                // checkerboard. Keep existing alpha and exclude only that key.
                if (data[p + 3] === 0) {
                    data[p] = data[p + 1] = data[p + 2] = 0;
                    continue;
                }
                left = Math.min(left, x); top = Math.min(top, y);
                right = Math.max(right, x); bottom = Math.max(bottom, y);
            }
        }
        if (right < left || bottom < top) throw new Error(`Empty sprite: ${name}`);
        const sprite = await sharp(data, { raw: info })
            .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
            .resize(26, 26, { fit: 'inside', kernel: 'nearest' })
            .png({ palette: true, colours: 32, dither: 0 }).toBuffer();
        const size = await sharp(sprite).metadata();
        await sharp({ create: { width: 32, height: 32, channels: 4, background: '#00000000' } })
            .composite([{ input: sprite, left: Math.floor((32 - size.width) / 2), top: Math.floor((32 - size.height) / 2) }])
            .png().toFile(output);
    }
    const png = await readFile(output);
    const meta = await sharp(png).metadata();
    if (meta.width !== 32 || meta.height !== 32 || !meta.hasAlpha) throw new Error(`Invalid icon: ${name}`);
    manifest.push({ name, col, row: 0, file: `supplemental/${name}.png`, sha256: createHash('sha256').update(png).digest('hex') });
}
await sharp({ create: { width: ICON_NAMES.length * 32, height: 32, channels: 4, background: '#00000000' } })
    .composite(ICON_NAMES.map((name, col) => ({ input: join(outputDir, `${name}.png`), left: col * 32, top: 0 })))
    .png().toFile(join(outputDir, '../supplemental_items.png'));
await writeFile(join(outputDir, 'manifest.json'), JSON.stringify({ cellSize: 32, icons: manifest }, null, 2) + '\n');
console.log(`Packed ${ICON_NAMES.length} transparent item icons.`);
