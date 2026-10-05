import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

const read = file => readFileSync(new URL('../' + file, import.meta.url));
const pngSize = data => {
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
};
// Decode RGBA PNG scanlines to inspect actual alpha, including every ICO entry.
function assertTransparentCorners(data, label) {
  const [width, height] = pngSize(data);
  assert.equal(data[24], 8, label + ': 8-bit channels');
  assert.equal(data[25], 6, label + ': RGBA');
  assert.equal(data[28], 0, label + ': non-interlaced');
  const chunks = [];
  for (let offset = 8; offset < data.length;) {
    const length = data.readUInt32BE(offset);
    if (data.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(data.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const row = y * stride, input = y * (stride + 1), filter = raw[input];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? pixels[row + x - 4] : 0, b = y ? pixels[row + x - stride] : 0;
      const c = x >= 4 && y ? pixels[row + x - stride - 4] : 0;
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      pixels[row + x] = (raw[input + 1 + x] + predictor) & 255;
    }
  }
  for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]) {
    assert.equal(pixels[(y * width + x) * 4 + 3], 0, `${label}: transparent corner ${x},${y}`);
  }
  assert.equal(pixels[(Math.floor(height / 2) * width + Math.floor(width / 2)) * 4 + 3], 255, label + ': opaque emblem interior');
  assert.ok(pixels.some((value, index) => index % 4 === 3 && value > 0 && value < 255), label + ': antialiased edge');
}
test('Favicon package retains the exact attached source and square icon dimensions', () => {
  assert.equal(createHash('sha256').update(read('img/favicon/source.jpg')).digest('hex'),
    'a3e7aefdf00ae877d16e79703129e2a701768011dee0f7579f48531e2aee967d');
  const master = read('img/favicon/master.png');
  const [masterWidth, masterHeight] = pngSize(master);
  assert.equal(masterWidth, masterHeight);
  assertTransparentCorners(master, 'Transparent master');
  for (const [file, size] of [['favicon-16x16.png', 16], ['favicon-32x32.png', 32], ['apple-touch-icon.png', 180], ['android-chrome-192x192.png', 192], ['android-chrome-512x512.png', 512]]) {
    assert.deepEqual(pngSize(read('img/favicon/' + file)), [size, size]);
    assertTransparentCorners(read('img/favicon/' + file), file);
  }
  const ico = read('favicon.ico');
  assert.equal(ico.readUInt16LE(0), 0); assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 3);
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + index * 16;
    assert.equal(ico[entry], size); assert.equal(ico[entry + 1], size);
    const length = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
    assert.deepEqual(pngSize(ico.subarray(offset, offset + length)), [size, size]);
    assertTransparentCorners(ico.subarray(offset, offset + length), `ICO ${size}px`);
    if (size !== 48) assert.deepEqual(ico.subarray(offset, offset + length), read(`img/favicon/favicon-${size}x${size}.png`));
  }
});
test('Manifest exposes the two Android icons with TurkLuxx navy branding and build inclusion', () => {
  const manifest = JSON.parse(read('site.webmanifest'));
  assert.equal(manifest.name, 'TurkLuxx'); assert.equal(manifest.short_name, 'TurkLuxx');
  assert.equal(manifest.theme_color, '#071e34'); assert.equal(manifest.background_color, '#071e34');
  const files = JSON.parse(read('scripts/public-files.json'));
  for (const [index, size] of [192, 512].entries()) {
    const icon = manifest.icons[index];
    assert.equal(icon.sizes, `${size}x${size}`); assert.equal(icon.type, 'image/png');
    assert.ok(files.includes(icon.src.slice(1))); assert.deepEqual(pngSize(read(icon.src.slice(1))), [size, size]);
  }
  assert.ok(files.includes('site.webmanifest')); assert.ok(files.includes('favicon.ico'));
  assert.ok(!files.includes('img/favicon/source.jpg'), 'Source reference is kept locally, not published');
});
