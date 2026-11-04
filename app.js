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

function getDisplayOrientation() {
  const type = screen.orientation?.type;
  if (type) return type.startsWith("portrait") ? "portrait" : "landscape";
  return window.matchMedia?.("(orientation: portrait)").matches || window.innerHeight >= window.innerWidth
    ? "portrait"
    : "landscape";
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function capture() {
  if (!stream) return;
  const video = $("video");
  const canvas = $("canvas");
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) {
    setStatus("Kamera belum siap. Tunggu gambar kamera tampil, lalu coba lagi.");
    return;
  }

  const targetOrientation = getDisplayOrientation();
  const sourceOrientation = sourceHeight >= sourceWidth ? "portrait" : "landscape";
  const shouldRotate = sourceOrientation !== targetOrientation;

  // A rear Android camera commonly supplies a landscape video buffer while
  // the phone is held upright. Rotate the pixels before drawing the overlay.
  // The saved JPEG therefore does not depend on EXIF orientation metadata.
  canvas.width = shouldRotate ? sourceHeight : sourceWidth;
  canvas.height = shouldRotate ? sourceWidth : sourceHeight;
  const outputWidth = canvas.width;
  const outputHeight = canvas.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    setStatus("Tidak dapat menyiapkan kanvas foto pada perangkat ini.");
    return;
  }

  ctx.save();
  if (shouldRotate) {
    // Landscape source -> portrait output: clockwise 90 degrees.
    // Portrait source -> landscape output: counter-clockwise 90 degrees.
    const angle = targetOrientation === "portrait" ? Math.PI / 2 : -Math.PI / 2;
    ctx.translate(outputWidth / 2, outputHeight / 2);
    ctx.rotate(angle);
    ctx.drawImage(video, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
  } else {
    ctx.drawImage(video, 0, 0, outputWidth, outputHeight);
  }
  ctx.restore();

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
  ].filter(Boolean);

  // Draw tagging only after the image transform has been restored, so the
  // text and information card stay upright and are positioned in output pixels.
  const pad = Math.max(14, Math.round(outputWidth * 0.018));
  const titleFont = Math.max(17, Math.round(outputWidth * 0.024));
  const bodyFont = Math.max(14, Math.round(titleFont * 0.78));
  const titleLineHeight = Math.round(titleFont * 1.35);
  const bodyLineHeight = Math.round(bodyFont * 1.42);
  const boxWidth = Math.min(outputWidth - pad * 2, Math.round(outputWidth * 0.88));
  const textWidth = boxWidth - pad * 2;

  ctx.font = `bold ${titleFont}px Arial, sans-serif`;
  const titleLines = wrapText(ctx, lines[0], textWidth);
  ctx.font = `${bodyFont}px Arial, sans-serif`;
  const bodyLines = lines.slice(1).flatMap(line => wrapText(ctx, line, textWidth));
  const textHeight = titleLines.length * titleLineHeight + bodyLines.length * bodyLineHeight;
  const boxHeight = pad * 2 + textHeight;
  const x = pad;
  const y = Math.max(pad, outputHeight - boxHeight - pad);

  ctx.fillStyle = "rgba(0, 0, 0, 0.76)";
  ctx.fillRect(x, y, boxWidth, boxHeight);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  ctx.font = `bold ${titleFont}px Arial, sans-serif`;
  let textY = y + pad + titleFont;
  for (const line of titleLines) {
    ctx.fillText(line, x + pad, textY, textWidth);
    textY += titleLineHeight;
  }
  ctx.font = `${bodyFont}px Arial, sans-serif`;
  for (const line of bodyLines) {
    ctx.fillText(line, x + pad, textY, textWidth);
    textY += bodyLineHeight;
  }

  lastBlob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.96));
  if (!lastBlob) {
    setStatus("Gagal membuat foto tagging. Coba ambil foto kembali.");
    return;
  }

  const url = URL.createObjectURL(lastBlob);
  const result = $("result");
  if (result.dataset.objectUrl) URL.revokeObjectURL(result.dataset.objectUrl);
  result.dataset.objectUrl = url;
  result.src = url;
  result.hidden = false;
  const download = $("download");
  download.href = url;
  download.download = `TAG_${takenAt.toISOString().replace(/[:.]/g, "-")}.jpg`;
  download.classList.remove("disabled");
  download.setAttribute("aria-disabled", "false");

  const record = {
    takenAt: takenAt.toISOString(),
    farmer,
    note,
    latitude: gpsFix?.lat ?? null,
    longitude: gpsFix?.lon ?? null,
    accuracy: gpsFix?.accuracy ?? null,
    gpsTimestamp: gpsFix?.timestamp ? new Date(gpsFix.timestamp).toISOString() : null,
    gpsSource: gpsFix?.source ?? "unavailable",
    imageWidth: outputWidth,
    imageHeight: outputHeight,
    imageOrientation: outputWidth >= outputHeight ? "landscape" : "portrait"
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
  anchor.download = download.download;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setStatus(gpsFix
    ? `Tagging selesai. Foto ${record.imageOrientation}, ${outputWidth} × ${outputHeight} px. GPS ±${Math.round(gpsFix.accuracy)} m.`
    : `Tagging selesai. Foto ${record.imageOrientation}, ${outputWidth} × ${outputHeight} px. GPS belum memperoleh posisi.`);
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
