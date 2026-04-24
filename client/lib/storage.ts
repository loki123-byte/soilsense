export function getSessionId(): string {
  try {
    return localStorage.getItem("ss_session") || "guest";
  } catch {
    return "guest";
  }
}

// Chat history
export type ChatMsg = {
  role: "user" | "assistant";
  text?: string;
  image?: string;
};
export type ChatSession = {
  id: string;
  ts: number;
  model: string;
  messages: ChatMsg[];
};

export function readHistory(uid = getSessionId()): ChatSession[] {
  try {
    return JSON.parse(localStorage.getItem(`ss_history_${uid}`) || "[]");
  } catch {
    return [];
  }
}
export function writeHistory(arr: ChatSession[], uid = getSessionId()) {
  localStorage.setItem(`ss_history_${uid}`, JSON.stringify(arr));
}

// Latest soil data
export function setLatestSoil(data: any, uid = getSessionId()) {
  localStorage.setItem(`ss_latestSoilData_${uid}`, JSON.stringify(data));
}
export function getLatestSoil(uid = getSessionId()) {
  try {
    return JSON.parse(
      localStorage.getItem(`ss_latestSoilData_${uid}`) || "null",
    );
  } catch {
    return null;
  }
}

// ESP32 snapshots
export type Snapshot = {
  id: string;
  ts: number;
  source: "ble" | "wifi" | "file";
  payload: any;
};
export function readSnapshots(uid = getSessionId()): Snapshot[] {
  try {
    return JSON.parse(localStorage.getItem(`ss_snapshots_${uid}`) || "[]");
  } catch {
    return [];
  }
}
export function addSnapshot(s: Snapshot, uid = getSessionId()) {
  const arr = readSnapshots(uid);
  arr.unshift(s);
  localStorage.setItem(`ss_snapshots_${uid}`, JSON.stringify(arr));
}
export function removeSnapshot(id: string, uid = getSessionId()) {
  const arr = readSnapshots(uid).filter((s) => s.id !== id);
  localStorage.setItem(`ss_snapshots_${uid}`, JSON.stringify(arr));
}

export type LatestData = {
  id: string;
  ts: number;
  source: "ble" | "wifi";
  text: string;
};
export function readLatestData(uid = getSessionId()): LatestData[] {
  try {
    return JSON.parse(localStorage.getItem(`ss_latestData_${uid}`) || "[]");
  } catch {
    return [];
  }
}
export function addLatestData(d: LatestData, uid = getSessionId()) {
  const arr = readLatestData(uid);
  arr.unshift(d);
  localStorage.setItem(`ss_latestData_${uid}`, JSON.stringify(arr));
}
export function removeLatestData(id: string, uid = getSessionId()) {
  const arr = readLatestData(uid).filter((s) => s.id !== id);
  localStorage.setItem(`ss_latestData_${uid}`, JSON.stringify(arr));
}

// Clear all latest data entries
export function clearLatestData(uid = getSessionId()) {
  try {
    localStorage.setItem(`ss_latestData_${uid}`, JSON.stringify([]));
  } catch {
    // ignore
  }
}
