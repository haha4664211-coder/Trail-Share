(function () {
  "use strict";

  /* ─── State ─── */
  var currentCoords = null;
  var currentTripId = null;
  var mode = "idle";
  var totalRouteDist = 0;
  var currentView = "map";
  var miniMaps = {};
  var doMap = null;
  var doMapInitialized = false;

  // Route tracking state
  var routeMode = "idle";
  var routeTripId = null;
  var routeTimer = null;
  var routeStartTime = null;
  var routeElapsed = 0;
  var routeGpsWatchId = null;
  var routeGpsPoints = [];
  var routeGpsPolyline = null;
  var routeGpsMarker = null;
  var routeGpsLayer = null;
  var routeCurrentDist = 0;

  // Map expand
  var meMap = null;
  var meInitialized = false;

  // User location dot
  var userWatchId = null;
  var userMarker = null;

  /* ─── Map ─── */
  var map = L.map("map", {
    center: [37.865, -119.538],
    zoom: 11,
    zoomControl: true,
    attributionControl: true,
  });

  L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> contributors',
  }).addTo(map);

  /* ─── Demo Route ─── */
  var routeCoords = [
    [37.830, -119.458], [37.835, -119.465], [37.841, -119.472],
    [37.848, -119.478], [37.855, -119.483], [37.862, -119.487],
    [37.868, -119.490], [37.875, -119.495], [37.880, -119.500],
    [37.886, -119.508], [37.892, -119.516], [37.896, -119.525],
    [37.900, -119.533], [37.905, -119.540], [37.910, -119.546],
    [37.916, -119.552], [37.922, -119.557], [37.928, -119.563],
    [37.933, -119.570], [37.938, -119.578], [37.942, -119.586],
  ];

  var routeLine = L.polyline(routeCoords, {
    color: "#5a7c5f", weight: 4, opacity: 0.85,
  }).addTo(map);

  var startIcon = L.divIcon({
    className: "custom-marker",
    html: '<div style="background:#3d5a3e;width:12px;height:12px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
    iconSize: [12, 12], iconAnchor: [6, 6],
  });

  var endIcon = L.divIcon({
    className: "custom-marker",
    html: '<div style="background:#7a9a7e;width:12px;height:12px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
    iconSize: [12, 12], iconAnchor: [6, 6],
  });

  L.marker(routeCoords[0], { icon: startIcon })
    .addTo(map).bindPopup("<strong>Start:</strong> Tenaya Lake Trailhead");
  L.marker(routeCoords[routeCoords.length - 1], { icon: endIcon })
    .addTo(map).bindPopup("<strong>End:</strong> Tuolumne Meadows");

  map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });

  var gpxLayer = L.featureGroup().addTo(map);

  /* ─── User Location ─── */
  function startUserTracking() {
    if (!navigator.geolocation) { console.warn("Geolocation not supported."); return; }

    userMarker = L.circleMarker([37.865, -119.538], {
      radius: 7, color: "#3a7bd5", fillColor: "#5a9cf5", fillOpacity: 0.8, weight: 3,
    }).addTo(map);

    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      userMarker.setLatLng([lat, lng]);
      map.setView([lat, lng], 14);
    }, function (err) {
      console.warn("getCurrentPosition error:", err.code, err.message);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });

    userWatchId = navigator.geolocation.watchPosition(function (pos) {
      userMarker.setLatLng([pos.coords.latitude, pos.coords.longitude]);
    }, function (err) {
      console.warn("watchPosition error:", err.code, err.message);
    }, { enableHighAccuracy: false, timeout: 30000, maximumAge: 10000 });
  }

  /* ─── Helpers ─── */
  function haversineDistance(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = ((lat2 - lat1) * Math.PI) / 180;
    var dLon = ((lon2 - lon1) * Math.PI) / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function calcRouteDistance(coords) {
    var total = 0;
    for (var i = 1; i < coords.length; i++)
      total += haversineDistance(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
    return total;
  }

  function escapeHtml(str) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  function generateElevation(points, activity) {
    var base = activity === "biking" ? 120 + Math.random() * 60 : 2000 + Math.random() * 900;
    var amp = activity === "biking" ? 25 : 180;
    var elevations = [];
    for (var i = 0; i < points.length; i++) {
      var t = i / (points.length - 1);
      var variation = Math.sin(t * 8 * Math.PI) * amp * 0.5
        + Math.sin(t * 3.7 * Math.PI) * amp * 0.3
        + Math.sin(t * 15 * Math.PI) * amp * 0.2;
      var grade = t < 0.5 ? t * 400 : (1 - t) * 400;
      elevations.push(Math.round(base + variation + grade));
    }
    return elevations;
  }

  function ensureTripElevation(trip) {
    if (trip.elevationData && trip.elevationData.length === trip.points.length) return;
    trip.elevationData = generateElevation(trip.points, trip.activity);
  }

  function calcElevationGainLoss(trip) {
    ensureTripElevation(trip);
    var gain = 0, loss = 0;
    for (var i = 1; i < trip.elevationData.length; i++) {
      var diff = trip.elevationData[i] - trip.elevationData[i-1];
      if (diff > 0) gain += diff;
      else loss += Math.abs(diff);
    }
    return { gain: Math.round(gain), loss: Math.round(loss) };
  }

  function calcDifficulty(trip) {
    var score = trip.distance + (trip.elevationGain || 0) / 500;
    if (score < 5) return "Easy";
    if (score < 15) return "Medium";
    if (score < 30) return "Hard";
    return "Extreme";
  }

  function findTrip(id) {
    var trips = getTrips();
    for (var i = 0; i < trips.length; i++) {
      if (trips[i].id === id) return trips[i];
    }
    return null;
  }

  /* ─── Trip Storage ─── */
  function getTrips() {
    var data = localStorage.getItem("trailshare_trips");
    return data ? JSON.parse(data) : [];
  }

  function saveTripToStorage(name, activity, coords, elevationData) {
    var trips = getTrips();
    var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var distance = calcRouteDistance(coords);
    trips.push({
      id: id, name: name, activity: activity || "hiking",
      distance: distance, points: coords,
      elevationData: elevationData || null,
      date: new Date().toISOString().split("T")[0],
    });
    localStorage.setItem("trailshare_trips", JSON.stringify(trips));
  }

  /* ─── Render Trips ─── */
  function renderTrips() {
    destroyMiniMaps();
    var trips = getTrips();
    var query = (document.getElementById("trips-search").value || "").toLowerCase().trim();
    var sortBy = document.querySelector("#view-trips .sort-btn.active");
    var sort = sortBy ? sortBy.dataset.sort : "latest";

    var sorted = trips.slice();
    if (sort === "distance") sorted.sort(function (a, b) { return a.distance - b.distance; });
    else sorted.sort(function (a, b) {
      return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    });

    var container = document.getElementById("trips-feed");
    container.innerHTML = "";

    if (sorted.length === 0) {
      container.innerHTML = '<div class="empty-state">No trips yet.<br />Upload a GPX file to get started.</div>';
      return;
    }

    var count = 0;
    sorted.forEach(function (trip) {
      if (query && trip.name.toLowerCase().indexOf(query) === -1) return;
      count++;

      var card = document.createElement("div");
      card.className = "trip-card trip-card-vertical";
      card.dataset.tripId = trip.id;

      var mmId = "mm-" + trip.id;
      card.innerHTML =
        '<div class="trip-mini-map" id="' + mmId + '"></div>' +
        '<div class="trip-card-body">' +
        '<div class="trip-card-info">' +
        '<h3 class="trip-title">' + escapeHtml(trip.name) + '</h3>' +
        '<span class="trip-distance">' + trip.distance.toFixed(1) + ' km</span>' +
        '<span class="trip-badge ' + trip.activity + '">' + trip.activity + '</span></div>' +
        '<div class="trip-card-actions">' +
        '<button class="view-btn" data-id="' + trip.id + '">View</button>' +
        '<button class="start-btn" data-id="' + trip.id + '">Start</button></div></div>';

      container.appendChild(card);

      card.querySelector('.view-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        openDetailOverlay(trip.id);
      });
      card.querySelector('.start-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        startRoute(trip.id);
      });

      requestAnimationFrame(function () {
        createMiniMapForCard(mmId, trip.points);
      });
    });

    if (count === 0) {
      container.innerHTML = '<div class="empty-state">No trips match your search.</div>';
    }
  }

  /* ─── Mini Maps ─── */
  function createMiniMapForCard(containerId, points) {
    var el = document.getElementById(containerId);
    if (!el || points.length < 2) return;

    var mm = L.map(containerId, {
      zoomControl: false, attributionControl: false,
      dragging: false, scrollWheelZoom: false, touchZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false,
    });

    L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17, attribution: "",
    }).addTo(mm);

    L.polyline(points, { color: "#5a7c5f", weight: 3, opacity: 0.8 }).addTo(mm);
    try { mm.fitBounds(L.latLngBounds(points), { padding: [6, 6] }); } catch (e) {}
    miniMaps[containerId] = mm;
  }

  function destroyMiniMaps() {
    for (var key in miniMaps) {
      if (miniMaps.hasOwnProperty(key)) miniMaps[key].remove();
    }
    miniMaps = {};
  }

  /* ─── Detail Overlay ─── */
  var detailSmMap = null;
  var detailSmInitialized = false;

  function openDetailOverlay(id) {
    var trip = findTrip(id);
    if (!trip) return;

    var gl = calcElevationGainLoss(trip);
    trip.elevationGain = gl.gain;
    trip.elevationLoss = gl.loss;

    document.getElementById("detail-overlay").classList.remove("hidden");
    document.getElementById("do-title").textContent = trip.name;
    var badge = document.getElementById("do-badge");
    badge.textContent = trip.activity;
    badge.className = "badge " + trip.activity;
    document.getElementById("do-distance").textContent = trip.distance.toFixed(1) + " km";
    document.getElementById("do-gain").textContent = gl.gain + " m";
    document.getElementById("do-loss").textContent = gl.loss + " m";

    var diff = calcDifficulty(trip);
    var dEl = document.getElementById("do-diff");
    dEl.textContent = diff;
    dEl.className = "do-diff " + diff.toLowerCase();

    document.getElementById("do-start").dataset.tripId = id;
    document.getElementById("do-delete").dataset.tripId = id;

    // route history
    var histEl = document.getElementById("do-history");
    var listEl = document.getElementById("do-history-list");
    if (trip.routeHistory && trip.routeHistory.length > 0) {
      histEl.style.display = "block";
      listEl.innerHTML = trip.routeHistory.slice().reverse().map(function (r) {
        return '<div class="do-history-item">' +
          '<span class="hi-date">' + r.date + '</span>' +
          '<span class="hi-stat">' + r.distance.toFixed(1) + ' km<div class="hi-label">Dist</div></span>' +
          '<span class="hi-stat">' + r.time + '<div class="hi-label">Time</div></span>' +
          '</div>';
      }).join("");
    } else {
      histEl.style.display = "none";
    }

    // small map
    var smEl = document.getElementById("do-map-sm-inner");
    if (!detailSmInitialized) {
      detailSmMap = L.map(smEl, {
        zoomControl: false, attributionControl: false,
        dragging: false, scrollWheelZoom: false, touchZoom: false,
        doubleClickZoom: false, boxZoom: false, keyboard: false,
      });
      L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
        maxZoom: 17, attribution: "",
      }).addTo(detailSmMap);
      detailSmInitialized = true;
    }

    detailSmMap.invalidateSize();
    setTimeout(function () {
      detailSmMap.invalidateSize();
      detailSmMap.eachLayer(function (l) { if (l instanceof L.Polyline) detailSmMap.removeLayer(l); });
      var route = L.polyline(trip.points, { color: "#5a7c5f", weight: 4, opacity: 0.85 });
      detailSmMap.addLayer(route);
      try { detailSmMap.fitBounds(route.getBounds(), { padding: [8, 8] }); } catch (e) {}
    }, 100);
  }

  function closeDetailOverlay() {
    document.getElementById("detail-overlay").classList.add("hidden");
  }

  /* ─── Map Expand Overlay ─── */
  var expandRoute = null;

  function openMapExpand(id) {
    var trip = findTrip(id);
    if (!trip) return;

    document.getElementById("map-expand-overlay").classList.remove("hidden");

    var el = document.getElementById("me-map");
    if (!meInitialized) {
      meMap = L.map(el, {
        zoomControl: true, attributionControl: true,
        dragging: true, scrollWheelZoom: true,
      });
      L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
        maxZoom: 17,
        attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
      }).addTo(meMap);
      meInitialized = true;
    }

    meMap.invalidateSize();
    setTimeout(function () {
      meMap.invalidateSize();
      if (expandRoute) { meMap.removeLayer(expandRoute); }
      expandRoute = L.polyline(trip.points, { color: "#5a7c5f", weight: 5, opacity: 0.9 });
      meMap.addLayer(expandRoute);
      try { meMap.fitBounds(expandRoute.getBounds(), { padding: [20, 20] }); } catch (e) {}
    }, 100);
    meMap.dataset.tripId = id;
  }

  function closeMapExpand() {
    document.getElementById("map-expand-overlay").classList.add("hidden");
  }

  /* ─── Navigation ─── */
  function switchView(view) {
    currentView = view;
    document.querySelectorAll(".nav-tab").forEach(function (el) {
      el.classList.toggle("active", el.dataset.view === view);
    });
    document.querySelectorAll(".view").forEach(function (el) {
      el.classList.remove("active");
    });
    document.getElementById("view-" + view).classList.add("active");
    closeDetailOverlay();
    if (view === "map") map.invalidateSize();
  }

  /* ─── Mode ─── */
  function updateMode() {
    var el = document.getElementById("mode-indicator");
    if (routeMode === "routing") { el.textContent = "ROUTE ACTIVE"; el.classList.add("active"); }
    else if (routeMode === "paused") { el.textContent = "ROUTE PAUSED"; el.classList.add("active"); }
    else { el.textContent = "Idle"; el.classList.remove("active"); }
  }

  /* ─── Route Panel ─── */
  function showRoutePanel(trip) {
    document.getElementById("rp-title").textContent = trip.name;
    var badge = document.getElementById("rp-activity");
    badge.textContent = trip.activity;
    badge.className = "ob-badge " + trip.activity;
    document.getElementById("rp-dist").textContent = trip.distance.toFixed(1) + " km";
    document.getElementById("rp-ele").textContent = (trip.elevationGain || "—") + " m";
    document.getElementById("rp-diff").textContent = calcDifficulty(trip);
    document.getElementById("route-panel").style.display = "block";

    document.getElementById("rp-stats-idle").style.display = "flex";
    document.getElementById("rp-stats-active").style.display = "none";
    document.getElementById("rp-actions-idle").style.display = "flex";
    document.getElementById("rp-actions-active").style.display = "none";
  }

  function showRouteActive() {
    document.getElementById("rp-stats-idle").style.display = "none";
    document.getElementById("rp-stats-active").style.display = "flex";
    document.getElementById("rp-actions-idle").style.display = "none";
    document.getElementById("rp-actions-active").style.display = "flex";
    document.getElementById("rp-stop-btn").textContent = "Stop";
    document.getElementById("rp-stop-btn").className = "ob-btn ob-btn-danger";
    document.getElementById("rp-time").textContent = "0:00";
    document.getElementById("rp-covered").textContent = "0.0 km";
    document.getElementById("rp-remaining").textContent = totalRouteDist.toFixed(1) + " km";
  }

  function showRoutePaused() {
    document.getElementById("rp-stop-btn").textContent = "Start";
    document.getElementById("rp-stop-btn").className = "ob-btn";
  }

  function hideRoutePanel() {
    document.getElementById("route-panel").style.display = "none";
  }

  /* ─── Start Route ─── */
  function startRoute(id) {
    if (routeMode !== "idle") return;

    var trip = findTrip(id);
    if (!trip) return;

    closeDetailOverlay();

    currentTripId = id;
    currentCoords = trip.points;
    routeTripId = id;
    totalRouteDist = trip.distance;
    routeCurrentDist = 0;
    routeGpsPoints = [];

    ensureTripElevation(trip);
    var gl = calcElevationGainLoss(trip);
    trip.elevationGain = gl.gain;

    // set route active state immediately
    routeMode = "routing";
    updateMode();
    routeStartTime = Date.now();
    routeElapsed = 0;

    // show panels immediately so timer/buttons are visible
    showRoutePanel(trip);
    showRouteActive();
    document.getElementById("timeline-bar").style.display = "flex";
    document.getElementById("elevation-panel").style.display = "block";
    drawElevationProfile(trip, 0);
    document.getElementById("rp-time").textContent = "0:00";

    // switch to map
    if (currentView !== "map") switchView("map");

    // load route on map
    gpxLayer.clearLayers();
    var route = L.polyline(trip.points, { color: "#5a7c5f", weight: 4, opacity: 0.85 });
    gpxLayer.addLayer(route);
    map.fitBounds(route.getBounds(), { padding: [40, 40] });

    // gps tracking layer
    routeGpsLayer = L.featureGroup().addTo(map);
    routeGpsMarker = L.circleMarker([0, 0], {
      radius: 8, color: "#3d5a3e", fillColor: "#5a7c5f", fillOpacity: 0.9, weight: 3,
    }).addTo(routeGpsLayer);
    routeGpsPolyline = L.polyline([], { color: "#4a7bb5", weight: 4, opacity: 0.85 })
      .addTo(routeGpsLayer);

    // start timer
    routeTimer = setInterval(function () {
      if (routeMode === "routing") {
        routeElapsed = Date.now() - routeStartTime;
      }
      var sec = Math.floor(routeElapsed / 1000);
      var min = Math.floor(sec / 60);
      sec = sec % 60;
      document.getElementById("rp-time").textContent = min + ":" + (sec < 10 ? "0" : "") + sec;
    }, 200);

    try {
      routeGpsWatchId = navigator.geolocation.watchPosition(routeGpsHandler, function () {}, {
        enableHighAccuracy: true, timeout: 10000, maximumAge: 5000,
      });
    } catch (e) {}
  }

  function routeGpsHandler(pos) {
    if (routeMode !== "routing") return;
    var lat = pos.coords.latitude;
    var lng = pos.coords.longitude;

    routeGpsPoints.push({ lat: lat, lng: lng, ts: pos.timestamp });
    routeGpsMarker.setLatLng([lat, lng]);

    var pts = routeGpsPoints.map(function (p) { return [p.lat, p.lng]; });
    routeGpsPolyline.setLatLngs(pts);

    // calculate current distance along route
    routeCurrentDist = 0;
    for (var i = 1; i < pts.length; i++) {
      routeCurrentDist += haversineDistance(pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1]);
    }

    var remaining = Math.max(0, totalRouteDist - routeCurrentDist);
    document.getElementById("rp-covered").textContent = routeCurrentDist.toFixed(1) + " km";
    document.getElementById("rp-remaining").textContent = remaining.toFixed(1) + " km";

    var pct = totalRouteDist > 0 ? Math.min(100, (routeCurrentDist / totalRouteDist) * 100) : 0;
    document.getElementById("timeline-fill").style.width = pct + "%";
    document.getElementById("timeline-progress").textContent = Math.round(pct) + "%";
    document.getElementById("timeline-distance").textContent =
      routeCurrentDist.toFixed(1) + " km / " + totalRouteDist.toFixed(1) + " km";

    // update elevation dot to closest point on route
    var closestIdx = findClosestRouteIndex(lat, lng, currentCoords);
    if (closestIdx >= 0) {
      var trip = findTrip(routeTripId);
      if (trip) drawElevationProfile(trip, Math.min(closestIdx, trip.elevationData.length - 1));
    }
  }

  function findClosestRouteIndex(lat, lng, coords) {
    var minDist = Infinity, minIdx = -1;
    for (var i = 0; i < coords.length; i++) {
      var d = haversineDistance(lat, lng, coords[i][0], coords[i][1]);
      if (d < minDist) { minDist = d; minIdx = i; }
    }
    return minIdx;
  }

  function toggleRoute() {
    if (routeMode === "routing") {
      if (routeGpsWatchId) { navigator.geolocation.clearWatch(routeGpsWatchId); routeGpsWatchId = null; }
      routeElapsed = Date.now() - routeStartTime;
      routeMode = "paused";
      updateMode();
      showRoutePaused();
    } else if (routeMode === "paused") {
      routeMode = "routing";
      updateMode();
      routeStartTime = Date.now() - routeElapsed;
      showRouteActive();
      try {
        routeGpsWatchId = navigator.geolocation.watchPosition(routeGpsHandler, function () {}, {
          enableHighAccuracy: true, timeout: 10000, maximumAge: 5000,
        });
      } catch (e) {}
    }
  }

  function saveRouteResult(id, dist, elapsed) {
    if (!id) return;
    var trips = getTrips();
    for (var i = 0; i < trips.length; i++) {
      if (trips[i].id === id) {
        if (!trips[i].routeHistory) trips[i].routeHistory = [];
        var sec = Math.floor(elapsed / 1000);
        var min = Math.floor(sec / 60);
        sec = sec % 60;
        trips[i].routeHistory.push({
          distance: dist,
          time: min + ":" + (sec < 10 ? "0" : "") + sec,
          elapsed: elapsed,
          date: new Date().toISOString().split("T")[0],
        });
        break;
      }
    }
    localStorage.setItem("trailshare_trips", JSON.stringify(trips));
  }

  function endRoute() {
    if (routeTimer) { clearInterval(routeTimer); routeTimer = null; }
    if (routeGpsWatchId) { navigator.geolocation.clearWatch(routeGpsWatchId); routeGpsWatchId = null; }
    if (routeGpsLayer) { map.removeLayer(routeGpsLayer); routeGpsLayer = null; }

    var sec = Math.floor(routeElapsed / 1000);
    var min = Math.floor(sec / 60);
    sec = sec % 60;
    var timeStr = min + ":" + (sec < 10 ? "0" : "") + sec;

    var pace = routeCurrentDist > 0 ? (routeElapsed / 1000 / 60 / routeCurrentDist).toFixed(1) + " min/km" : "—";
    var avgSpeed = routeCurrentDist > 0 ? (routeCurrentDist / (routeElapsed / 1000 / 3600)).toFixed(1) + " km/h" : "—";

    saveRouteResult(routeTripId, routeCurrentDist, routeElapsed);

    document.getElementById("end-distance").textContent = routeCurrentDist.toFixed(1) + " km";
    document.getElementById("end-time").textContent = timeStr;
    document.getElementById("end-pace").textContent = pace;
    document.getElementById("end-speed").textContent = avgSpeed;
    var trip = findTrip(routeTripId);
    document.getElementById("end-gain").textContent = (trip ? (trip.elevationGain || 0) : 0) + " m";
    document.getElementById("end-date").textContent = new Date().toLocaleDateString();
    document.getElementById("end-modal").style.display = "flex";

    routeMode = "idle";
    updateMode();
    hideRoutePanel();
    document.getElementById("timeline-bar").style.display = "none";
    document.getElementById("elevation-panel").style.display = "none";

    routeTripId = null;
    currentTripId = null;
    currentCoords = null;
    routeGpsPoints = [];
    routeCurrentDist = 0;
    routeElapsed = 0;
  }

  function endRouteDone() {
    document.getElementById("end-modal").style.display = "none";
    gpxLayer.clearLayers();
    renderTrips();
    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
  }

  /* ─── Delete Trip ─── */
  function deleteTrip(id) {
    if (routeMode !== "idle") return;
    var trips = getTrips().filter(function (t) { return t.id !== id; });
    localStorage.setItem("trailshare_trips", JSON.stringify(trips));

    if (currentTripId === id) {
      currentTripId = null; currentCoords = null;
      gpxLayer.clearLayers();
      hideRoutePanel();
      document.getElementById("timeline-bar").style.display = "none";
      document.getElementById("elevation-panel").style.display = "none";
      mode = "idle"; updateMode();
      map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
    }
    renderTrips();
  }

  /* ─── Elevation Profile ─── */
  function drawElevationProfile(trip, highlightIndex) {
    var canvas = document.getElementById("ep-canvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    var w = rect.width, h = rect.height;

    var data = trip.elevationData;
    if (!data || data.length < 2) return;
    var minEle = Infinity, maxEle = -Infinity;
    for (var i = 0; i < data.length; i++) {
      if (data[i] < minEle) minEle = data[i];
      if (data[i] > maxEle) maxEle = data[i];
    }
    var range = maxEle - minEle || 1;
    var pad = 6;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#f8f9f7";
    ctx.fillRect(0, 0, w, h);

    var cumulativeDist = [0];
    for (var i = 1; i < trip.points.length; i++) {
      cumulativeDist.push(cumulativeDist[i-1] + haversineDistance(
        trip.points[i-1][0], trip.points[i-1][1],
        trip.points[i][0], trip.points[i][1]
      ));
    }
    var totalDist = cumulativeDist[cumulativeDist.length - 1] || 1;

    ctx.beginPath();
    ctx.strokeStyle = "#5a7c5f";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    for (var i = 0; i < data.length; i++) {
      var x = cumulativeDist[i] / totalDist * (w - pad * 2) + pad;
      var y = h - pad - ((data[i] - minEle) / range) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.lineTo(cumulativeDist[cumulativeDist.length - 1] / totalDist * (w - pad * 2) + pad, h - pad);
    ctx.lineTo(pad, h - pad);
    ctx.closePath();
    ctx.fillStyle = "rgba(90, 124, 95, 0.08)";
    ctx.fill();

    if (highlightIndex !== undefined && highlightIndex >= 0 && highlightIndex < data.length) {
      var hx = cumulativeDist[highlightIndex] / totalDist * (w - pad * 2) + pad;
      var hy = h - pad - ((data[highlightIndex] - minEle) / range) * (h - pad * 2);
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#b34a4a";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();

      document.getElementById("ep-elevation").textContent = data[highlightIndex] + " m";
      document.getElementById("ep-dist").textContent =
        cumulativeDist[highlightIndex].toFixed(1) + " km / " + totalDist.toFixed(1) + " km";
    }
  }

  /* ─── GPX Upload ─── */
  var gpxInput = document.getElementById("gpx-input");
  var gpxFilename = document.getElementById("gpx-filename");
  var loadBtn = document.getElementById("load-preview-btn");
  var uploadError = document.getElementById("upload-error");
  var gpxFile = null;
  var currentElevationData = null;

  gpxInput.addEventListener("change", function () {
    if (gpxInput.files.length > 0) {
      gpxFile = gpxInput.files[0];
      gpxFilename.textContent = gpxFile.name;
      uploadError.textContent = "";
    }
  });

  loadBtn.addEventListener("click", function () {
    if (!gpxFile) { uploadError.textContent = "Please select a .gpx file first."; return; }
    var reader = new FileReader();

    reader.onload = function (e) {
      try {
        var text = e.target.result;
        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString(text, "text/xml");

        if (xmlDoc.querySelector("parsererror")) throw new Error("Invalid XML file");

        var trackPoints = xmlDoc.querySelectorAll("trkpt");
        if (trackPoints.length === 0) throw new Error("No track points found in GPX file");

        var coords = [];
        var elevations = [];
        trackPoints.forEach(function (pt) {
          var lat = parseFloat(pt.getAttribute("lat"));
          var lon = parseFloat(pt.getAttribute("lon"));
          if (!isNaN(lat) && !isNaN(lon)) {
            coords.push([lat, lon]);
            var eleEl = pt.querySelector("ele");
            if (eleEl) {
              var eleVal = parseFloat(eleEl.textContent);
              elevations.push(isNaN(eleVal) ? 0 : Math.round(eleVal));
            } else {
              elevations.push(0);
            }
          }
        });

        if (coords.length < 2) throw new Error("Need at least 2 track points");

        if (routeMode !== "idle") { uploadError.textContent = "Finish current route first."; return; }

        currentCoords = coords;
        currentElevationData = elevations;
        currentTripId = null;

        gpxLayer.clearLayers();
        var route = L.polyline(coords, { color: "#4a7bb5", weight: 4, opacity: 0.85 });
        gpxLayer.addLayer(route);
        map.fitBounds(route.getBounds(), { padding: [40, 40] });
        uploadError.textContent = "";

        document.getElementById("elevation-panel").style.display = "none";

        if (currentView !== "map") switchView("map");

      } catch (err) {
        uploadError.textContent = err.message || "Failed to parse GPX file.";
      }
    };

    reader.onerror = function () { uploadError.textContent = "Failed to read file."; };
    reader.readAsText(gpxFile);
  });

  /* ─── Save Current Trip ─── */
  document.getElementById("save-trip-btn").addEventListener("click", function () {
    if (!currentCoords || currentCoords.length < 2) {
      uploadError.textContent = "Load a route first.";
      return;
    }
    var name = prompt("Name this trip:", "My Trip");
    if (!name || name.trim() === "") return;

    var activityEl = document.querySelector('input[name="up-activity"]:checked');
    var activity = activityEl ? activityEl.value : "hiking";

    saveTripToStorage(name.trim(), activity, currentCoords, currentElevationData);
    renderTrips();
    uploadError.textContent = "Trip saved!";
  });

  /* ─── Event Wiring ─── */
  function wire() {
    // Bottom nav
    document.querySelectorAll(".nav-tab").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        switchView(this.dataset.view);
      });
    });

    // Route panel
    document.getElementById("rp-close").addEventListener("click", function () {
      gpxLayer.clearLayers();
      hideRoutePanel();
      document.getElementById("timeline-bar").style.display = "none";
      document.getElementById("elevation-panel").style.display = "none";
      currentTripId = null; currentCoords = null;
      map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
    });
    document.getElementById("rp-start-btn").addEventListener("click", function () {
      if (currentTripId) startRoute(currentTripId);
    });
    document.getElementById("rp-delete-btn").addEventListener("click", function () {
      if (currentTripId) {
        document.getElementById("delete-modal").style.display = "flex";
      }
    });
    document.getElementById("rp-stop-btn").addEventListener("click", toggleRoute);
    document.getElementById("rp-end-btn").addEventListener("click", endRoute);

    // Detail overlay
    document.getElementById("do-back").addEventListener("click", closeDetailOverlay);
    document.getElementById("do-map-sm").addEventListener("click", function () {
      var id = document.getElementById("do-start").dataset.tripId;
      if (id) openMapExpand(id);
    });
    document.getElementById("do-start").addEventListener("click", function () {
      var id = this.dataset.tripId;
      closeDetailOverlay();
      if (id) startRoute(id);
    });
    document.getElementById("do-delete").addEventListener("click", function () {
      var id = this.dataset.tripId;
      if (id) {
        currentTripId = id;
        closeDetailOverlay();
        document.getElementById("delete-modal").style.display = "flex";
      }
    });

    // Map expand
    document.getElementById("me-back").addEventListener("click", closeMapExpand);

    // Elevation close
    document.getElementById("ep-close").addEventListener("click", function () {
      document.getElementById("elevation-panel").style.display = "none";
    });

    // Modals
    document.getElementById("modal-delete-confirm-btn").addEventListener("click", function () {
      document.getElementById("delete-modal").style.display = "none";
      if (currentTripId) deleteTrip(currentTripId);
    });
    document.getElementById("modal-delete-cancel-btn").addEventListener("click", function () {
      document.getElementById("delete-modal").style.display = "none";
    });
    document.getElementById("end-ok-btn").addEventListener("click", endRouteDone);

    // Trips search + sort
    document.getElementById("trips-search").addEventListener("input", renderTrips);
    document.querySelectorAll("#view-trips .sort-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("#view-trips .sort-btn").forEach(function (b) { b.classList.remove("active"); });
        this.classList.add("active");
        renderTrips();
      });
    });
  }

  /* ─── Init ─── */
  wire();
  renderTrips();
  switchView("map");
  updateMode();
  startUserTracking();
})();
