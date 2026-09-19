<p align="center">
  <a href="https://ly.sunal.in"><img src="public/favicon.png" height="80" alt="ly"/></a>
</p>

<h1 align="center">ly</h1>

<p align="center"><b>Manipulate images via chat. Uses a Laya-like model to classify your prompt.</b></p>

<p align="center">
  <a href="https://ly.sunal.in"><img alt="Open ly.sunal.in" src="https://img.shields.io/badge/Open-ly.sunal.in-a5d184?style=for-the-badge&labelColor=101510"/></a>
  <a href="LICENSE.md"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/License-AGPL--3.0-a5d184?style=for-the-badge&labelColor=101510"/></a>
</p>

Images never leave your device. In **auto** mode, a small on-device model downloads once (~580 MB, then cached) to interpret your prompt.

#### Features

- [x] **Natural language** — describe what you want; pick a fixed operation if you prefer
- [x] **Batch processing** — drop many files and apply one plan to all of them
- [x] **Convert** — PNG, JPEG, WebP, AVIF
- [x] **Compress** — smaller files while keeping the same format when possible
- [x] **Resize** — dimensions, scale, crop, or letterbox
- [x] **Remove background** — subject on transparency (PNG)
- [x] **Private by default** — processing stays in the browser

Use a recent **Chrome** or **Edge** for the best experience.

If something breaks, **[open an issue](https://github.com/prateekmedia/ly/issues)**.

<h2 align="center">Run locally</h2>

```bash
git clone https://github.com/prateekmedia/ly.git
cd ly
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).
