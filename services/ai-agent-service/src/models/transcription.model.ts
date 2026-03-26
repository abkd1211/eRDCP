import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ITranscription extends Document {
  _id:             Types.ObjectId;
  sessionId:       string;
  rawText:         string;       // Full Whisper output
  cleanedText:     string;       // Normalised for NLP
  language:        string;       // Whisper-detected language code
  confidenceScore: number;       // Whisper confidence 0-1
  wordCount:       number;
  processedAt:     Date;

  // Whisper metadata
  whisperModel:    string;       // e.g. "base", "small", "medium"
  processingMs:    number;       // how long Whisper took
}

const TranscriptionSchema = new Schema<ITranscription>(
  {
    sessionId:       { type: String, required: true, unique: true },
    rawText:         { type: String, required: true },
    cleanedText:     { type: String, required: true },
    language:        { type: String, default: 'en' },
    confidenceScore: { type: Number, default: 0 },
    wordCount:       { type: Number, default: 0 },
    processedAt:     { type: Date,   default: Date.now },
    whisperModel:    { type: String, default: 'base' },
    processingMs:    { type: Number, default: 0 },
  },
  { versionKey: false }
);

TranscriptionSchema.index({ sessionId: 1 });

export const Transcription = mongoose.model<ITranscription>('Transcription', TranscriptionSchema);
