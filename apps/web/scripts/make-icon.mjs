// Renders public/logo.svg into square PNG assets for @capacitor/assets.
// Outputs:
//   resources/icon.png            (1024x1024, teal background, logo centered)
//   resources/icon-foreground.png (1024x1024, transparent, logo only, inset for adaptive)
//   resources/icon-background.png (1024x1024, solid teal)
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const svgPath = path.join(root, 'public', 'logo.svg');
const outDir = path.join(root, 'resources');
await fs.mkdir(outDir, { recursive: true });

const SIZE = 1024;
const TEAL = { r: 0x2b, g: 0xa4, b: 0xb4, alpha: 1 };

const svg = await fs.readFile(svgPath);

// Logo is 400x240 — fit it inside ~70% of the square canvas, centered.
const logoW = Math.round(SIZE * 0.78);
const logoH = Math.round((logoW * 240) / 400);
const logoBuf = await sharp(svg)
  .resize(logoW, logoH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

// icon.png — full-bleed teal with logo centered
await sharp({
  create: { width: SIZE, height: SIZE, channels: 4, background: TEAL },
})
  .composite([{ input: logoBuf, gravity: 'center' }])
  .png()
  .toFile(path.join(outDir, 'icon.png'));

// icon-background.png — solid teal
await sharp({
  create: { width: SIZE, height: SIZE, channels: 4, background: TEAL },
})
  .png()
  .toFile(path.join(outDir, 'icon-background.png'));

// icon-foreground.png — adaptive icons require ~33% safe padding (logo smaller)
const fgLogoW = Math.round(SIZE * 0.55);
const fgLogoH = Math.round((fgLogoW * 240) / 400);
const fgLogoBuf = await sharp(svg)
  .resize(fgLogoW, fgLogoH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
await sharp({
  create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: fgLogoBuf, gravity: 'center' }])
  .png()
  .toFile(path.join(outDir, 'icon-foreground.png'));

console.log('Generated:');
for (const f of ['icon.png', 'icon-background.png', 'icon-foreground.png']) {
  const s = await fs.stat(path.join(outDir, f));
  console.log(`  resources/${f}  (${s.size} bytes)`);
}
