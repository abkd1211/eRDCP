// ─── NLP Engine ───────────────────────────────────────────────────────────────
// Rule-based NLP for extracting emergency incident data from call transcripts.
// Supports English, Twi, Ga, and Hausa — all common in Ghana emergency calls.
// Each extracted field gets an individual confidence score (0-1).

export interface NlpFieldResult {
  value:      string | number | null;
  confidence: number;
  source:     string;
}

export interface NlpExtractionResult {
  citizenName:  NlpFieldResult;
  incidentType: NlpFieldResult;
  locationText: NlpFieldResult;
  notes:        NlpFieldResult;
  urgencyLevel: NlpFieldResult;
  overallConfidence: number;
  detectedLanguage:  string;
  languageName:      string;
}

// ─── Incident Type Keywords ───────────────────────────────────────────────────
// Each array: [keyword, confidence_weight]
const INCIDENT_KEYWORDS: Record<string, [string, number][]> = {
  MEDICAL: [
    // English
    ['accident', 0.9], ['injured', 0.95], ['bleeding', 0.95], ['unconscious', 1.0],
    ['heart attack', 1.0], ['stroke', 1.0], ['ambulance', 0.95], ['hospital', 0.8],
    ['sick', 0.7], ['collapsed', 0.95], ['breathing', 0.85], ['overdose', 1.0],
    ['pregnant', 0.9], ['labour', 0.95], ['labor', 0.95], ['delivery', 0.85],
    // Twi (Akan)
    ['ayarefo', 0.9], ['oyi', 0.85], ['ahoma', 0.8], ['kɔ ho', 0.7],
    // Ga
    ['yeli', 0.9], ['sane', 0.85],
    // Hausa
    ['rashin lafiya', 0.9], ['ciwon', 0.85], ['jini', 0.95], ['bugun zuciya', 1.0],
  ],
  FIRE: [
    // English
    ['fire', 1.0], ['burning', 1.0], ['flames', 1.0], ['smoke', 0.85],
    ['explosion', 1.0], ['exploded', 1.0], ['blaze', 1.0], ['inferno', 1.0],
    ['gas leak', 0.9], ['electrical fire', 1.0],
    // Twi
    ['ogya', 1.0], ['ohu', 0.9],
    // Ga
    ['gbogbo', 0.9], ['fiemo', 1.0],
    // Hausa
    ['wuta', 1.0], ['gobara', 1.0], ['hayaki', 0.8],
  ],
  CRIME: [
    // English
    ['robbery', 1.0], ['robbed', 1.0], ['stolen', 0.9], ['thief', 0.95],
    ['attack', 0.9], ['attacked', 0.9], ['shooting', 1.0], ['shot', 0.95],
    ['stabbed', 1.0], ['stabbing', 1.0], ['assault', 0.95], ['rape', 1.0],
    ['kidnap', 1.0], ['kidnapped', 1.0], ['burglar', 0.95], ['break in', 0.9],
    ['armed', 0.85], ['gun', 0.9], ['knife', 0.85],
    // Twi
    ['koraa', 0.8], ['hwehwe', 0.7], ['tokuro', 0.9],
    // Hausa
    ['fashi', 1.0], ['sata', 0.95], ['makami', 0.9],
  ],
  ACCIDENT: [
    // English
    ['accident', 0.95], ['crash', 1.0], ['collision', 1.0], ['hit', 0.7],
    ['knocked', 0.85], ['run over', 0.95], ['vehicle', 0.6], ['car', 0.6],
    ['motorcycle', 0.7], ['trotro', 0.9], ['bus', 0.6], ['truck', 0.7],
    ['overturned', 1.0], ['flipped', 0.95],
    // Twi
    ['motor', 0.8], ['bɔ', 0.7],
    // Hausa
    ['hatsari', 0.95], ['haɗari', 0.9],
  ],
};

// ─── Name Extraction Patterns ────────────────────────────────────────────────
const NAME_PATTERNS = [
  { regex: /my name is ([A-Z][a-z]+(?: [A-Z][a-z]+)*)/i,         confidence: 0.95 },
  { regex: /i am ([A-Z][a-z]+(?: [A-Z][a-z]+)*)/i,               confidence: 0.90 },
  { regex: /this is ([A-Z][a-z]+(?: [A-Z][a-z]+)*) calling/i,    confidence: 0.92 },
  { regex: /caller(?:'s)? name(?:\s+is)? ([A-Z][a-z]+(?: [A-Z][a-z]+)*)/i, confidence: 0.88 },
  { regex: /^([A-Z][a-z]+ [A-Z][a-z]+)/m,                        confidence: 0.60 },
];

// ─── Location Patterns ────────────────────────────────────────────────────────
const LOCATION_PATTERNS = [
  { regex: /(?:at|near|around|opposite|behind|in front of|on)\s+(.{5,60}?)(?:\.|,|$)/i, confidence: 0.85 },
  { regex: /location(?:\s+is)?\s+(.{5,60}?)(?:\.|,|$)/i,        confidence: 0.90 },
  { regex: /(?:road|street|avenue|lane|junction|circle|roundabout|market|hospital|school|church|mosque)\s*[^.]{0,40}/i, confidence: 0.80 },
  // Ghana-specific location references
  { regex: /(?:accra|kumasi|tema|takoradi|cape coast|tamale|sunyani|ho|bolgatanga|wa)\b[^.]{0,50}/i, confidence: 0.88 },
  { regex: /(?:circle|interchange|junction|toll booth|mall|stadium|airport)[^.]{0,40}/i, confidence: 0.85 },
];

// ─── Notes Extraction ────────────────────────────────────────────────────────
const NOTES_PATTERNS = [
  /(\d+)\s+(?:people|persons|victims?|casualties)/i,
  /(?:floor|storey|level)\s+(\d+)/i,
  /(child(?:ren)?|woman|man|elderly|pregnant)/i,
  /(help(?:ing)?|trapped|stuck|cannot move)/i,
];

// ─── Urgency Keywords ────────────────────────────────────────────────────────
const HIGH_URGENCY   = ['dying', 'dead', 'critical', 'emergency', 'urgent', 'immediately', 'please hurry', 'help me', 'blood', 'unconscious', 'not breathing'];
const MEDIUM_URGENCY = ['serious', 'bad', 'hurt', 'injured', 'need help', 'quickly'];

// ─── Language Detection ───────────────────────────────────────────────────────
const LANGUAGE_MARKERS: Record<string, { markers: string[]; name: string }> = {
  tw: { name: 'Twi',   markers: ['yɛ', 'ɛ', 'ɔ', 'kɔ', 'wo', 'me', 'na', 'ogya', 'ayarefo'] },
  ga: { name: 'Ga',    markers: ['mi', 'ni', 'yeli', 'gbogbo', 'ko', 'bo', 'fiemo'] },
  ha: { name: 'Hausa', markers: ['na', 'da', 'wuta', 'gobara', 'fashi', 'hatsari', 'ciwon', 'bugun'] },
};

// ─── Main NLP Function ────────────────────────────────────────────────────────
export const extractIncidentData = (transcript: string): NlpExtractionResult => {
  const text = transcript.trim();
  const lower = text.toLowerCase();

  // ── Language Detection ────────────────────────────────────────────────────
  let detectedLanguage = 'en';
  let languageName     = 'English';
  let langScore        = 0;

  for (const [code, { name, markers }] of Object.entries(LANGUAGE_MARKERS)) {
    const score = markers.filter(m => lower.includes(m)).length;
    if (score > langScore) {
      langScore        = score;
      detectedLanguage = code;
      languageName     = name;
    }
  }

  // ── Incident Type ─────────────────────────────────────────────────────────
  const typeScores: Record<string, number> = {};
  const typeSources: Record<string, string[]> = {};

  for (const [type, keywords] of Object.entries(INCIDENT_KEYWORDS)) {
    typeScores[type]  = 0;
    typeSources[type] = [];
    for (const [kw, weight] of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        typeScores[type] += weight;
        typeSources[type].push(kw);
      }
    }
  }

  const topType    = Object.entries(typeScores).sort((a, b) => b[1] - a[1])[0];
  const typeConf   = topType[1] > 0 ? Math.min(topType[1] / 2, 1.0) : 0;
  const incidentType: NlpFieldResult = {
    value:      topType[1] > 0 ? topType[0] : 'OTHER',
    confidence: topType[1] > 0 ? typeConf : 0.3,
    source:     typeSources[topType[0]]?.join(', ') || 'default',
  };

  // ── Citizen Name ──────────────────────────────────────────────────────────
  let citizenName: NlpFieldResult = { value: null, confidence: 0, source: 'none' };
  for (const pattern of NAME_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) {
      citizenName = { value: match[1].trim(), confidence: pattern.confidence, source: pattern.regex.source };
      break;
    }
  }

  // ── Location Text ─────────────────────────────────────────────────────────
  let locationText: NlpFieldResult = { value: null, confidence: 0, source: 'none' };
  for (const pattern of LOCATION_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) {
      const loc = match[0].replace(/^(at|near|around|on|in|location is)\s+/i, '').trim();
      if (loc.length >= 5) {
        locationText = { value: loc, confidence: pattern.confidence, source: pattern.regex.source };
        break;
      }
    }
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  const noteMatches: string[] = [];
  for (const pattern of NOTES_PATTERNS) {
    const match = text.match(pattern);
    if (match) noteMatches.push(match[0]);
  }
  const notes: NlpFieldResult = {
    value:      noteMatches.length > 0 ? noteMatches.join('; ') : text.slice(0, 200),
    confidence: noteMatches.length > 0 ? 0.75 : 0.5,
    source:     'pattern-match',
  };

  // ── Urgency Level ─────────────────────────────────────────────────────────
  let urgency = 1;
  let urgencyConf = 0.5;
  if (HIGH_URGENCY.some(w => lower.includes(w))) {
    urgency = 3; urgencyConf = 0.9;
  } else if (MEDIUM_URGENCY.some(w => lower.includes(w))) {
    urgency = 2; urgencyConf = 0.75;
  }
  const urgencyLevel: NlpFieldResult = {
    value: urgency, confidence: urgencyConf, source: 'urgency-keywords',
  };

  // ── Placeholder for lat/lng (filled by geocoding service) ─────────────────
  const latResult: NlpFieldResult  = { value: null, confidence: 0, source: 'pending-geocoding' };
  const lngResult: NlpFieldResult  = { value: null, confidence: 0, source: 'pending-geocoding' };

  // ── Overall Confidence ────────────────────────────────────────────────────
  // Weighted average — incident type and location are most important
  const overallConfidence = (
    (incidentType.confidence * 0.35) +
    (locationText.confidence * 0.30) +
    (citizenName.confidence  * 0.15) +
    (notes.confidence        * 0.10) +
    (urgencyLevel.confidence * 0.10)
  );

  return {
    citizenName,
    incidentType,
    locationText,
    notes,
    urgencyLevel,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
    detectedLanguage,
    languageName,
  };
};
