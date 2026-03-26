import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { env } from '../config/env';

// Ensure upload directory exists
if (!fs.existsSync(env.AUDIO_UPLOAD_PATH)) {
  fs.mkdirSync(env.AUDIO_UPLOAD_PATH, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.AUDIO_UPLOAD_PATH);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const ext       = path.extname(file.originalname).toLowerCase();
    cb(null, `call-${timestamp}${ext}`);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const allowed = ['.wav', '.mp3', '.mp4', '.m4a', '.ogg', '.flac', '.webm'];
  const ext     = path.extname(file.originalname).toLowerCase();

  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported audio format. Allowed: ${allowed.join(', ')}`));
  }
};

export const audioUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.MAX_AUDIO_FILE_SIZE_MB * 1024 * 1024,
  },
});
