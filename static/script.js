(function () {
  "use strict";

  /* ─── State ─── */
  var currentCoords = null;
  var currentTripId = null;
  var mode = "idle";
  var simInterval = null;
  var simIndex = 0;
  var simMarker = null;
  var totalRouteDist = 0;
  var gpsWatchId = null;
  var gpsPoints = [];
  var gpsStartTime = null;
  var gpsPolyline = null;
  var gpsMarker = null;
  var gpsLiveLayer = null;
  var gpsTimerInterval = null;
  var currentView = "map";
  var miniMaps = {};
  var doMap = null;
  var doMapInitialized = false;
  var tripElevationData = [];
  var currentElevationData = null;

  /* ─── Map ─── */
  var map = L.map("map", {
    center: [37.865, -119.538],
    zoom: 11,
    zoomControl: true,
    attributionControl: true,
  });

  L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    attribution:
      '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> contributors',
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

  /* ─── Helpers ─── */
  function haversineDistance(lat1, lon1, lat2, lon2) {
    var R = 3958.8;
    var dLat = ((lat2 - lat1) * Math.PI) / 180;
    var dLon = ((lon2 - lon1) * Math.PI) / 180;
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * 3958.8 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function calcRouteDistance(coords) {
    var total = 0;
    for (var i = 1; i < coords.length; i++) {
      total += haversineDistance(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
    }
    return total;
  }

  function escapeHtml(str) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  function generateElevation(points, activity) {
    var base = activity === "biking" ? 400 + Math.random() * 200 : 7000 + Math.random() * 3000;
    var amp = activity === "biking" ? 80 : 600;
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
      duration: "—", elevation: "—", description: "",
    });
    localStorage.setItem("trailshare_trips", JSON.stringify(trips));
  }

  /* ─── Render Trips ─── */
  function renderTrips() {
    destroyMiniMaps();
    var trips = getTrips();
    var exploreSearch = (document.getElementById("explore-search").value || "").toLowerCase().trim();
    var tripsSearch = (document.getElementById("trips-search").value || "").toLowerCase().trim();
    var activeFilter = document.querySelector("#view-explore .filter-btn.active");
    var filter = activeFilter ? activeFilter.dataset.filter : "hiking";
    var sortBy = document.querySelector("#view-trips .sort-btn.active");
    var sort = sortBy ? sortBy.dataset.sort : "latest";

    var sorted = trips.slice();
    if (sort === "distance") sorted.sort(function (a, b) { return a.distance - b.distance; });
    else sorted.sort(function (a, b) {
      var aTime = new Date(a.date || 0).getTime();
      var bTime = new Date(b.date || 0).getTime();
      return bTime - aTime;
    });

    renderFeed("explore-feed", trips, filter, exploreSearch, "explore");
    renderFeed("trips-feed", sorted, null, tripsSearch, "trips");
  }

  function renderFeed(containerId, trips, filter, query, viewType) {
    var container = document.getElementById(containerId);
    container.innerHTML = "";

    if (trips.length === 0) {
      container.innerHTML = '<div class="empty-state">No trips yet.<br />Upload a GPX or record a GPS track.</div>';
      return;
    }

    var count = 0;
    trips.forEach(function (trip) {
      if (filter && filter !== trip.activity) return;
      if (query && trip.name.toLowerCase().indexOf(query) === -1) return;
      count++;

      var card = document.createElement("div");
      card.className = "trip-card" + (trip.id === currentTripId ? " active" : "") + (viewType === "trips" ? " trip-card-vertical" : "");
      card.dataset.activity = trip.activity;
      card.dataset.tripId = trip.id;

      if (viewType === "trips") {
        var mmId = "mm-" + trip.id;
        card.innerHTML =
          '<div class="trip-mini-map" id="' + mmId + '"></div>' +
          '<div class="trip-card-body">' +
          '<div class="trip-card-info">' +
          '<h3 class="trip-title">' + escapeHtml(trip.name) + '</h3>' +
          '<span class="trip-distance">' + trip.distance.toFixed(1) + ' mi</span>' +
          '<span class="trip-badge ' + trip.activity + '">' + trip.activity + '</span></div>' +
          '<div class="trip-card-actions">' +
          '<button class="view-btn" data-id="' + trip.id + '">View</button>' +
          '<button class="start-btn" data-id="' + trip.id + '">Start</button></div></div>';

        container.appendChild(card);

        var vBtn = card.querySelector('.view-btn');
        var sBtn = card.querySelector('.start-btn');
        vBtn.addEventListener('click', function (e) { e.stopPropagation(); openDetailOverlay(trip.id); });
        sBtn.addEventListener('click', function (e) { e.stopPropagation(); startTrip(trip.id); });

        requestAnimationFrame(function () {
          createMiniMapForCard(mmId, trip.points);
        });
      } else {
        var thumbColor = trip.activity === "hiking" ? "#5a7c5f" : "#7a8f6a";
        var thumbIcon = trip.activity === "hiking" ? "&#9968;" : "&#128690;";
        card.innerHTML =
          '<div class="trip-thumb" style="background-color:' + thumbColor + ';">' +
          '<span class="trip-thumb-icon">' + thumbIcon + '</span></div>' +
          '<div class="trip-info">' +
          '<h3 class="trip-title">' + escapeHtml(trip.name) + '</h3>' +
          '<span class="trip-distance">' + trip.distance.toFixed(1) + ' mi</span>' +
          '<span class="trip-badge ' + trip.activity + '">' + trip.activity + '</span></div>';

        card.addEventListener("click", function () { openTrip(trip.id); });
        container.appendChild(card);
      }
    });

    if (count === 0) {
      container.innerHTML = '<div class="empty-state">No trips match your filters.</div>';
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
      if (miniMaps.hasOwnProperty(key)) {
        miniMaps[key].remove();
      }
    }
    miniMaps = {};
  }

  /* ─── Open Trip (trip info overlay on map) ─── */
  function openTrip(id) {
    if (simInterval) stopSimulation();
    if (gpsWatchId) stopGpsTracking(false);
    if (gpsLiveLayer) { map.removeLayer(gpsLiveLayer); gpsLiveLayer = null; }

    var trips = getTrips();
    var trip = null;
    for (var i = 0; i < trips.length; i++) {
      if (trips[i].id === id) { trip = trips[i]; break; }
    }
    if (!trip) return;

    currentTripId = id;
    currentCoords = trip.points;
    totalRouteDist = trip.distance;
    mode = "viewing";
    updateMode();
    showElevationProfile(trip);

    document.getElementById("info-title").textContent = trip.name;
    document.getElementById("info-activity").textContent =
      trip.activity.charAt(0).toUpperCase() + trip.activity.slice(1);
    document.getElementById("info-activity").className = "ob-badge " + trip.activity;
    document.getElementById("info-dist").textContent = trip.distance.toFixed(1) + " mi";
    document.getElementById("info-dur").textContent = trip.duration || "—";
    document.getElementById("info-ele").textContent = trip.elevation || "—";

    gpxLayer.clearLayers();
    var route = L.polyline(trip.points, { color: "#4a7bb5", weight: 4, opacity: 0.85 });
    gpxLayer.addLayer(route);
    map.fitBounds(route.getBounds(), { padding: [40, 40] });

    document.getElementById("timeline-bar").style.display = "flex";
    document.getElementById("trip-info").style.display = "block";
    document.getElementById("sim-panel").style.display = "none";
    document.getElementById("tracking-card").style.display = "none";
    document.getElementById("fab-btn").style.display = "block";
    document.getElementById("fab-stop").style.display = "none";

    updateTimeline(0);
    renderTrips();
    switchView("map");
  }

  /* ─── Start Trip (load on main map + elevation) ─── */
  function startTrip(id) {
    destroyDetailOverlayMap();
    openTrip(id);
  }

  /* ─── Detail Overlay ─── */
  function openDetailOverlay(id) {
    var trips = getTrips();
    var trip = null;
    for (var i = 0; i < trips.length; i++) {
      if (trips[i].id === id) { trip = trips[i]; break; }
    }
    if (!trip) return;

    document.getElementById("detail-overlay").classList.remove("hidden");
    document.getElementById("do-title").textContent = trip.name;
    var badge = document.getElementById("do-badge");
    badge.textContent = trip.activity;
    badge.className = "badge " + trip.activity;
    document.getElementById("do-distance").textContent = trip.distance.toFixed(1) + " mi";
    document.getElementById("do-duration").textContent = trip.duration && trip.duration !== "—" ? trip.duration : "—";
    var avgSpeed = trip.duration && trip.duration !== "—" ? (trip.distance / parseFloat(trip.duration)).toFixed(1) + " mph" : "—";
    document.getElementById("do-speed").textContent = avgSpeed;

    document.getElementById("do-start").dataset.tripId = id;
    document.getElementById("do-delete").dataset.tripId = id;

    if (!doMapInitialized) {
      doMap = L.map("do-map", {
        zoomControl: false, attributionControl: false,
        dragging: true, scrollWheelZoom: true,
      });
      L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
        maxZoom: 17, attribution: "",
      }).addTo(doMap);
      doMapInitialized = true;
    }

    doMap.invalidateSize();
    setTimeout(function () {
      doMap.invalidateSize();
      var route = L.polyline(trip.points, { color: "#5a7c5f", weight: 4, opacity: 0.85 });
      doMap.eachLayer(function (l) { if (l instanceof L.Polyline) doMap.removeLayer(l); });
      doMap.addLayer(route);
      try { doMap.fitBounds(route.getBounds(), { padding: [16, 16] }); } catch (e) {}
    }, 100);
  }

  function destroyDetailOverlayMap() {
    if (doMap) { doMap.remove(); doMap = null; doMapInitialized = false; }
  }

  function closeDetailOverlay() {
    document.getElementById("detail-overlay").classList.add("hidden");
  }

  /* ─── Elevation Profile ─── */
  function showElevationProfile(trip) {
    ensureTripElevation(trip);
    tripElevationData = trip.elevationData;

    var panel = document.getElementById("elevation-panel");
    panel.style.display = "block";
    document.getElementById("ep-elevation").textContent = tripElevationData[0] + " ft";
    document.getElementById("ep-dist").textContent = "0.0 mi / " + trip.distance.toFixed(1) + " mi";

    drawElevationProfile(trip);
  }

  function hideElevationProfile() {
    document.getElementById("elevation-panel").style.display = "none";
    tripElevationData = [];
  }

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
    // fill background
    ctx.fillStyle = "#f8f9f7";
    ctx.fillRect(0, 0, w, h);

    // draw line
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

    // fill under line
    ctx.lineTo(
      cumulativeDist[cumulativeDist.length - 1] / totalDist * (w - pad * 2) + pad,
      h - pad
    );
    ctx.lineTo(pad, h - pad);
    ctx.closePath();
    ctx.fillStyle = "rgba(90, 124, 95, 0.08)";
    ctx.fill();

    // highlight dot
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

      document.getElementById("ep-elevation").textContent = data[highlightIndex] + " ft";
      document.getElementById("ep-dist").textContent = cumulativeDist[highlightIndex].toFixed(1) + " mi / " + totalDist.toFixed(1) + " mi";
    }
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

    if (view === "map") {
      map.invalidateSize();
    }
  }

  /* ─── Mode ─── */
  function updateMode() {
    var el = document.getElementById("mode-indicator");
    if (mode === "recording") { el.textContent = "SIMULATING ROUTE"; el.classList.remove("gps"); }
    else if (mode === "viewing") { el.textContent = "VIEWING TRIP"; el.classList.remove("gps"); }
    else if (mode === "gps") { el.textContent = "LIVE TRACKING"; el.classList.add("gps"); }
    else { el.textContent = "Idle"; el.classList.remove("gps"); }
  }

  function showTripOnMap(coords, fit) {
    gpxLayer.clearLayers();
    var route = L.polyline(coords, { color: "#4a7bb5", weight: 4, opacity: 0.85 });
    gpxLayer.addLayer(route);
    if (fit && coords.length >= 2) {
      map.fitBounds(route.getBounds(), { padding: [40, 40] });
    }
  }

  function updateTimeline(progress) {
    if (!currentCoords || !totalRouteDist) {
      document.getElementById("timeline-fill").style.width = "0%";
      document.getElementById("timeline-progress").textContent = "0%";
      document.getElementById("timeline-distance").textContent = "0.0 mi";
      return;
    }
    var pct = Math.min(100, Math.max(0, progress));
    var dist = (pct / 100) * totalRouteDist;
    document.getElementById("timeline-fill").style.width = pct + "%";
    document.getElementById("timeline-progress").textContent = Math.round(pct) + "%";
    document.getElementById("timeline-distance").textContent =
      dist.toFixed(1) + " mi / " + totalRouteDist.toFixed(1) + " mi";
  }

  /* ─── Simulation ─── */
  function startSimulation() {
    if (!currentCoords || currentCoords.length < 2) return;

    mode = "recording";
    updateMode();
    simIndex = 0;
    if (simMarker) map.removeLayer(simMarker);

    simMarker = L.circleMarker(currentCoords[0], {
      radius: 7, color: "#b34a4a", fillColor: "#b34a4a", fillOpacity: 1, weight: 2,
    }).addTo(map);

    document.getElementById("trip-info").style.display = "none";
    document.getElementById("sim-panel").style.display = "block";
    document.getElementById("sim-progress-fill").style.width = "0%";
    document.getElementById("sim-covered").textContent = "0.0 mi";
    document.getElementById("sim-remaining").textContent = totalRouteDist.toFixed(1) + " mi";
    document.getElementById("sim-progress").textContent = "0%";
    document.getElementById("elevation-panel").style.display = "block";

    if (currentView !== "map") switchView("map");

    simInterval = setInterval(function () {
      simIndex++;
      if (simIndex >= currentCoords.length) { stopSimulation(); return; }
      simMarker.setLatLng(currentCoords[simIndex]);
      updateSimStats();
    }, 300);
  }

  function stopSimulation() {
    if (simInterval) { clearInterval(simInterval); simInterval = null; }
    if (simMarker) { map.removeLayer(simMarker); simMarker = null; }
    mode = "viewing";
    updateMode();
    document.getElementById("sim-panel").style.display = "none";
    document.getElementById("elevation-panel").style.display = "none";
    if (currentTripId) {
      document.getElementById("trip-info").style.display = "block";
    }
  }

  function updateSimStats() {
    var covered = 0;
    for (var i = 1; i <= simIndex && i < currentCoords.length; i++) {
      covered += haversineDistance(
        currentCoords[i-1][0], currentCoords[i-1][1],
        currentCoords[i][0], currentCoords[i][1]
      );
    }
    var remaining = Math.max(0, totalRouteDist - covered);
    var progress = totalRouteDist > 0 ? Math.min(100, (covered / totalRouteDist) * 100) : 0;

    document.getElementById("sim-covered").textContent = covered.toFixed(1) + " mi";
    document.getElementById("sim-remaining").textContent = remaining.toFixed(1) + " mi";
    document.getElementById("sim-progress").textContent = Math.round(progress) + "%";
    document.getElementById("sim-progress-fill").style.width = progress + "%";
    updateTimeline(progress);

    // update elevation profile
    if (currentTripId && tripElevationData.length > 0) {
      var trips = getTrips();
      for (var t = 0; t < trips.length; t++) {
        if (trips[t].id === currentTripId) {
          drawElevationProfile(trips[t], Math.min(simIndex, trips[t].elevationData.length - 1));
          break;
        }
      }
    }
  }

  /* ─── GPS Tracking ─── */
  function startGpsTracking() {
    if (!navigator.geolocation) {
      document.getElementById("upload-error").textContent = "Geolocation is not supported.";
      return;
    }

    if (simInterval) stopSimulation();
    if (gpsLiveLayer) { map.removeLayer(gpsLiveLayer); gpsLiveLayer = null; }
    if (gpsWatchId) stopGpsTracking(false);

    currentCoords = null;
    currentTripId = null;
    mode = "gps";
    updateMode();

    gpsPoints = [];
    gpsStartTime = Date.now();
    gpsLiveLayer = L.featureGroup().addTo(map);
    gpxLayer.clearLayers();

    gpsMarker = L.circleMarker([0, 0], {
      radius: 8, color: "#3d5a3e", fillColor: "#5a7c5f", fillOpacity: 0.9, weight: 3,
    }).addTo(gpsLiveLayer);

    gpsPolyline = L.polyline([], { color: "#4a7bb5", weight: 4, opacity: 0.85 })
      .addTo(gpsLiveLayer);

    document.getElementById("trip-info").style.display = "none";
    document.getElementById("sim-panel").style.display = "none";
    document.getElementById("tracking-card").style.display = "block";
    document.getElementById("timeline-bar").style.display = "none";
    document.getElementById("fab-btn").style.display = "none";
    document.getElementById("fab-stop").style.display = "block";

    document.getElementById("tc-dist").textContent = "0.0 mi";
    document.getElementById("tc-time").textContent = "0:00";
    document.getElementById("tc-speed").textContent = "—";

    if (currentView !== "map") switchView("map");

    gpsWatchId = navigator.geolocation.watchPosition(gpsPositionHandler, gpsErrorHandler, {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 5000,
    });

    gpsTimerInterval = setInterval(updateGpsTimer, 1000);
  }

  function stopGpsTracking(showSave) {
    if (gpsWatchId) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
    if (gpsTimerInterval) { clearInterval(gpsTimerInterval); gpsTimerInterval = null; }

    document.getElementById("fab-btn").style.display = "block";
    document.getElementById("fab-stop").style.display = "none";
    document.getElementById("tracking-card").style.display = "none";

    mode = "idle";
    updateMode();

    if (showSave !== false && gpsPoints.length >= 2) {
      showSaveModal();
    } else {
      if (gpsLiveLayer) { map.removeLayer(gpsLiveLayer); gpsLiveLayer = null; }
    }
  }

  function gpsPositionHandler(position) {
    var lat = position.coords.latitude;
    var lng = position.coords.longitude;
    var accuracy = position.coords.accuracy;
    var speed = position.coords.speed;

    gpsPoints.push({ lat: lat, lng: lng, ts: position.timestamp });
    gpsMarker.setLatLng([lat, lng]);

    var coords = gpsPoints.map(function (p) { return [p.lat, p.lng]; });
    gpsPolyline.setLatLngs(coords);

    map.setView([lat, lng], map.getZoom());

    var dist = calcGpsDistance();
    document.getElementById("tc-dist").textContent = dist.toFixed(2) + " mi";
    if (speed !== null && speed !== undefined) {
      document.getElementById("tc-speed").textContent = (speed * 2.237).toFixed(1) + " mph";
    }
  }

  function gpsErrorHandler(err) {
    document.getElementById("upload-error").textContent = "GPS error: " + err.message;
  }

  function calcGpsDistance() {
    var total = 0;
    for (var i = 1; i < gpsPoints.length; i++) {
      total += haversineDistance(gpsPoints[i-1].lat, gpsPoints[i-1].lng, gpsPoints[i].lat, gpsPoints[i].lng);
    }
    return total;
  }

  function updateGpsTimer() {
    if (!gpsStartTime) return;
    var elapsed = Math.floor((Date.now() - gpsStartTime) / 1000);
    var min = Math.floor(elapsed / 60);
    var sec = elapsed % 60;
    document.getElementById("tc-time").textContent = min + ":" + (sec < 10 ? "0" : "") + sec;
  }

  /* ─── Save Modal ─── */
  function showSaveModal() {
    document.getElementById("modal-trip-name").value = "GPS Track " + new Date().toLocaleDateString();
    document.getElementById("save-modal").style.display = "flex";
  }

  function saveGpsTrip() {
    var name = document.getElementById("modal-trip-name").value.trim();
    if (!name) { document.getElementById("modal-trip-name").focus(); return; }

    var activityEl = document.querySelector('input[name="gps-activity"]:checked');
    var activity = activityEl ? activityEl.value : "hiking";
    var coords = gpsPoints.map(function (p) { return [p.lat, p.lng]; });

    saveTripToStorage(name, activity, coords);
    renderTrips();

    document.getElementById("save-modal").style.display = "none";
    if (gpsLiveLayer) { map.removeLayer(gpsLiveLayer); gpsLiveLayer = null; }

    var trips = getTrips();
    if (trips.length > 0) openTrip(trips[trips.length - 1].id);
  }

  /* ─── Delete Trip ─── */
  function deleteTrip(id) {
    var trips = getTrips().filter(function (t) { return t.id !== id; });
    localStorage.setItem("trailshare_trips", JSON.stringify(trips));

    if (currentTripId === id) {
      currentTripId = null; currentCoords = null;
      gpxLayer.clearLayers();
      document.getElementById("trip-info").style.display = "none";
      document.getElementById("sim-panel").style.display = "none";
      document.getElementById("timeline-bar").style.display = "none";
      document.getElementById("elevation-panel").style.display = "none";
      mode = "idle"; updateMode();
      map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
    }
    renderTrips();
  }

  /* ─── GPX Upload ─── */
  var gpxInput = document.getElementById("gpx-input");
  var gpxFilename = document.getElementById("gpx-filename");
  var loadBtn = document.getElementById("load-preview-btn");
  var uploadError = document.getElementById("upload-error");
  var gpxFile = null;

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
              elevations.push(isNaN(eleVal) ? 0 : Math.round(eleVal * 3.28084));
            } else {
              elevations.push(0);
            }
          }
        });

        if (coords.length < 2) throw new Error("Need at least 2 track points");

        if (simInterval) stopSimulation();
        if (gpsWatchId) stopGpsTracking(false);
        if (gpsLiveLayer) { map.removeLayer(gpsLiveLayer); gpsLiveLayer = null; }

        currentCoords = coords;
        currentElevationData = elevations;
        currentTripId = null;
        mode = "idle";
        updateMode();

        document.getElementById("trip-info").style.display = "none";
        document.getElementById("sim-panel").style.display = "none";
        document.getElementById("tracking-card").style.display = "none";
        document.getElementById("timeline-bar").style.display = "none";
        document.getElementById("elevation-panel").style.display = "none";

        showTripOnMap(coords, true);
        uploadError.textContent = "";

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
      uploadError.textContent = "Load or record a route first.";
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

    // FAB buttons
    document.getElementById("fab-btn").addEventListener("click", startGpsTracking);
    document.getElementById("fab-stop").addEventListener("click", function () { stopGpsTracking(true); });

    // Trip info card
    document.getElementById("info-start-route").addEventListener("click", startSimulation);
    document.getElementById("info-close").addEventListener("click", function () {
      document.getElementById("trip-info").style.display = "none";
      document.getElementById("timeline-bar").style.display = "none";
      document.getElementById("elevation-panel").style.display = "none";
      gpxLayer.clearLayers();
      currentTripId = null;
      currentCoords = null;
      mode = "idle";
      updateMode();
      map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
    });
    document.getElementById("info-delete").addEventListener("click", function () {
      document.getElementById("delete-modal").style.display = "flex";
    });

    // Sim stop
    document.getElementById("stop-sim-btn").addEventListener("click", stopSimulation);

    // Modals
    document.getElementById("modal-save-btn").addEventListener("click", saveGpsTrip);
    document.getElementById("modal-cancel-btn").addEventListener("click", function () {
      document.getElementById("save-modal").style.display = "none";
      if (gpsLiveLayer) { map.removeLayer(gpsLiveLayer); gpsLiveLayer = null; }
      gpsPoints = []; updateMode();
    });
    document.getElementById("modal-delete-confirm-btn").addEventListener("click", function () {
      document.getElementById("delete-modal").style.display = "none";
      if (currentTripId) deleteTrip(currentTripId);
    });
    document.getElementById("modal-delete-cancel-btn").addEventListener("click", function () {
      document.getElementById("delete-modal").style.display = "none";
    });

    // Explore filters + search
    document.querySelectorAll("#view-explore .filter-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("#view-explore .filter-btn").forEach(function (b) { b.classList.remove("active"); });
        this.classList.add("active");
        renderTrips();
      });
    });
    document.getElementById("explore-search").addEventListener("input", renderTrips);

    // Trips search + sort
    document.getElementById("trips-search").addEventListener("input", renderTrips);
    document.querySelectorAll("#view-trips .sort-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("#view-trips .sort-btn").forEach(function (b) { b.classList.remove("active"); });
        this.classList.add("active");
        renderTrips();
      });
    });

    // Detail overlay
    document.getElementById("do-back").addEventListener("click", closeDetailOverlay);
    document.getElementById("do-start").addEventListener("click", function () {
      var id = this.dataset.tripId;
      closeDetailOverlay();
      if (id) startTrip(id);
    });
    document.getElementById("do-delete").addEventListener("click", function () {
      var id = this.dataset.tripId;
      if (id) {
        currentTripId = id;
        closeDetailOverlay();
        document.getElementById("delete-modal").style.display = "flex";
      }
    });

    // Elevation panel close
    document.getElementById("ep-close").addEventListener("click", hideElevationProfile);
  }

  /* ─── Init ─── */
  wire();
  renderTrips();
  switchView("map");
  updateMode();
})();
