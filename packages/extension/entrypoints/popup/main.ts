import { getOrCreateSubmitterId } from "../../lib/submitter-id";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import type { ActivityEntry, RuntimeMessage } from "../../lib/types";

const consentItem = storage.defineItem<boolean>(STORAGE_KEYS.consent, {
  fallback: false,
});
const logItem = storage.defineItem<ActivityEntry[]>(STORAGE_KEYS.activityLog, {
  fallback: [],
});
const submitterIdItem = storage.defineItem<string | null>(
  STORAGE_KEYS.submitterId,
  { fallback: null },
);

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`popup: missing #${id}`);
  return el as T;
};

const consentCheckbox = byId<HTMLInputElement>("consent");
const consentState = byId("consent-state");
const ingestUrlEl = byId("ingest-url");
const submitterIdEl = byId("submitter-id");
const sendNowBtn = byId("send-now");
const clearBtn = byId("clear");
const logEl = byId("log");

ingestUrlEl.textContent =
  import.meta.env.WXT_INGEST_URL ?? "http://localhost:8787/ingest";

// Mint-on-first-use so the id shows even before the background has run.
void getOrCreateSubmitterId({
  get: () => submitterIdItem.getValue(),
  set: (value) => submitterIdItem.setValue(value),
}).then((id) => {
  submitterIdEl.textContent = id;
});

const reflectConsent = (on: boolean): void => {
  consentCheckbox.checked = on;
  consentState.textContent = on ? "on" : "off";
};
void consentItem.getValue().then(reflectConsent);
consentItem.watch(reflectConsent);
consentCheckbox.addEventListener("change", () => {
  void consentItem.setValue(consentCheckbox.checked);
});

const renderLog = (entries: ActivityEntry[]): void => {
  logEl.textContent = "";
  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No uploads yet.";
    logEl.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    const li = document.createElement("li");
    if (entry.error) li.classList.add("error");

    let summary: string;
    if (entry.error) {
      summary = `Failed to send ${entry.count} (${entry.error})`;
    } else if (entry.duplicate) {
      summary = `${entry.count} capture(s) — already uploaded`;
    } else {
      summary = `Uploaded ${entry.count} capture(s) — HTTP ${entry.status}`;
    }

    const line = document.createElement("div");
    line.textContent = summary;
    const when = document.createElement("div");
    when.className = "when";
    when.textContent = new Date(entry.at).toLocaleTimeString();
    li.append(line, when);
    logEl.appendChild(li);
  }
};
void logItem.getValue().then(renderLog);
logItem.watch(renderLog);

sendNowBtn.addEventListener("click", () => {
  const message: RuntimeMessage = { type: "sendNow" };
  void browser.runtime.sendMessage(message).catch(() => {});
});
clearBtn.addEventListener("click", () => {
  const message: RuntimeMessage = { type: "clear" };
  void browser.runtime.sendMessage(message).catch(() => {});
});
