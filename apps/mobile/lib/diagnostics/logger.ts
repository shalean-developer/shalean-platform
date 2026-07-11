import AsyncStorage from "@react-native-async-storage/async-storage";

type LogLevel = "info" | "warn" | "error";

export type DiagnosticLogEntry = {
  id: string;
  at: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
};

const STORAGE_KEY = "shalean.diagnostics.logs.v1";
const MAX_ENTRIES = 200;
const entries: DiagnosticLogEntry[] = [];
let seq = 0;
let hydrated = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as DiagnosticLogEntry[];
    if (Array.isArray(parsed) && parsed.length) {
      entries.splice(0, entries.length, ...parsed.slice(-MAX_ENTRIES));
      seq = entries.length;
    }
  } catch {
    // ignore corrupt log store
  }
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES))).catch(() => undefined);
  }, 750);
}

function push(level: LogLevel, message: string, context?: Record<string, unknown>) {
  void hydrate();
  seq += 1;
  entries.push({
    id: `log-${seq}-${Date.now()}`,
    at: new Date().toISOString(),
    level,
    message,
    context,
  });
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  schedulePersist();
  if (__DEV__) {
    const line = `[diag:${level}] ${message}`;
    if (level === "error") console.error(line, context ?? "");
    else if (level === "warn") console.warn(line, context ?? "");
    else console.log(line, context ?? "");
  }
}

/** Call once at app start so prior session logs are available for export. */
export async function hydrateDiagnosticLogs(): Promise<void> {
  await hydrate();
}

export const diagnosticLog = {
  info: (message: string, context?: Record<string, unknown>) => push("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => push("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => push("error", message, context),
  snapshot: (): DiagnosticLogEntry[] => entries.slice(),
  clear: () => {
    entries.length = 0;
    schedulePersist();
  },
  exportText: (): string =>
    entries
      .map((e) => {
        const ctx = e.context ? ` ${JSON.stringify(e.context)}` : "";
        return `${e.at} [${e.level}] ${e.message}${ctx}`;
      })
      .join("\n"),
};
