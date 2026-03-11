import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type DownloadMode = "video" | "audio";
export type VideoQuality = "720p" | "1080p" | "best";
export type AudioQuality = "128k" | "192k" | "256k" | "320k";
export type JobStatus = "pending" | "downloading" | "converting" | "done" | "error";

export interface DownloadJob {
  jobId: string;
  status: JobStatus;
  progress: number;
  filename?: string;
  filesize?: number;
  error?: string;
  title?: string;
  mode: string;
  url: string;
  startedAt: number;
}

export interface HistoryEntry {
  jobId: string;
  title: string;
  url: string;
  mode: string;
  filename: string;
  filesize: number;
  completedAt: number;
}

interface DownloadContextType {
  currentJob: DownloadJob | null;
  history: HistoryEntry[];
  startDownload: (params: {
    url: string;
    mode: DownloadMode;
    videoQuality: VideoQuality;
    audioQuality: AudioQuality;
  }) => Promise<void>;
  clearCurrentJob: () => void;
  deleteHistoryEntry: (jobId: string) => void;
  clearHistory: () => void;
}

const DownloadContext = createContext<DownloadContextType | null>(null);

const HISTORY_KEY = "@ytdl_history";
const BASE_URL = `${process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : ""}/api/download`;

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [currentJob, setCurrentJob] = useState<DownloadJob | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const pollingRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then((raw) => {
      if (raw) {
        try {
          setHistory(JSON.parse(raw));
        } catch {
          // ignore
        }
      }
    });
  }, []);

  const saveHistory = useCallback(async (entries: HistoryEntry[]) => {
    setHistory(entries);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(
    async (jobId: string, url: string) => {
      try {
        const res = await fetch(`${BASE_URL}/status/${jobId}`);
        if (!res.ok) {
          stopPolling();
          setCurrentJob((prev) =>
            prev ? { ...prev, status: "error", error: "Failed to get status" } : null
          );
          return;
        }
        const data = await res.json();
        setCurrentJob((prev) =>
          prev
            ? {
                ...prev,
                status: data.status,
                progress: data.progress ?? prev.progress,
                filename: data.filename ?? prev.filename,
                filesize: data.filesize ?? prev.filesize,
                error: data.error ?? prev.error,
                title: data.title ?? prev.title,
              }
            : null
        );
        if (data.status === "done") {
          stopPolling();
          const entry: HistoryEntry = {
            jobId: data.jobId,
            title: data.title ?? "Unknown",
            url,
            mode: data.mode,
            filename: data.filename ?? "",
            filesize: data.filesize ?? 0,
            completedAt: Date.now(),
          };
          setHistory((prev) => {
            const next = [entry, ...prev.slice(0, 49)];
            AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
            return next;
          });
        } else if (data.status === "error") {
          stopPolling();
        }
      } catch {
        // network hiccup, keep polling
      }
    },
    [stopPolling]
  );

  const startDownload = useCallback(
    async ({
      url,
      mode,
      videoQuality,
      audioQuality,
    }: {
      url: string;
      mode: DownloadMode;
      videoQuality: VideoQuality;
      audioQuality: AudioQuality;
    }) => {
      stopPolling();

      const body = JSON.stringify({ url, mode, videoQuality, audioQuality });
      const res = await fetch(`${BASE_URL}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Failed to start download");
      }

      const data = await res.json();
      const job: DownloadJob = {
        jobId: data.jobId,
        status: data.status,
        progress: 0,
        mode: data.mode,
        url,
        startedAt: Date.now(),
      };
      setCurrentJob(job);

      pollingRef.current = setInterval(() => {
        pollStatus(data.jobId, url);
      }, 1500);
    },
    [stopPolling, pollStatus]
  );

  const clearCurrentJob = useCallback(() => {
    stopPolling();
    setCurrentJob(null);
  }, [stopPolling]);

  const deleteHistoryEntry = useCallback(
    (jobId: string) => {
      const next = history.filter((h) => h.jobId !== jobId);
      saveHistory(next);
      // best-effort delete on server
      fetch(`${BASE_URL}/delete/${jobId}`, { method: "DELETE" }).catch(() => {});
    },
    [history, saveHistory]
  );

  const clearHistory = useCallback(async () => {
    await saveHistory([]);
  }, [saveHistory]);

  return (
    <DownloadContext.Provider
      value={{
        currentJob,
        history,
        startDownload,
        clearCurrentJob,
        deleteHistoryEntry,
        clearHistory,
      }}
    >
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownload() {
  const ctx = useContext(DownloadContext);
  if (!ctx) throw new Error("useDownload must be used within DownloadProvider");
  return ctx;
}
