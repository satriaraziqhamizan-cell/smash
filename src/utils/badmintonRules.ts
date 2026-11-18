import type { ActiveCourtMatch, GameScoreSnapshot, ScoringSettings } from '../types/smashboard';

export interface ScoreEvaluation {
  isDeuce: boolean;
  isGamePointA: boolean;
  isGamePointB: boolean;
  isMatchPointA: boolean;
  isMatchPointB: boolean;
  gameWinner: 'A' | 'B' | null;
  matchWinner: 'A' | 'B' | null;
  shouldTriggerSideSwitch: boolean;
  serviceCourt: 'Kanan' | 'Kiri';
}

/**
 * Menghitung batas poin untuk menukar sisi lapangan pada game penentu.
 * Contoh: target 21 -> poin 11; target 15 -> poin 8; target 11 -> poin 6.
 */
export function getSideSwitchPoint(targetPoints: number): number {
  return Math.floor(targetPoints / 2) + 1;
}

/**
 * Mengevaluasi status game badminton saat ini berdasarkan aturan resmi yang dikonfigurasi.
 */
export function evaluateScoreState(
  match: Pick<
    ActiveCourtMatch,
    | 'scoreA'
    | 'scoreB'
    | 'gamesWonA'
    | 'gamesWonB'
    | 'currentGameIndex'
    | 'servingTeam'
    | 'sideSwitchShownForGame'
  >,
  settings: ScoringSettings
): ScoreEvaluation {
  const { scoreA, scoreB, gamesWonA, gamesWonB, currentGameIndex, servingTeam } = match;
  const { targetPoints, matchFormat, capAt30 } = settings;
  const maxCap = targetPoints === 21 ? 30 : targetPoints + 9;
  const gamesNeededToWin = matchFormat === 'bo3' ? 2 : 1;

  // Cek apakah game sudah selesai
  let gameWinner: 'A' | 'B' | null = null;
  if (capAt30 && (scoreA >= maxCap || scoreB >= maxCap)) {
    if (scoreA > scoreB) gameWinner = 'A';
    else if (scoreB > scoreA) gameWinner = 'B';
  } else {
    if (scoreA >= targetPoints && scoreA - scoreB >= 2) {
      gameWinner = 'A';
    } else if (scoreB >= targetPoints && scoreB - scoreA >= 2) {
      gameWinner = 'B';
    }
  }

  // Deuce terjadi jika kedua tim mencapai targetPoints - 1 dan selisih <= 1
  const isDeuce =
    !gameWinner && scoreA >= targetPoints - 1 && scoreB >= targetPoints - 1 && Math.abs(scoreA - scoreB) <= 1;

  // Cek apakah jika A mencetak 1 poin lagi maka A menang game
  const checkNextWins = (a: number, b: number): boolean => {
    if (capAt30 && a >= maxCap) return true;
    return a >= targetPoints && a - b >= 2;
  };

  const isGamePointA = !gameWinner && checkNextWins(scoreA + 1, scoreB);
  const isGamePointB = !gameWinner && checkNextWins(scoreB + 1, scoreA);

  const isMatchPointA = isGamePointA && gamesWonA + 1 >= gamesNeededToWin;
  const isMatchPointB = isGamePointB && gamesWonB + 1 >= gamesNeededToWin;

  let matchWinner: 'A' | 'B' | null = null;
  if (gameWinner === 'A' && gamesWonA + 1 >= gamesNeededToWin) {
    matchWinner = 'A';
  } else if (gameWinner === 'B' && gamesWonB + 1 >= gamesNeededToWin) {
    matchWinner = 'B';
  }

  // Tukar sisi otomatis di game penentu (Game 3 pada BO3, atau Game 1 jika single game & diaktifkan)
  const isDecidingGame = matchFormat === 'bo3' ? currentGameIndex === 2 : currentGameIndex === 0;
  const switchThreshold = getSideSwitchPoint(targetPoints);
  const alreadySwitchedThisGame = match.sideSwitchShownForGame === currentGameIndex;
  const shouldTriggerSideSwitch =
    settings.autoSideSwitchAlert &&
    isDecidingGame &&
    !alreadySwitchedThisGame &&
    !gameWinner &&
    (scoreA === switchThreshold || scoreB === switchThreshold) &&
    Math.max(scoreA, scoreB) === switchThreshold &&
    Math.min(scoreA, scoreB) < switchThreshold;

  // Posisi servis Kanan (genap) / Kiri (ganjil) berdasarkan skor tim yang servis
  const servingScore = servingTeam === 'A' ? scoreA : scoreB;
  const serviceCourt: 'Kanan' | 'Kiri' = servingScore % 2 === 0 ? 'Kanan' : 'Kiri';

  return {
    isDeuce,
    isGamePointA,
    isGamePointB,
    isMatchPointA,
    isMatchPointB,
    gameWinner,
    matchWinner,
    shouldTriggerSideSwitch,
    serviceCourt,
  };
}

/**
 * Membuat snapshot kondisi skor untuk fitur Undo tak terbatas dalam 1 pertandingan.
 */
export function createScoreSnapshot(match: ActiveCourtMatch): GameScoreSnapshot {
  return {
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    gamesWonA: match.gamesWonA,
    gamesWonB: match.gamesWonB,
    currentGameIndex: match.currentGameIndex,
    completedGames: match.completedGames.map((g) => ({ ...g })),
    servingTeam: match.servingTeam,
    servingPlayerSlot: match.servingPlayerSlot,
    sidesSwapped: match.sidesSwapped,
    sideSwitchShownForGame: match.sideSwitchShownForGame,
  };
}

/**
 * Memproses penambahan poin (+1) untuk Tim A atau Tim B, termasuk pindah servis & lanjut ke game berikutnya (BO3).
 */
export function applyPointToMatch(
  match: ActiveCourtMatch,
  scoringTeam: 'A' | 'B',
  settings: ScoringSettings
): {
  updatedMatch: ActiveCourtMatch;
  evaluation: ScoreEvaluation;
  gameJustFinished: 'A' | 'B' | null;
  sideSwitchedNow: boolean;
} {
  if (match.winner) {
    return {
      updatedMatch: match,
      evaluation: evaluateScoreState(match, settings),
      gameJustFinished: null,
      sideSwitchedNow: false,
    };
  }

  const snapshot = createScoreSnapshot(match);
  const nextScoreA = match.scoreA + (scoringTeam === 'A' ? 1 : 0);
  const nextScoreB = match.scoreB + (scoringTeam === 'B' ? 1 : 0);

  // Jika tim penerima yang mencetak poin, servis pindah & posisi servis tetap dari tim baru
  // Jika tim yang sama mencetak poin lagi, server bisa berganti slot di ganda secara konseptual atau tetap satu tim
  let nextServingSlot = match.servingPlayerSlot;
  if (match.servingTeam !== scoringTeam) {
    // Pindah bola: pemain di sisi sesuai skor baru yang akan servis
    const newTeamScore = scoringTeam === 'A' ? nextScoreA : nextScoreB;
    nextServingSlot = (newTeamScore % 2) as 0 | 1;
  }

  let nextMatch: ActiveCourtMatch = {
    ...match,
    scoreA: nextScoreA,
    scoreB: nextScoreB,
    servingTeam: scoringTeam,
    servingPlayerSlot: nextServingSlot,
    undoStack: [...match.undoStack, snapshot],
  };

  const evalResult = evaluateScoreState(nextMatch, settings);
  let sideSwitchedNow = false;

  if (evalResult.shouldTriggerSideSwitch) {
    nextMatch = {
      ...nextMatch,
      sidesSwapped: !nextMatch.sidesSwapped,
      sideSwitchShownForGame: nextMatch.currentGameIndex,
    };
    sideSwitchedNow = true;
  }

  let gameJustFinished: 'A' | 'B' | null = null;
  if (evalResult.gameWinner) {
    gameJustFinished = evalResult.gameWinner;
    const newGamesWonA = nextMatch.gamesWonA + (evalResult.gameWinner === 'A' ? 1 : 0);
    const newGamesWonB = nextMatch.gamesWonB + (evalResult.gameWinner === 'B' ? 1 : 0);
    const completed = [...nextMatch.completedGames, { scoreA: nextScoreA, scoreB: nextScoreB }];

    if (evalResult.matchWinner) {
      nextMatch = {
        ...nextMatch,
        gamesWonA: newGamesWonA,
        gamesWonB: newGamesWonB,
        completedGames: completed,
        winner: evalResult.matchWinner,
      };
    } else {
      // Lanjut otomatis ke game berikutnya di Best of 3 dan tukar sisi lapangan
      nextMatch = {
        ...nextMatch,
        gamesWonA: newGamesWonA,
        gamesWonB: newGamesWonB,
        completedGames: completed,
        currentGameIndex: nextMatch.currentGameIndex + 1,
        scoreA: 0,
        scoreB: 0,
        servingTeam: evalResult.gameWinner,
        servingPlayerSlot: 0,
        sidesSwapped: !nextMatch.sidesSwapped,
      };
    }
  }

  return {
    updatedMatch: nextMatch,
    evaluation: evaluateScoreState(nextMatch, settings),
    gameJustFinished,
    sideSwitchedNow,
  };
}

/**
 * Memproses pengurangan poin (-1) secara manual pada game berjalan.
 */
export function decrementPointOnMatch(match: ActiveCourtMatch, team: 'A' | 'B'): ActiveCourtMatch {
  const current = team === 'A' ? match.scoreA : match.scoreB;
  if (current <= 0 || match.winner) return match;
  const snapshot = createScoreSnapshot(match);
  return {
    ...match,
    scoreA: team === 'A' ? current - 1 : match.scoreA,
    scoreB: team === 'B' ? current - 1 : match.scoreB,
    undoStack: [...match.undoStack, snapshot],
  };
}

/**
 * Mengembalikan skor ke langkah sebelumnya dari riwayat undo.
 */
export function undoLastScoreAction(match: ActiveCourtMatch): ActiveCourtMatch {
  if (match.undoStack.length === 0) return match;
  const prev = match.undoStack[match.undoStack.length - 1];
  return {
    ...match,
    ...prev,
    winner: null,
    undoStack: match.undoStack.slice(0, -1),
  };
}
