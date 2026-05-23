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
    [37.830, -119.458],
    [37.835, -119.465],
    [37.841, -119.472],
    [37.848, -119.478],
    [37.855, -119.483],
    [37.862, -119.487],
    [37.868, -119.490],
    [37.875, -119.495],
    [37.880, -119.500],
    [37.886, -119.508],
    [37.892, -119.516],
    [37.896, -119.525],
    [37.900, -119.533],
    [37.905, -119.540],
    [37.910, -119.546],
    [37.916, -119.552],
    [37.922, -119.557],
    [37.928, -119.563],
    [37.933, -119.570],
    [37.938, -119.578],
    [37.942, -119.586],
  ];

  var routeLine = L.polyline(routeCoords, {
    color: "#5a7c5f",
    weight: 4,
    opacity: 0.85,
  }).addTo(map);

  var startIcon = L.divIcon({
    className: "custom-marker",
    html: '<div style="background:#3d5a3e;width:12px;height:12px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

  var endIcon = L.divIcon({
    className: "custom-marker",
    html: '<div style="background:#7a9a7e;width:12px;height:12px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

  L.marker(routeCoords[0], { icon: startIcon })
    .addTo(map)
    .bindPopup("<strong>Start:</strong> Tenaya Lake Trailhead");

  L.marker(routeCoords[routeCoords.length - 1], { icon: endIcon })
    .addTo(map)
    .bindPopup("<strong>End:</strong> Tuolumne Meadows");

  map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });

  /* ─── Layers ─── */
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
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function calcRouteDistance(coords) {
    var total = 0;
    for (var i = 1; i < coords.length; i++) {
      total += haversineDistance(
        coords[i - 1][0],
        coords[i - 1][1],
        coords[i][0],
        coords[i][1]
      );
    }
    return total;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
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
      id: id,
      name: name,
      activity: activity || "hiking",
      distance: distance,
      points: coords,
    });
    localStorage.setItem("trailshare_trips", JSON.stringify(trips));
  }

  /* ─── Render Saved Trips ─── */
  function renderTrips() {
    var container = document.getElementById("saved-trips-list");
    var trips = getTrips();
    var activeFilter = document.querySelector(".filter-btn.active");
    var filter = activeFilter ? activeFilter.dataset.filter : "hiking";
    var query = (document.querySelector(".search-input").value || "")
      .toLowerCase()
      .trim();

    container.innerHTML = "";

    trips.forEach(function (trip) {
      var matchesFilter = filter === trip.activity;
      var matchesSearch = trip.name.toLowerCase().indexOf(query) !== -1;
      if (!matchesFilter || !matchesSearch) return;

      var card = document.createElement("div");
      card.className =
        "trip-card" + (trip.id === currentTripId ? " active" : "");
      card.dataset.activity = trip.activity;
      card.dataset.tripId = trip.id;

      var thumbColor =
        trip.activity === "hiking" ? "#5a7c5f" : "#7a8f6a";
      var thumbIcon = trip.activity === "hiking" ? "&#9968;" : "&#128690;";
      var distStr = trip.distance.toFixed(1) + " mi";

      card.innerHTML =
        '<div class="trip-thumb" style="background-color:' +
        thumbColor +
        ';">' +
        '<span class="trip-thumb-icon">' +
        thumbIcon +
        "</span>" +
        "</div>" +
        '<div class="trip-info">' +
        '<h3 class="trip-title">' +
        escapeHtml(trip.name) +
        "</h3>" +
        '<span class="trip-distance">' +
        distStr +
        "</span>" +
        '<span class="trip-badge ' +
        trip.activity +
        '">' +
        trip.activity +
        "</span>" +
        "</div>";

      var footer = document.createElement("div");
      footer.className = "trip-card-footer";
      var viewBtn = document.createElement("button");
      viewBtn.className = "view-btn";
      viewBtn.textContent = "View";
      viewBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        viewTrip(trip.id);
      });
      footer.appendChild(viewBtn);
      card.appendChild(footer);

      card.addEventListener("click", function () {
        viewTrip(trip.id);
      });

      container.appendChild(card);
    });
  }

  /* ─── View Trip ─── */
  function viewTrip(id) {
    if (simInterval) stopSimulation();

    var trips = getTrips();
    var trip = null;
    for (var i = 0; i < trips.length; i++) {
      if (trips[i].id === id) {
        trip = trips[i];
        break;
      }
    }
    if (!trip) return;

    currentTripId = id;
    currentCoords = trip.points;
    mode = "viewing";
    updateMode();

    gpxLayer.clearLayers();

    var route = L.polyline(trip.points, {
      color: "#4a7bb5",
      weight: 4,
      opacity: 0.85,
    });
    gpxLayer.addLayer(route);
    map.fitBounds(route.getBounds(), { padding: [40, 40] });

    totalRouteDist = trip.distance;

    document.getElementById("sim-panel").style.display = "block";
    document.getElementById("start-trip-btn").style.display = "block";
    document.getElementById("stop-trip-btn").style.display = "none";
    document.getElementById("sim-covered").textContent = "0.0 mi";
    document.getElementById("sim-remaining").textContent =
      trip.distance.toFixed(1) + " mi";
    document.getElementById("sim-progress").textContent = "0%";

    renderTrips();
  }

  /* ─── Simulation ─── */
  function startSimulation() {
    if (!currentCoords || currentCoords.length < 2) return;

    mode = "recording";
    updateMode();
    simIndex = 0;

    if (simMarker) map.removeLayer(simMarker);

    simMarker = L.circleMarker(currentCoords[0], {
      radius: 7,
      color: "#b34a4a",
      fillColor: "#b34a4a",
      fillOpacity: 1,
      weight: 2,
    }).addTo(map);

    document.getElementById("start-trip-btn").style.display = "none";
    document.getElementById("stop-trip-btn").style.display = "block";
    updateStats();

    simInterval = setInterval(function () {
      simIndex++;
      if (simIndex >= currentCoords.length) {
        stopSimulation();
        return;
      }
      simMarker.setLatLng(currentCoords[simIndex]);
      updateStats();
    }, 300);
  }

  function stopSimulation() {
    if (simInterval) {
      clearInterval(simInterval);
      simInterval = null;
    }
    if (simMarker) {
      map.removeLayer(simMarker);
      simMarker = null;
    }
    mode = "viewing";
    updateMode();

    document.getElementById("start-trip-btn").style.display = "block";
    document.getElementById("stop-trip-btn").style.display = "none";
  }

  function updateStats() {
    var covered = 0;
    for (var i = 1; i <= simIndex && i < currentCoords.length; i++) {
      covered += haversineDistance(
        currentCoords[i - 1][0],
        currentCoords[i - 1][1],
        currentCoords[i][0],
        currentCoords[i][1]
      );
    }

    var remaining = Math.max(0, totalRouteDist - covered);
    var progress =
      totalRouteDist > 0
        ? Math.min(100, (covered / totalRouteDist) * 100)
        : 0;

    document.getElementById("sim-covered").textContent =
      covered.toFixed(1) + " mi";
    document.getElementById("sim-remaining").textContent =
      remaining.toFixed(1) + " mi";
    document.getElementById("sim-progress").textContent =
      Math.round(progress) + "%";
  }

  /* ─── Mode ─── */
  function updateMode() {
    var el = document.getElementById("mode-indicator");
    if (mode === "recording") el.textContent = "Recording Trip";
    else if (mode === "viewing") el.textContent = "Viewing Trip";
    else el.textContent = "Idle";
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
    if (!gpxFile) {
      uploadError.textContent = "Please select a .gpx file first.";
      return;
    }

    var reader = new FileReader();

    reader.onload = function (e) {
      try {
        var text = e.target.result;
        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString(text, "text/xml");

        var parseError = xmlDoc.querySelector("parsererror");
        if (parseError) {
          throw new Error("Invalid XML file");
        }

        var trackPoints = xmlDoc.querySelectorAll("trkpt");
        if (trackPoints.length === 0) {
          throw new Error("No track points found in GPX file");
        }

        var coords = [];
        trackPoints.forEach(function (pt) {
          var lat = parseFloat(pt.getAttribute("lat"));
          var lon = parseFloat(pt.getAttribute("lon"));
          if (!isNaN(lat) && !isNaN(lon)) {
            coords.push([lat, lon]);
          }
        });

        if (coords.length < 2) {
          throw new Error("Need at least 2 track points to draw a route");
        }

        if (simInterval) stopSimulation();
        currentCoords = coords;
        currentTripId = null;
        mode = "idle";
        updateMode();
        document.getElementById("sim-panel").style.display = "none";

        gpxLayer.clearLayers();

        var gpxRoute = L.polyline(coords, {
          color: "#4a7bb5",
          weight: 4,
          opacity: 0.85,
        });

        gpxLayer.addLayer(gpxRoute);
        map.fitBounds(gpxRoute.getBounds(), { padding: [40, 40] });
        uploadError.textContent = "";
      } catch (err) {
        uploadError.textContent =
          err.message || "Failed to parse GPX file.";
      }
    };

    reader.onerror = function () {
      uploadError.textContent = "Failed to read file.";
    };

    reader.readAsText(gpxFile);
  });

  /* ─── Save Current Trip ─── */
  document.getElementById("save-trip-btn").addEventListener("click", function () {
    if (!currentCoords || currentCoords.length < 2) {
      uploadError.textContent = "Load a GPX route first.";
      return;
    }

    var name = prompt("Name this trip:", "My Trip");
    if (!name || name.trim() === "") return;

    var activeFilter = document.querySelector(".filter-btn.active");
    var activity = activeFilter ? activeFilter.dataset.filter : "hiking";

    saveTripToStorage(name.trim(), activity, currentCoords);
    renderTrips();
  });

  /* ─── Simulation Controls ─── */
  document
    .getElementById("start-trip-btn")
    .addEventListener("click", startSimulation);
  document
    .getElementById("stop-trip-btn")
    .addEventListener("click", stopSimulation);

  /* ─── Filter Buttons ─── */
  var filterBtns = document.querySelectorAll(".filter-btn");

  filterBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      filterBtns.forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      renderTrips();
    });
  });

  /* ─── Search ─── */
  document.querySelector(".search-input").addEventListener("input", function () {
    renderTrips();
  });

  /* ─── Init ─── */
  renderTrips();
  updateMode();
})();
