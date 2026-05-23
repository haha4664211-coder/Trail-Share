# Trail Share — Anchored Summary

**Goal:** Build a mobile-first trail-sharing web app: upload GPX tracks, view trip details, start real GPS routes with live progress, and examine route terrain on an interactive map.

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

### 7. Trips Tab Upgrade (Removed in v8)
Vertical min-map cards, full-screen detail overlay, elevation profile canvas. **Replaced in v8.**

### 9. Bug Fixes (Current)
- **Line 441 typo**: `routeTotalDist` was undefined (undeclared variable), throwing a `ReferenceError` in strict mode. This crashed `showRouteActive()`, preventing the timer, GPS tracking, and remaining distance from ever initializing. Timer not starting, stop button appearing dead, and remaining distance never updating were all caused by this single error.
- **User location**: Empty error callbacks in geolocation API caused silent failure when GPS was denied/timed out. Added console warnings and centered the dot on the map's default location instead of [0,0] (off the coast of Africa).
- **Cache-busting**: Added `?v=2` query parameter to `style.css` and `script.js` URLs to force browsers to load fresh files on upgrade.

### 8. Route Tracking Redesign
- **Removed**: GPS FAB button, standalone GPS tracking, save modal, Explore tab, simulation mode
- **Bottom nav**: 3 tabs — Map, Upload, Trips
- **Auto-locate**: app centers map on user location on start
- **Trips cards**: vertical cards with mini map + View (opens detail with clickable terrain map) + Start (launches route)
- **Detail overlay**: small non-interactive route map (tap to expand to full-screen interactive terrain map), distance/elevation gain/elevation loss/difficulty rating (Easy/Medium/Hard/Extreme)
- **Map expand overlay**: full-screen Leaflet map with zoom/pan to examine terrain (road surfaces, vegetation)
- **Route tracking**: Start Route → GPS autostarts, shows time/covered/remaining + elevation profile + timeline. Stop (pause), Resume, End Route.
- **End summary**: modal showing total distance, elapsed time, pace

## Architectural Decisions
- **No build step**: raw HTML/CSS/JS served by Flask
- **State**: IIFE closure, `localStorage` for persistence
- **Route tracking**: route panel has idle/active states; GPS `watchPosition` auto-started on route begin
- **Maps**: single main Leaflet instance; mini maps (card + detail) created/destroyed per render; expand overlay has its own persistent map
- **Difficulty**: scored from distance + elevation gain; Easy (<5), Medium (5-15), Hard (15-30), Extreme (30+)

## File Structure
```
📁 Trail Share/
├── app.py                 # Flask server
├── AGENTS.md              # This file
├── static/
│   ├── style.css          # All styles (~860 lines)
│   └── script.js          # All logic (~855 lines)
└── templates/
    └── index.html         # Single-page app shell (~194 lines)
```

## Key Functions (script.js)
| Function | Purpose |
|---|---|
| `getTrips` / `saveTripToStorage` | CRUD for `localStorage` |
| `renderTrips` | Render trips feed with mini maps |
| `openDetailOverlay` / `closeDetailOverlay` | Trip detail with small map, elevation gain/loss, difficulty |
| `openMapExpand` / `closeMapExpand` | Full-screen interactive map for terrain inspection |
| `startRoute` / `stopRoute` / `resumeRoute` / `endRoute` | Route tracking lifecycle |
| `routeGpsHandler` | `watchPosition` callback updating distance, timeline, elevation dot |
| `drawElevationProfile` | Canvas elevation chart with live position dot |
| `calcElevationGainLoss` | Sum elevation changes from GPX/generated data |
| `calcDifficulty` | Score-based difficulty rating |
| `autoLocate` | Center map on user position on startup |
| `createMiniMapForCard` / `destroyMiniMaps` | Non-interactive mini maps in trips cards |
| `generateElevation` / `ensureTripElevation` | Simulate realistic elevation for missing data |

## Running
```bash
cd /mnt/c/dev/Trail\ Share && python3 app.py
```
Open `http://127.0.0.1:5000` in a browser.
