#!/usr/bin/env node
'use strict'

// No bundler: the extension is plain ES modules the browser loads directly, so "build"
// just assembles a clean dist/ folder Chrome can load unpacked (see README.md).

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist')

const FILES = [
  'manifest.json',
  'popup.html',
  'popup.css',
  'popup.js',
  'background.js',
  'content.js',
  'config.js',
  'storage.js',
  'api.js',
]

function clean(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
}

clean(DIST)

for (const file of FILES) {
  fs.copyFileSync(path.join(ROOT, file), path.join(DIST, file))
}

fs.cpSync(path.join(ROOT, 'icons'), path.join(DIST, 'icons'), {
  recursive: true,
  filter: (src) => !src.endsWith('.svg'), // manifest only references the PNGs
})

console.log(`Built extension into ${path.relative(ROOT, DIST)}/`)
