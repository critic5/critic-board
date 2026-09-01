/**
 * The Board — /api/state
 *
 * Cloudflare Worker. Replaces the critic_board.json file the Python version
 * kept on the PC. Same shape of data, same two verbs, so the app in
 * public/index.html talks to this exactly the way it talked to the local server.
 *
 * Everything except /api/state is served straight from public/ as a static
 * asset and never reaches this script.
 *
 * Bindings (see wrangler.jsonc):
 *   ASSETS     fetcher       the static site in public/
 *   BOARD_KV   KV namespace  where the board is stored
 *   BOARD_KEY  secret        the passphrase the app sends
 */

const KEY = "board";

const SEED_SOURCES = [
  ["Iron Canopy League", "league", 7],
  ["Vietnam Competitive League", "league", 7],
  ["Summit", "league", 7],
  ["The Premiere League", "league", 7],
  ["Offseason Competitive League", "league", 7],
  ["The Hell Let Loose Classic", "league", 14],
  ["Legacy", "community", 5],
  ["The Embassy", "community", 5],
  ["Smithers", "community", 5],
];

function seed() {
  const now = new Date().toISOString();
  return {
    rev: 1,
    sources: SEED_SOURCES.map(([name, kind, cadence], i) => ({
      id: "s" + i,
      name,
      kind,
      cadence,
      season: "in",
      crcon: "unknown",
      url: "",
      checked: now,
    })),
    events: [],
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

/** Comparison that doesn't leak the answer through how long it takes. */
function sameSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authed(request, env) {
  const expected = env.BOARD_KEY;
  if (!expected) return false;          // no secret configured: refuse everything
  const sent = request.headers.get("X-Board-Key") || "";
  return sameSecret(sent, expected);
}

async function readBoard(env) {
  const raw = await env.BOARD_KV.get(KEY);
  if (!raw) {
    const fresh = seed();
    await env.BOARD_KV.put(KEY, JSON.stringify(fresh));
    return fresh;
  }
  try {
    const board = JSON.parse(raw);
    if (!board || typeof board !== "object") return seed();
    if (!Array.isArray(board.sources)) board.sources = [];
    if (!Array.isArray(board.events)) board.events = [];
    if (typeof board.rev !== "number") board.rev = 1;
    return board;
  } catch {
    // Keep the unreadable copy rather than binning it, same as the Python did.
    await env.BOARD_KV.put(KEY + ".broken." + Date.now(), raw);
    return seed();
  }
}

async function write(request, env) {
  if (!authed(request, env)) return json({ error: "denied" }, 401);

  let incoming;
  try {
    incoming = await request.json();
  } catch {
    return json({ error: "body wasn't valid JSON" }, 400);
  }
  if (!incoming || typeof incoming !== "object") {
    return json({ error: "expected an object" }, 400);
  }
  if (!Array.isArray(incoming.sources) || !Array.isArray(incoming.events)) {
    return json({ error: "sources and events must both be lists" }, 400);
  }
  if (incoming.sources.length > 500 || incoming.events.length > 5000) {
    return json({ error: "board is too large" }, 400);
  }

  const current = await readBoard(env);

  // The client sends the revision it loaded. If the stored board has moved on
  // since then, the other device won and this write is refused rather than
  // quietly overwriting work. Also catches an offline client (rev 0) trying to
  // push an empty board over a real one.
  const claimed = Number(request.headers.get("X-Board-Rev"));
  if (!Number.isFinite(claimed) || claimed !== current.rev) {
    return json({ error: "stale", rev: current.rev }, 409);
  }

  const next = {
    rev: current.rev + 1,
    sources: incoming.sources,
    events: incoming.events,
    updated: new Date().toISOString(),
  };
  await env.BOARD_KV.put(KEY, JSON.stringify(next));
  return json({ ok: true, rev: next.rev });
}

async function handleState(request, env) {
  if (request.method === "GET") {
    if (!authed(request, env)) return json({ error: "denied" }, 401);
    return json(await readBoard(env));
  }
  if (request.method === "PUT" || request.method === "POST") {
    return write(request, env);
  }
  return json({ error: "method not allowed" }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/state") return handleState(request, env);
    // Anything else is the static site.
    return env.ASSETS.fetch(request);
  },
};
