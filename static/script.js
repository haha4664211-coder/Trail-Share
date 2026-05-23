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

  /* ─── Trip Storage ─── */
  function getTrips() {
    var data = localStorage.getItem("trailshare_trips");
    return data ? JSON.parse(data) : [];
  }

  function saveTripToStorage(name, activity, coords) {
    var trips = getTrips();
    var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var distance = calcRouteDistance(coords);
    trips.push({
      id: id, name: name, activity: activity || "hiking",
      distance: distance, points: coords,
      date: new Date().toISOString().split("T")[0],
      duration: "—", elevation: "—", description: "",
    });
    localStorage.setItem("trailshare_trips", JSON.stringify(trips));
  }

  /* ─── Render Trips ─── */
  function renderTrips() {
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

    renderFeed("explore-feed", trips, filter, exploreSearch, false);
    renderFeed("trips-feed", sorted, null, tripsSearch, true);
  }

  function renderFeed(containerId, trips, filter, query, showViewBtn) {
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
      card.className = "trip-card" + (trip.id === currentTripId ? " active" : "");
      card.dataset.activity = trip.activity;
      card.dataset.tripId = trip.id;

      var thumbColor = trip.activity === "hiking" ? "#5a7c5f" : "#7a8f6a";
      var thumbIcon = trip.activity === "hiking" ? "&#9968;" : "&#128690;";
      var distStr = trip.distance.toFixed(1) + " mi";

      card.innerHTML =
        '<div class="trip-thumb" style="background-color:' + thumbColor + ';">' +
        '<span class="trip-thumb-icon">' + thumbIcon + '</span></div>' +
        '<div class="trip-info">' +
        '<h3 class="trip-title">' + escapeHtml(trip.name) + '</h3>' +
        '<span class="trip-distance">' + distStr + '</span>' +
        '<span class="trip-badge ' + trip.activity + '">' + trip.activity + '</span></div>';

      if (showViewBtn) {
        var footer = document.createElement("div");
        footer.className = "trip-card-footer";
        var btn = document.createElement("button");
        btn.className = "view-btn";
        btn.textContent = "View";
        btn.addEventListener("click", function (e) { e.stopPropagation(); openTrip(trip.id); });
        footer.appendChild(btn);
        card.appendChild(footer);
      }

      card.addEventListener("click", function () { openTrip(trip.id); });
      container.appendChild(card);
    });

    if (count === 0) {
      container.innerHTML = '<div class="empty-state">No trips match your filters.</div>';
    }
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
        trackPoints.forEach(function (pt) {
          var lat = parseFloat(pt.getAttribute("lat"));
          var lon = parseFloat(pt.getAttribute("lon"));
          if (!isNaN(lat) && !isNaN(lon)) coords.push([lat, lon]);
        });

        if (coords.length < 2) throw new Error("Need at least 2 track points");

        if (simInterval) stopSimulation();
        if (gpsWatchId) stopGpsTracking(false);
        if (gpsLiveLayer) { map.removeLayer(gpsLiveLayer); gpsLiveLayer = null; }

        currentCoords = coords;
        currentTripId = null;
        mode = "idle";
        updateMode();

        document.getElementById("trip-info").style.display = "none";
        document.getElementById("sim-panel").style.display = "none";
        document.getElementById("tracking-card").style.display = "none";
        document.getElementById("timeline-bar").style.display = "none";

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

    saveTripToStorage(name.trim(), activity, currentCoords);
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
  }

  /* ─── Init ─── */
  wire();
  renderTrips();
  switchView("map");
  updateMode();
})();
