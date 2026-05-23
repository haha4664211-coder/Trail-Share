(function () {
  "use strict";

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

  /* ─── Demo Route (Tenaya Lake → Tuolumne Meadows area) ─── */
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

  /* Start / End markers */
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

  /* Fit map to route with padding */
  map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });

  /* ─── GPX Upload ─── */
  var gpxLayer = L.featureGroup().addTo(map);
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
        uploadError.textContent = err.message || "Failed to parse GPX file.";
      }
    };

    reader.onerror = function () {
      uploadError.textContent = "Failed to read file.";
    };

    reader.readAsText(gpxFile);
  });

  /* ─── Filter Buttons ─── */
  var filterBtns = document.querySelectorAll(".filter-btn");
  var tripCards = document.querySelectorAll(".trip-card");

  filterBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      filterBtns.forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");

      var filter = btn.dataset.filter;

      tripCards.forEach(function (card) {
        if (filter === card.dataset.activity) {
          card.style.display = "flex";
        } else {
          card.style.display = "none";
        }
      });
    });
  });

  /* ─── Search (basic filter by title) ─── */
  var searchInput = document.querySelector(".search-input");

  searchInput.addEventListener("input", function () {
    var query = this.value.toLowerCase().trim();

    tripCards.forEach(function (card) {
      var title = card.querySelector(".trip-title").textContent.toLowerCase();
      if (title.indexOf(query) !== -1) {
        card.style.display = "flex";
      } else {
        card.style.display = "none";
      }
    });
  });
})();
