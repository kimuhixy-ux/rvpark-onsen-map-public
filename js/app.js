(function () {
  "use strict";

  const DEFAULT_CENTER = [36.0, 138.0];
  const DEFAULT_ZOOM = 5;
  const GEOLOCATION_ZOOM = 10;
  const NEARBY_ONSEN_RADIUS_KM = 10;
  const NEARBY_ONSEN_LIMIT = 3;

  const TYPE_META = {
    rvpark: { emoji: "🚐", color: "#1a73e8", label: "🚐 RVパーク" },
    autocamp: { emoji: "⛺", color: "#7b3fe4", label: "⛺ オートキャンプ" },
    onsen: { emoji: "♨", color: "#e05a2b", label: "♨ 温泉" },
    michinoeki: { emoji: "🅿️", color: "#2e7d32", label: "🅿️ 道の駅" },
    udon: { emoji: "🍜", color: "#d81b60", label: "🍜 うどん" },
  };
  const TYPES = Object.keys(TYPE_META);

  const state = {
    spots: [],
    spotsById: new Map(),
    markersById: new Map(),
    typeVisible: Object.fromEntries(TYPES.map((t) => [t, true])),
    minRating: 0,
    udonLargeParkingOnly: false,
  };

  const map = L.map("map", {
    zoomControl: true,
    attributionControl: true,
  }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const clusterGroups = {};
  for (const type of TYPES) {
    clusterGroups[type] = L.markerClusterGroup();
    clusterGroups[type].addTo(map);
  }

  function makeIcon(spot) {
    const meta = TYPE_META[spot.type];
    const isLargeParkingUdon = spot.type === "udon" && spot.large_parking;
    const markerClass = isLargeParkingUdon ? "spot-marker spot-marker-large-parking" : "spot-marker";
    const badge = isLargeParkingUdon ? `<span class="parking-badge">P</span>` : "";
    return L.divIcon({
      html: `<div class="${markerClass}" style="background:${meta.color}"><span>${meta.emoji}</span>${badge}</div>`,
      className: "spot-marker-wrapper",
      iconSize: [30, 30],
      popupAnchor: [0, -14],
    });
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function findNearbyOnsen(spot) {
    const candidates = [];
    for (const other of state.spots) {
      if (other.type !== "onsen") continue;
      const dist = haversineKm(spot.lat, spot.lng, other.lat, other.lng);
      if (dist <= NEARBY_ONSEN_RADIUS_KM) {
        candidates.push({ spot: other, dist });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates.slice(0, NEARBY_ONSEN_LIMIT);
  }

  function appleMapsSearchUrl(spot) {
    const query = encodeURIComponent(spot.name);
    return `https://maps.apple.com/?q=${query}&ll=${spot.lat},${spot.lng}`;
  }

  function appleMapsDirectionsUrl(spot) {
    return `https://maps.apple.com/?daddr=${spot.lat},${spot.lng}&dirflg=d`;
  }

  function tabelogSearchUrl(spot) {
    const query = encodeURIComponent(spot.name);
    return `https://tabelog.com/kagawa/rstLst/?sk=${query}&sw=${query}`;
  }

  function safeWebsiteUrl(rawUrl) {
    if (!rawUrl) return null;
    const firstUrl = String(rawUrl).trim().split(/[\s,;]+/)[0];
    const withScheme = /^https?:\/\//i.test(firstUrl) ? firstUrl : `https://${firstUrl}`;
    try {
      const parsed = new URL(withScheme);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
    } catch (_error) {
      return null;
    }
  }

  function buildPopupContent(spot) {
    const typeLabel = TYPE_META[spot.type].label;
    const parts = [`<div class="spot-popup">`];
    parts.push(`<h3>${escapeHtml(spot.name)}</h3>`);
    parts.push(`<div class="spot-type">${typeLabel}${spot.pref ? " ・ " + escapeHtml(spot.pref) : ""}</div>`);

    if (spot.rating !== null && spot.rating !== undefined) {
      const countText = spot.rating_count ? `（${spot.rating_count}件）` : "";
      parts.push(`<div class="spot-rating">★${spot.rating}${countText}</div>`);
    }

    if (spot.type === "udon") {
      parts.push(buildUdonParkingInfo(spot));
    }

    parts.push(`<div class="spot-links">`);
    parts.push(`<a href="${appleMapsSearchUrl(spot)}" target="_blank" rel="noopener">マップで開く</a>`);
    parts.push(`<a href="${appleMapsDirectionsUrl(spot)}" target="_blank" rel="noopener">経路案内</a>`);
    const websiteUrl = safeWebsiteUrl(spot.website);
    if (websiteUrl) {
      parts.push(`<a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noopener">公式サイト</a>`);
    }
    if (spot.type === "udon") {
      parts.push(`<a href="${tabelogSearchUrl(spot)}" target="_blank" rel="noopener">食べログで探す</a>`);
    }
    parts.push(`</div>`);

    if (spot.type === "rvpark" || spot.type === "autocamp" || spot.type === "michinoeki") {
      const nearby = findNearbyOnsen(spot);
      if (nearby.length > 0) {
        parts.push(`<div class="nearby-onsen"><h4>近くの温泉</h4><ul>`);
        for (const { spot: onsen, dist } of nearby) {
          parts.push(
            `<li><a href="#" class="nearby-onsen-link" data-id="${onsen.id}">${escapeHtml(
              onsen.name
            )}</a>（${dist.toFixed(1)}km）</li>`
          );
        }
        parts.push(`</ul></div>`);
      }
    }

    parts.push(`</div>`);
    return parts.join("");
  }

  function buildUdonParkingInfo(spot) {
    if (spot.large_parking) {
      const detail = spot.parking_capacity
        ? `駐車場 約${spot.parking_capacity}台分`
        : spot.parking_area_m2
        ? `駐車場 約${spot.parking_area_m2}㎡`
        : "";
      return `<div class="spot-parking spot-parking-large">🅿️ 広い駐車場あり${detail ? "（" + detail + "・OSM推定）" : ""}</div>`;
    }
    if (spot.parking_capacity || spot.parking_area_m2) {
      return `<div class="spot-parking">🅿️ 駐車場あり</div>`;
    }
    return `<div class="spot-parking spot-parking-unknown">🅿️ 駐車場情報なし</div>`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function passesRatingFilter(spot) {
    if (state.minRating <= 0) return true;
    if (spot.rating === null || spot.rating === undefined) return false;
    return spot.rating >= state.minRating;
  }

  function passesUdonParkingFilter(spot) {
    if (!state.udonLargeParkingOnly) return true;
    if (spot.type !== "udon") return true;
    return !!spot.large_parking;
  }

  function rebuildClusters() {
    for (const type of TYPES) {
      clusterGroups[type].clearLayers();
    }

    for (const spot of state.spots) {
      if (!passesRatingFilter(spot)) continue;
      if (!passesUdonParkingFilter(spot)) continue;
      const marker = state.markersById.get(spot.id);
      clusterGroups[spot.type].addLayer(marker);
    }

    for (const type of TYPES) {
      if (state.typeVisible[type]) {
        if (!map.hasLayer(clusterGroups[type])) clusterGroups[type].addTo(map);
      } else {
        if (map.hasLayer(clusterGroups[type])) map.removeLayer(clusterGroups[type]);
      }
    }
  }

  function focusSpot(spotId) {
    const spot = state.spotsById.get(spotId);
    const marker = state.markersById.get(spotId);
    if (!spot || !marker) return;

    if (!state.typeVisible[spot.type]) {
      state.typeVisible[spot.type] = true;
      document.getElementById(`toggle-${spot.type}`).classList.add("active");
    }
    state.minRating = 0;
    document.querySelectorAll(".rating-btn").forEach((btn) => btn.classList.remove("active"));
    document.querySelector('.rating-btn[data-min-rating="0"]').classList.add("active");

    rebuildClusters();

    map.setView([spot.lat, spot.lng], 15);
    const group = clusterGroups[spot.type];
    if (group.zoomToShowLayer) {
      group.zoomToShowLayer(marker, () => marker.openPopup());
    } else {
      marker.openPopup();
    }
  }

  document.addEventListener("click", (e) => {
    const link = e.target.closest(".nearby-onsen-link");
    if (!link) return;
    e.preventDefault();
    focusSpot(link.dataset.id);
    document.getElementById("search-panel").classList.add("hidden");
  });

  async function loadSpots() {
    const res = await fetch("data/spots.json");
    const data = await res.json();
    state.spots = data.spots;

    for (const spot of state.spots) {
      state.spotsById.set(spot.id, spot);
      const marker = L.marker([spot.lat, spot.lng], { icon: makeIcon(spot) });
      marker.bindPopup(() => buildPopupContent(spot));
      state.markersById.set(spot.id, marker);
    }

    rebuildClusters();
  }

  // フィルタUI: 種別トグル
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      state.typeVisible[type] = !state.typeVisible[type];
      btn.classList.toggle("active", state.typeVisible[type]);
      rebuildClusters();
    });
  });

  // フィルタUI: 評価
  document.querySelectorAll(".rating-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".rating-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.minRating = parseFloat(btn.dataset.minRating);
      rebuildClusters();
    });
  });

  // フィルタUI: うどん屋の駐車場
  const udonParkingBtn = document.getElementById("udon-parking-btn");
  if (udonParkingBtn) {
    udonParkingBtn.addEventListener("click", () => {
      state.udonLargeParkingOnly = !state.udonLargeParkingOnly;
      udonParkingBtn.classList.toggle("active", state.udonLargeParkingOnly);
      rebuildClusters();
    });
  }

  // 検索
  const searchToggleBtn = document.getElementById("search-toggle-btn");
  const searchPanel = document.getElementById("search-panel");
  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");

  searchToggleBtn.addEventListener("click", () => {
    searchPanel.classList.toggle("hidden");
    if (!searchPanel.classList.contains("hidden")) {
      searchInput.focus();
    }
  });

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    searchResults.innerHTML = "";
    if (!q) return;

    const matches = state.spots.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 30);
    for (const spot of matches) {
      const li = document.createElement("li");
      const typeIcon = TYPE_META[spot.type].emoji;
      li.innerHTML = `${typeIcon} ${escapeHtml(spot.name)}<span class="spot-pref">${
        spot.pref ? escapeHtml(spot.pref) : ""
      }</span>`;
      li.addEventListener("click", () => {
        focusSpot(spot.id);
        searchPanel.classList.add("hidden");
        searchInput.value = "";
        searchResults.innerHTML = "";
      });
      searchResults.appendChild(li);
    }
  });

  // 現在地ボタン
  document.getElementById("locate-btn").addEventListener("click", () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], GEOLOCATION_ZOOM);
      },
      () => {},
      { timeout: 8000 }
    );
  });

  // 初期表示: 現在地が取得できれば現在地中心、できなければ日本全体
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], GEOLOCATION_ZOOM);
      },
      () => {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      },
      { timeout: 5000 }
    );
  }

  loadSpots();
})();
