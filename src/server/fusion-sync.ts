import fs from "fs";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import type { Express, Request, Response } from "express";

export type FusionSyncConfig = {
  spritesDir: string;
  spritesUrlBase?: string;
  packZipPath?: string;
  indexCacheTtlMs?: number;
};

type FusionVariantIndex = Map<string, string[]>; // key: head.body -> filenames

const DEFAULT_INDEX_TTL_MS = 5 * 60 * 1000;

function normalizeFusionKey(headId: number | string, bodyId: number | string) {
  return `${headId}.${bodyId}`;
}

function parseFusionFilename(filename: string): { headId: number; bodyId: number; variant?: string } | null {
  // Supports:
  // - 25.6.png
  // - 25.6_alt1.png
  // - 25.6a.png (suffix letters)
  // - 25.6aa.png (suffix letters)
  // - 25.6b.png
  const underscore = filename.match(/^(\d+)\.(\d+)_([A-Za-z0-9]+)\.png$/);
  if (underscore) {
    return {
      headId: Number(underscore[1]),
      bodyId: Number(underscore[2]),
      variant: underscore[3],
    };
  }
  const suffix = filename.match(/^(\d+)\.(\d+)([A-Za-z]+)\.png$/);
  if (suffix) {
    return {
      headId: Number(suffix[1]),
      bodyId: Number(suffix[2]),
      variant: suffix[3],
    };
  }
  const base = filename.match(/^(\d+)\.(\d+)\.png$/);
  if (base) {
    return {
      headId: Number(base[1]),
      bodyId: Number(base[2]),
    };
  }
  return null;
}

function resolveSpriteDirs(spritesDir: string): string[] {
  const dirs: string[] = [];
  if (spritesDir && fs.existsSync(spritesDir)) {
    dirs.push(spritesDir);
    const customBattlers = path.join(spritesDir, "CustomBattlers");
    if (fs.existsSync(customBattlers)) dirs.push(customBattlers);
  }
  return Array.from(new Set(dirs));
}

function buildFusionIndex(spritesDir: string): FusionVariantIndex {
  const index: FusionVariantIndex = new Map();
  const dirs = resolveSpriteDirs(spritesDir);
  if (!dirs.length) return index;

  for (const dir of dirs) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(".png")) continue;
      const parsed = parseFusionFilename(entry.name);
      if (!parsed) continue;
      const key = normalizeFusionKey(parsed.headId, parsed.bodyId);
      const list = index.get(key) || [];
      list.push(entry.name);
      index.set(key, list);
    }
  }

  // sort variants deterministically: base first, then alts
  for (const [key, list] of index.entries()) {
    list.sort((a, b) => {
      const aParsed = parseFusionFilename(a);
      const bParsed = parseFusionFilename(b);
      const aIsBase = aParsed && !aParsed.variant;
      const bIsBase = bParsed && !bParsed.variant;
      if (aIsBase && !bIsBase) return -1;
      if (!aIsBase && bIsBase) return 1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    });
    index.set(key, list);
  }

  return index;
}

export function registerFusionRoutes(app: Express, config: FusionSyncConfig) {
  const spritesDir = config.spritesDir;
  const spriteDirs = resolveSpriteDirs(spritesDir);
  const packZipPath = config.packZipPath;
  let indexCache: FusionVariantIndex | null = null;
  let indexCacheTime = 0;

  function getIndex(): FusionVariantIndex {
    const ttl = config.indexCacheTtlMs ?? DEFAULT_INDEX_TTL_MS;
    const now = Date.now();
    if (!indexCache || now - indexCacheTime > ttl) {
      indexCache = buildFusionIndex(spritesDir);
      indexCacheTime = now;
    }
    return indexCache;
  }

  app.get("/fusion/variants/:head/:body", (req: Request, res: Response) => {
    const headId = Number(req.params.head);
    const bodyId = Number(req.params.body);
    if (!Number.isFinite(headId) || !Number.isFinite(bodyId)) {
      return res.status(400).json({ error: "invalid head/body id" });
    }
    const index = getIndex();
    const key = normalizeFusionKey(headId, bodyId);
    const variants = index.get(key) || [];
    res.json({ headId, bodyId, variants });
  });

  app.get("/fusion/variants", (_req: Request, res: Response) => {
    const index = getIndex();
    res.json({ totalFusions: index.size });
  });

  app.get("/fusion/sprites/:filename", (req: Request, res: Response) => {
    const filename = req.params.filename;
    const safeName = path.basename(filename);
    for (const dir of spriteDirs) {
      const target = path.join(dir, safeName);
      if (fs.existsSync(target)) return res.sendFile(target);
    }
    return res.status(404).send("Not found");
  });

  if (packZipPath && fs.existsSync(packZipPath)) {
    app.get("/fusion/pack", (_req: Request, res: Response) => {
      res.download(packZipPath);
    });
  } else {
    app.get("/fusion/pack", (_req: Request, res: Response) => {
      res.status(404).json({ error: "fusion pack not configured" });
    });
  }

  return { getIndex };
}

export function attachFusionWebSocket(server: HttpServer, config: FusionSyncConfig) {
  const wss = new WebSocketServer({ server, path: "/fusion-sync" });
  const connections = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    connections.add(ws);

    ws.on("message", (data) => {
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (!msg || typeof msg.type !== "string") return;

      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }

      if (msg.type === "identify") {
        ws.send(JSON.stringify({ type: "connected", server_version: "fusion-sync-v1" }));
        return;
      }

      if (msg.type === "get-fusion-variants") {
        const headId = Number(msg.head_id ?? msg.headId);
        const bodyId = Number(msg.body_id ?? msg.bodyId);
        if (!Number.isFinite(headId) || !Number.isFinite(bodyId)) return;
        const index = buildFusionIndex(config.spritesDir);
        const key = normalizeFusionKey(headId, bodyId);
        const variants = index.get(key) || [];
        ws.send(JSON.stringify({
          type: "fusion-variants",
          head_id: headId,
          body_id: bodyId,
          variants,
        }));
        return;
      }

      if (msg.type === "select-fusion-sprite") {
        const headId = Number(msg.head_id ?? msg.headId);
        const bodyId = Number(msg.body_id ?? msg.bodyId);
        const spriteFile = String(msg.sprite_file ?? msg.spriteFile ?? "");
        if (!Number.isFinite(headId) || !Number.isFinite(bodyId) || !spriteFile) return;

        const payload = JSON.stringify({
          type: "fusion-sprite-selected",
          head_id: headId,
          body_id: bodyId,
          sprite_file: spriteFile,
          player_id: msg.player_id ?? msg.playerId ?? "unknown",
        });

        for (const client of connections) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
      }
    });

    ws.on("close", () => {
      connections.delete(ws);
    });
  });

  return wss;
}
