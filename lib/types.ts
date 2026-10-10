// Shared domain types for the web client and the API routes.

export type Mode = 'education' | 'series';
export type AspectRatio = '16:9' | '9:16' | '1:1';
export type Language = 'ar' | 'en';

export type VoiceRef = {
  provider: string; // e.g. 'tts' (worker TTS_GENERATE_COMMAND engine)
  voiceId: string;
  speakingStyle?: string;
};

export type MediaRef = {
  url: string;
  key?: string;
  durable: boolean; // false = dev-only / worker-local URL
  contentType?: string;
};

export type Character = {
  id: string;
  seriesId: string;
  name: string;
  role?: string;
  appearance: string;
  age?: string;
  build?: string;
  hair?: string;
  wardrobe?: string;
  personality?: string;
  relationships?: string;
  negativeConstraints?: string;
  referenceImage?: MediaRef;
  voice?: VoiceRef;
  locked: boolean;
  lockedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Series = {
  id: string;
  title: string;
  logline?: string;
  style?: string;
  language: Language;
  aspectRatio: AspectRatio;
  narratorVoice?: VoiceRef;
  createdAt: string;
  updatedAt: string;
};

export type DialogueLine = { speakerId?: string; speaker: string; text: string };

export type Shot = { id: string; prompt: string; duration: number };

export type Scene = {
  id: string;
  index: number;
  title: string;
  phase?: string;
  sourceText: string; // verbatim slice of the user's text this scene covers
  narration: string; // narrator text (educational: verbatim source)
  dialogue: DialogueLine[];
  visual: string; // what the viewer sees
  characterIds: string[];
  referenceImageUrl?: string;
  duration: number; // seconds, 10-60 typical
  shots: Shot[];
};

export type Storyboard = {
  planner: 'llm' | 'deterministic';
  totalSeconds: number;
  narrationSeconds: number;
  warnings: string[];
  scenes: Scene[];
  createdAt: string;
};

export type EpisodeMemory = {
  summary: string;
  unresolvedThreads: string[];
  events: string[];
  characterStates: { characterId?: string; name: string; state: string }[];
  relationshipChanges: string[];
  locations: string[];
  wardrobeProps: string[];
  acquired: string[]; // injuries / objects / knowledge acquired
  finalSceneState: string;
  nextEpisodeNotes: string;
  source: 'llm' | 'deterministic' | 'manual';
  savedAt: string;
};

export type Episode = {
  id: string;
  seriesId: string;
  number: number;
  title: string;
  goal: string; // the episode idea / script supplied by the user
  minutes: number;
  aspectRatio: AspectRatio;
  storyboard?: Storyboard;
  memory?: EpisodeMemory;
  createdAt: string;
  updatedAt: string;
};

export type EducationProject = {
  id: string;
  title: string;
  sourceText: string;
  minutes: number;
  language: Language;
  aspectRatio: AspectRatio;
  narratorVoice?: VoiceRef;
  storyboard?: Storyboard;
  createdAt: string;
  updatedAt: string;
};

export type OwnerKind = 'episode' | 'project';
export type JobType = 'video' | 'audio' | 'render';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type Job = {
  id: string;
  ownerKind: OwnerKind;
  ownerId: string;
  seriesId?: string;
  sceneId?: string;
  shotId?: string;
  type: JobType;
  provider: string;
  providerJobId?: string;
  status: JobStatus;
  attempts: number;
  error?: string;
  output?: MediaRef;
  input: Record<string, unknown>;
  // fingerprint of the input; a changed storyboard makes old jobs stale
  inputHash: string;
  submittedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductionStatus = 'draft' | 'storyboard' | 'generating' | 'rendering' | 'completed' | 'failed';

// What the production UI needs in one round-trip.
export type ProductionView = {
  kind: OwnerKind;
  id: string;
  status: ProductionStatus;
  jobs: Job[];
  final?: Job;
};
