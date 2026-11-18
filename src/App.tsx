import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  BellRing,
  Moon,
  Sliders,
  Sun,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  ActiveCourtMatch,
  AppState,
  ExpenseSettings,
  MatchRecord,
  NavTab,
  Player,
  PlayerStatus,
  RotationSettings,
  SavedGroupMember,
  ScoringSettings,
  VoiceSettings,
} from './types/smashboard';
import {
  applyPointToMatch,
  createScoreSnapshot,
  decrementPointOnMatch,
  evaluateScoreState,
  undoLastScoreAction,
} from './utils/badmintonRules';
import {
  acakArray,
  ambilPemainAktif,
  bentukPasanganAdilDariEmpat,
  bentukPertandinganPertama,
  buatJadwalTurnamenMini,
  buatKunciPasangan,
  buatPertandinganBaru,
  prosesRotasiSetelahPertandingan,
  sinkronkanAntreanDenganPemain,
  tukarPemainLapanganDenganAntrean,
} from './utils/rotation';
import {
  createInitialState,
  createPlayer,
  loadState,
  saveState,
} from './utils/storage';
import { useOnlineStatus } from './hooks/usePWAInstall';
import { MatchTab } from './components/MatchTab';
import { PlayersTab } from './components/PlayersTab';
import { StatsTab } from './components/StatsTab';
import { MoreTab } from './components/MoreTab';
import { SpinWheelModal } from './components/SpinWheelModal';

function playAlertChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.16);
      gain.gain.setValueAtTime(0.18, now + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.16 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.16);
      osc.stop(now + i * 0.16 + 0.36);
    });
  } catch {
    // Abaikan jika audio diblokir browser
  }
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [activeTab, setActiveTab] = useState<NavTab>('main');
  const [rentalAlertBanner, setRentalAlertBanner] = useState<string | null>(null);
  const [spinModalOpen, setSpinModalOpen] = useState(false);
  const [spinModalScope, setSpinModalScope] = useState<'all_active' | 'court_only'>('all_active');
  const isOnline = useOnlineStatus();

  // Simpan otomatis ke localStorage setiap kali state berubah
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Sinkronkan tema gelap/terang ke <html>
  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [state.theme]);

  // Pemantau alarm 10 menit sebelum waktu sewa habis
  useEffect(() => {
    if (!state.rentalReminder.active || !state.rentalReminder.startedAt) return;
    const interval = setInterval(() => {
      const endAt =
        state.rentalReminder.startedAt! + state.rentalReminder.durationMinutes * 60 * 1000;
      const remainingMs = endAt - Date.now();

      if (remainingMs <= 0 && !state.rentalReminder.alertedEnded) {
        playAlertChime();
        setRentalAlertBanner('Waktu sewa lapangan sudah habis!');
        setState((prev) => ({
          ...prev,
          rentalReminder: {
            ...prev.rentalReminder,
            alertedEnded: true,
            active: false,
          },
        }));
      } else if (
        remainingMs > 0 &&
        remainingMs <= 10 * 60 * 1000 &&
        !state.rentalReminder.alerted10Min
      ) {
        playAlertChime();
        setRentalAlertBanner('Perhatian: Sisa waktu sewa lapangan tinggal 10 menit lagi!');
        setState((prev) => ({
          ...prev,
          rentalReminder: {
            ...prev.rentalReminder,
            alerted10Min: true,
          },
        }));
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [state.rentalReminder]);

  const onCourtPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    state.courts.forEach((c) => {
      c.teamAIds.forEach((id) => ids.add(id));
      c.teamBIds.forEach((id) => ids.add(id));
    });
    return ids;
  }, [state.courts]);

  // === HANDLER PERTANDINGAN & SKOR ===
  const handleStartCourtMatch = (courtNumber: 1 | 2) => {
    setState((prev) => {
      const otherCourts = prev.courts.filter((c) => c.courtNumber !== courtNumber);
      const res = bentukPertandinganPertama(
        courtNumber,
        prev.players,
        prev.queueIds,
        otherCourts,
        prev.rotationSettings,
        prev.recentPairKeys
      );
      if (!res.nextMatch) {
        return {
          ...prev,
          queueIds: res.nextQueueIds,
          lastRotationNote: res.alasanRotasi,
        };
      }
      return {
        ...prev,
        courts: [...otherCourts, res.nextMatch].sort((a, b) => a.courtNumber - b.courtNumber),
        queueIds: res.nextQueueIds,
        lastRotationNote: res.alasanRotasi,
      };
    });
  };

  const handleScorePoint = (courtNumber: 1 | 2, team: 'A' | 'B') => {
    setState((prev) => ({
      ...prev,
      courts: prev.courts.map((c) => {
        if (c.courtNumber !== courtNumber) return c;
        return applyPointToMatch(c, team, prev.scoringSettings).updatedMatch;
      }),
    }));
  };

  const handleDecrementPoint = (courtNumber: 1 | 2, team: 'A' | 'B') => {
    setState((prev) => ({
      ...prev,
      courts: prev.courts.map((c) =>
        c.courtNumber === courtNumber ? decrementPointOnMatch(c, team) : c
      ),
    }));
  };

  const handleUndoScore = (courtNumber: 1 | 2) => {
    setState((prev) => ({
      ...prev,
      courts: prev.courts.map((c) =>
        c.courtNumber === courtNumber ? undoLastScoreAction(c) : c
      ),
    }));
  };

  const handleSwapCourtSides = (courtNumber: 1 | 2) => {
    setState((prev) => ({
      ...prev,
      courts: prev.courts.map((c) =>
        c.courtNumber === courtNumber
          ? {
              ...c,
              sidesSwapped: !c.sidesSwapped,
              undoStack: [...c.undoStack, createScoreSnapshot(c)],
            }
          : c
      ),
    }));
  };

  const handleSetCustomScore = (
    courtNumber: 1 | 2,
    scoreA: number,
    scoreB: number,
    gamesWonA: number,
    gamesWonB: number
  ) => {
    setState((prev) => ({
      ...prev,
      courts: prev.courts.map((c) => {
        if (c.courtNumber !== courtNumber) return c;
        const nextMatch: ActiveCourtMatch = {
          ...c,
          scoreA,
          scoreB,
          gamesWonA,
          gamesWonB,
          undoStack: [...c.undoStack, createScoreSnapshot(c)],
          winner: null,
        };
        const ev = evaluateScoreState(nextMatch, prev.scoringSettings);
        return {
          ...nextMatch,
          winner: ev.matchWinner,
        };
      }),
    }));
  };

  const handleResetCourtScore = (courtNumber: 1 | 2) => {
    setState((prev) => ({
      ...prev,
      courts: prev.courts.map((c) => {
        if (c.courtNumber !== courtNumber) return c;
        return {
          ...c,
          scoreA: 0,
          scoreB: 0,
          gamesWonA: 0,
          gamesWonB: 0,
          currentGameIndex: 0,
          completedGames: [],
          servingTeam: 'A',
          servingPlayerSlot: 0,
          sidesSwapped: false,
          sideSwitchShownForGame: null,
          winner: null,
          undoStack: [...c.undoStack, createScoreSnapshot(c)],
        };
      }),
      lastRotationNote: `Skor Lapangan ${courtNumber} direset ke 0 - 0.`,
    }));
  };

  const handleManualSetCourtLineup = (
    courtNumber: 1 | 2,
    teamAIds: [string, string],
    teamBIds: [string, string]
  ) => {
    setState((prev) => {
      const nextCourts = prev.courts.map((c) =>
        c.courtNumber === courtNumber
          ? {
              ...c,
              teamAIds,
              teamBIds,
              streakTeam: null,
              consecutiveWins: 0,
            }
          : c
      );
      const nextQueue = sinkronkanAntreanDenganPemain(prev.players, prev.queueIds, nextCourts);
      return {
        ...prev,
        courts: nextCourts,
        queueIds: nextQueue,
        lastRotationNote: `Susunan pemain Lapangan ${courtNumber} diatur manual.`,
      };
    });
  };

  const handleAdjustShuttle = (courtNumber: 1 | 2, delta: number) => {
    setState((prev) => {
      const targetCourt = prev.courts.find((c) => c.courtNumber === courtNumber);
      if (!targetCourt) return prev;
      if (delta < 0 && targetCourt.shuttleCountThisMatch <= 0) return prev;
      return {
        ...prev,
        courts: prev.courts.map((c) =>
          c.courtNumber === courtNumber
            ? { ...c, shuttleCountThisMatch: Math.max(0, c.shuttleCountThisMatch + delta) }
            : c
        ),
        expenseSettings: {
          ...prev.expenseSettings,
          shuttleCount: Math.max(0, prev.expenseSettings.shuttleCount + delta),
        },
      };
    });
  };

  const handleShuffleCurrentCourt = (courtNumber: 1 | 2) => {
    setState((prev) => ({
      ...prev,
      courts: prev.courts.map((c) => {
        if (c.courtNumber !== courtNumber) return c;
        const four = acakArray([...c.teamAIds, ...c.teamBIds]) as [
          string,
          string,
          string,
          string,
        ];
        const { teamA, teamB } = bentukPasanganAdilDariEmpat(
          four,
          prev.recentPairKeys,
          true
        );
        return {
          ...c,
          teamAIds: teamA,
          teamBIds: teamB,
          streakTeam: null,
          consecutiveWins: 0,
        };
      }),
      lastRotationNote: 'Pasangan di lapangan diacak ulang secara adil.',
    }));
  };

  const handleSwapCourtPlayers = (courtNumber: 1 | 2, id1: string, id2: string) => {
    setState((prev) => ({
      ...prev,
      courts: prev.courts.map((c) => {
        if (c.courtNumber !== courtNumber) return c;
        const swapId = (id: string) => (id === id1 ? id2 : id === id2 ? id1 : id);
        return {
          ...c,
          teamAIds: [swapId(c.teamAIds[0]), swapId(c.teamAIds[1])],
          teamBIds: [swapId(c.teamBIds[0]), swapId(c.teamBIds[1])],
        };
      }),
    }));
  };

  const handleSwapCourtWithQueue = (
    courtNumber: 1 | 2,
    courtPlayerId: string,
    queuePlayerId: string
  ) => {
    setState((prev) => {
      const target = prev.courts.find((c) => c.courtNumber === courtNumber);
      if (!target) return prev;
      const { updatedMatch, updatedQueueIds } = tukarPemainLapanganDenganAntrean(
        target,
        courtPlayerId,
        queuePlayerId,
        prev.queueIds
      );
      const pOut = prev.players.find((p) => p.id === courtPlayerId)?.name ?? '';
      const pIn = prev.players.find((p) => p.id === queuePlayerId)?.name ?? '';
      return {
        ...prev,
        courts: prev.courts.map((c) => (c.courtNumber === courtNumber ? updatedMatch : c)),
        queueIds: updatedQueueIds,
        lastRotationNote: `${pOut} ditukar dengan ${pIn} dari antrean.`,
      };
    });
  };

  const finalizeAndRotateMatch = (
    prev: AppState,
    finished: ActiveCourtMatch,
    winner: 'A' | 'B'
  ): AppState => {
    const courtNumber = finished.courtNumber;
    const now = Date.now();
    const playerMap = new Map(prev.players.map((p) => [p.id, p]));

    const teamANames = finished.teamAIds.map((id) => playerMap.get(id)?.name ?? '?');
    const teamBNames = finished.teamBIds.map((id) => playerMap.get(id)?.name ?? '?');

    const effectiveGameScores =
      finished.completedGames.length > 0
        ? finished.completedGames
        : [{ scoreA: finished.scoreA, scoreB: finished.scoreB }];

    const totalPointsA = effectiveGameScores.reduce((s, g) => s + g.scoreA, 0);
    const totalPointsB = effectiveGameScores.reduce((s, g) => s + g.scoreB, 0);

    const record: MatchRecord = {
      id: `m_${now}_${courtNumber}`,
      courtNumber,
      timestamp: now,
      durationSeconds: Math.max(1, Math.floor((now - finished.startedAt) / 1000)),
      teamAIds: [...finished.teamAIds],
      teamBIds: [...finished.teamBIds],
      teamANames,
      teamBNames,
      finalScoreA: finished.scoreA,
      finalScoreB: finished.scoreB,
      gameScores: effectiveGameScores,
      winner,
      shuttlesUsed: finished.shuttleCountThisMatch,
    };

    const winnerSet = new Set(winner === 'A' ? finished.teamAIds : finished.teamBIds);
    const loserSet = new Set(winner === 'A' ? finished.teamBIds : finished.teamAIds);

    // Update statistik setiap pemain
    const updatedPlayers = prev.players.map((p) => {
      if (winnerSet.has(p.id)) {
        const pts = finished.teamAIds.includes(p.id) ? totalPointsA : totalPointsB;
        const nextStreak = p.currentStreak + 1;
        return {
          ...p,
          gamesPlayedSession: p.gamesPlayedSession + 1,
          winsSession: p.winsSession + 1,
          pointsSession: p.pointsSession + pts,
          currentStreak: nextStreak,
          bestStreakSession: Math.max(p.bestStreakSession, nextStreak),
          waitingSince: now,
          allTimeGames: p.allTimeGames + 1,
          allTimeWins: p.allTimeWins + 1,
          allTimePoints: p.allTimePoints + pts,
          allTimeBestStreak: Math.max(p.allTimeBestStreak, nextStreak),
        };
      }
      if (loserSet.has(p.id)) {
        const pts = finished.teamAIds.includes(p.id) ? totalPointsA : totalPointsB;
        return {
          ...p,
          gamesPlayedSession: p.gamesPlayedSession + 1,
          lossesSession: p.lossesSession + 1,
          pointsSession: p.pointsSession + pts,
          currentStreak: 0,
          waitingSince: now,
          allTimeGames: p.allTimeGames + 1,
          allTimeLosses: p.allTimeLosses + 1,
          allTimePoints: p.allTimePoints + pts,
        };
      }
      return p;
    });

    // Update statistik duo
    const nextDuoStats = { ...prev.duoStats };
    const updateDuo = (pair: [string, string], won: boolean) => {
      const key = buatKunciPasangan(pair[0], pair[1]);
      const sortedIds: [string, string] =
        pair[0] < pair[1] ? [pair[0], pair[1]] : [pair[1], pair[0]];
      const cur = nextDuoStats[key] ?? { playerIds: sortedIds, games: 0, wins: 0 };
      nextDuoStats[key] = {
        playerIds: sortedIds,
        games: cur.games + 1,
        wins: cur.wins + (won ? 1 : 0),
      };
    };
    updateDuo(finished.teamAIds, winner === 'A');
    updateDuo(finished.teamBIds, winner === 'B');

    const pairKeysNow = [
      buatKunciPasangan(finished.teamAIds[0], finished.teamAIds[1]),
      buatKunciPasangan(finished.teamBIds[0], finished.teamBIds[1]),
    ];
    const nextRecentPairKeys = [...prev.recentPairKeys, ...pairKeysNow].slice(-12);

    const otherCourts = prev.courts.filter((c) => c.courtNumber !== courtNumber);
    const rotation = prosesRotasiSetelahPertandingan(
      finished,
      winner,
      updatedPlayers,
      prev.queueIds,
      otherCourts,
      prev.rotationSettings,
      nextRecentPairKeys
    );

    const nextCourts = rotation.nextMatch
      ? [...otherCourts, rotation.nextMatch].sort((a, b) => a.courtNumber - b.courtNumber)
      : otherCourts;

    const nextMatchCount = prev.matchHistory.length + 1;
    const targetMatches = prev.rotationSettings.targetSessionMatches;
    if (targetMatches !== null && nextMatchCount === targetMatches) {
      setTimeout(() => {
        playAlertChime();
        setRentalAlertBanner(`Target ${targetMatches} pertandingan sesi telah tercapai!`);
      }, 0);
    }

    return {
      ...prev,
      players: updatedPlayers,
      matchHistory: [...prev.matchHistory, record],
      duoStats: nextDuoStats,
      recentPairKeys: nextRecentPairKeys,
      courts: nextCourts,
      queueIds: rotation.nextQueueIds,
      lastRotationNote: rotation.alasanRotasi,
    };
  };

  const handleFinishAndRotate = (courtNumber: 1 | 2) => {
    setState((prev) => {
      const finished = prev.courts.find((c) => c.courtNumber === courtNumber);
      if (!finished || !finished.winner) return prev;
      return finalizeAndRotateMatch(prev, finished, finished.winner);
    });
  };

  const handleDeclareWinner = (
    courtNumber: 1 | 2,
    winner: 'A' | 'B',
    scoreA?: number,
    scoreB?: number,
    autoRecap = false
  ) => {
    setState((prev) => {
      const target = prev.courts.find((c) => c.courtNumber === courtNumber);
      if (!target) return prev;

      let nextScoreA = scoreA ?? target.scoreA;
      let nextScoreB = scoreB ?? target.scoreB;

      // Jika pemenang dinyatakan tanpa angka dan skor pemenang masih <= lawan, sesuaikan agar valid
      if (scoreA === undefined && scoreB === undefined) {
        if (winner === 'A' && nextScoreA <= nextScoreB) {
          nextScoreA = Math.max(prev.scoringSettings.targetPoints, nextScoreB + 2);
        } else if (winner === 'B' && nextScoreB <= nextScoreA) {
          nextScoreB = Math.max(prev.scoringSettings.targetPoints, nextScoreA + 2);
        }
      }

      const updatedMatch: ActiveCourtMatch = {
        ...target,
        scoreA: nextScoreA,
        scoreB: nextScoreB,
        winner,
        undoStack: [...target.undoStack, createScoreSnapshot(target)],
      };

      if (autoRecap) {
        return finalizeAndRotateMatch(prev, updatedMatch, winner);
      }

      return {
        ...prev,
        courts: prev.courts.map((c) => (c.courtNumber === courtNumber ? updatedMatch : c)),
        lastRotationNote: `Tim ${winner} dinyatakan menang (${nextScoreA}-${nextScoreB}). Siap direkap.`,
      };
    });
  };

  // === HANDLER PEMAIN ===
  const handleAddPlayers = (newPlayers: Player[]) => {
    setState((prev) => {
      const combined = [...prev.players, ...newPlayers];
      const shouldAutoShuffle = prev.rotationSettings.autoShuffleOnAdd;
      const hasUnstartedMatchesOnly =
        prev.matchHistory.length === 0 &&
        prev.courts.every(
          (c) =>
            c.scoreA === 0 &&
            c.scoreB === 0 &&
            c.gamesWonA === 0 &&
            c.gamesWonB === 0 &&
            c.undoStack.length === 0
        );

      let nextCourts = [...prev.courts];
      let nextQueue = sinkronkanAntreanDenganPemain(combined, prev.queueIds, nextCourts);
      let note = prev.lastRotationNote;

      if (shouldAutoShuffle) {
        const activeList = ambilPemainAktif(combined);
        if (hasUnstartedMatchesOnly && activeList.length >= 4) {
          // Acak semua pemain aktif sejak awal sebelum pertandingan pertama dimulai
          const shuffledIds = acakArray(activeList.map((p) => p.id));
          const res = bentukPertandinganPertama(
            1,
            combined,
            shuffledIds,
            [],
            { ...prev.rotationSettings, firstMatchMode: 'queue_order' },
            prev.recentPairKeys
          );
          if (res.nextMatch) {
            nextCourts = [res.nextMatch];
            nextQueue = res.nextQueueIds;
            note = 'Pemain baru ditambahkan dan seluruh susunan awal langsung diacak otomatis.';
          }
        } else {
          // Pertandingan sedang berjalan: acak urutan antrean yang tersedia
          nextQueue = acakArray(nextQueue);
          if (nextCourts.length === 0 && activeList.length >= 4) {
            const res = bentukPertandinganPertama(
              1,
              combined,
              nextQueue,
              [],
              { ...prev.rotationSettings, firstMatchMode: 'random' },
              prev.recentPairKeys
            );
            if (res.nextMatch) {
              nextCourts = [res.nextMatch];
              nextQueue = res.nextQueueIds;
              note = res.alasanRotasi;
            }
          }
        }
      } else if (nextCourts.length === 0 && ambilPemainAktif(combined).length >= 4) {
        // Jika lapangan 1 belum mulai dan sekarang sudah >= 4 pemain aktif, otomatis mulai
        const res = bentukPertandinganPertama(
          1,
          combined,
          nextQueue,
          [],
          prev.rotationSettings,
          prev.recentPairKeys
        );
        if (res.nextMatch) {
          nextCourts = [res.nextMatch];
          nextQueue = res.nextQueueIds;
          note = res.alasanRotasi;
        }
      }

      return {
        ...prev,
        players: combined,
        queueIds: nextQueue,
        courts: nextCourts,
        lastRotationNote: note,
      };
    });
  };

  const handleApplySpinResult = (result: {
    scope: 'all_active' | 'court_only';
    teamAIds: [string, string];
    teamBIds: [string, string];
    queueIds: string[];
  }) => {
    setState((prev) => {
      const otherCourts = prev.courts.filter((c) => c.courtNumber !== 1);
      const otherCourtIds = new Set(
        otherCourts.flatMap((c) => [...c.teamAIds, ...c.teamBIds])
      );

      const freshCourt1 = buatPertandinganBaru(1, result.teamAIds, result.teamBIds, null, 0);

      const nextCourts = [freshCourt1, ...otherCourts].sort(
        (a, b) => a.courtNumber - b.courtNumber
      );

      let nextQueue = prev.queueIds;
      if (result.scope === 'all_active') {
        const filteredSpinQueue = result.queueIds.filter((id) => !otherCourtIds.has(id));
        nextQueue = sinkronkanAntreanDenganPemain(prev.players, filteredSpinQueue, nextCourts);
      } else {
        nextQueue = sinkronkanAntreanDenganPemain(prev.players, prev.queueIds, nextCourts);
      }

      return {
        ...prev,
        courts: nextCourts,
        queueIds: nextQueue,
        lastRotationNote:
          result.scope === 'all_active'
            ? 'Hasil undian diterapkan ke Lapangan 1 & antrean. Siap mencatat skor!'
            : 'Pasangan baru dari undian diterapkan di Lapangan 1. Siap mencatat skor!',
      };
    });
    setActiveTab('main');
  };

  const handleUpdatePlayerStatus = (playerId: string, status: PlayerStatus) => {
    setState((prev) => {
      const now = Date.now();
      const updatedPlayers = prev.players.map((p) =>
        p.id === playerId
          ? {
              ...p,
              status,
              waitingSince: status === 'aktif' ? now : p.waitingSince,
            }
          : p
      );

      let nextCourts = [...prev.courts];
      let nextQueue = sinkronkanAntreanDenganPemain(updatedPlayers, prev.queueIds, nextCourts);
      let note = prev.lastRotationNote;

      // Tangani edge case jika pemain yang sedang di lapangan diubah jadi Istirahat atau Pulang
      if (status !== 'aktif') {
        const affectedCourt = nextCourts.find(
          (c) => c.teamAIds.includes(playerId) || c.teamBIds.includes(playerId)
        );
        if (affectedCourt) {
          const pName = updatedPlayers.find((p) => p.id === playerId)?.name ?? 'Pemain';
          if (nextQueue.length > 0) {
            const replacementId = nextQueue[0];
            const repName = updatedPlayers.find((p) => p.id === replacementId)?.name ?? '';
            const replacedMatch: ActiveCourtMatch = {
              ...affectedCourt,
              teamAIds: [
                affectedCourt.teamAIds[0] === playerId ? replacementId : affectedCourt.teamAIds[0],
                affectedCourt.teamAIds[1] === playerId ? replacementId : affectedCourt.teamAIds[1],
              ],
              teamBIds: [
                affectedCourt.teamBIds[0] === playerId ? replacementId : affectedCourt.teamBIds[0],
                affectedCourt.teamBIds[1] === playerId ? replacementId : affectedCourt.teamBIds[1],
              ],
            };
            nextCourts = nextCourts.map((c) =>
              c.courtNumber === affectedCourt.courtNumber ? replacedMatch : c
            );
            nextQueue = nextQueue.slice(1);
            note = `${pName} (${status}) digantikan otomatis oleh ${repName} dari antrean terdepan.`;
          } else {
            // Tidak ada pengganti di antrean -> kosongkan lapangan dan kembalikan sisa pemain aktif ke antrean
            nextCourts = nextCourts.filter((c) => c.courtNumber !== affectedCourt.courtNumber);
            nextQueue = sinkronkanAntreanDenganPemain(updatedPlayers, nextQueue, nextCourts);
            note = `${pName} (${status}) dan tidak ada pengganti di antrean. Butuh minimal 4 pemain aktif.`;
          }
        }
      } else {
        // Jika menjadi aktif & lapangan belum ada, coba isi lapangan jika cukup 4 pemain
        if (nextCourts.length === 0 && ambilPemainAktif(updatedPlayers).length >= 4) {
          const res = bentukPertandinganPertama(
            1,
            updatedPlayers,
            nextQueue,
            [],
            prev.rotationSettings,
            prev.recentPairKeys
          );
          if (res.nextMatch) {
            nextCourts = [res.nextMatch];
            nextQueue = res.nextQueueIds;
            note = res.alasanRotasi;
          }
        }
      }

      return {
        ...prev,
        players: updatedPlayers,
        courts: nextCourts,
        queueIds: nextQueue,
        lastRotationNote: note,
      };
    });
  };

  const handleRemovePlayer = (playerId: string) => {
    setState((prev) => {
      const updatedPlayers = prev.players.filter((p) => p.id !== playerId);
      let nextCourts = prev.courts.filter(
        (c) => !c.teamAIds.includes(playerId) && !c.teamBIds.includes(playerId)
      );
      let nextQueue = sinkronkanAntreanDenganPemain(updatedPlayers, prev.queueIds, nextCourts);
      let note = prev.lastRotationNote;

      if (nextCourts.length < prev.courts.length && ambilPemainAktif(updatedPlayers).length >= 4) {
        const res = bentukPertandinganPertama(
          1,
          updatedPlayers,
          nextQueue,
          nextCourts,
          prev.rotationSettings,
          prev.recentPairKeys
        );
        if (res.nextMatch) {
          nextCourts = [...nextCourts, res.nextMatch];
          nextQueue = res.nextQueueIds;
          note = res.alasanRotasi;
        }
      } else if (ambilPemainAktif(updatedPlayers).length < 4) {
        note = 'Butuh minimal 4 pemain aktif untuk melanjutkan pertandingan.';
      }

      return {
        ...prev,
        players: updatedPlayers,
        courts: nextCourts,
        queueIds: nextQueue,
        lastRotationNote: note,
      };
    });
  };

  const handleSaveToGroup = (playersToSave: Player[]) => {
    setState((prev) => {
      const existingByName = new Map(
        prev.savedGroup.map((m) => [m.name.toLowerCase(), m])
      );
      playersToSave.forEach((p) => {
        const key = p.name.toLowerCase();
        const old = existingByName.get(key);
        existingByName.set(key, {
          id: old?.id ?? `grp_${p.id}`,
          name: p.name,
          avatarUrl: p.avatarUrl ?? old?.avatarUrl,
          avatarColor: p.avatarColor,
          allTimeGames: Math.max(old?.allTimeGames ?? 0, p.allTimeGames),
          allTimeWins: Math.max(old?.allTimeWins ?? 0, p.allTimeWins),
          allTimeLosses: Math.max(old?.allTimeLosses ?? 0, p.allTimeLosses),
          allTimePoints: Math.max(old?.allTimePoints ?? 0, p.allTimePoints),
          allTimeBestStreak: Math.max(old?.allTimeBestStreak ?? 0, p.allTimeBestStreak),
        });
      });
      return {
        ...prev,
        savedGroup: Array.from(existingByName.values()),
      };
    });
  };

  const handleLoadFromGroup = (members: SavedGroupMember[]) => {
    const newPlayers = members.map((m) =>
      createPlayer(m.name, {
        avatarUrl: m.avatarUrl,
        avatarColor: m.avatarColor,
        allTimeGames: m.allTimeGames,
        allTimeWins: m.allTimeWins,
        allTimeLosses: m.allTimeLosses,
        allTimePoints: m.allTimePoints,
        allTimeBestStreak: m.allTimeBestStreak,
      })
    );
    handleAddPlayers(newPlayers);
  };

  // === HANDLER STATISTIK & AI ===
  const handleStartNewSession = () => {
    setState((prev) => {
      const resetPlayers = prev.players.map((p) => ({
        ...p,
        gamesPlayedSession: 0,
        winsSession: 0,
        lossesSession: 0,
        pointsSession: 0,
        currentStreak: 0,
        bestStreakSession: 0,
        waitingSince: Date.now(),
      }));
      const first = bentukPertandinganPertama(
        1,
        resetPlayers,
        resetPlayers.map((p) => p.id),
        [],
        prev.rotationSettings,
        []
      );
      return {
        ...prev,
        sessionStartedAt: Date.now(),
        players: resetPlayers,
        allTimeMatchHistory: [...prev.allTimeMatchHistory, ...prev.matchHistory],
        matchHistory: [],
        courts: first.nextMatch ? [first.nextMatch] : [],
        queueIds: first.nextQueueIds,
        lastRotationNote: 'Sesi baru dimulai. Statistik sesi sebelumnya tersimpan di riwayat Semua Sesi.',
        expenseSettings: {
          ...prev.expenseSettings,
          shuttleCount: 0,
        },
      };
    });
    setActiveTab('main');
  };

  const handleResetAllPlayCounts = () => {
    setState((prev) => ({
      ...prev,
      sessionStartedAt: Date.now(),
      players: prev.players.map((p) => ({
        ...p,
        gamesPlayedSession: 0,
        winsSession: 0,
        lossesSession: 0,
        pointsSession: 0,
        currentStreak: 0,
        bestStreakSession: 0,
        allTimeGames: 0,
        allTimeWins: 0,
        allTimeLosses: 0,
        allTimePoints: 0,
        allTimeBestStreak: 0,
      })),
      courts: prev.courts.map((c) => ({
        ...c,
        streakTeam: null,
        consecutiveWins: 0,
      })),
      matchHistory: [],
      allTimeMatchHistory: [],
      duoStats: {},
      recentPairKeys: [],
      lastRotationNote: 'Hitungan jumlah main & statistik semua pemain direset ke 0.',
    }));
  };

  const handleApplySuggestedPairs = (teamANames: string[], teamBNames: string[]) => {
    setState((prev) => {
      const byName = new Map(prev.players.map((p) => [p.name.toLowerCase(), p]));
      const aIds = teamANames.map((n) => byName.get(n.toLowerCase())?.id).filter((x): x is string => Boolean(x));
      const bIds = teamBNames.map((n) => byName.get(n.toLowerCase())?.id).filter((x): x is string => Boolean(x));
      if (aIds.length < 2 || bIds.length < 2) return prev;

      const newMatch = buatPertandinganBaru(
        1,
        [aIds[0], aIds[1]],
        [bIds[0], bIds[1]],
        null,
        0
      );
      const otherCourts = prev.courts.filter((c) => c.courtNumber !== 1);
      const nextCourts = [newMatch, ...otherCourts].sort((a, b) => a.courtNumber - b.courtNumber);
      const nextQueue = sinkronkanAntreanDenganPemain(prev.players, prev.queueIds, nextCourts);
      return {
        ...prev,
        courts: nextCourts,
        queueIds: nextQueue,
        lastRotationNote: `Susunan seimbang AI diterapkan: ${teamANames.join(' & ')} vs ${teamBNames.join(' & ')}.`,
      };
    });
    setActiveTab('main');
  };

  // === HANDLER PENGATURAN ===
  const handleUpdateScoring = (patch: Partial<ScoringSettings>) => {
    setState((prev) => ({
      ...prev,
      scoringSettings: { ...prev.scoringSettings, ...patch },
    }));
  };

  const handleUpdateRotation = (patch: Partial<RotationSettings>) => {
    setState((prev) => {
      const nextSettings = { ...prev.rotationSettings, ...patch };
      let nextCourts = [...prev.courts];
      let nextQueue = [...prev.queueIds];
      let note = prev.lastRotationNote;

      if (patch.courtCount === 1 && nextCourts.length > 1) {
        nextCourts = nextCourts.filter((c) => c.courtNumber === 1);
        nextQueue = sinkronkanAntreanDenganPemain(prev.players, nextQueue, nextCourts);
        note = 'Mode 1 Lapangan aktif. Pemain Lapangan 2 dikembalikan ke antrean.';
      } else if (patch.courtCount === 2 && nextCourts.length < 2) {
        const res2 = bentukPertandinganPertama(
          2,
          prev.players,
          nextQueue,
          nextCourts,
          nextSettings,
          prev.recentPairKeys
        );
        if (res2.nextMatch) {
          nextCourts = [...nextCourts, res2.nextMatch];
          nextQueue = res2.nextQueueIds;
          note = 'Mode 2 Lapangan aktif. Lapangan 2 dimulai dari antrean!';
        } else {
          note = 'Mode 2 Lapangan aktif. Butuh minimal 4 pemain di antrean untuk mengisi Lapangan 2.';
        }
      }

      return {
        ...prev,
        rotationSettings: nextSettings,
        courts: nextCourts,
        queueIds: nextQueue,
        lastRotationNote: note,
      };
    });
  };

  const handleUpdateVoice = (patch: Partial<VoiceSettings>) => {
    setState((prev) => ({
      ...prev,
      voiceSettings: { ...prev.voiceSettings, ...patch },
    }));
  };

  const handleUpdateExpense = (patch: Partial<ExpenseSettings>) => {
    setState((prev) => ({
      ...prev,
      expenseSettings: { ...prev.expenseSettings, ...patch },
    }));
  };

  const navItems: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'main', label: 'Main', icon: Activity },
    { id: 'pemain', label: 'Pemain', icon: Users },
    { id: 'statistik', label: 'Statistik', icon: BarChart3 },
    { id: 'lainnya', label: 'Lainnya', icon: Sliders },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F8FA] dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* TOP BAR CONTRACT: 1-line brand wordmark — 4 concise single-line nav links (desktop) — 1 primary theme action */}
      <header className="sticky top-0 z-30 h-13 bg-white/95 dark:bg-zinc-950/90 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto h-full px-4 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('main')}
            className="font-display text-lg font-bold tracking-tight text-zinc-900 dark:text-white whitespace-nowrap shrink-0"
          >
            SmashBoard
          </button>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                    active
                      ? 'text-zinc-900 dark:text-white border-zinc-900 dark:border-white font-semibold'
                      : 'border-transparent hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  theme: prev.theme === 'dark' ? 'light' : 'dark',
                }))
              }
              className="min-h-[40px] min-w-[40px] px-3 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center justify-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
              aria-label="Ganti tema gelap atau terang"
            >
              {state.theme === 'dark' ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">Terang</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-zinc-700" />
                  <span className="hidden sm:inline">Gelap</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Banner Pengingat Waktu Sewa & Status Offline */}
      {rentalAlertBanner && (
        <div className="bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-200 px-4 py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3">
          <div className="max-w-6xl mx-auto w-full flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <BellRing className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              {rentalAlertBanner}
            </span>
            <button
              type="button"
              onClick={() => setRentalAlertBanner(null)}
              className="min-h-[32px] min-w-[32px] flex items-center justify-center"
              aria-label="Tutup pengingat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {!isOnline && (
        <div className="bg-zinc-900 text-zinc-100 px-4 py-1.5 text-xs font-medium text-center flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5" />
          Mode Offline — Data skor & antrean tersimpan di perangkat.
        </div>
      )}

      {/* KONTEN UTAMA */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 pt-5 pb-24 md:pb-10">
        {activeTab === 'main' && (
          <MatchTab
            players={state.players}
            courts={state.courts}
            queueIds={state.queueIds}
            lastRotationNote={state.lastRotationNote}
            recentPairKeys={state.recentPairKeys}
            sessionStartedAt={state.sessionStartedAt}
            scoringSettings={state.scoringSettings}
            rotationSettings={state.rotationSettings}
            voiceSettings={state.voiceSettings}
            totalShuttlesSession={state.expenseSettings.shuttleCount}
            completedMatchCount={state.matchHistory.length}
            onStartCourtMatch={handleStartCourtMatch}
            onScorePoint={handleScorePoint}
            onDecrementPoint={handleDecrementPoint}
            onUndoScore={handleUndoScore}
            onSwapCourtSides={handleSwapCourtSides}
            onSetCustomScore={handleSetCustomScore}
            onResetScore={handleResetCourtScore}
            onDeclareWinner={handleDeclareWinner}
            onFinishAndRotate={handleFinishAndRotate}
            onShuffleCurrentCourt={handleShuffleCurrentCourt}
            onManualSetLineup={handleManualSetCourtLineup}
            onOpenSpinWheel={(scope = 'all_active') => {
              setSpinModalScope(scope);
              setSpinModalOpen(true);
            }}
            onSwapCourtPlayers={handleSwapCourtPlayers}
            onSwapCourtWithQueue={handleSwapCourtWithQueue}
            onReorderQueue={(newQueueIds) =>
              setState((prev) => ({ ...prev, queueIds: newQueueIds }))
            }
            onToggleTTS={() =>
              handleUpdateScoring({ ttsEnabled: !state.scoringSettings.ttsEnabled })
            }
            onAdjustShuttle={handleAdjustShuttle}
            onGoToPlayers={() => setActiveTab('pemain')}
          />
        )}

        {activeTab === 'pemain' && (
          <PlayersTab
            players={state.players}
            matchHistory={state.matchHistory}
            allTimeMatchHistory={state.allTimeMatchHistory}
            savedGroup={state.savedGroup}
            onCourtPlayerIds={onCourtPlayerIds}
            currentCourtMatch={state.courts[0] ?? null}
            autoShuffleOnAdd={state.rotationSettings.autoShuffleOnAdd}
            onToggleAutoShuffleOnAdd={() =>
              handleUpdateRotation({
                autoShuffleOnAdd: !state.rotationSettings.autoShuffleOnAdd,
              })
            }
            onOpenSpinWheel={() => {
              setSpinModalScope('all_active');
              setSpinModalOpen(true);
            }}
            onGoToMatch={() => setActiveTab('main')}
            onResetAllPlayCounts={handleResetAllPlayCounts}
            onAddPlayers={handleAddPlayers}
            onUpdatePlayerStatus={handleUpdatePlayerStatus}
            onUpdatePlayerAvatar={(playerId, avatarUrl) =>
              setState((prev) => ({
                ...prev,
                players: prev.players.map((p) =>
                  p.id === playerId ? { ...p, avatarUrl } : p
                ),
              }))
            }
            onRenamePlayer={(playerId, newName) =>
              setState((prev) => ({
                ...prev,
                players: prev.players.map((p) =>
                  p.id === playerId ? { ...p, name: newName } : p
                ),
              }))
            }
            onRemovePlayer={handleRemovePlayer}
            onSaveToGroup={handleSaveToGroup}
            onRemoveFromGroup={(groupId) =>
              setState((prev) => ({
                ...prev,
                savedGroup: prev.savedGroup.filter((g) => g.id !== groupId),
              }))
            }
            onLoadFromGroup={handleLoadFromGroup}
          />
        )}

        {activeTab === 'statistik' && (
          <StatsTab
            state={state}
            onStartNewSession={handleStartNewSession}
            onResetAllPlayCounts={handleResetAllPlayCounts}
            onApplySuggestedPairs={handleApplySuggestedPairs}
          />
        )}

        {activeTab === 'lainnya' && (
          <MoreTab
            state={state}
            onToggleTheme={() =>
              setState((prev) => ({
                ...prev,
                theme: prev.theme === 'dark' ? 'light' : 'dark',
              }))
            }
            onUpdateScoring={handleUpdateScoring}
            onUpdateRotation={handleUpdateRotation}
            onUpdateVoice={handleUpdateVoice}
            onUpdateExpense={handleUpdateExpense}
            onUpdateNotes={(quickNotes) => setState((prev) => ({ ...prev, quickNotes }))}
            onStartRentalTimer={(durationMinutes) =>
              setState((prev) => ({
                ...prev,
                rentalReminder: {
                  active: true,
                  durationMinutes,
                  startedAt: Date.now(),
                  alerted10Min: false,
                  alertedEnded: false,
                },
              }))
            }
            onStopRentalTimer={() =>
              setState((prev) => ({
                ...prev,
                rentalReminder: {
                  ...prev.rentalReminder,
                  active: false,
                  startedAt: null,
                },
              }))
            }
            onGenerateTournament={() => {
              const active = ambilPemainAktif(state.players);
              const matches = buatJadwalTurnamenMini(active);
              setState((prev) => ({
                ...prev,
                tournament: {
                  active: true,
                  matches,
                  createdAt: Date.now(),
                },
              }));
            }}
            onUpdateTournamentScore={(matchId, scoreA, scoreB) =>
              setState((prev) => ({
                ...prev,
                tournament: {
                  ...prev.tournament,
                  matches: prev.tournament.matches.map((m) =>
                    m.id === matchId
                      ? { ...m, scoreA, scoreB, completed: scoreA !== scoreB }
                      : m
                  ),
                },
              }))
            }
            onCloseTournament={() =>
              setState((prev) => ({
                ...prev,
                tournament: { ...prev.tournament, active: false },
              }))
            }
            onRestoreBackup={(restored) => setState(restored)}
            onResetAllPlayCounts={handleResetAllPlayCounts}
            onResetAllData={() => setState(createInitialState())}
          />
        )}
      </main>

      <SpinWheelModal
        isOpen={spinModalOpen}
        players={state.players}
        courtPlayerIds={
          state.courts[0]
            ? [...state.courts[0].teamAIds, ...state.courts[0].teamBIds]
            : []
        }
        initialScope={spinModalScope}
        onClose={() => setSpinModalOpen(false)}
        onApplyResult={handleApplySpinResult}
      />

      {/* BOTTOM NAVIGATION MOBILE (Tersembunyi di desktop md: ke atas) */}
      <nav
        aria-label="Navigasi utama"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-t border-zinc-200/80 dark:border-zinc-800 pb-safe"
      >
        <div className="grid grid-cols-4 h-16 items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`h-full flex flex-col items-center justify-center gap-1 transition-colors ${
                  active
                    ? 'text-zinc-900 dark:text-white'
                    : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] font-semibold tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
