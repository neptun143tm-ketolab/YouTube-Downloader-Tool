import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router: IRouter = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOWNLOADS_DIR = path.resolve(__dirname, "../../../../downloads");
const AUTO_DELETE_MS = 30 * 60 * 1000; // 30 minutes

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

type JobStatus = "pending" | "downloading" | "converting" | "done" | "error";

interface DownloadJob {
  jobId: string;
  status: JobStatus;
  progress: number;
  filename?: string;
  filepath?: string;
  filesize?: number;
  error?: string;
  title?: string;
  mode: string;
  deleteTimer?: ReturnType<typeof setTimeout>;
}

const jobs = new Map<string, DownloadJob>();

function scheduleDelete(job: DownloadJob) {
  if (job.deleteTimer) clearTimeout(job.deleteTimer);
  job.deleteTimer = setTimeout(() => {
    if (job.filepath && fs.existsSync(job.filepath)) {
      fs.unlinkSync(job.filepath);
    }
    jobs.delete(job.jobId);
  }, AUTO_DELETE_MS);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\s\-_.]/g, "").trim().replace(/\s+/g, "_");
}

router.post("/info", async (req, res) => {
  const { url } = req.body as { url: string };
  if (!url || !url.includes("youtube.com") && !url.includes("youtu.be")) {
    res.status(400).json({ error: "Invalid YouTube URL" });
    return;
  }

  const ytdlp = spawn("yt-dlp", [
    "--dump-json",
    "--no-playlist",
    url,
  ]);

  let output = "";
  let errOutput = "";

  ytdlp.stdout.on("data", (data: Buffer) => { output += data.toString(); });
  ytdlp.stderr.on("data", (data: Buffer) => { errOutput += data.toString(); });

  ytdlp.on("close", (code) => {
    if (code !== 0) {
      res.status(400).json({ error: errOutput || "Failed to fetch video info" });
      return;
    }
    try {
      const info = JSON.parse(output.trim());
      res.json({
        title: info.title ?? "Unknown",
        thumbnail: info.thumbnail ?? null,
        duration: info.duration ?? 0,
        channel: info.uploader ?? info.channel ?? "Unknown",
      });
    } catch {
      res.status(400).json({ error: "Failed to parse video info" });
    }
  });
});

router.post("/start", async (req, res) => {
  const { url, mode, videoQuality, audioQuality } = req.body as {
    url: string;
    mode: "video" | "audio";
    videoQuality?: string;
    audioQuality?: string;
  };

  if (!url || !url.includes("youtube.com") && !url.includes("youtu.be")) {
    res.status(400).json({ error: "Invalid YouTube URL" });
    return;
  }

  const jobId = randomUUID();
  const job: DownloadJob = {
    jobId,
    status: "pending",
    progress: 0,
    mode: mode ?? "audio",
  };
  jobs.set(jobId, job);

  res.json({ jobId, status: job.status, progress: 0, mode: job.mode });

  const ext = mode === "audio" ? "mp3" : "mp4";
  const tmpBase = path.join(DOWNLOADS_DIR, `${jobId}`);

  const ytdlpArgs: string[] = ["--no-playlist", "--newline"];

  if (mode === "audio") {
    const abr = audioQuality ?? "192k";
    ytdlpArgs.push(
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", abr,
      "-o", `${tmpBase}.%(ext)s`,
      url
    );
  } else {
    let formatStr = "bestvideo+bestaudio/best";
    if (videoQuality === "720p") {
      formatStr = "bestvideo[height<=720]+bestaudio/best[height<=720]";
    } else if (videoQuality === "1080p") {
      formatStr = "bestvideo[height<=1080]+bestaudio/best[height<=1080]";
    }
    ytdlpArgs.push(
      "-f", formatStr,
      "--merge-output-format", "mp4",
      "-o", `${tmpBase}.%(ext)s`,
      url
    );
  }

  job.status = "downloading";

  const ytdlp = spawn("yt-dlp", ytdlpArgs);
  let lastTitle = "";

  ytdlp.stdout.on("data", (data: Buffer) => {
    const text = data.toString();
    const lines = text.split("\n");
    for (const line of lines) {
      const dlMatch = line.match(/\[download\]\s+([\d.]+)%/);
      if (dlMatch) {
        const pct = parseFloat(dlMatch[1]);
        if (mode === "audio") {
          job.progress = Math.min(pct * 0.7, 70);
        } else {
          job.progress = Math.min(pct, 80);
        }
      }
      const titleMatch = line.match(/\[(?:download|youtube)\].*?"([^"]+)"/);
      if (titleMatch) lastTitle = titleMatch[1];
      if (line.includes("[ExtractAudio]") || line.includes("[ffmpeg]") || line.includes("[Merger]")) {
        job.status = "converting";
        job.progress = 80;
      }
    }
  });

  ytdlp.on("close", (code) => {
    if (code !== 0) {
      job.status = "error";
      job.error = "Download failed. The video may be unavailable or restricted.";
      return;
    }

    const finalPath = `${tmpBase}.${ext}`;
    if (fs.existsSync(finalPath)) {
      const stats = fs.statSync(finalPath);
      const rawName = lastTitle || jobId;
      job.filename = `${sanitizeFilename(rawName)}.${ext}`;
      job.filepath = finalPath;
      job.filesize = stats.size;
      job.status = "done";
      job.progress = 100;
      job.title = lastTitle || undefined;
      scheduleDelete(job);
    } else {
      const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(jobId));
      if (files.length > 0) {
        const found = path.join(DOWNLOADS_DIR, files[0]);
        const stats = fs.statSync(found);
        job.filename = `${sanitizeFilename(lastTitle || jobId)}.${ext}`;
        job.filepath = found;
        job.filesize = stats.size;
        job.status = "done";
        job.progress = 100;
        job.title = lastTitle || undefined;
        scheduleDelete(job);
      } else {
        job.status = "error";
        job.error = "Output file not found after download.";
      }
    }
  });
});

router.get("/status/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json({
    jobId: job.jobId,
    status: job.status,
    progress: job.progress,
    filename: job.filename,
    filesize: job.filesize,
    error: job.error,
    title: job.title,
    mode: job.mode,
  });
});

router.get("/file/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job || !job.filepath || job.status !== "done") {
    res.status(404).json({ error: "File not ready or not found" });
    return;
  }
  if (!fs.existsSync(job.filepath)) {
    res.status(404).json({ error: "File has been deleted" });
    return;
  }
  const filename = job.filename ?? path.basename(job.filepath);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", job.mode === "audio" ? "audio/mpeg" : "video/mp4");
  const stream = fs.createReadStream(job.filepath);
  stream.pipe(res as unknown as NodeJS.WritableStream);
});

router.delete("/delete/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (job.deleteTimer) clearTimeout(job.deleteTimer);
  if (job.filepath && fs.existsSync(job.filepath)) {
    fs.unlinkSync(job.filepath);
  }
  jobs.delete(jobId);
  res.json({ success: true, message: "Deleted" });
});

export default router;
