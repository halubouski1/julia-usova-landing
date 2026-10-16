// Build the responsive WebP variants used by index.html from the original PNGs.
//
//   node tools/optimize-images.mjs
//
// Input:  ../julia-usova-originals/images/<name>.png (originals outside the
//         project, never modified; override with IMAGES_SRC)
// Output: assets/images/<name>-<width>.webp for every width in
//         tools/images.config.json, plus .avif twins where AVIF is smaller at
//         equal or better quality, the cropped grain overlay, and
//         tools/images.manifest.json (which images have AVIF) for the markup.
// Quality: adaptive. Each variant starts at WebP q90 (smart subsampling,
// Lanczos3 downscaling, never upscaled) and is compared with the original
// resized to the same width; quality steps up (94 → 97 → 100 → near-lossless)
// until PSNR ≥ TARGET_DB (or q100 ≥ FLOOR_DB). Images with transparency are compared on colour
// premultiplied by alpha (colour under fully transparent pixels is invisible).
import { readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Originals live outside the deployable project (override with IMAGES_SRC=/path)
const SRC = process.env.IMAGES_SRC || path.resolve(ROOT, '..', 'julia-usova-originals', 'images');
const OUT = path.join(ROOT, 'assets/images');
const config = JSON.parse(readFileSync(path.join(ROOT, 'tools/images.config.json'), 'utf8'));

// libvips caches decoded files by path: without this, re-encoding into the same
// file and reading it back would measure the first (cached) version.
sharp.cache(false);

const TARGET_DB = 42;
// Lossy WebP is capped by 4:2:0 chroma; if q100 reaches FLOOR_DB (visually
// indistinguishable) keep it rather than jump to much larger near-lossless files.
const FLOOR_DB = 40;
// AVIF (4:4:4 chroma) must reach the WebP variant's PSNR, capped at AVIF_TARGET_DB:
// near-lossless WebP (≈52 dB) only exists because lossy WebP could not reach
// 40 dB, so AVIF needs to match the visually-lossless bar, not 52 dB.
const AVIF_TARGET_DB = 44;
const AVIF_STEPS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95];
const STEPS = [{ quality: config.quality }, { quality: 94 }, { quality: 97 }, { quality: 100 }, { nearLossless: true, quality: 80 }];

// Raw pixels, premultiplied by alpha when the image has transparency
async function pixels(img, keepAlpha) {
  const { data, info } = await (keepAlpha ? img.ensureAlpha() : img.removeAlpha()).raw().toBuffer({ resolveWithObject: true });
  if (!keepAlpha) return data;
  const out = new Uint8Array((data.length / 4) * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const a = data[i + 3] / 255;
    out[j] = data[i] * a; out[j + 1] = data[i + 1] * a; out[j + 2] = data[i + 2] * a;
  }
  return out;
}

function psnr(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sum += d * d; }
  const mse = sum / a.length;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

const kib = (file) => (statSync(file).size / 1024).toFixed(0);
let before = 0;
let after = 0;
const manifest = {};

for (const [name, widths] of Object.entries(config.widths)) {
  const input = path.join(SRC, `${name}.png`);
  const meta = await sharp(input).metadata();
  const { isOpaque } = await sharp(input).stats();
  const keepAlpha = meta.hasAlpha && !isOpaque;
  before += statSync(input).size;

  const lines = [];
  const avifFiles = [];
  let webpBytes = 0;
  let avifBytes = 0;
  let avifOk = true;
  for (const width of widths) {
    const output = path.join(OUT, `${name}-${width}.webp`);
    const base = () => {
      const img = sharp(input).resize({ width, kernel: 'lanczos3', withoutEnlargement: true });
      return keepAlpha ? img.ensureAlpha() : img.removeAlpha();
    };
    const reference = await pixels(base(), keepAlpha);
    let db = 0;
    let used = '';
    for (const step of STEPS) {
      await base().webp({ effort: 6, smartSubsample: true, alphaQuality: 100, ...step }).toFile(output);
      db = psnr(reference, await pixels(sharp(readFileSync(output)), keepAlpha));
      used = step.nearLossless ? 'NL' : 'q' + step.quality;
      if (db >= TARGET_DB || (step.quality === 100 && !step.nearLossless && db >= FLOOR_DB)) break;
    }
    webpBytes += statSync(output).size;
    let line = `${width}w ${used} ${kib(output)} KiB ${db === Infinity ? 'lossless' : db.toFixed(1) + ' dB'}`;

    // AVIF twin: lowest quality that is at least as close to the original as the WebP (up to AVIF_TARGET_DB)
    const avifOut = path.join(OUT, `${name}-${width}.avif`);
    let avifDb = 0;
    let avifQ = 0;
    for (const quality of AVIF_STEPS) {
      await base().avif({ quality, effort: 6, chromaSubsampling: '4:4:4' }).toFile(avifOut);
      avifDb = psnr(reference, await pixels(sharp(readFileSync(avifOut)), keepAlpha));
      avifQ = quality;
      if (avifDb >= Math.min(db, AVIF_TARGET_DB)) break;
    }
    avifFiles.push(avifOut);
    if (avifDb < Math.min(db, AVIF_TARGET_DB)) avifOk = false;
    avifBytes += statSync(avifOut).size;
    line += ` / avif q${avifQ} ${kib(avifOut)} KiB ${avifDb.toFixed(1)} dB`;
    lines.push(line);
  }

  // Use AVIF for this image only if every width reached the WebP quality and the set is smaller
  const useAvif = avifOk && avifBytes < webpBytes * 0.95;
  if (!useAvif) avifFiles.forEach((f) => unlinkSync(f));
  manifest[name] = { widths, avif: useAvif };
  after += webpBytes + (useAvif ? avifBytes : 0);
  console.log(`${name} (${meta.width}×${meta.height}${keepAlpha ? ', alpha' : ''}, ${kib(input)} KiB) → ${lines.join(' | ')}`);
  console.log(`   WebP set ${(webpBytes / 1024).toFixed(0)} KiB, AVIF set ${(avifBytes / 1024).toFixed(0)} KiB → ${useAvif ? 'AVIF used' : 'WebP only'}`);
}

writeFileSync(path.join(ROOT, 'tools/images.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// Grain overlay: only its top-left corner is ever visible (largest box 210×179
// at background-size 1024px), so keep a lossless 256×256 crop.
const grainIn = path.join(SRC, 'about-grain.png');
const grainOut = path.join(OUT, 'about-grain-256.webp');
before += statSync(grainIn).size;
await sharp(grainIn).extract({ left: 0, top: 0, width: 256, height: 256 }).webp({ lossless: true, effort: 6 }).toFile(grainOut);
after += statSync(grainOut).size;
console.log(`about-grain (1024×1024, ${kib(grainIn)} KiB) → 256×256 lossless crop ${kib(grainOut)} KiB`);

console.log(`\nOriginals ${(before / 1048576).toFixed(2)} MB → all variants ${(after / 1048576).toFixed(2)} MB (each page load downloads only one variant per image)`);
