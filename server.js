const http = require("http");
const path = require("path");

const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  serveClient: true
});

const PORT = Number(process.env.PORT || 3000);
const allowedRooms = new Set(
  String(process.env.INVITE_ROOMS || "arkadaslar")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

const roomParticipants = new Map();

function isValidRoomToken(room) {
  return typeof room === "string" && /^[a-zA-Z0-9_-]{1,32}$/.test(room);
}

function normalizeUsername(username) {
  if (typeof username !== "string") return "";
  const normalized = username.trim().replace(/\s+/g, " ");
  return normalized.slice(0, 24);
}

function getRoomMap(room) {
  let map = roomParticipants.get(room);
  if (!map) {
    map = new Map();
    roomParticipants.set(room, map);
  }
  return map;
}

function getParticipantList(room) {
  const map = getRoomMap(room);
  return Array.from(map.entries()).map(([id, info]) => ({
    id,
    username: info.username
  }));
}

function inSameAllowedRoom(room, aSocketId, bSocketId) {
  if (!allowedRooms.has(room)) return false;
  const map = roomParticipants.get(room);
  if (!map) return false;
  return map.has(aSocketId) && map.has(bSocketId);
}

app.use(express.static(path.join(__dirname, "public")));

io.use((socket, next) => {
  const { room, username } = socket.handshake.auth || {};

  if (!isValidRoomToken(room)) return next(new Error("invalid_room"));
  if (!allowedRooms.has(room)) return next(new Error("unauthorized_room"));

  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return next(new Error("invalid_username"));

  socket.data.room = room;
  socket.data.username = normalizedUsername;
  next();
});

io.on("connection", (socket) => {
  const room = socket.data.room;
  let username = socket.data.username;

  socket.join(room);

  const map = getRoomMap(room);
  map.set(socket.id, { username });

  socket.emit("participants", {
    you: { id: socket.id, username },
    participants: getParticipantList(room)
  });

  socket.to(room).emit("peer-joined", { id: socket.id, username });
  socket.to(room).emit("system-message", {
    type: "join",
    username,
    ts: Date.now()
  });

  socket.on("chat-message", (payload) => {
    const text =
      typeof payload?.text === "string" ? payload.text.trim().slice(0, 500) : "";
    if (!text) return;

    io.to(room).emit("chat-message", {
      id: socket.id,
      username: socket.data.username,
      text,
      ts: Date.now()
    });
  });

  socket.on("update-username", (payload) => {
    const nextUsername = normalizeUsername(payload?.username);
    if (!nextUsername) return;
    if (nextUsername === socket.data.username) return;

    const oldUsername = socket.data.username;
    socket.data.username = nextUsername;
    username = nextUsername;

    const roomMap = roomParticipants.get(room);
    if (roomMap && roomMap.has(socket.id)) {
      roomMap.set(socket.id, { username: nextUsername });
    }

    io.to(room).emit("participants-update", {
      participants: getParticipantList(room)
    });

    io.to(room).emit("username-updated", {
      id: socket.id,
      username: nextUsername,
      oldUsername,
      ts: Date.now()
    });
  });

  socket.on("webrtc-offer", (payload) => {
    const to = payload?.to;
    const sdp = payload?.sdp;
    if (typeof to !== "string" || !sdp) return;
    if (!inSameAllowedRoom(room, socket.id, to)) return;
    io.to(to).emit("webrtc-offer", { from: socket.id, sdp });
  });

  socket.on("webrtc-answer", (payload) => {
    const to = payload?.to;
    const sdp = payload?.sdp;
    if (typeof to !== "string" || !sdp) return;
    if (!inSameAllowedRoom(room, socket.id, to)) return;
    io.to(to).emit("webrtc-answer", { from: socket.id, sdp });
  });

  socket.on("webrtc-ice-candidate", (payload) => {
    const to = payload?.to;
    const candidate = payload?.candidate;
    if (typeof to !== "string" || !candidate) return;
    if (!inSameAllowedRoom(room, socket.id, to)) return;
    io.to(to).emit("webrtc-ice-candidate", { from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    const currentRoom = socket.data.room;
    const currentUsername = socket.data.username;

    const m = roomParticipants.get(currentRoom);
    if (m) {
      m.delete(socket.id);
      if (m.size === 0) roomParticipants.delete(currentRoom);
    }

    socket.to(currentRoom).emit("peer-left", { id: socket.id });
    socket.to(currentRoom).emit("system-message", {
      type: "leave",
      username: currentUsername,
      ts: Date.now()
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(
    `Allowed invite tokens: ${Array.from(allowedRooms)
      .map((r) => `?room=${r}`)
      .join(" ")}`
  );
});
