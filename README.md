<p align="center">
  <a href="https://ly.sunal.in"><img src="public/favicon.png" height="80" alt="ly"/></a>
</p>

<h1 align="center">ly</h1>

<p align="center"><b>Batch image edits from plain language — entirely in your browser.</b></p>

<p align="center">
  <a href="https://ly.sunal.in"><img alt="Open ly.sunal.in" src="https://img.shields.io/badge/Open-ly.sunal.in-a5d184?style=for-the-badge&labelColor=101510"/></a>
</p>

<table align="center">
  <tr>
    <th colspan="2"><h6>Get started</h6></th>
  </tr>
  <tr>
    <td align="center">
      <a href="https://ly.sunal.in"><img alt="Use the app" src="https://img.shields.io/badge/Use_the_app-online-7fad62?style=flat-square&labelColor=101510"/></a>
    </td>
    <td align="center">
      <a href="#installing-manually"><img alt="Run from source" src="https://img.shields.io/badge/Run_from_source-locally-a5d184?style=flat-square&labelColor=101510"/></a>
    </td>
  </tr>
</table>

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

<h2 align="center">Installing manually</h2>

```bash
git clone https://github.com/prateekmedia/ly.git
cd ly
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).
