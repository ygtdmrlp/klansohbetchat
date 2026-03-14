const roomParam = new URLSearchParams(location.search).get("room");

const overlay = document.getElementById("overlay");
const overlayHint = document.getElementById("overlayHint");
const overlayError = document.getElementById("overlayError");
const joinForm = document.getElementById("joinForm");
const usernameInput = document.getElementById("username");

const roomTokenEl = document.getElementById("roomToken");

const btnMic = document.getElementById("btnMic");
const btnCam = document.getElementById("btnCam");
const btnShare = document.getElementById("btnShare");
const btnStopShare = document.getElementById("btnStopShare");

const localNameEl = document.getElementById("localName");
const localBadgesEl = document.getElementById("localBadges");
const localVideo = document.getElementById("localVideo");

const videoGrid = document.getElementById("videoGrid");
const userList = document.getElementById("userList");

const settingsNameInput = document.getElementById("settingsName");
const btnSaveName = document.getElementById("btnSaveName");
const settingsHelp = document.getElementById("settingsHelp");

const messagesEl = document.getElementById("messages");
const chatForm = document.getElementById("chatForm");
const chatText = document.getElementById("chatText");

const peers = new Map();
const users = new Map();

let socket = null;
let you = null;

let localStream = null;
let cameraVideoTrack = null;
let micTrack = null;
let screenStream = null;

let micEnabled = true;
let camEnabled = false;

const rtcConfig = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]
};

function storageKeyForUsername(room) {
  return `dc_clone_username:${room}`;
}

function getStoredUsername(room) {
  try {
    const val = localStorage.getItem(storageKeyForUsername(room));
    return sanitizeName(val || "");
  } catch {
    return "";
  }
}

function setStoredUsername(room, username) {
  try {
    localStorage.setItem(storageKeyForUsername(room), username);
  } catch {}
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function addMessage({ username, text, ts, system = false }) {
  const wrapper = document.createElement("div");
  wrapper.className = system ? "message system" : "message";

  const meta = document.createElement("div");
  meta.className = "meta";

  const who = document.createElement("span");
  who.className = "who";
  who.textContent = system ? "Sistem" : username;

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = formatTime(ts);

  meta.appendChild(who);
  meta.appendChild(time);

  const body = document.createElement("div");
  body.className = "text";
  body.textContent = text;

  wrapper.appendChild(meta);
  wrapper.appendChild(body);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setOverlayError(message) {
  overlayError.textContent = message || "";
}

function showOverlayHint(text) {
  overlayHint.textContent = text || "";
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function showOverlay() {
  overlay.classList.remove("hidden");
}

function sanitizeName(name) {
  if (typeof name !== "string") return "";
  return name.trim().replace(/\s+/g, " ").slice(0, 24);
}

function isValidRoomToken(room) {
  return typeof room === "string" && /^[a-zA-Z0-9_-]{1,32}$/.test(room);
}

function setButtons() {
  btnMic.textContent = micEnabled ? "Mikrofon Kapat" : "Mikrofon Aç";
  btnCam.textContent = camEnabled ? "Kamera Kapat" : "Kamera Aç";
  btnStopShare.disabled = !screenStream;

  const badges = [];
  if (!micEnabled) badges.push("Mikrofon Kapalı");
  if (!camEnabled) badges.push("Kamera Kapalı");
  if (screenStream) badges.push("Ekran Paylaşılıyor");
  localBadgesEl.textContent = badges.join(" · ");
}

function getCurrentVideoTrackForSending() {
  const screenTrack = screenStream?.getVideoTracks?.()?.[0] || null;
  if (screenTrack) return screenTrack;
  if (camEnabled && cameraVideoTrack) return cameraVideoTrack;
  return null;
}

function updateLocalPreview() {
  if (screenStream) {
    localVideo.srcObject = screenStream;
    return;
  }

  const track = camEnabled && cameraVideoTrack ? cameraVideoTrack : null;
  if (track) {
    localVideo.srcObject = new MediaStream([track]);
    return;
  }

  localVideo.srcObject = new MediaStream();
}

function updateUserList() {
  userList.innerHTML = "";
  const entries = Array.from(users.entries()).map(([id, info]) => ({
    id,
    username: info.username
  }));
  entries.sort((a, b) => a.username.localeCompare(b.username, "tr"));
  for (const u of entries) {
    const row = document.createElement("div");
    row.className = "user";
    row.dataset.userId = u.id;

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = u.username;

    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = u.id === you?.id ? "Sen" : "Online";

    row.appendChild(name);
    row.appendChild(tag);
    userList.appendChild(row);
  }
}

function syncRemoteTileNames() {
  for (const tile of videoGrid.querySelectorAll(".tile[data-peer-id]")) {
    const peerId = tile.getAttribute("data-peer-id");
    if (!peerId) continue;
    const nameEl = tile.querySelector(".tile-name");
    if (!nameEl) continue;
    nameEl.textContent = users.get(peerId)?.username || "Kullanıcı";
  }
}

function localTileDisplayName(username) {
  if (screenStream) return `${username} (Ekran)`;
  return username;
}

function setLocalUsername(username) {
  if (you) you.username = username;
  localNameEl.textContent = localTileDisplayName(username);
  if (settingsNameInput) settingsNameInput.value = username;
}

function ensureRemoteTile(peerId) {
  let tile = videoGrid.querySelector(`.tile[data-peer-id="${peerId}"]`);
  if (tile) return tile;

  tile = document.createElement("div");
  tile.className = "tile";
  tile.dataset.peerId = peerId;

  const header = document.createElement("div");
  header.className = "tile-header";

  const name = document.createElement("span");
  name.className = "tile-name";
  name.textContent = users.get(peerId)?.username || "Kullanıcı";

  const badge = document.createElement("span");
  badge.className = "tile-badge";
  badge.textContent = "";

  header.appendChild(name);
  header.appendChild(badge);

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;

  tile.appendChild(header);
  tile.appendChild(video);
  videoGrid.appendChild(tile);
  return tile;
}

function removeRemoteTile(peerId) {
  const tile = videoGrid.querySelector(`.tile[data-peer-id="${peerId}"]`);
  if (tile) tile.remove();
}

function getOrCreatePeer(peerId) {
  let entry = peers.get(peerId);
  if (entry) return entry;

  const pc = new RTCPeerConnection(rtcConfig);
  const remoteStream = new MediaStream();
  const pendingCandidates = [];
  const videoTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });
  const videoSender = videoTransceiver.sender;

  pc.onicecandidate = (event) => {
    if (event.candidate && socket) {
      socket.emit("webrtc-ice-candidate", {
        to: peerId,
        candidate: event.candidate
      });
    }
  };

  pc.ontrack = (event) => {
    if (event.track) remoteStream.addTrack(event.track);
    const tile = ensureRemoteTile(peerId);
    const video = tile.querySelector("video");
    if (video && video.srcObject !== remoteStream) {
      video.srcObject = remoteStream;
    }
  };

  if (localStream) {
    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream);
    }
  }

  const initialVideoTrack = getCurrentVideoTrackForSending();
  if (initialVideoTrack) {
    try {
      Promise.resolve(videoSender.replaceTrack(initialVideoTrack)).catch(() => {});
    } catch {}
  }

  entry = { pc, remoteStream, pendingCandidates, videoSender };
  peers.set(peerId, entry);
  return entry;
}

async function flushCandidates(peerId) {
  const entry = peers.get(peerId);
  if (!entry) return;
  if (!entry.pc.remoteDescription) return;
  while (entry.pendingCandidates.length) {
    const c = entry.pendingCandidates.shift();
    try {
      await entry.pc.addIceCandidate(c);
    } catch {}
  }
}

async function createOffer(peerId) {
  const entry = getOrCreatePeer(peerId);
  const offer = await entry.pc.createOffer();
  await entry.pc.setLocalDescription(offer);
  socket.emit("webrtc-offer", { to: peerId, sdp: entry.pc.localDescription });
}

async function handleOffer(from, sdp) {
  const entry = getOrCreatePeer(from);
  await entry.pc.setRemoteDescription(sdp);
  await flushCandidates(from);
  const answer = await entry.pc.createAnswer();
  await entry.pc.setLocalDescription(answer);
  socket.emit("webrtc-answer", { to: from, sdp: entry.pc.localDescription });
}

async function handleAnswer(from, sdp) {
  const entry = getOrCreatePeer(from);
  await entry.pc.setRemoteDescription(sdp);
  await flushCandidates(from);
}

async function handleIceCandidate(from, candidate) {
  const entry = getOrCreatePeer(from);
  if (entry.pc.remoteDescription) {
    try {
      await entry.pc.addIceCandidate(candidate);
    } catch {}
    return;
  }
  entry.pendingCandidates.push(candidate);
}

function closePeer(peerId) {
  const entry = peers.get(peerId);
  if (entry) {
    try {
      entry.pc.onicecandidate = null;
      entry.pc.ontrack = null;
      entry.pc.close();
    } catch {}
  }
  peers.delete(peerId);
  removeRemoteTile(peerId);
}

async function initMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false
  });

  micTrack = localStream.getAudioTracks()[0] || null;
  cameraVideoTrack = null;

  micEnabled = !!micTrack?.enabled;
  camEnabled = false;
  updateLocalPreview();
  setButtons();
}

async function replaceVideoTrackForAll(newTrack) {
  for (const entry of peers.values()) {
    const sender = entry.videoSender;
    if (!sender) continue;
    try {
      await sender.replaceTrack(newTrack);
    } catch {}
  }
}

async function enableCamera() {
  if (camEnabled) return;

  if (!cameraVideoTrack) {
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
    } catch {
      setButtons();
      return;
    }

    cameraVideoTrack = stream?.getVideoTracks?.()?.[0] || null;
  }

  if (!cameraVideoTrack) return;

  camEnabled = true;
  if (!screenStream) {
    await replaceVideoTrackForAll(cameraVideoTrack);
  }

  updateLocalPreview();
  setButtons();
}

async function disableCamera() {
  if (!camEnabled && !cameraVideoTrack) {
    camEnabled = false;
    setButtons();
    return;
  }

  camEnabled = false;
  if (cameraVideoTrack) {
    try {
      cameraVideoTrack.stop();
    } catch {}
    cameraVideoTrack = null;
  }

  if (!screenStream) {
    await replaceVideoTrackForAll(null);
  }

  updateLocalPreview();
  setButtons();
}

async function startScreenShare() {
  if (screenStream) return;
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });
  } catch {
    screenStream = null;
    setButtons();
    return;
  }

  const screenTrack = screenStream.getVideoTracks()[0];
  if (!screenTrack) {
    stopScreenShare();
    return;
  }

  screenTrack.addEventListener("ended", () => {
    stopScreenShare();
  });

  await replaceVideoTrackForAll(screenTrack);

  const tile = videoGrid.querySelector(`.tile[data-tile="local"]`);
  if (tile) {
    const headerName = tile.querySelector(".tile-name");
    if (headerName)
      headerName.textContent = localTileDisplayName(you?.username || "Sen");
  }

  updateLocalPreview();
  btnStopShare.disabled = false;
  setButtons();
}

async function stopScreenShare() {
  if (!screenStream) return;

  for (const track of screenStream.getTracks()) {
    try {
      track.stop();
    } catch {}
  }
  screenStream = null;

  if (camEnabled && cameraVideoTrack) {
    await replaceVideoTrackForAll(cameraVideoTrack);
  } else {
    await replaceVideoTrackForAll(null);
  }

  updateLocalPreview();
  const tile = videoGrid.querySelector(`.tile[data-tile="local"]`);
  if (tile) {
    const headerName = tile.querySelector(".tile-name");
    if (headerName) headerName.textContent = localTileDisplayName(you?.username || "Sen");
  }

  btnStopShare.disabled = true;
  setButtons();
}

function attachSocketHandlers(room) {
  socket.on("participants", async (payload) => {
    you = payload?.you || null;
    setLocalUsername(you?.username || "Sen");

    users.clear();
    for (const p of payload?.participants || []) {
      if (p?.id && p?.username) users.set(p.id, { username: p.username });
    }
    updateUserList();
    syncRemoteTileNames();

    for (const peerId of users.keys()) {
      if (peerId === you?.id) continue;
      getOrCreatePeer(peerId);
    }
  });

  socket.on("participants-update", (payload) => {
    users.clear();
    for (const p of payload?.participants || []) {
      if (p?.id && p?.username) users.set(p.id, { username: p.username });
    }
    updateUserList();
    syncRemoteTileNames();
  });

  socket.on("username-updated", ({ id, username, oldUsername, ts }) => {
    if (!id || !username) return;
    users.set(id, { username });
    updateUserList();
    syncRemoteTileNames();

    if (id === you?.id) {
      setLocalUsername(username);
      addMessage({
        system: true,
        username: "Sistem",
        text: "Kullanıcı adın güncellendi.",
        ts: ts || Date.now()
      });
      return;
    }

    if (oldUsername) {
      addMessage({
        system: true,
        username: "Sistem",
        text: `${oldUsername} adını ${username} yaptı.`,
        ts: ts || Date.now()
      });
    }
  });

  socket.on("peer-joined", async ({ id, username }) => {
    if (!id || !username) return;
    users.set(id, { username });
    updateUserList();
    syncRemoteTileNames();

    addMessage({
      system: true,
      username: "Sistem",
      text: `${username} odaya katıldı.`,
      ts: Date.now()
    });

    try {
      getOrCreatePeer(id);
      await createOffer(id);
    } catch {}
  });

  socket.on("peer-left", ({ id }) => {
    if (!id) return;
    const name = users.get(id)?.username || "Bir kullanıcı";
    users.delete(id);
    updateUserList();
    syncRemoteTileNames();
    closePeer(id);

    addMessage({
      system: true,
      username: "Sistem",
      text: `${name} odadan ayrıldı.`,
      ts: Date.now()
    });
  });

  socket.on("system-message", (msg) => {
    const type = msg?.type;
    const username = msg?.username;
    if (!username) return;
    const text = type === "leave" ? `${username} ayrıldı.` : `${username} katıldı.`;
    addMessage({ system: true, username: "Sistem", text, ts: msg?.ts || Date.now() });
  });

  socket.on("chat-message", (msg) => {
    if (!msg?.text || !msg?.username) return;
    addMessage({
      username: msg.username,
      text: msg.text,
      ts: msg.ts || Date.now()
    });
  });

  socket.on("webrtc-offer", async ({ from, sdp }) => {
    if (!from || !sdp) return;
    try {
      await handleOffer(from, sdp);
    } catch {}
  });

  socket.on("webrtc-answer", async ({ from, sdp }) => {
    if (!from || !sdp) return;
    try {
      await handleAnswer(from, sdp);
    } catch {}
  });

  socket.on("webrtc-ice-candidate", async ({ from, candidate }) => {
    if (!from || !candidate) return;
    try {
      await handleIceCandidate(from, candidate);
    } catch {}
  });

  socket.on("connect_error", (err) => {
    const code = err?.message || "Bağlantı hatası";
    setOverlayError(`Bağlantı hatası: ${code}`);
    showOverlay();
  });

  roomTokenEl.textContent = `Davet: ?room=${room}`;
}

btnMic.addEventListener("click", () => {
  if (!micTrack) return;
  micEnabled = !micEnabled;
  micTrack.enabled = micEnabled;
  setButtons();
});

btnCam.addEventListener("click", () => {
  (async () => {
    if (camEnabled) {
      await disableCamera();
      return;
    }
    await enableCamera();
  })();
});

btnShare.addEventListener("click", async () => {
  await startScreenShare();
});

btnStopShare.addEventListener("click", async () => {
  await stopScreenShare();
});

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatText.value.trim();
  if (!text || !socket) return;
  socket.emit("chat-message", { text });
  chatText.value = "";
});

function initJoinUI() {
  if (!isValidRoomToken(roomParam)) {
    showOverlayHint("Davet linki geçersiz. Örn: /?room=arkadaslar");
    joinForm.querySelector("button").disabled = true;
    setOverlayError("room parametresi gerekli.");
    return;
  }

  showOverlayHint(`Davet tokeni: ${roomParam}`);
  roomTokenEl.textContent = `Davet: ?room=${roomParam}`;
  const stored = getStoredUsername(roomParam);
  if (stored) {
    usernameInput.value = stored;
    if (settingsNameInput) settingsNameInput.value = stored;
    joinWithUsername(stored, roomParam, true);
    return;
  }

  usernameInput.focus();
}

async function joinWithUsername(username, room, auto) {
  if (socket) return;
  const cleanUsername = sanitizeName(username);
  if (!cleanUsername) return;

  setStoredUsername(room, cleanUsername);
  setLocalUsername(cleanUsername);

  if (auto) hideOverlay();

  try {
    await initMedia();
  } catch {
    addMessage({
      system: true,
      username: "Sistem",
      text: "Kamera/mikrofon izni verilmedi veya cihaz bulunamadı.",
      ts: Date.now()
    });
  }

  socket = io({
    auth: {
      room,
      username: cleanUsername
    }
  });

  hideOverlay();
  attachSocketHandlers(room);
}

joinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  setOverlayError("");

  const username = sanitizeName(usernameInput.value);
  if (!username) {
    setOverlayError("Kullanıcı adı gerekli.");
    return;
  }

  const room = roomParam;
  joinWithUsername(username, room, false);
});

btnSaveName.addEventListener("click", (e) => {
  e.preventDefault();
  if (!isValidRoomToken(roomParam)) return;
  const next = sanitizeName(settingsNameInput.value);
  if (!next) {
    settingsHelp.textContent = "Geçerli bir kullanıcı adı yaz.";
    return;
  }

  settingsHelp.textContent = "";
  setStoredUsername(roomParam, next);
  setLocalUsername(next);

  if (socket) {
    socket.emit("update-username", { username: next });
  }
});

initJoinUI();
