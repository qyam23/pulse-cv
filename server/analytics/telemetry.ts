import fs from "fs/promises";
import path from "path";

type TelemetryKind = "product" | "quality";

export interface TelemetryEvent {
  kind: TelemetryKind;
  event: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

const telemetryDir = path.join(process.cwd(), "data", "telemetry");
const telemetryFile = path.join(telemetryDir, "events.ndjson");

async function ensureTelemetryDir() {
  await fs.mkdir(telemetryDir, { recursive: true });
}

async function appendEvent(kind: TelemetryKind, event: string, payload: Record<string, unknown>) {
  await ensureTelemetryDir();
  const row: TelemetryEvent = {
    kind,
    event,
    timestamp: new Date().toISOString(),
    payload,
  };
  await fs.appendFile(telemetryFile, `${JSON.stringify(row)}\n`, "utf8");
}

export async function recordProductEvent(event: string, payload: Record<string, unknown>) {
  await appendEvent("product", event, payload);
}

export async function recordQualityEvent(event: string, payload: Record<string, unknown>) {
  await appendEvent("quality", event, payload);
}

export async function readTelemetrySummary() {
  try {
    const raw = await fs.readFile(telemetryFile, "utf8");
    const events = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TelemetryEvent);

    const summary = {
      totalEvents: events.length,
      productEvents: events.filter((event) => event.kind === "product").length,
      qualityEvents: events.filter((event) => event.kind === "quality").length,
      byEvent: {} as Record<string, number>,
      latestEventAt: events.at(-1)?.timestamp || null,
    };

    for (const event of events) {
      summary.byEvent[event.event] = (summary.byEvent[event.event] || 0) + 1;
    }

    return summary;
  } catch {
    return {
      totalEvents: 0,
      productEvents: 0,
      qualityEvents: 0,
      byEvent: {},
      latestEventAt: null,
    };
  }
}
