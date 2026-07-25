# RobWatch

Simulasi interaktif banjir rob & penurunan tanah, pesisir Semarang–Demak, 2025–2050.

## Struktur folder yang dibutuhkan

```
robwatch/
├── index.html
├── app.js
├── README.md
└── data/
    ├── stats_ssp245.json          ← sudah terisi data asli dari Colab
    ├── stats_ssp585.json          ← sudah terisi data asli dari Colab
    ├── ssp245_dual/
    │   ├── flooded_2025.geojson   ⚠️ GANTI dengan file asli dari Colab
    │   ├── flooded_2026.geojson   ⚠️ GANTI dengan file asli dari Colab
    │   ├── ... (2025-2050)
    │   ├── atrisk_2025.geojson    ⚠️ GANTI dengan file asli dari Colab
    │   └── ... (2025-2050)
    └── ssp585_dual/
        └── (struktur sama seperti ssp245_dual)
```

## ⚠️ PENTING — Data saat ini adalah PLACEHOLDER

File-file `.geojson` di folder `data/` saat ini adalah **data sintetis/dummy**
(bentuk heksagon sederhana) — dibuat hanya supaya situs bisa langsung ditest
dan dilihat strukturnya bekerja.

**Sebelum publish final, WAJIB ganti isi folder `data/ssp245_dual/` dan
`data/ssp585_dual/` dengan 104 file GeoJSON asli hasil pipeline Colab**
(`output/geojson/ssp245_dual/` dan `output/geojson/ssp585_dual/` di Google Drive).

Nama file HARUS sama persis:
- `flooded_{tahun}.geojson`
- `atrisk_{tahun}.geojson`

## Cara ganti data

1. Download folder `ssp245_dual` dan `ssp585_dual` dari Google Drive
   (`RobWatch/output/geojson/`)
2. Replace folder `data/ssp245_dual/` dan `data/ssp585_dual/` di repo ini
   dengan folder hasil download (nama file harus tetap sama)
3. Commit & push

## Menjalankan secara lokal

```bash
python3 -m http.server 8080
# buka http://localhost:8080
```

## Link balik ke portofolio

`app.js` baris `wirePortfolioLinks()` mengarah ke `../index.html` — sesuaikan
path ini dengan lokasi deploy portofolio utama Anda.
