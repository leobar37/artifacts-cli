#!/usr/bin/env bun
/**
 * Video Audio Enhancement Script
 *
 * Supports two AI models:
 *   - Resemble Enhance (Replicate) - denoiser + enhancer, best quality
 *   - Nova SR (fal.ai) - speech super-resolution
 *
 * Requires:
 *   bun add @fal-ai/client replicate
 *
 * Usage:
 *   bun scripts/enhance-video-audio.ts -i video.mp4 -m resemble
 *   bun scripts/enhance-video-audio.ts -i video.mp4 -m nova
 */

import { spawn } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { basename, dirname, join, extname } from "path";

type ModelProvider = "resemble" | "nova";

interface EnhanceOptions {
  input?: string;
  output?: string;
  model: ModelProvider;
  falKey?: string;
  replicateKey?: string;
  keepTemp?: boolean;
  quiet?: boolean;
  audioBitrate?: string;
}

interface VideoInfo {
  duration: number;
  width: number;
  height: number;
}

function log(msg: string, quiet = false) {
  if (!quiet) console.log(msg);
}

function execAsync(command: string, args: string[], quiet = false): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
      if (!quiet) process.stdout.write(data);
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
      if (!quiet) process.stderr.write(data);
    });

    proc.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

async function getVideoInfo(videoPath: string): Promise<VideoInfo | null> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "quiet", "-print_format", "json",
      "-show_format", "-show_streams", videoPath,
    ]);
    let output = "";
    proc.stdout.on("data", (data) => { output += data.toString(); });
    proc.on("close", () => {
      try {
        const data = JSON.parse(output);
        const vs = data.streams?.find((s: any) => s.codec_type === "video");
        resolve({
          duration: parseFloat(data.format?.duration || "0"),
          width: vs?.width || 0,
          height: vs?.height || 0,
        });
      } catch { resolve(null); }
    });
  });
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

async function extractAudio(videoPath: string, audioPath: string, quiet = false): Promise<void> {
  log(`🔊 Extracting audio...`, quiet);
  const { code } = await execAsync("ffmpeg", [
    "-i", videoPath, "-vn", "-acodec", "pcm_s16le",
    "-ar", "48000", "-ac", "2", "-y", audioPath,
  ], quiet);
  if (code !== 0) throw new Error("Failed to extract audio");
  log(`✅ Audio extracted`, quiet);
}

// ── Resemble Enhance (Replicate) ──────────────────────────────────

async function enhanceWithResemble(audioPath: string, apiKey: string, quiet = false): Promise<string> {
  log(`🚀 Enhancing with Resemble Enhance (Replicate)...`, quiet);

  const Replicate = (await import("replicate")).default;
  const replicate = new Replicate({ auth: apiKey });

  const fileContent = await import("fs/promises").then(fs => fs.readFile(audioPath));
  const sizeMB = (fileContent.length / 1024 / 1024).toFixed(2);
  log(`📤 File: ${sizeMB} MB`, quiet);

  // Use data URI (Replicate accepts data URIs as input)
  const dataUri = `data:audio/wav;base64,${fileContent.toString("base64")}`;

  // Run Resemble Enhance: denoise + enhance
  log(`🎛️ Processing with Resemble Enhance (30-60s)...`, quiet);

  const output = await replicate.run(
    "resemble-ai/resemble-enhance:93266a7e7f5805fb79bcf213b1a4e0ef2e45aff3c06eefd96c59e850c87fd6a2",
    {
      input: {
        input_audio: dataUri,
        denoise_flag: true,
        solver: "Midpoint",
        number_function_evaluations: 64,
        prior_temperature: 0.5,
      },
    }
  );

  // Output is [denoised_url, enhanced_url] - we want the enhanced one (index 1)
  const urls = output as unknown as string[];
  if (!urls || !Array.isArray(urls) || urls.length < 2) {
    console.log("📦 Response:", JSON.stringify(output, null, 2));
    throw new Error("No enhanced audio URL in response");
  }

  log(`✅ Audio enhanced (denoised + enhanced)`, quiet);
  return urls[1]; // enhanced version
}

// ── Nova SR (fal.ai) ──────────────────────────────────────────────

async function enhanceWithNova(audioPath: string, apiKey: string, quiet = false): Promise<string> {
  log(`🚀 Enhancing with Nova SR (fal.ai)...`, quiet);

  const { fal } = await import("@fal-ai/client");
  fal.config({ credentials: apiKey });

  const fileContent = await import("fs/promises").then(fs => fs.readFile(audioPath));
  const sizeMB = (fileContent.length / 1024 / 1024).toFixed(2);
  log(`📤 File: ${sizeMB} MB`, quiet);

  const result = await fal.subscribe("fal-ai/nova-sr", {
    input: { audio_url: `data:audio/wav;base64,${fileContent.toString("base64")}` },
    logs: true,
    onQueueUpdate: (update: any) => {
      if (update.status === "in_progress") log(`⏳ Processing...`, quiet);
      else if (update.status === "queued") log(`⏳ Queued`, quiet);
    },
  });

  const audioUrl = result?.data?.audio?.url;
  if (!audioUrl) {
    console.log("📦 Response:", JSON.stringify(result, null, 2));
    throw new Error("No audio URL in Nova SR response");
  }

  log(`✅ Audio enhanced`, quiet);
  return audioUrl;
}

// ── Download & Merge ──────────────────────────────────────────────

async function downloadFile(url: string, outputPath: string, quiet = false): Promise<void> {
  log(`💾 Downloading enhanced audio...`, quiet);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const buffer = await response.arrayBuffer();
  await import("fs/promises").then(fs => fs.writeFile(outputPath, Buffer.from(buffer)));
  log(`✅ Downloaded`, quiet);
}

async function mergeAudioWithVideo(
  videoPath: string, audioPath: string, outputPath: string,
  audioBitrate = "320k", quiet = false
): Promise<void> {
  log(`🎬 Merging audio with video...`, quiet);
  const { code } = await execAsync("ffmpeg", [
    "-i", videoPath, "-i", audioPath,
    "-c:v", "copy", "-c:a", "aac", "-b:a", audioBitrate,
    "-map", "0:v:0", "-map", "1:a:0",
    "-shortest", "-y", outputPath,
  ], quiet);
  if (code !== 0) throw new Error("Failed to merge audio");
  log(`✅ Video saved`, quiet);
}

// ── CLI ───────────────────────────────────────────────────────────

function parseArgs(): EnhanceOptions {
  const args = process.argv.slice(2);
  const options: EnhanceOptions = {
    model: "resemble",
    falKey: process.env.FAL_KEY,
    replicateKey: process.env.REPLICATE_API_TOKEN,
    quiet: false,
    audioBitrate: "320k",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input" || arg === "-i") options.input = args[++i];
    else if (arg === "--output" || arg === "-o") options.output = args[++i];
    else if (arg === "--model" || arg === "-m") options.model = args[++i] as ModelProvider;
    else if (arg === "--fal-key" || arg === "-k") options.falKey = args[++i];
    else if (arg === "--replicate-key" || arg === "-r") options.replicateKey = args[++i];
    else if (arg === "--bitrate" || arg === "-b") options.audioBitrate = args[++i];
    else if (arg === "--quiet" || arg === "-q") options.quiet = true;
    else if (arg === "--keep-temp") options.keepTemp = true;
    else if (!arg.startsWith("-")) {
      if (!options.input) options.input = arg;
      else if (!options.output) options.output = arg;
    }
  }

  return options;
}

function printUsage(): void {
  console.log(`
🎬 Video Audio Enhancement

Models:
  resemble   Resemble Enhance via Replicate (default) - denoiser + enhancer, best quality
  nova       Nova SR via fal.ai - speech super-resolution

Usage:
 *  bun scripts/enhance-video-audio.ts [options] <input> [output]

Options:
  -i, --input <path>          Input video file (required)
  -o, --output <path>         Output file (default: <input>-enhanced.<ext>)
  -m, --model <model>         Model: resemble | nova (default: resemble)
  -k, --fal-key <key>         fal.ai API key (or FAL_KEY env)
  -r, --replicate-key <key>   Replicate API key (or REPLICATE_API_TOKEN env)
  -b, --bitrate <rate>        Audio bitrate: 192k, 256k, 320k (default: 320k)
  -q, --quiet                 Less output
  --keep-temp                 Keep temporary files
  -h, --help                  Show this help

Examples:
 *  REPLICATE_API_TOKEN=xxx bun scripts/enhance-video-audio.ts video.mp4
 *  FAL_KEY=xxx bun scripts/enhance-video-audio.ts -i video.mp4 -m nova
 *  REPLICATE_API_TOKEN=xxx bun scripts/enhance-video-audio.ts video.mp4 -b 256k
`);
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  if (!options.input) {
    console.error("❌ Error: Input video file is required");
    printUsage();
    process.exit(1);
  }

  if (!existsSync(options.input)) {
    console.error(`❌ Error: File not found: ${options.input}`);
    process.exit(1);
  }

  // Validate API key for selected model
  if (options.model === "resemble" && !options.replicateKey) {
    console.error("❌ Error: Replicate API key required (--replicate-key or REPLICATE_API_TOKEN env)");
    process.exit(1);
  }

  if (options.model === "nova" && !options.falKey) {
    console.error("❌ Error: fal.ai API key required (--fal-key or FAL_KEY env)");
    process.exit(1);
  }

  const videoInfo = await getVideoInfo(options.input);
  const duration = videoInfo ? formatDuration(videoInfo.duration) : "unknown";
  const modelName = options.model === "resemble" ? "Resemble Enhance" : "Nova SR";

  if (!options.output) {
    const dir = dirname(options.input);
    const ext = extname(options.input);
    const name = basename(options.input, ext);
    options.output = join(dir, `${name}-enhanced${ext}`);
  }

  const tempDir = dirname(options.input);
  const ts = Date.now();
  const tempOriginalAudio = join(tempDir, `.temp-${ts}-original.wav`);
  const tempEnhancedAudio = join(tempDir, `.temp-${ts}-enhanced.wav`);

  const cleanup = () => {
    if (!options.keepTemp) {
      try {
        if (existsSync(tempOriginalAudio)) unlinkSync(tempOriginalAudio);
        if (existsSync(tempEnhancedAudio)) unlinkSync(tempEnhancedAudio);
      } catch { /* ignore */ }
    }
  };

  try {
    console.log(`
╔══════════════════════════════════════════════════════╗
║  🎬 Video Audio Enhancement                         ║
║  Model: ${modelName.padEnd(43)}║
╚══════════════════════════════════════════════════════╝`);
    console.log(`📁 Input:    ${options.input}`);
    console.log(`📁 Output:   ${options.output}`);
    console.log(`⏱️  Duration: ${duration}`);
    console.log(`🔊 Bitrate:  ${options.audioBitrate}`);
    console.log("─".repeat(50));

    await extractAudio(options.input, tempOriginalAudio, options.quiet);

    let enhancedUrl: string;
    if (options.model === "resemble") {
      enhancedUrl = await enhanceWithResemble(tempOriginalAudio, options.replicateKey!, options.quiet);
    } else {
      enhancedUrl = await enhanceWithNova(tempOriginalAudio, options.falKey!, options.quiet);
    }

    await downloadFile(enhancedUrl, tempEnhancedAudio, options.quiet);
    await mergeAudioWithVideo(options.input, tempEnhancedAudio, options.output!, options.audioBitrate, options.quiet);

    console.log(`
╔══════════════════════════════════════════════════════╗
║  ✅ Done! Video enhanced with ${modelName.padEnd(22)}║
║  📁 ${options.output!.slice(-50).padStart(54)}║
╚══════════════════════════════════════════════════════╝`);

    cleanup();
  } catch (error) {
    cleanup();
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
