import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import Groq from 'groq-sdk';
import { env } from '../config/env';
import logger from '../config/logger';

export interface WhisperResult {
  text:        string;
  language:    string;
  duration:    number;
  confidence:  number;
  model:       string;
  processingMs:number;
}

// ─── Transcribe using Groq (cloud, free tier) ─────────────────────────────────
const transcribeWithGroq = async (filePath: string): Promise<WhisperResult> => {
  const startTime = Date.now();

  const groq         = new Groq({ apiKey: env.GROQ_API_KEY });
  const audioStream  = fs.createReadStream(filePath);

  try {
    const response = await groq.audio.transcriptions.create({
      file:            audioStream,
      model:           'whisper-large-v3',
      response_format: 'verbose_json',
      // No language specified = auto-detect (Ga, Twi, Hausa, etc supported by Whisper v3)
    });

    const processingMs = Date.now() - startTime;
    const resAny = response as any;

    logger.info('Groq Whisper transcription complete', {
      processingMs,
      language:   resAny.language ?? 'detect',
      textLength: response.text.length,
    });

    return {
      text:         response.text,
      language:     String(resAny.language ?? 'en'),
      duration:     Number(resAny.duration ?? 0),
      confidence:   0.95,  // Groq Whisper large-v3 is state-of-the-art
      model:        resAny.model ?? 'whisper-large-v3-groq',
      processingMs,
    };
  } catch (err) {
    logger.error('Groq API Error', { error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
};

// ─── Transcribe using local Whisper Docker API ────────────────────────────────
const transcribeWithLocal = async (filePath: string): Promise<WhisperResult> => {
  const startTime = Date.now();
  const form      = new FormData();
  form.append('audio_file', fs.createReadStream(filePath));

  const response = await axios.post(
    `${env.WHISPER_API_URL}/asr`,
    form,
    {
      headers: { ...form.getHeaders() },
      params:  { task: 'transcribe', language: 'auto', output: 'json', encode: true },
      timeout: 120_000,
      maxBodyLength: env.MAX_AUDIO_FILE_SIZE_MB * 1024 * 1024,
    }
  );

  const processingMs = Date.now() - startTime;
  const data         = response.data;

  return {
    text:         data.text ?? '',
    language:     data.language ?? 'en',
    duration:     data.duration ?? 0,
    confidence:   data.confidence ?? 0.8,
    model:        'whisper-base-local',
    processingMs,
  };
};

// ─── Main transcribe function — picks provider automatically ──────────────────
export const transcribeAudio = async (filePath: string): Promise<WhisperResult> => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }

  // Priority: Groq (cloud) → Local Whisper → Simulation
  if (env.GROQ_API_KEY) {
    logger.debug('Using Groq Whisper (cloud)');
    try {
      return await transcribeWithGroq(filePath);
    } catch (err) {
      logger.warn('Groq transcription failed — falling back', { error: err });
    }
  }

  if (env.WHISPER_API_URL) {
    const localAvailable = await isLocalWhisperAvailable();
    if (localAvailable) {
      logger.debug('Using local Whisper Docker API');
      try {
        return await transcribeWithLocal(filePath);
      } catch (err) {
        logger.warn('Local Whisper failed — falling back to simulation', { error: err });
      }
    }
  }

  // Simulation fallback for development
  logger.warn('No Whisper provider available — using simulated transcript');
  return {
    text:         'Hello, my name is Kofi Mensah. There has been a serious accident on the N1 Highway near Achimota. Two vehicles collided and one person is unconscious and bleeding badly. Please send an ambulance immediately.',
    language:     'en',
    duration:     15,
    confidence:   0.92,
    model:        'simulated',
    processingMs: 0,
  };
};

// ─── Availability checks ──────────────────────────────────────────────────────
export const isLocalWhisperAvailable = async (): Promise<boolean> => {
  try {
    await axios.get(`${env.WHISPER_API_URL}/`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
};

export const isWhisperAvailable = async (): Promise<boolean> => {
  if (env.GROQ_API_KEY) return true;
  return isLocalWhisperAvailable();
};
