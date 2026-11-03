const $ = id => document.getElementById(id);
let stream = null;
let latestFix = null;
let watchId = null;
let lastBlob = null;
let db = null;
const records = [];
const MAX_FIX_AGE_MS = 60_000;

function setStatus(message) { $("status").textContent = message; }

function dbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("PhotoFieldTagging", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function saveRecord(record, blob) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").add({ ...record, image: blob });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function formatFix(fix) {
  const ageSeconds = Math.max(0, Math.round((Date.now() - fix.timestamp) / 1000));
  return `Lat ${fix.lat.toFixed(6)}°, Long ${fix.lon.toFixed(6)}° · ±${Math.round(fix.accuracy)} m · ${ageSeconds} dtk lalu`;
}

function updateGpsUI(state, detail = "") {
  const pill = $("gpsState");
  const text = $("gpsText");
  if (state === "searching") {
    pill.textContent = "Mencari GPS…";
    pill.className = "pill warn";
    text.textContent = detail || "Menunggu sinyal satelit. Tetap di luar ruangan bila memungkinkan.";
  } else if (state === "locked" && latestFix) {
    pill.textContent = `GPS terkunci ±${Math.round(latestFix.accuracy)} m`;
    pill.className = "pill ok";
    text.textContent = formatFix(latestFix);
  } else if (state === "error") {
    pill.textContent = "GPS belum tersedia";
    pill.className = "pill warn";
    text.textContent = detail || "Periksa izin lokasi dan pengaturan lokasi perangkat.";
  }
}

function acceptPosition(position) {
  const c = position.coords;
  if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude) || !Number.isFinite(c.accuracy)) return;
  latestFix = {
    lat: c.latitude,
    lon: c.longitude,
    accuracy: c.accuracy,
    timestamp: position.timestamp || Date.now()
  };
  updateGpsUI("locked");
}

function handleGeoError(error) {
  let message = "GPS belum berhasil diperoleh.";
  if (error.code === 1) message = "Izin lokasi ditolak. Izinkan lokasi presisi untuk situs ini.";
  if (error.code === 2) message = "Perangkat belum memberikan posisi. Coba di luar ruangan dan pastikan Lokasi aktif.";
  if (error.code === 3) message = "Pencarian GPS masih berlangsung terlalu lama. Aplikasi akan tetap mencoba.";
  if (!latestFix) updateGpsUI("error", message);
  else updateGpsUI("locked");
}

function startGpsTracking() {
  if (!("geolocation" in navigator)) {
    updateGpsUI("error", "Browser ini tidak menyediakan layanan lokasi.");
    return;
  }
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  updateGpsUI("searching", "Mencari posisi GPS. Pencarian akan terus berjalan selama aplikasi terbuka.");
  // A quick cached read can give an initial fix, then watchPosition keeps updating it.
  navigator.geolocation.getCurrentPosition(acceptPosition, handleGeoError, {
    enableHighAccuracy: true, timeout: 60_000, maximumAge: 30_000
  });
  watchId = navigator.geolocation.watchPosition(acceptPosition, handleGeoError, {
    enableHighAccuracy: true, timeout: 120_000, maximumAge: 5_000
  });
}

function getFreshFixForCapture() {
  return new Promise(resolve => {
    const now = Date.now();
    if (latestFix && now - latestFix.timestamp <= MAX_FIX_AGE_MS) {
      resolve({ ...latestFix, source: "gps" });
      return;
    }
    if (!navigator.geolocation) { resolve(null); return; }
    updateGpsUI("searching", "Meminta pembacaan GPS terbaru untuk foto ini…");
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    navigator.geolocation.getCurrentPosition(
      p => { acceptPosition(p); finish({ ...latestFix, source: "gps" }); },
      () => finish(latestFix && Date.now() - latestFix.timestamp <= MAX_FIX_AGE_MS ? { ...latestFix, source: "last-known" } : null),
      { enableHighAccuracy: true, timeout: 60_000, maximumAge: 10_000 }
    );
    // Do not block the camera shutter for a full minute; use a recent valid fix if one exists.
    setTimeout(() => finish(latestFix && Date.now() - latestFix.timestamp <= MAX_FIX_AGE_MS ? { ...latestFix, source: "last-known" } : null), 12_000);
  });
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    const video = $("video");
    video.srcObject = stream;
    await new Promise(resolve => {
      if (video.readyState >= 1) return resolve();
      video.addEventListener("loadedmetadata", resolve, { once: true });
    });
    // Rotate only a portrait camera feed inside the landscape preview.
    video.classList.toggle("rotate-landscape", video.videoHeight > video.videoWidth);
    $("cameraPlaceholder").hidden = true;
    $("capture").disabled = false;
    startGpsTracking();
  } catch (e) {
    setStatus("Kamera gagal dibuka. Pastikan izin kamera diberikan dan aplikasi dibuka melalui HTTPS.");
  }
}

function drawWrapped(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
}

async function capture() {
  if (!stream) return;
  const video = $("video");
  const canvas = $("canvas");
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) { setStatus("Kamera belum siap."); return; }

  // The browser prototype captures the current video frame. This is not equivalent to a full-resolution native camera still.
  // Hasil akhir landscape tanpa memutar seluruh halaman aplikasi.
  const portraitStream = height > width;
  canvas.width = portraitStream ? height : width;
  canvas.height = portraitStream ? width : height;
  const ctx = canvas.getContext("2d");
  if (portraitStream) {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(video, -width / 2, -height / 2, width, height);
  } else {
    ctx.drawImage(video, 0, 0, width, height);
  }

  const takenAt = new Date();
  const gpsFix = await getFreshFixForCapture();
  const farmer = $("farmer").value.trim();
  const note = "";

  const lines = [
    farmer || "Dokumentasi Lahan Petani",
    "Desa Silau Jawa, Bandar Pasir Mandoge",
    "Kabupaten Asahan, Sumatera Utara",
    gpsFix ? `Lat ${gpsFix.lat.toFixed(6)}°  Long ${gpsFix.lon.toFixed(6)}°` : "Koordinat GPS tidak tersedia",
    gpsFix ? `Akurasi GPS ±${Math.round(gpsFix.accuracy)} m` : "GPS belum memperoleh posisi",
    takenAt.toLocaleString("id-ID", { dateStyle: "full", timeStyle: "medium", timeZone: "Asia/Jakarta" }) + " WIB",
    note
  ];

  const pad = Math.max(14, Math.round(width * .018));
  const font = Math.max(16, Math.round(width * .022));
  const lineHeight = Math.round(font * 1.45);
  const boxWidth = Math.round(width * .76);
  ctx.font = `${font}px Arial`;
  let total = pad * 2;
  for (const line of lines.filter(Boolean)) {
    let current = "";
    for (const word of line.split(" ")) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > boxWidth - pad * 2 && current) {
        total += lineHeight;
        current = word;
      } else current = test;
    }
    if (current) total += lineHeight;
  }
  const x = pad;
  const y = height - total - pad;
  ctx.fillStyle = "rgba(0,0,0,.76)";
  ctx.fillRect(x, y, boxWidth, total);
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${font}px Arial`;
  let yy = y + pad + font;
  yy = drawWrapped(ctx, lines[0], x + pad, yy, boxWidth - pad * 2, lineHeight);
  ctx.font = `${Math.round(font * .78)}px Arial`;
  for (const line of lines.slice(1).filter(Boolean)) {
    yy = drawWrapped(ctx, line, x + pad, yy, boxWidth - pad * 2, lineHeight);
  }

  lastBlob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", .94));
  if (!lastBlob) { setStatus("Gagal membuat foto tagging."); return; }
  const url = URL.createObjectURL(lastBlob);
  $("result").src = url;
  $("result").hidden = false;
  $("download").href = url;
  $("download").download = `TAG_${takenAt.toISOString().replace(/[:.]/g, "-")}.jpg`;
  $("download").classList.remove("disabled");
  $("download").setAttribute("aria-disabled", "false");

  const record = {
    takenAt: takenAt.toISOString(),
    farmer,
    note,
    latitude: gpsFix?.lat ?? null,
    longitude: gpsFix?.lon ?? null,
    accuracy: gpsFix?.accuracy ?? null,
    gpsTimestamp: gpsFix?.timestamp ? new Date(gpsFix.timestamp).toISOString() : null,
    gpsSource: gpsFix?.source ?? "unavailable"
  };
  try {
    await saveRecord(record, lastBlob);
    records.unshift(record);
    $("records").textContent = `${records.length} foto diproses pada sesi ini. Metadata dan foto tersimpan di IndexedDB perangkat ini.`;
  } catch (e) {
    setStatus("Foto berhasil dibuat, tetapi penyimpanan lokal gagal. Segera unduh hasil foto.");
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = $("download").download;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setStatus(gpsFix
    ? `Tagging selesai. Koordinat dikunci dari GPS (${gpsFix.source === "gps" ? "pembacaan GPS" : "posisi terakhir"}), akurasi ±${Math.round(gpsFix.accuracy)} m.`
    : "Tagging selesai tanpa koordinat. GPS belum memperoleh posisi; koordinat tidak dibuat-buat.");
}

$("start").addEventListener("click", startCamera);
$("capture").addEventListener("click", capture);
$("refreshGps").addEventListener("click", startGpsTracking);
$("export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "metadata-photo-field-tagging.json";
  a.click();
  URL.revokeObjectURL(url);
});

window.addEventListener("online", () => { $("net").textContent = "Online"; $("net").className = "pill ok"; });
window.addEventListener("offline", () => { $("net").textContent = "Offline"; $("net").className = "pill warn"; });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && stream) startGpsTracking();
});
$("net").textContent = navigator.onLine ? "Online" : "Offline";
dbOpen().catch(() => setStatus("Penyimpanan lokal tidak tersedia pada browser ini."));
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
