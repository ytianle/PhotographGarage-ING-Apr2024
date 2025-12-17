# Photograph Garage SPA

## Overview

The photograph garage now runs as a modern single-page application powered by React 18, Vite, and TypeScript. It still talks to the existing AWS backend (API Gateway, Lambda, S3) for authentication and album data, but the presentation layer has been rebuilt for faster navigation, responsive layouts, and richer interactions.

Key front-end capabilities:
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

All static assets (icons, gifs, album covers) live under `public/` and are served directly by Vite.

## Project Structure

```
src/
	App.tsx              # Top-level shell wiring auth + gallery contexts
	components/          # LoginModal, ControlPanel, GalleryGrid, etc.
	context/             # AuthProvider + GalleryProvider
	data/                # Album cover lookups and default imagery
	hooks/               # Lazy Fancybox binding and EXIF metadata cache
	lib/                 # Tree builder + shared typing
	styles/              # Global reset + app-specific styling
```

Legacy static assets (`index.js`, `index.css`) remain for reference but are no longer used by the SPA entrypoint.

## Notes

- The gallery still targets `https://7jaqpxmr1h.execute-api.us-west-2.amazonaws.com/prod` for album listings and `https://x67i134qw3.execute-api.us-west-2.amazonaws.com/prod/login` for authentication. Update the constants in `src/context/AuthContext.tsx` and `src/context/GalleryContext.tsx` if endpoints change.
- Thumbnail metadata (`*_info.json`) is loaded on demand with in-memory caching to keep popovers fast without spamming S3.
- Fancybox styles are imported once in `App.tsx`. If you customize the lightbox, adjust `useFancybox.ts`.

## Screenshots

Existing demo imagery in `Demos/` still represents the experience; regenerate as needed once the SPA is deployed.

