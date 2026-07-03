import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const logoPath = path.join(root, "assets/ui/logo/mylit-logo.png");

const BACKGROUND = "#07111f";

const outputs = [
  { name: "favicon.png", size: 48 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "pwa-icon-192.png", size: 192 },
  { name: "pwa-icon-512.png", size: 512 },
  { name: "maskable-icon-512.png", size: 512, maskable: true },
];

async function renderIcon(size, maskable = false) {
  const padding = maskable ? Math.round(size * 0.18) : Math.round(size * 0.12);
  const inner = size - padding * 2;

  const logo = await sharp(logoPath)
    .resize({ width: inner, height: Math.round(inner * 0.35), fit: "inside" })
    .png()
    .toBuffer();

  const background = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .png()
    .toBuffer();

  return sharp(background)
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
}

async function main() {
  fs.mkdirSync(publicDir, { recursive: true });

  for (const output of outputs) {
    const buffer = await renderIcon(output.size, output.maskable);
    fs.writeFileSync(path.join(publicDir, output.name), buffer);
    console.log(`wrote ${output.name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
