import express, { Request, Response } from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import Engine from "../engine";
import { Action, MoveAction, Player, TurnResult } from "../types";
import { ExternalDexData } from "../adapters/pokedex-adapter";
import { mergeAbilities } from "../data/abilities";
import { mergeItems } from "../data/items";
import { convertShowdownAbilities, convertShowdownItems } from "../data/converters/showdown-converter";
import { convertShowdownSpecies, convertShowdownMoves } from "../data/converters/showdown-species-moves";

// Simple JSON persistence directories (for Raspberry Pi prototype)
const DATA_DIR = path.resolve(process.cwd(), "data");
const REPLAYS_DIR = path.join(DATA_DIR, "replays");
const CUSTOM_DEX_FILE = path.join(DATA_DIR, "customdex.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(REPLAYS_DIR)) fs.mkdirSync(REPLAYS_DIR);

export interface ClientInfo {
  id: string;
  username: string;
}

export interface Room {
  id: string;
  name: string;
  players: { id: string; username: string; socketId: string }[];
  spectators: { id: string; username: string; socketId: string }[];
  engine?: Engine;
  battleStarted: boolean;
  turnBuffer: Record<string, Action>; // keyed by player id
  replay: any[];
  phase?: "normal" | "force-switch";
  forceSwitchNeeded?: Set<string>;
  forceSwitchTimer?: NodeJS.Timeout;
  forceSwitchDeadline?: number; // epoch ms
}

const app = express();
app.use(express.json());

// --- Custom Dex persistence & helpers ---
function loadCustomDex(): ExternalDexData {
  try {
    if (fs.existsSync(CUSTOM_DEX_FILE)) {
      const json = JSON.parse(fs.readFileSync(CUSTOM_DEX_FILE, "utf-8"));
      // Ensure shape
      return { species: json.species ?? {}, moves: json.moves ?? {} } as ExternalDexData;
    }
  } catch {}
  return { species: {}, moves: {} };
}

function saveCustomDex(dex: ExternalDexData) {
  const payload = { species: dex.species ?? {}, moves: dex.moves ?? {} };
  fs.writeFileSync(CUSTOM_DEX_FILE, JSON.stringify(payload, null, 2));
}

function diffDex(serverDex: ExternalDexData, clientDex: ExternalDexData) {
  const missingOnClient = { species: {} as Record<string, any>, moves: {} as Record<string, any> };
  const missingOnServer = { species: {} as Record<string, any>, moves: {} as Record<string, any> };

  // Server -> Client (what client lacks)
  for (const [id, s] of Object.entries(serverDex.species ?? {})) {
    if (!clientDex.species || !clientDex.species[id]) missingOnClient.species[id] = s;
  }
  for (const [id, m] of Object.entries(serverDex.moves ?? {})) {
    if (!clientDex.moves || !clientDex.moves[id]) missingOnClient.moves[id] = m;
  }

  // Client -> Server (what server lacks)
  for (const [id, s] of Object.entries(clientDex.species ?? {})) {
    if (!serverDex.species || !serverDex.species[id]) missingOnServer.species[id] = s;
  }
  for (const [id, m] of Object.entries(clientDex.moves ?? {})) {
    if (!serverDex.moves || !serverDex.moves[id]) missingOnServer.moves[id] = m;
  }

  return { missingOnClient, missingOnServer };
}

app.get("/api/rooms", (_req: Request, res: Response) => {
  const list = Array.from(rooms.values()).map((r) => ({
    id: r.id,
    name: r.name,
    players: r.players.map((p) => p.username),
    spectCount: r.spectators.length,
    started: r.battleStarted,
  }));
  res.json(list);
});

// Custom Dex APIs
// 1) Read server-side store
app.get("/api/customdex", (_req: Request, res: Response) => {
  const dex = loadCustomDex();
  res.json(dex);
});

// 2) Sync: client posts its dex; server returns what client is missing (from server),
//    and what server is missing (from client). Client may then call /upload to add to server.
app.post("/api/customdex/sync", (req: Request, res: Response) => {
  const clientDex = (req.body ?? {}) as ExternalDexData;
  const serverDex = loadCustomDex();
  const { missingOnClient, missingOnServer } = diffDex(serverDex, clientDex);
  res.json({ missingOnClient, missingOnServer });
});

// 3) Upload: merge new entries from client into server store (no overwrite by default)
app.post("/api/customdex/upload", (req: Request, res: Response) => {
  const incoming = (req.body ?? {}) as ExternalDexData;
  const serverDex = loadCustomDex();
  let addedSpecies = 0;
  let addedMoves = 0;
  serverDex.species = serverDex.species || {};
  serverDex.moves = serverDex.moves || {};
  for (const [id, s] of Object.entries(incoming.species ?? {})) {
    if (!serverDex.species[id]) {
      serverDex.species[id] = s as any;
      addedSpecies++;
    }
  }
  for (const [id, m] of Object.entries(incoming.moves ?? {})) {
    if (!serverDex.moves[id]) {
      serverDex.moves[id] = m as any;
      addedMoves++;
    }
  }
  saveCustomDex(serverDex);
  res.json({ ok: true, added: { species: addedSpecies, moves: addedMoves } });
});

app.get("/api/rooms/:id", (req: Request, res: Response) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: "room not found" });
  res.json({
    id: room.id,
    name: room.name,
    players: room.players.map((p) => ({ id: p.id, username: p.username })),
    spectCount: room.spectators.length,
    started: room.battleStarted,
  });
});

app.get("/api/replay/:id", (req: Request, res: Response) => {
  const file = path.join(REPLAYS_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(file)) return res.status(404).send("Replay not found");
  res.download(file);
});
app.get("/api/replays", (_req: Request, res: Response) => {
  const files = fs.readdirSync(REPLAYS_DIR).filter(f => f.endsWith('.json'));
  const list = files.map(f => ({ id: f.replace(/\.json$/, ''), size: fs.statSync(path.join(REPLAYS_DIR, f)).size }));
  res.json(list);
});
app.get("/api/replays/:id/meta", (req: Request, res: Response) => {
  const file = path.join(REPLAYS_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "not found" });
  const json = JSON.parse(fs.readFileSync(file, "utf-8"));
  res.json({ id: json.id, room: json.room, createdAt: json.createdAt, turns: json.replay?.length ?? 0 });
});

// Compact spectator snapshot: mirrors spectate_start payload
app.get("/api/rooms/:id/snapshot", (req: Request, res: Response) => {
  const room = rooms.get(req.params.id);
  if (!room || !room.engine) return res.status(404).json({ error: "room not found or battle not started" });
  const needsSwitch = room.forceSwitchNeeded ? Array.from(room.forceSwitchNeeded) : [];
  const state = (room.engine as any)["state"] as import("../types").BattleState;
  res.json({ state, replay: room.replay, phase: room.phase ?? "normal", needsSwitch, deadline: room.forceSwitchDeadline ?? null, rooms: { trick: state.field.room, magic: state.field.magicRoom, wonder: state.field.wonderRoom } });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
// Optionally load external Showdown/Essentials datasets at runtime (not bundled)
async function tryLoadExternalData() {
  try {
    const abilities = (await import(path.resolve("external/showdown/abilities.js"))).default;
    if (abilities) mergeAbilities(abilities);
  } catch {}
  try {
    const items = (await import(path.resolve("external/showdown/items.js"))).default;
    if (items) mergeItems(items);
  } catch {}
  // If user placed Showdown-like TS/JS under data/, convert the subset we support
  try {
    const localAbilities = (await import(path.resolve("data/abilities.ts"))).default as Record<string, any>;
    if (localAbilities) mergeAbilities(convertShowdownAbilities(localAbilities));
  } catch {}
  try {
    const localItems = (await import(path.resolve("data/items.ts"))).default as Record<string, any>;
    if (localItems) mergeItems(convertShowdownItems(localItems));
  } catch {}
  try {
    const localSpecies = (await import(path.resolve("data/pokedex.ts"))).default as Record<string, any>;
    if (localSpecies) convertShowdownSpecies(localSpecies);
  } catch {}
  try {
    const localMoves = (await import(path.resolve("data/moves.ts"))).default as Record<string, any>;
    if (localMoves) {
      // Expose moves if needed: for now just convert and keep a map here if you want to serve it.
      convertShowdownMoves(localMoves);
    }
  } catch {}
}
tryLoadExternalData();

const rooms = new Map<string, Room>();

const FORCE_SWITCH_TIMEOUT_MS = Number(process.env.FORCE_SWITCH_TIMEOUT_MS || 45000);

export function computeNeedsSwitch(state: import("../types").BattleState): string[] {
  const out: string[] = [];
  for (const pl of state.players) {
    const active = pl.team[pl.activeIndex];
    if (active.currentHP <= 0 && pl.team.some((m, idx) => idx !== pl.activeIndex && m.currentHP > 0)) {
      out.push(pl.id);
    }
  }
  return out;
}

function startForceSwitchTimer(room: Room) {
  clearForceSwitchTimer(room);
  room.forceSwitchDeadline = Date.now() + FORCE_SWITCH_TIMEOUT_MS;
  room.forceSwitchTimer = setTimeout(() => {
    if (!room.engine || !room.forceSwitchNeeded || room.forceSwitchNeeded.size === 0) return;
    // Auto-switch remaining players to first healthy bench
    for (const pid of Array.from(room.forceSwitchNeeded)) {
      const state = (room.engine as any)["state"] as import("../types").BattleState;
      const pl = state.players.find(p => p.id === pid);
      if (!pl) continue;
      const benchIndex = pl.team.findIndex((m, idx) => idx !== pl.activeIndex && m.currentHP > 0);
      if (benchIndex >= 0) {
        const res = room.engine.forceSwitch(pid, benchIndex);
        room.replay.push({ turn: res.state.turn, events: res.events, anim: res.anim, phase: "force-switch", auto: true });
        room.forceSwitchNeeded.delete(pid);
      }
    }
    io.to(room.id).emit("battleUpdate", { result: { state: (room.engine as any)["state"], events: [], anim: [] }, needsSwitch: Array.from(room.forceSwitchNeeded ?? []) });
    if (room.forceSwitchNeeded.size === 0) {
      room.phase = "normal";
      io.to(room.id).emit("phase", { phase: room.phase });
      clearForceSwitchTimer(room);
    } else {
      // Extend time for any still-required (optional). For simplicity, clear deadline and keep old until manual switches.
    }
  }, FORCE_SWITCH_TIMEOUT_MS);
}

function clearForceSwitchTimer(room: Room) {
  if (room.forceSwitchTimer) {
    clearTimeout(room.forceSwitchTimer);
    room.forceSwitchTimer = undefined;
  }
  room.forceSwitchDeadline = undefined;
}

io.on("connection", (socket: Socket) => {
  let user: ClientInfo = { id: socket.id, username: `Guest-${socket.id.slice(0, 4)}` };

  socket.on("identify", (data: { username?: string }) => {
    if (data?.username) user.username = data.username;
    socket.emit("identified", { id: user.id, username: user.username });
  });

  socket.on("createRoom", (data: { name?: string }) => {
    const id = uuidv4().slice(0, 8);
    const room: Room = {
      id,
      name: data?.name || `Room ${id}`,
      players: [],
      spectators: [],
      battleStarted: false,
      turnBuffer: {},
      replay: [],
    };
    rooms.set(id, room);
    socket.join(id);
    socket.emit("roomCreated", { id, name: room.name });
    io.to(id).emit("roomUpdate", summary(room));
  });

  socket.on("joinRoom", (data: { roomId: string; role: "player" | "spectator" }) => {
    const room = rooms.get(data.roomId);
    if (!room) return socket.emit("error", { error: "room not found" });
    socket.join(room.id);
    if (data.role === "player") {
      room.players.push({ id: user.id, username: user.username, socketId: socket.id });
    } else {
      room.spectators.push({ id: user.id, username: user.username, socketId: socket.id });
      // Send spectator snapshot if battle started
      if (room.battleStarted && room.engine) {
  const state = (room.engine as any)["state"] as import("../types").BattleState;
  socket.emit("spectate_start", { state, replay: room.replay, phase: room.phase ?? "normal", needsSwitch: Array.from(room.forceSwitchNeeded ?? []), deadline: room.forceSwitchDeadline ?? null, rooms: { trick: state.field.room, magic: state.field.magicRoom, wonder: state.field.wonderRoom } });
      }
    }
    io.to(room.id).emit("roomUpdate", summary(room));
  });

  socket.on("startBattle", (data: { roomId: string; players: Player[]; seed?: number }) => {
    const room = rooms.get(data.roomId);
    if (!room) return socket.emit("error", { error: "room not found" });
    if (room.battleStarted) return;
    room.engine = new Engine({ seed: data.seed ?? 123 });
    const state = room.engine.initializeBattle(data.players, { seed: data.seed ?? 123 });
    room.battleStarted = true;
    room.phase = "normal";
    room.forceSwitchNeeded = new Set();
    io.to(room.id).emit("battleStarted", { state });
  });

  socket.on("sendAction", (data: { roomId: string; playerId: string; action: Action }) => {
    const room = rooms.get(data.roomId);
    if (!room || !room.engine) return socket.emit("error", { error: "room not found or battle not started" });
    // Validate sender is a player in the room and matches playerId
    const sender = room.players.find((p) => p.socketId === socket.id);
    if (!sender || sender.id !== data.playerId) {
      return socket.emit("error", { error: "not authorized for this action" });
    }
    // If we're in force-switch phase, only accept switch actions from required players
    if (room.phase === "force-switch") {
      if (!room.forceSwitchNeeded?.has(data.playerId)) {
        return socket.emit("error", { error: "no switch required" });
      }
      if (data.action.type !== "switch") {
        return socket.emit("error", { error: "must switch due to faint" });
      }
      // Perform immediate forced switch via engine
      const res = room.engine.forceSwitch(data.playerId, (data.action as any).toIndex);
      room.replay.push({ turn: res.state.turn, events: res.events, anim: res.anim, phase: "force-switch" });
      room.forceSwitchNeeded.delete(data.playerId);
      {
        const s = (room.engine as any)["state"] as import("../types").BattleState;
        io.to(room.id).emit("battleUpdate", { result: res, needsSwitch: Array.from(room.forceSwitchNeeded), deadline: room.forceSwitchDeadline ?? null, rooms: { trick: s.field.room, magic: s.field.magicRoom, wonder: s.field.wonderRoom } });
      }
      if (room.forceSwitchNeeded.size === 0) {
        room.phase = "normal";
        io.to(room.id).emit("phase", { phase: room.phase });
        clearForceSwitchTimer(room);
      }
      return;
    }
    room.turnBuffer[data.playerId] = data.action;
    const expected = room.engine["state"].players.length; // internal access for quick prototype
    if (Object.keys(room.turnBuffer).length >= expected) {
      const actions = Object.values(room.turnBuffer);
      room.turnBuffer = {};
      const result: TurnResult = room.engine.processTurn(actions);
      room.replay.push({ turn: result.state.turn, events: result.events, anim: result.anim });
      const needsSwitch: string[] = computeNeedsSwitch(result.state);
      if (needsSwitch.length > 0) {
        room.phase = "force-switch";
        room.forceSwitchNeeded = new Set(needsSwitch);
        io.to(room.id).emit("phase", { phase: room.phase, deadline: (room.forceSwitchDeadline = Date.now() + FORCE_SWITCH_TIMEOUT_MS) });
        startForceSwitchTimer(room);
      }
  io.to(room.id).emit("battleUpdate", { result, needsSwitch, rooms: { trick: result.state.field.room, magic: result.state.field.magicRoom, wonder: result.state.field.wonderRoom } });
      // Simple end detection: if any player's active mon is fainted and no healthy mons remain
      const sideDefeated = result.state.players.find((pl) => pl.team.every(m => m.currentHP <= 0));
      if (sideDefeated) {
        const winner = result.state.players.find(pl => pl.id !== sideDefeated.id)?.id;
        const replayId = saveReplay(room);
        io.to(room.id).emit("battleEnd", { winner, replayId });
        clearForceSwitchTimer(room);
      }
    } else {
      // prompt others
      io.to(room.id).emit("promptAction", { waitingFor: expected - Object.keys(room.turnBuffer).length });
    }
  });

  socket.on("sendChat", (data: { roomId: string; text: string }) => {
    const room = rooms.get(data.roomId);
    if (!room) return;
    io.to(room.id).emit("chatMessage", { user: user.username, text: data.text, time: Date.now() });
  });

  socket.on("disconnect", () => {
    // Remove from any rooms
    for (const room of rooms.values()) {
      room.players = room.players.filter((p) => p.socketId !== socket.id);
      room.spectators = room.spectators.filter((s) => s.socketId !== socket.id);
      io.to(room.id).emit("roomUpdate", summary(room));
    }
  });
});

function summary(room: Room) {
  return {
    id: room.id,
    name: room.name,
    players: room.players.map((p) => ({ id: p.id, username: p.username })),
    spectCount: room.spectators.length,
    battleStarted: room.battleStarted,
  };
}

function saveReplay(room: Room) {
  const id = uuidv4().slice(0, 8);
  const file = path.join(REPLAYS_DIR, `${id}.json`);
  const payload = {
    id,
    room: { id: room.id, name: room.name },
    createdAt: Date.now(),
    replay: room.replay,
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return id;
}

export function startServer(port = Number(process.env.PORT) || 3000) {
  server.listen(port, () => console.log(`Server running on :${port}`));
}

if (require.main === module) {
  startServer();
}
