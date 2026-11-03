const $=id=>document.getElementById(id);
let stream=null, position=null, lastBlob=null, db=null;
const records=[];
function setStatus(t){$("status").textContent=t}
function dbOpen(){return new Promise((resolve,reject)=>{const q=indexedDB.open("PhotoFieldTagging",1);q.onupgradeneeded=()=>q.result.createObjectStore("photos",{keyPath:"id",autoIncrement:true});q.onsuccess=()=>{db=q.result;resolve(db)};q.onerror=()=>reject(q.error)})}
function saveRecord(record,blob){return new Promise((resolve,reject)=>{const tx=db.transaction("photos","readwrite");tx.objectStore("photos").add({...record,image:blob});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
function gps(){return new Promise(resolve=>{if(!navigator.geolocation){resolve(null);return}navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy}),()=>resolve(null),{enableHighAccuracy:true,timeout:15000,maximumAge:0})})}
async function updateGps(){ $("gpsState").textContent="Membaca GPS…";$("gpsState").className="pill warn";position=await gps();if(position){$("gpsState").textContent=`GPS ±${Math.round(position.accuracy)} m`;$("gpsState").className="pill ok";$("gpsText").textContent=`${position.lat.toFixed(6)}, ${position.lon.toFixed(6)} (akurasi ±${Math.round(position.accuracy)} m)`}else{$("gpsState").textContent="GPS tidak tersedia";$("gpsText").textContent="Koordinat tidak tersedia — foto tetap bisa diambil tanpa koordinat."}}
async function startCamera(){try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});$("video").srcObject=stream;$("cameraPlaceholder").hidden=true;$("capture").disabled=false;await updateGps()}catch(e){setStatus("Kamera gagal dibuka. Pastikan izin kamera diberikan dan aplikasi dibuka melalui HTTPS.")}}
function drawWrapped(ctx,text,x,y,maxWidth,lineHeight){let words=text.split(" "),line="";for(const w of words){const test=line?line+" "+w:w;if(ctx.measureText(test).width>maxWidth&&line){ctx.fillText(line,x,y);line=w;y+=lineHeight}else line=test}if(line)ctx.fillText(line,x,y);return y+lineHeight}
async function capture(){if(!stream)return;const v=$("video"),c=$("canvas"),w=v.videoWidth,h=v.videoHeight;if(!w||!h){setStatus("Kamera belum siap.");return}
  // Capture the camera frame at its native video dimensions; source photo is retained separately only in memory during this session.
  c.width=w;c.height=h;const ctx=c.getContext("2d");ctx.drawImage(v,0,0,w,h);
  const shotTime=new Date(),gpsAtShutter=await gps();position=gpsAtShutter;
  const farmer=$("farmer").value.trim(),note=$("note").value.trim();
  const lines=[farmer||"Dokumentasi Lahan Petani","Desa Silau Jawa, Bandar Pasir Mandoge","Kabupaten Asahan, Sumatera Utara",
    gpsAtShutter?`Lat ${gpsAtShutter.lat.toFixed(6)}°  Long ${gpsAtShutter.lon.toFixed(6)}°`:"Koordinat GPS tidak tersedia",
    shotTime.toLocaleString("id-ID",{dateStyle:"full",timeStyle:"medium",timeZone:"Asia/Jakarta"})+" WIB",
    note];
  const pad=Math.max(14,Math.round(w*.018)),font=Math.max(16,Math.round(w*.022)),lineH=Math.round(font*1.45),boxW=Math.round(w*.72);
  ctx.font=`${font}px Arial`;let total=pad*2;for(const line of lines.filter(Boolean)){let words=line.split(" "),cur="";for(const word of words){const t=cur?cur+" "+word:word;if(ctx.measureText(t).width>boxW-pad*2&&cur){total+=lineH;cur=word}else cur=t}if(cur)total+=lineH}
  const x=pad,y=h-total-pad;ctx.fillStyle="rgba(0,0,0,.76)";ctx.fillRect(x,y,boxW,total);
  ctx.fillStyle="#fff";ctx.font=`bold ${font}px Arial`;let yy=y+pad+font;yy=drawWrapped(ctx,lines[0],x+pad,yy,boxW-pad*2,lineH);
  ctx.font=`${Math.round(font*.78)}px Arial`;for(const line of lines.slice(1).filter(Boolean))yy=drawWrapped(ctx,line,x+pad,yy,boxW-pad*2,lineH);
  lastBlob=await new Promise(r=>c.toBlob(r,"image/jpeg",.94));const url=URL.createObjectURL(lastBlob);$("result").src=url;$("result").hidden=false;$("download").href=url;$("download").download=`TAG_${shotTime.toISOString().replace(/[:.]/g,"-")}.jpg`;$("download").classList.remove("disabled");$("download").setAttribute("aria-disabled","false");
  const rec={takenAt:shotTime.toISOString(),farmer,note,latitude:gpsAtShutter?.lat??null,longitude:gpsAtShutter?.lon??null,accuracy:gpsAtShutter?.accuracy??null};
  await saveRecord(rec,lastBlob);records.unshift(rec);$("records").textContent=`${records.length} foto diproses pada sesi ini. Data metadata tersimpan di perangkat.`;setStatus("Tagging selesai. Foto siap diunduh. Pada Chrome Android, unduhan biasanya masuk ke folder Downloads.");
  // Trigger browser download. Android browser may require a user gesture/permission and does not guarantee direct Gallery insertion.
  const a=document.createElement("a");a.href=url;a.download=$("download").download;document.body.appendChild(a);a.click();a.remove();
}
$("start").addEventListener("click",startCamera);$("capture").addEventListener("click",capture);$("refreshGps").addEventListener("click",updateGps);
$("export").addEventListener("click",()=>{const b=new Blob([JSON.stringify(records,null,2)],{type:"application/json"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="metadata-photo-field-tagging.json";a.click();URL.revokeObjectURL(u)});
window.addEventListener("online",()=>{$("net").textContent="Online";$("net").className="pill ok"});window.addEventListener("offline",()=>{$("net").textContent="Offline";$("net").className="pill warn"});
$("net").textContent=navigator.onLine?"Online":"Offline";
dbOpen().catch(()=>setStatus("Penyimpanan lokal tidak tersedia pada browser ini."));
if("serviceWorker" in navigator && location.protocol!=="file:")navigator.serviceWorker.register("./sw.js").catch(()=>{});
