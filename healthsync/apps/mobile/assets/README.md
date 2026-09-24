# HealthSync Mobile Assets

Folder ini berisi asset statis untuk aplikasi mobile.

## Struktur

```
assets/
├── images/       ← Logo, ilustrasi, icon PNG/SVG
│   └── .gitkeep
└── fonts/        ← Custom fonts (jika ada)
    └── .gitkeep
```

## Cara menambah gambar

Letakkan file gambar di `assets/images/` lalu referensikan di `pubspec.yaml`:

```yaml
flutter:
  assets:
    - assets/images/logo.png
```
