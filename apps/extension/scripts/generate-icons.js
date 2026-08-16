#!/usr/bin/env node
'use strict'

// Chrome (MV3) does not accept SVG for extension/toolbar icons — only raster formats
// (PNG) are honored in manifest.json's "icons"/"action.default_icon" fields. This script
// writes small flat-color placeholder PNGs by hand (signature + IHDR/IDAT/IEND chunks via
// Node's built-in zlib), so the icon set works with no extra dependency and no design tool.
// See icons/*.svg for an editable source if a real design ever replaces these.

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const BRAND = [13, 159, 110] // #0D9F6E
const WHITE = [255, 255, 255]
const SIZES = [16, 48, 128]

function buildCrcTable() {
  const table = new Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
}
const CRC_TABLE = buildCrcTable()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function pngFromPixels(width, height, getPixel) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const raw = Buffer.alloc((width * 4 + 1) * height)
  let offset = 0
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0 // no per-scanline filter
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y)
      raw[offset++] = r
      raw[offset++] = g
      raw[offset++] = b
      raw[offset++] = a
    }
  }

  const idat = zlib.deflateSync(raw)
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

function drawIcon(size) {
  const center = size / 2
  const cornerRadius = size * 0.22
  const dotRadius = size * 0.22

  return pngFromPixels(size, size, (x, y) => {
    const px = x + 0.5
    const py = y + 0.5

    // Rounded-square mask (superellipse-ish via clamped corner distance).
    const dx = Math.max(0, Math.abs(px - center) - (size / 2 - cornerRadius))
    const dy = Math.max(0, Math.abs(py - center) - (size / 2 - cornerRadius))
    if (Math.sqrt(dx * dx + dy * dy) > cornerRadius) return [0, 0, 0, 0]

    const distFromCenter = Math.hypot(px - center, py - center)
    if (distFromCenter < dotRadius) return [...WHITE, 255]
    return [...BRAND, 255]
  })
}

const outDir = path.join(__dirname, '..', 'icons')
fs.mkdirSync(outDir, { recursive: true })
for (const size of SIZES) {
  const filePath = path.join(outDir, `icon${size}.png`)
  fs.writeFileSync(filePath, drawIcon(size))
  console.log(`wrote ${path.relative(process.cwd(), filePath)}`)
}
