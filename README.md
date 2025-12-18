# Photograph Garage SPA

## Overview

The photograph garage runs as a modern single-page application powered by React 18, Vite, and TypeScript. It integrates with an existing backend for authentication and album data.

Key capabilities:
- JWT-based login overlay with automatic token expiry handling.
- Dynamic album tree building with folder navigation and breadcrumb routing.
- Responsive masonry-like photo grid with lazy-loading and Fancybox lightbox integration.
- Adjustable thumbnail sizing, optional pagination, and S3 metadata overlays.
- Animated gradient background, floating controls, and mobile-friendly layouts.

## Getting Started

```bash
npm install
npm run dev    # start Vite dev server on http://localhost:5173
npm run build  # type-check and produce optimized production bundle
npm run preview  # serve the production bundle locally
```

Static assets (icons, gifs, album covers) live under `public/` and are served directly by Vite.

## Project Structure

```
archive/                # Archived legacy root assets / one-off files
backend/                # AWS Lambda / backend helpers (not part of Vite build)
docs/                   # Screenshots and project docs
legacy/                 # Pre-SPA static prototype (kept for reference)
src/
App.tsx              	# Top-level shell wiring auth + gallery contexts
components/          	# LoginModal, ControlPanel, GalleryGrid, etc.
context/             	# AuthProvider + GalleryProvider
data/                	# Album cover lookups and default imagery
hooks/               	# Lazy Fancybox binding and EXIF metadata cache
lib/                 	# Tree builder + shared typing
styles/              	# Global reset + app-specific styling
```

Legacy static assets (`legacy/index.js`, `legacy/index.css`) remain for reference but are no longer used by the SPA entrypoint.

## Notes

- Backend endpoints and credentials are intentionally not documented here. Configure/update them in `src/context/AuthContext.tsx` and `src/context/GalleryContext.tsx`.
- Thumbnail metadata (`*_info.json`) is loaded on demand with in-memory caching to keep popovers fast without spamming S3.
- Fancybox styles are imported once in `App.tsx`. If you customize the lightbox, adjust `useFancybox.ts`.

## Screenshots

Existing demo imagery in `docs/screenshots/Demos/` still represents the experience; regenerate as needed once the SPA is deployed.

![Photograph Garage SPA Demo 1](docs/screenshots/Demos/Snipaste_2025-03-20_20-06-37.png)
![Photograph Garage SPA Demo 2](docs/screenshots/Demos/Snipaste_2025-03-20_20-06-57.png)
![Photograph Garage SPA Demo 3](docs/screenshots/Demos/Snipaste_2025-03-20_20-07-13.png)
![Photograph Garage SPA Demo 4](docs/screenshots/Demos/Snipaste_2025-03-20_20-08-06.png)
![Photograph Garage SPA Demo 5](docs/screenshots/Demos/Snipaste_2025-03-20_20-08-49.png)
![Photograph Garage SPA Demo 6](docs/screenshots/Demos/Snipaste_2025-03-20_20-10-16.png)
