export type PlayerStatus = 'aktif' | 'istirahat' | 'pulang';

export type NavTab = 'main' | 'pemain' | 'statistik' | 'lainnya';

export interface Player {
  id: string;
  name: string;
  avatarUrl?: string;
  avatarColor: string;
  status: PlayerStatus;
  /** Jumlah game yang dimainkan pada sesi hari ini */
  gamesPlayedSession: number;
  /** Menang di sesi hari ini */
  winsSession: number;
  /** Kalah di sesi hari ini */
  lossesSession: number;
  /** Total poin dicetak pada sesi hari ini */
  pointsSession: number;
  /** Kemenangan beruntun saat ini */
  currentStreak: number;
  /** Kemenangan beruntun terpanjang di sesi ini */
  bestStreakSession: number;
  /** Timestamp kapan pemain mulai menunggu di antrean */
  waitingSince: number;
  /** Statistik kumulatif sepanjang waktu (semua sesi) */
  allTimeGames: number;
  allTimeWins: number;
  allTimeLosses: number;
  allTimePoints: number;
  allTimeBestStreak: number;
}

export interface SavedGroupMember {
  id: string;
  name: string;
  avatarUrl?: string;
  avatarColor: string;
  allTimeGames: number;
  allTimeWins: number;
  allTimeLosses: number;
  allTimePoints: number;
  allTimeBestStreak: number;
}

export interface ScoringSettings {
  targetPoints: number; // default 21 (11, 15, 21, custom)
  matchFormat: 'single' | 'bo3'; // 1 game atau best of 3
  capAt30: boolean; // maksimal 30 (29-29 -> 30 menang)
  ttsEnabled: boolean;
  autoSideSwitchAlert: boolean;
}

export interface RotationSettings {
  maxConsecutiveWins: number; // default 2
  winnerPairPolicy: 'stay_together' | 'split'; // tetap berpasangan atau dipisah
  shuffle4Players: boolean; // acak ulang pasangan jika hanya 4 pemain
  firstMatchMode: 'queue_order' | 'random';
  autoShuffleOnAdd: boolean; // otomatis acak saat menambah pemain
  targetSessionMatches: number | null; // target jumlah match dalam 1 sesi (1, 2, 3, dst. atau bebas/null)
  courtCount: 1 | 2; // mode 1 lapangan atau 2 lapangan
}

export interface VoiceSettings {
  enabled: boolean;
  pointAKeywords: string[];
  pointBKeywords: string[];
  minusAKeywords: string[];
  minusBKeywords: string[];
  undoKeywords: string[];
}

export interface ExpenseSettings {
  courtPricePerHour: number;
  courtHours: number;
  shuttlePricePerUnit: number;
  shuttleCount: number;
  splitMode: 'equal' | 'proportional';
  excludedFromSplitIds: string[];
}

export interface RentalReminder {
  active: boolean;
  durationMinutes: number;
  startedAt: number | null;
  alerted10Min: boolean;
  alertedEnded: boolean;
}

export interface GameScoreSnapshot {
  scoreA: number;
  scoreB: number;
  gamesWonA: number;
  gamesWonB: number;
  currentGameIndex: number; // 0, 1, 2
  completedGames: { scoreA: number; scoreB: number }[];
  servingTeam: 'A' | 'B';
  servingPlayerSlot: 0 | 1; // indeks pemain servis di tim yang sedang servis
  sidesSwapped: boolean;
  sideSwitchShownForGame: number | null;
}

export interface ActiveCourtMatch {
  courtNumber: 1 | 2;
  teamAIds: [string, string];
  teamBIds: [string, string];
  /** Tim mana yang sedang dalam rentetan kemenangan dan berapa kali */
  streakTeam: 'A' | 'B' | null;
  consecutiveWins: number;
  scoreA: number;
  scoreB: number;
  gamesWonA: number;
  gamesWonB: number;
  currentGameIndex: number;
  completedGames: { scoreA: number; scoreB: number }[];
  servingTeam: 'A' | 'B';
  servingPlayerSlot: 0 | 1;
  sidesSwapped: boolean;
  sideSwitchShownForGame: number | null;
  startedAt: number;
  shuttleCountThisMatch: number;
  undoStack: GameScoreSnapshot[];
  winner: 'A' | 'B' | null;
}

export interface MatchRecord {
  id: string;
  courtNumber: 1 | 2;
  timestamp: number;
  durationSeconds: number;
  teamAIds: string[];
  teamBIds: string[];
  teamANames: string[];
  teamBNames: string[];
  finalScoreA: number;
  finalScoreB: number;
  gameScores: { scoreA: number; scoreB: number }[];
  winner: 'A' | 'B';
  shuttlesUsed: number;
}

export interface TournamentMatch {
  id: string;
  round: number;
  teamAIds: [string, string];
  teamBIds: [string, string];
  scoreA: number | null;
  scoreB: number | null;
  completed: boolean;
}

export interface TournamentState {
  active: boolean;
  matches: TournamentMatch[];
  createdAt: number;
}

export interface AppState {
  theme: 'dark' | 'light';
  sessionStartedAt: number;
  players: Player[];
  savedGroup: SavedGroupMember[];
  /** Urutan antrean pemain aktif (ID pemain) yang tidak sedang di lapangan */
  queueIds: string[];
  /** Catatan penjelasan rotasi terakhir (misal saat 5/6 pemain atau habis streak 2x) */
  lastRotationNote: string;
  /** Pasangan terakhir yang bermain bersama untuk menghindari pengulangan berturut-turut */
  recentPairKeys: string[];
  courts: ActiveCourtMatch[];
  matchHistory: MatchRecord[];
  /** Riwayat pertandingan dari sesi-sesi sebelumnya untuk leaderboard keseluruhan */
  allTimeMatchHistory: MatchRecord[];
  scoringSettings: ScoringSettings;
  rotationSettings: RotationSettings;
  voiceSettings: VoiceSettings;
  expenseSettings: ExpenseSettings;
  rentalReminder: RentalReminder;
  tournament: TournamentState;
  quickNotes: string;
  /** Statistik duo sepanjang sesi / semua sesi */
  duoStats: Record<string, { playerIds: [string, string]; games: number; wins: number }>;
}
