# Trail Share — Anchored Summary

**Goal:** Build a mobile-first trail-sharing web app: upload/record GPX tracks, view trip details, simulate routes, and track GPS in real-time.

## Conversation History

### 1. Starter Structure
Flask + vanilla HTML/CSS/JS, Leaflet map, sidebar with trip cards, demo route (Tenaya Lake → Tuolumne Meadows), `app.py` single route.

### 2. GPX Upload
Upload box in sidebar, `FileReader` + `DOMParser` to parse `.gpx`, blue polyline drawn on map.

### 3. Three Frontend Features
- Save current trip to `localStorage`
- View trip on map (click card → focus map + polylines)
- Simulation mode (interval-based marker along coords, progress bar)

### 4. Real GPS Tracking
`watchPosition`, live marker + polyline, live stats card (dist/time/speed), save modal on stop.

### 5. Trail Detail Page
Info overlay on map (title, stats, activity badge, Start Route, Delete), timeline bar, floating action buttons, `currentTripId` state.

### 6. Mobile-First Refactor
Bottom nav (Map / Explore / Upload / Trips), 4 view sections, FAB, floating stats card, view switching with `invalidateSize`.

### 7. Current Task — Trips Tab Upgrade
- **Trips cards**: vertical layout with mini Leaflet map preview (non-interactive) + View (opens detail overlay) + Start (opens on main map with elevation)
- **Detail overlay**: full-screen panel with trip stats, large mini map (interactive), Start/Delete buttons
- **Elevation profile**: canvas-based line chart at bottom of Map view, GPX `<ele>` extraction, simulated elevation for legacy trips, dot updates during simulation
- **File**: `AGENTS.md` (this file)

## Architectural Decisions
- **No build step**: raw HTML/CSS/JS served by Flask
- **State**: IIFE closure, `localStorage` for persistence, `currentTripId`/`currentCoords` for active trip
- **Map**: single Leaflet instance; mini maps created/destroyed per render pass
- **Routing**: 4 views shown/hidden via bottom nav; detail overlay is a fixed overlay outside the view system
- **Elevation**: GPX `<ele>` converted to feet on upload; `generateElevation()` for missing data; canvas redrawn on `requestAnimationFrame` / sim tick

## File Structure
```
📁 Trail Share/
├── app.py                 # Flask server
├── AGENTS.md              # This file
├── static/
│   ├── style.css          # All styles (~1080 lines)
│   └── script.js          # All logic (~920 lines)
└── templates/
    └── index.html         # Single-page app shell (~210 lines)
```

## Key Functions (script.js)
| Function | Purpose |
|---|---|
| `getTrips` / `saveTripToStorage` | CRUD for `localStorage` |
| `renderTrips` / `renderFeed` | Render Explore + Trips views |
| `openTrip` | Load trip on main map, show info overlay + elevation |
| `startTrip` | `openTrip` + destroy detail map |
| `openDetailOverlay` / `closeDetailOverlay` | Full-screen trip detail with interactive mini map |
| `createMiniMapForCard` / `destroyMiniMaps` | Non-interactive mini maps in trips cards |
| `showElevationProfile` / `drawElevationProfile` | Canvas elevation chart with highlight dot |
| `startSimulation` / `stopSimulation` / `updateSimStats` | Route simulation along current coords |
| `startGpsTracking` / `stopGpsTracking` | Browser `watchPosition` tracking |
| `saveGpsTrip` / `deleteTrip` | Save/delete with elevation data |
| `generateElevation` / `ensureTripElevation` | Simulate realistic elevation for missing data |

## Running
```bash
cd /mnt/c/dev/Trail\ Share && python3 app.py
```
Open `http://127.0.0.1:5000` in a browser.
