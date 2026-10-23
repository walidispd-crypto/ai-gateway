/**
 * End-to-end smoke tests against a running gateway + mock worker.
 *
 *   npm run mock-worker         # terminal 1
 *   npm run dev                 # terminal 2 (with .env.local filled)
 *   npm run test:smoke          # terminal 3
 *
 * Env: BASE_URL (default http://localhost:3000), MOCK_URL (default http://127.0.0.1:8787),
 * APP_PASSWORD (falls back to .env.local).
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const MOCK_URL = process.env.MOCK_URL ?? "http://127.0.0.1:8787";

function envFromFile(key) {
  if (process.env[key]) return process.env[key];
  if (!existsSync(".env.local")) return undefined;
  const line = readFileSync(".env.local", "utf8")
    .split("\n")
    .find((entry) => entry.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim();
}

const APP_PASSWORD = envFromFile("APP_PASSWORD");

// Mirrors src/config/models.ts: ids, default upstream model, and the configured fallback chain.
const PROVIDERS = ["luna", "glm-p2", "glm-p3"];
const PRIMARY = "luna";
const PRIMARY_FALLBACK = "glm-p2";
const FALLBACK_UPSTREAM_MODEL = "glm-5.3";
const NO_FALLBACK_PROVIDER = "glm-p3";
let cookie = "";
let failures = 0;
let passes = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passes += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function eventsFrom(ndjson) {
  return ndjson
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

async function mockRequests() {
  return (await fetch(`${MOCK_URL}/_requests`)).json();
}

/** Last Worker request whose final user message matches, so concurrent tests cannot collide. */
async function lastWorkerRequest(content) {
  const log = await mockRequests();
  return log.filter((entry) => entry.body.messages?.at(-1)?.content === content).at(-1);
}

async function chat(payload, { signal } = {}) {
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(payload),
    signal,
  });
  const text = await response.text();
  return { status: response.status, text, events: response.ok ? eventsFrom(text) : [] };
}

async function main() {
  if (!APP_PASSWORD) {
    console.error("APP_PASSWORD tidak ditemukan. Isi .env.local atau env var.");
    process.exit(1);
  }

  console.log("\nAuth");
  const anonymous = await fetch(`${BASE_URL}/`, { redirect: "manual" });
  check("GET / tanpa sesi ditolak", [302, 307].includes(anonymous.status));

  const anonymousApi = await fetch(`${BASE_URL}/api/chat`, { method: "POST", body: "{}" });
  check("POST /api/chat tanpa sesi → 401", anonymousApi.status === 401);

  const wrong = await fetch(`${BASE_URL}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: `${APP_PASSWORD}-salah` }),
  });
  check("Login dengan sandi salah → 401", wrong.status === 401);

  const login = await fetch(`${BASE_URL}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: APP_PASSWORD }),
  });
  const setCookie = login.headers.get("set-cookie") ?? "";
  cookie = setCookie.split(";")[0];
  check("Login benar mengembalikan cookie httpOnly", login.ok && setCookie.includes("HttpOnly"));

  const page = await fetch(`${BASE_URL}/`, { headers: { Cookie: cookie } });
  const html = await page.text();
  check("GET / dengan sesi → 200", page.status === 200);
  const csp = page.headers.get("content-security-policy") ?? "";
  check("Halaman mengirim nonce CSP", /'nonce-[^']+'/.test(csp) && /script-src /.test(csp));

  const tampered = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { Cookie: "ai_session=9999999999999.palsu" },
    body: "{}",
  });
  check("Cookie palsu → 401", tampered.status === 401);

  console.log("\nStreaming per penyedia");
  for (const modelId of PROVIDERS) {
    const result = await chat({
      modelId,
      system: "Kamu asisten.",
      messages: [{ role: "user", content: `Halo ${modelId}` }],
    });
    const text = result.events
      .filter((event) => event.type === "delta")
      .map((event) => event.text)
      .join("");
    check(
      `${modelId}: meta + delta + done`,
      result.events[0]?.type === "meta" && result.events.at(-1)?.type === "done",
    );
    check(`${modelId}: teks utuh`, text.includes("export function add"));
    check(`${modelId}: meta memuat nama model`, typeof result.events[0]?.modelName === "string");
  }

  console.log("\nFailures");
  const upstream500 = await chat({
    modelId: NO_FALLBACK_PROVIDER,
    messages: [{ role: "user", content: "MOCK_502" }],
  });
  const errorEvent = upstream500.events.find((event) => event.type === "error");
  check("HTTP 500 → error upstream", errorEvent?.code === "upstream");
  check(
    "Pesan error tidak membocorkan URL/token",
    Boolean(errorEvent) && !/127\.0\.0\.1|dev-token|Bearer/i.test(errorEvent.message),
  );

  const fallback = await chat({
    modelId: PRIMARY,
    customModel: "fail-model",
    messages: [{ role: "user", content: "Uji fallback" }],
  });
  const fallbackMeta = fallback.events.find((event) => event.type === "meta");
  check(
    "Fallback terekspos di meta",
    fallbackMeta?.modelId === PRIMARY_FALLBACK && fallbackMeta?.fallbackFrom?.modelId === PRIMARY,
  );
  check(
    "Override tidak ikut ke fallback",
    fallbackMeta?.modelName === FALLBACK_UPSTREAM_MODEL,
    `modelName=${fallbackMeta?.modelName}`,
  );
  const fallbackRequest = await lastWorkerRequest("Uji fallback");
  check(
    "Worker fallback menerima model miliknya sendiri",
    fallbackRequest?.body.model === FALLBACK_UPSTREAM_MODEL,
    `model=${fallbackRequest?.body.model}`,
  );

  const disconnected = await chat({
    modelId: PRIMARY_FALLBACK,
    messages: [{ role: "user", content: "MOCK_DISCONNECT" }],
  });
  const disconnectError = disconnected.events.find((event) => event.type === "error");
  const partial = disconnected.events.filter((event) => event.type === "delta").length;
  check("Putus di tengah: teks parsial dikirim", partial > 0);
  check("Putus di tengah: error network", disconnectError?.code === "network");

  console.log("\nStop / abort");
  const controller = new AbortController();
  const slow = chat(
    { modelId: PRIMARY_FALLBACK, messages: [{ role: "user", content: "MOCK_SLOW" }] },
    { signal: controller.signal },
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  controller.abort();
  let aborted = false;
  try {
    await slow;
  } catch {
    aborted = true;
  }
  check("Client abort menghentikan request", aborted);
  await new Promise((resolve) => setTimeout(resolve, 400));

  const log = await (await fetch(`${MOCK_URL}/_requests`)).json();
  const slowRecord = log
    .filter((entry) => entry.body.messages?.at(-1)?.content === "MOCK_SLOW")
    .at(-1);
  check("Abort diteruskan ke Worker", slowRecord?.aborted === true);

  console.log("\nNama model kustom");
  const override = await chat({
    modelId: PRIMARY,
    customModel: "claude-opus-5",
    messages: [{ role: "user", content: "Uji override" }],
  });
  const overrideMeta = override.events.find((event) => event.type === "meta");
  check("Override dipakai di meta", overrideMeta?.modelName === "claude-opus-5");
  check("Override tidak mengubah penyedia", overrideMeta?.modelId === PRIMARY);

  const overrideRequest = await lastWorkerRequest("Uji override");
  check(
    "Worker menerima nama model kustom",
    overrideRequest?.body.model === "claude-opus-5",
    `model=${overrideRequest?.body.model}`,
  );
  check(
    "URL dan token tetap dari env server",
    overrideRequest?.authorization === `Bearer ${envFromFile("WORKER_RADOX_TOKEN")}`,
    "authorization berubah",
  );

  const dotted = await chat({
    modelId: PRIMARY,
    customModel: "vendor/model.v2:beta_1-x",
    messages: [{ role: "user", content: "Uji karakter sah" }],
  });
  check("Karakter sah diterima (./_:- )", dotted.events.at(-1)?.type === "done");

  for (const [label, customModel] of [
    ["spasi", "claude opus"],
    ["karakter aneh", "claude$opus"],
    ["terlalu panjang", "a".repeat(101)],
    ["kosong", ""],
  ]) {
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        modelId: PRIMARY,
        customModel,
        messages: [{ role: "user", content: "x" }],
      }),
    });
    check(`customModel ${label} → 400`, response.status === 400, `status ${response.status}`);
  }

  console.log("\nValidation & limits");
  const huge = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      modelId: NO_FALLBACK_PROVIDER,
      messages: [{ role: "user", content: "x".repeat(1_600_000) }],
    }),
  });
  check("Body > batas → 413", huge.status === 413);

  const invalid = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ modelId: NO_FALLBACK_PROVIDER, messages: [] }),
  });
  check("Body tidak valid → 400", invalid.status === 400);

  let lastStatus = 0;
  for (let attempt = 0; attempt < 9; attempt += 1) {
    const response = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.77" },
      body: JSON.stringify({ password: "salah-terus" }),
    });
    lastStatus = response.status;
  }
  check("Rate limit login → 429", lastStatus === 429);

  if (html.length > 0) {
    const secrets = [
      APP_PASSWORD,
      envFromFile("SESSION_SECRET"),
      envFromFile("WORKER_RADOX_TOKEN"),
      envFromFile("WORKER_RADOX_URL"),
      envFromFile("WORKER_P2_TOKEN"),
      envFromFile("WORKER_P2_URL"),
      envFromFile("WORKER_P3_TOKEN"),
      envFromFile("WORKER_P3_URL"),
    ].filter(Boolean);
    const leaked = secrets.some((secret) => html.includes(secret));
    check("HTML tidak memuat secret server", !leaked);
  }

  console.log("\nProduction bundle");
  const staticDir = ".next/static/chunks";
  if (existsSync(staticDir)) {
    const files = [];
    const walk = (directory) => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) walk(path);
        else files.push(path);
      }
    };
    walk(staticDir);
    const bundle = files.map((file) => readFileSync(file, "utf8")).join("\n");
    const secrets = [
      APP_PASSWORD,
      envFromFile("SESSION_SECRET"),
      envFromFile("WORKER_RADOX_TOKEN"),
      "Bearer dev-token",
      "127.0.0.1:8787",
    ].filter(Boolean);
    const leakedSecrets = secrets.filter((secret) => bundle.includes(secret));
    check("Bundle client bebas secret", leakedSecrets.length === 0, leakedSecrets.join(", "));
  } else {
    console.log("  skip  .next/static belum ada (jalankan npm run build dulu)");
  }

  console.log(`\n${passes} lulus, ${failures} gagal`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
