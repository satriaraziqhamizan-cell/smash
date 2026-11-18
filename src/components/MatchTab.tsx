import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Clock,
  GripVertical,
  Mic,
  MicOff,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Shuffle,
  SlidersHorizontal,
  Trophy,
  UserCog,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  ActiveCourtMatch,
  Player,
  RotationSettings,
  ScoringSettings,
  VoiceSettings,
} from '../types/smashboard';
import { evaluateScoreState, getSideSwitchPoint } from '../utils/badmintonRules';
import {
  ambilPemainAktif,
  pratinjauPertandinganBerikutnya,
} from '../utils/rotation';
import { formatDuration } from '../utils/storage';
import { speakIndonesian, useVoiceControl, type VoiceAction } from '../hooks/useVoiceControl';
import { useWakeLock } from '../hooks/useWakeLock';
import { PlayerAvatar } from './PlayerAvatar';

interface MatchTabProps {
  players: Player[];
  courts: ActiveCourtMatch[];
  queueIds: string[];
  lastRotationNote: string;
  recentPairKeys: string[];
  sessionStartedAt: number;
  scoringSettings: ScoringSettings;
  rotationSettings: RotationSettings;
  voiceSettings: VoiceSettings;
  totalShuttlesSession: number;
  completedMatchCount: number;
  onStartCourtMatch: (courtNumber: 1 | 2) => void;
  onScorePoint: (courtNumber: 1 | 2, team: 'A' | 'B') => void;
  onDecrementPoint: (courtNumber: 1 | 2, team: 'A' | 'B') => void;
  onUndoScore: (courtNumber: 1 | 2) => void;
  onSwapCourtSides: (courtNumber: 1 | 2) => void;
  onSetCustomScore: (
    courtNumber: 1 | 2,
    scoreA: number,
    scoreB: number,
    gamesWonA: number,
    gamesWonB: number
  ) => void;
  onResetScore: (courtNumber: 1 | 2) => void;
  onDeclareWinner: (
    courtNumber: 1 | 2,
    winner: 'A' | 'B',
    scoreA?: number,
    scoreB?: number,
    autoRecap?: boolean
  ) => void;
  onFinishAndRotate: (courtNumber: 1 | 2) => void;
  onShuffleCurrentCourt: (courtNumber: 1 | 2) => void;
  onManualSetLineup: (
    courtNumber: 1 | 2,
    teamAIds: [string, string],
    teamBIds: [string, string]
  ) => void;
  onOpenSpinWheel: (scope?: 'all_active' | 'court_only') => void;
  onSwapCourtPlayers: (courtNumber: 1 | 2, playerId1: string, playerId2: string) => void;
  onSwapCourtWithQueue: (courtNumber: 1 | 2, courtPlayerId: string, queuePlayerId: string) => void;
  onReorderQueue: (newQueueIds: string[]) => void;
  onToggleTTS: () => void;
  onAdjustShuttle: (courtNumber: 1 | 2, delta: number) => void;
  onGoToPlayers: () => void;
}

export const MatchTab: React.FC<MatchTabProps> = ({
  players,
  courts,
  queueIds,
  lastRotationNote,
  recentPairKeys,
  sessionStartedAt,
  scoringSettings,
  rotationSettings,
  voiceSettings,
  totalShuttlesSession,
  completedMatchCount,
  onStartCourtMatch,
  onScorePoint,
  onDecrementPoint,
  onUndoScore,
  onSwapCourtSides,
  onSetCustomScore,
  onResetScore,
  onDeclareWinner,
  onFinishAndRotate,
  onShuffleCurrentCourt,
  onManualSetLineup,
  onOpenSpinWheel,
  onSwapCourtPlayers,
  onSwapCourtWithQueue,
  onReorderQueue,
  onToggleTTS,
  onAdjustShuttle,
  onGoToPlayers,
}) => {
  const [selectedCourtNum, setSelectedCourtNum] = useState<1 | 2>(1);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [showCustomScoreModal, setShowCustomScoreModal] = useState(false);
  const [customScoreA, setCustomScoreA] = useState(0);
  const [customScoreB, setCustomScoreB] = useState(0);
  const [customGamesA, setCustomGamesA] = useState(0);
  const [customGamesB, setCustomGamesB] = useState(0);

  const [showManualLineupModal, setShowManualLineupModal] = useState(false);
  const [manualLineup, setManualLineup] = useState<[string, string, string, string]>(['', '', '', '']);

  const [swapTargetPlayerId, setSwapTargetPlayerId] = useState<string | null>(null);
  const [selectedCourtSwapId, setSelectedCourtSwapId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [sideSwitchBanner, setSideSwitchBanner] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const voiceFeedbackTimerRef = useRef<number | null>(null);

  const touchStartYRef = useRef<{ A: number | null; B: number | null }>({ A: null, B: null });
  const swipeHandledRef = useRef<{ A: boolean; B: boolean }>({ A: false, B: false });

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const activeCourt =
    courts.find((c) => c.courtNumber === selectedCourtNum) ?? courts[0] ?? null;

  const { isLocked: wakeLocked } = useWakeLock(Boolean(activeCourt));

  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const activePlayers = useMemo(() => ambilPemainAktif(players), [players]);

  const evaluation = useMemo(
    () => (activeCourt ? evaluateScoreState(activeCourt, scoringSettings) : null),
    [activeCourt, scoringSettings]
  );

  const prevSideSwappedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!activeCourt) {
      prevSideSwappedRef.current = null;
      return;
    }
    if (
      prevSideSwappedRef.current !== null &&
      prevSideSwappedRef.current !== activeCourt.sidesSwapped &&
      activeCourt.sideSwitchShownForGame === activeCourt.currentGameIndex
    ) {
      setSideSwitchBanner(true);
      if (scoringSettings.ttsEnabled) {
        speakIndonesian('Waktunya tukar sisi lapangan');
      }
      const t = setTimeout(() => setSideSwitchBanner(false), 4500);
      prevSideSwappedRef.current = activeCourt.sidesSwapped;
      return () => clearTimeout(t);
    }
    prevSideSwappedRef.current = activeCourt.sidesSwapped;
  }, [activeCourt, scoringSettings.ttsEnabled]);

  const lastAnnouncedKeyRef = useRef<string>('');
  useEffect(() => {
    if (!activeCourt || !scoringSettings.ttsEnabled) return;
    const key = `${activeCourt.courtNumber}:${activeCourt.currentGameIndex}:${activeCourt.scoreA}-${activeCourt.scoreB}:${activeCourt.winner ?? ''}`;
    if (lastAnnouncedKeyRef.current === '') {
      lastAnnouncedKeyRef.current = key;
      return;
    }
    if (lastAnnouncedKeyRef.current === key) return;
    lastAnnouncedKeyRef.current = key;

    if (activeCourt.winner) {
      const winNames = (
        activeCourt.winner === 'A' ? activeCourt.teamAIds : activeCourt.teamBIds
      )
        .map((id) => playerMap.get(id)?.name ?? '')
        .join(' dan ');
      speakIndonesian(
        `Pertandingan selesai! Tim ${activeCourt.winner}, ${winNames}, menang!`
      );
      return;
    }

    if (activeCourt.scoreA === 0 && activeCourt.scoreB === 0) return;

    let announcement = `Tim A ${activeCourt.scoreA}, Tim B ${activeCourt.scoreB}`;
    if (evaluation?.isMatchPointA) announcement += '. Match point Tim A!';
    else if (evaluation?.isMatchPointB) announcement += '. Match point Tim B!';
    else if (evaluation?.isGamePointA) announcement += '. Game point Tim A!';
    else if (evaluation?.isGamePointB) announcement += '. Game point Tim B!';
    else if (evaluation?.isDeuce) announcement += '. Deuce!';

    speakIndonesian(announcement);
  }, [activeCourt, evaluation, playerMap, scoringSettings.ttsEnabled]);

  const showVoiceStatus = (msg: string) => {
    setVoiceFeedback(msg);
    if (voiceFeedbackTimerRef.current) {
      window.clearTimeout(voiceFeedbackTimerRef.current);
    }
    voiceFeedbackTimerRef.current = window.setTimeout(() => {
      setVoiceFeedback(null);
    }, 4000);
  };

  const handleVoiceAction = (action: VoiceAction) => {
    if (!activeCourt) return;
    switch (action.type) {
      case 'pointA':
        onScorePoint(activeCourt.courtNumber, 'A');
        showVoiceStatus('Skor Tim A +1');
        break;
      case 'pointB':
        onScorePoint(activeCourt.courtNumber, 'B');
        showVoiceStatus('Skor Tim B +1');
        break;
      case 'minusA':
        onDecrementPoint(activeCourt.courtNumber, 'A');
        showVoiceStatus('Skor Tim A -1');
        break;
      case 'minusB':
        onDecrementPoint(activeCourt.courtNumber, 'B');
        showVoiceStatus('Skor Tim B -1');
        break;
      case 'undo':
        onUndoScore(activeCourt.courtNumber);
        showVoiceStatus('Undo poin terakhir');
        break;
      case 'resetScore':
        onResetScore(activeCourt.courtNumber);
        showVoiceStatus('Skor direset ke 0 - 0');
        break;
      case 'setScores': {
        const nextA = action.scoreA ?? activeCourt.scoreA;
        const nextB = action.scoreB ?? activeCourt.scoreB;
        onSetCustomScore(
          activeCourt.courtNumber,
          nextA,
          nextB,
          activeCourt.gamesWonA,
          activeCourt.gamesWonB
        );
        showVoiceStatus(`Skor diubah menjadi ${nextA} - ${nextB}`);
        break;
      }
      case 'declareWinner': {
        onDeclareWinner(
          activeCourt.courtNumber,
          action.winner,
          action.scoreA,
          action.scoreB,
          action.autoRecap
        );
        if (action.autoRecap) {
          showVoiceStatus(`Tim ${action.winner} menang & pertandingan direkap!`);
          if (scoringSettings.ttsEnabled) {
            speakIndonesian(`Tim ${action.winner} menang dan pertandingan direkap. Lanjut pertandingan berikutnya.`);
          }
        } else {
          showVoiceStatus(`Tim ${action.winner} menang! Sebut "Rekap" untuk lanjut.`);
        }
        break;
      }
      case 'recapMatch': {
        if (activeCourt.winner) {
          onFinishAndRotate(activeCourt.courtNumber);
          showVoiceStatus('Pertandingan direkap & lanjut match berikutnya.');
          if (scoringSettings.ttsEnabled) {
            speakIndonesian('Pertandingan direkap. Lanjut pertandingan berikutnya.');
          }
        } else if (activeCourt.scoreA !== activeCourt.scoreB) {
          const leading = activeCourt.scoreA > activeCourt.scoreB ? 'A' : 'B';
          onDeclareWinner(activeCourt.courtNumber, leading, undefined, undefined, true);
          showVoiceStatus(`Tim ${leading} menang (${activeCourt.scoreA}-${activeCourt.scoreB}) & langsung direkap!`);
          if (scoringSettings.ttsEnabled) {
            speakIndonesian(`Tim ${leading} menang dan pertandingan direkap.`);
          }
        } else {
          const msg = `Skor masih seri (${activeCourt.scoreA}-${activeCourt.scoreB}). Sebut "Tim A menang" atau "Tim B menang" dulu.`;
          showVoiceStatus(msg);
          if (scoringSettings.ttsEnabled) {
            speakIndonesian('Skor masih seri. Sebut tim yang menang dulu.');
          }
        }
        break;
      }
    }
  };

  const voice = useVoiceControl(voiceSettings, handleVoiceAction);

  const nextPreview = useMemo(() => {
    if (!activeCourt) return null;
    const otherCourts = courts.filter((c) => c.courtNumber !== activeCourt.courtNumber);
    return pratinjauPertandinganBerikutnya(
      activeCourt,
      players,
      queueIds,
      otherCourts,
      rotationSettings,
      recentPairKeys
    );
  }, [activeCourt, courts, players, queueIds, rotationSettings, recentPairKeys]);

  const renderScorePanel = (team: 'A' | 'B') => {
    if (!activeCourt || !evaluation) return null;
    const isTeamA = team === 'A';
    const score = isTeamA ? activeCourt.scoreA : activeCourt.scoreB;
    const gamesWon = isTeamA ? activeCourt.gamesWonA : activeCourt.gamesWonB;
    const teamIds = isTeamA ? activeCourt.teamAIds : activeCourt.teamBIds;
    const isServing = activeCourt.servingTeam === team;
    const isGamePoint = isTeamA ? evaluation.isGamePointA : evaluation.isGamePointB;
    const isMatchPoint = isTeamA ? evaluation.isMatchPointA : evaluation.isMatchPointB;

    const topStripe = isTeamA ? 'bg-emerald-700' : 'bg-blue-700';
    const teamLabelColor = isTeamA
      ? 'text-emerald-800 dark:text-emerald-400'
      : 'text-blue-800 dark:text-blue-400';

    const handleTouchStart = (e: React.TouchEvent) => {
      touchStartYRef.current[team] = e.touches[0].clientY;
      swipeHandledRef.current[team] = false;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
      const startY = touchStartYRef.current[team];
      if (startY === null || swipeHandledRef.current[team]) return;
      const dy = startY - e.touches[0].clientY;
      if (dy > 48) {
        swipeHandledRef.current[team] = true;
        onScorePoint(activeCourt.courtNumber, team);
      } else if (dy < -48) {
        swipeHandledRef.current[team] = true;
        onDecrementPoint(activeCourt.courtNumber, team);
      }
    };

    const handleTouchEnd = () => {
      touchStartYRef.current[team] = null;
    };

    return (
      <div
        className={`rounded-xl bg-white dark:bg-zinc-900 border overflow-hidden flex flex-col justify-between transition ${
          isServing
            ? 'border-zinc-900 dark:border-zinc-300 shadow-sm'
            : 'border-zinc-200/90 dark:border-zinc-800'
        }`}
      >
        <div className={`h-1 w-full ${topStripe}`} />

        <div className="p-4 flex flex-col justify-between flex-1 gap-3">
          {/* Header Tim */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-sm font-bold tracking-tight ${teamLabelColor}`}>
                Tim {team}
              </span>
              {activeCourt.streakTeam === team && activeCourt.consecutiveWins > 0 && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-tabular">
                  · Menang {activeCourt.consecutiveWins}/{rotationSettings.maxConsecutiveWins}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs font-mono-tabular shrink-0">
              {scoringSettings.matchFormat === 'bo3' && (
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  Set {gamesWon}
                </span>
              )}
              {isServing && (
                <span className="font-sans font-semibold text-zinc-900 dark:text-white">
                  Servis · {evaluation.serviceCourt}
                </span>
              )}
            </div>
          </div>

          {/* Daftar 2 Pemain Tim */}
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border-y border-zinc-100 dark:border-zinc-800">
            {teamIds.map((pid, slotIdx) => {
              const p = playerMap.get(pid);
              const isSelectedForSwap = selectedCourtSwapId === pid;
              const isServerPlayer = isServing && activeCourt.servingPlayerSlot === slotIdx;
              return (
                <div
                  key={pid}
                  draggable
                  onDragStart={() => setDraggedId(pid)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggedId && draggedId !== pid) {
                      const inCourt =
                        activeCourt.teamAIds.includes(draggedId) ||
                        activeCourt.teamBIds.includes(draggedId);
                      if (inCourt) {
                        onSwapCourtPlayers(activeCourt.courtNumber, draggedId, pid);
                      } else if (queueIds.includes(draggedId)) {
                        onSwapCourtWithQueue(activeCourt.courtNumber, pid, draggedId);
                      }
                    }
                    setDraggedId(null);
                  }}
                  className={`py-2 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing ${
                    isSelectedForSwap ? 'bg-amber-50/70 dark:bg-amber-950/30 -mx-2 px-2 rounded-lg' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedCourtSwapId) {
                        setSelectedCourtSwapId(pid);
                      } else if (selectedCourtSwapId === pid) {
                        setSelectedCourtSwapId(null);
                      } else {
                        onSwapCourtPlayers(activeCourt.courtNumber, selectedCourtSwapId, pid);
                        setSelectedCourtSwapId(null);
                      }
                    }}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left min-h-[36px]"
                    title="Ketuk dua pemain untuk menukar posisi pasangan"
                  >
                    <PlayerAvatar
                      name={p?.name ?? '?'}
                      avatarUrl={p?.avatarUrl}
                      avatarColor={p?.avatarColor ?? '#3f3f46'}
                      size="xs"
                    />
                    <span className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                      {p?.name ?? 'Pemain'}
                    </span>
                    {isServerPlayer && (
                      <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 shrink-0">
                        · Servis
                      </span>
                    )}
                  </button>

                  {queueIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSwapTargetPlayerId(pid)}
                      className="min-h-[36px] min-w-[36px] rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center shrink-0 transition-colors"
                      title="Skip / Tukar dengan pemain antrean"
                      aria-label={`Tukar ${p?.name ?? 'pemain'}`}
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Area Tap Skor Besar (+1) — Putih bersih & kontras tinggi */}
          <button
            type="button"
            onClick={() => {
              if (swipeHandledRef.current[team]) {
                swipeHandledRef.current[team] = false;
                return;
              }
              onScorePoint(activeCourt.courtNumber, team);
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ touchAction: 'pan-x' }}
            className="w-full rounded-xl bg-zinc-50 hover:bg-zinc-100/90 active:bg-zinc-200/70 dark:bg-zinc-950 dark:hover:bg-zinc-800/70 border border-zinc-200/80 dark:border-zinc-800 py-7 sm:py-9 px-4 flex flex-col items-center justify-center select-none active:scale-[0.99] transition"
          >
            {(isMatchPoint || isGamePoint) && (
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">
                {isMatchPoint ? 'Match Point' : 'Game Point'}
              </span>
            )}
            <span className="font-display text-6xl sm:text-7xl font-bold leading-none text-zinc-900 dark:text-white font-mono-tabular tracking-tight">
              {score}
            </span>
            <span className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Ketuk atau geser ke atas (+1)
            </span>
          </button>

          {/* Tombol -1 */}
          <button
            type="button"
            disabled={score <= 0 || Boolean(activeCourt.winner)}
            onClick={() => onDecrementPoint(activeCourt.courtNumber, team)}
            className="min-h-[44px] w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 text-zinc-700 dark:text-zinc-200 font-medium text-sm flex items-center justify-center gap-1.5 active:scale-[0.99] transition"
          >
            <Minus className="w-4 h-4" />
            Kurangi (-1)
          </button>
        </div>
      </div>
    );
  };

  const sessionElapsedSeconds = Math.floor((nowTick - sessionStartedAt) / 1000);
  const matchElapsedSeconds = activeCourt
    ? Math.floor((nowTick - activeCourt.startedAt) / 1000)
    : 0;

  return (
    <div className="space-y-5 pb-6">
      {/* Bar Info Durasi, Progress Match & Pemilih Lapangan */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 font-mono-tabular">
          <span className="inline-flex items-center gap-1.5 text-zinc-900 dark:text-white font-semibold">
            <Clock className="w-4 h-4 text-zinc-500" />
            Sesi {formatDuration(sessionElapsedSeconds)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
            {rotationSettings.targetSessionMatches
              ? `Match ${Math.min(
                  completedMatchCount + (activeCourt ? 1 : 0),
                  rotationSettings.targetSessionMatches
                )}/${rotationSettings.targetSessionMatches}`
              : `Match ke-${completedMatchCount + (activeCourt ? 1 : 0)}`}
          </span>
          {activeCourt && (
            <>
              <span aria-hidden="true">·</span>
              <span>Game {formatDuration(matchElapsedSeconds)}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>Kok {totalShuttlesSession}</span>
          {wakeLocked && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-sans text-zinc-700 dark:text-zinc-300">Layar Aktif</span>
            </>
          )}
        </div>

        {rotationSettings.courtCount === 2 && (
          <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-200/70 dark:bg-zinc-800">
            {([1, 2] as const).map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setSelectedCourtNum(num)}
                className={`min-h-[36px] px-3 rounded-md text-xs font-semibold transition ${
                  selectedCourtNum === num
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Lapangan {num}
              </button>
            ))}
          </div>
        )}
      </div>

      {rotationSettings.targetSessionMatches !== null &&
        completedMatchCount >= rotationSettings.targetSessionMatches && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-4 py-2.5 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-2">
            <span>
              Target <strong>{rotationSettings.targetSessionMatches} pertandingan</strong> sesi sudah tercapai ({completedMatchCount} selesai). Kamu tetap bisa lanjut bermain jika mau.
            </span>
          </div>
        )}

      {!activeCourt ? (
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 p-8 text-center space-y-4">
          <Users className="w-10 h-10 mx-auto text-zinc-400" />
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
              {activePlayers.length < 4
                ? 'Butuh minimal 4 pemain aktif'
                : `Lapangan ${selectedCourtNum} Siap Dimulai`}
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
              {activePlayers.length < 4
                ? `Saat ini baru ada ${activePlayers.length} pemain berstatus Aktif. Tambahkan pemain atau ubah status dari Istirahat ke Aktif.`
                : 'Semua pemain siap bertanding. Mulai langsung atau putar roda undian untuk mengacak pemain secara interaktif.'}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {activePlayers.length < 4 ? (
              <button
                type="button"
                onClick={onGoToPlayers}
                className="min-h-[46px] px-6 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm hover:opacity-90 transition"
              >
                Kelola Daftar Pemain
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onOpenSpinWheel('all_active')}
                  className="min-h-[46px] px-5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-semibold text-sm inline-flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
                >
                  <RotateCw className="w-4 h-4" />
                  Putar Undian
                </button>
                <button
                  type="button"
                  onClick={() => onStartCourtMatch(selectedCourtNum)}
                  className="min-h-[46px] px-6 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm hover:opacity-90 transition"
                >
                  Mulai Pertandingan Lapangan {selectedCourtNum}
                </button>
              </>
            )}
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* KOLOM UTAMA: PAPAN SKOR */}
          <div className="lg:col-span-7 space-y-3">
            {(evaluation?.isDeuce || sideSwitchBanner || activeCourt.completedGames.length > 0) && (
              <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                <div className="font-semibold text-amber-700 dark:text-amber-400">
                  {sideSwitchBanner && (
                    <span>
                      Poin {getSideSwitchPoint(scoringSettings.targetPoints)} tercapai — Sisi lapangan ditukar otomatis.
                    </span>
                  )}
                  {!sideSwitchBanner && evaluation?.isDeuce && (
                    <span>
                      Deuce — Harus unggul 2 poin {scoringSettings.capAt30 ? '(maks. 30)' : ''}
                    </span>
                  )}
                  {!sideSwitchBanner && !evaluation?.isDeuce && (
                    <span className="text-zinc-700 dark:text-zinc-200">
                      Game ke-{activeCourt.currentGameIndex + 1} (Best of 3)
                    </span>
                  )}
                </div>
                {activeCourt.completedGames.length > 0 && (
                  <div className="font-mono-tabular text-zinc-500 dark:text-zinc-400">
                    {activeCourt.completedGames
                      .map((g, i) => `G${i + 1}: ${g.scoreA}-${g.scoreB}`)
                      .join(' · ')}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeCourt.sidesSwapped ? (
                <>
                  {renderScorePanel('B')}
                  {renderScorePanel('A')}
                </>
              ) : (
                <>
                  {renderScorePanel('A')}
                  {renderScorePanel('B')}
                </>
              )}
            </div>

            {selectedCourtSwapId && (
              <div className="rounded-xl bg-white dark:bg-zinc-900 border border-amber-400 px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm text-zinc-800 dark:text-zinc-200">
                <span>
                  Ketuk pemain lain di lapangan untuk bertukar pasangan dengan{' '}
                  <strong>{playerMap.get(selectedCourtSwapId)?.name}</strong>.
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedCourtSwapId(null)}
                  className="font-semibold underline ml-2"
                >
                  Batal
                </button>
              </div>
            )}

            {/* Toolbar Kontrol Skor */}
            <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 p-3 space-y-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  disabled={activeCourt.undoStack.length === 0}
                  onClick={() => onUndoScore(activeCourt.courtNumber)}
                  className="min-h-[44px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 text-zinc-900 dark:text-white font-medium text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition"
                >
                  <RotateCcw className="w-4 h-4" />
                  Undo ({activeCourt.undoStack.length})
                </button>

                <button
                  type="button"
                  onClick={voice.toggle}
                  className={`min-h-[44px] rounded-lg font-medium text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition border ${
                    voice.isListening
                      ? 'bg-rose-600 border-rose-600 text-white'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {voice.isListening ? (
                    <>
                      <Mic className="w-4 h-4 animate-pulse" />
                      Suara Aktif
                    </>
                  ) : (
                    <>
                      <MicOff className="w-4 h-4" />
                      Kontrol Suara
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onToggleTTS}
                  className={`min-h-[44px] rounded-lg font-medium text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition border ${
                    scoringSettings.ttsEnabled
                      ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-zinc-900'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {scoringSettings.ttsEnabled ? (
                    <>
                      <Volume2 className="w-4 h-4" />
                      Baca Skor On
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-4 h-4" />
                      Baca Skor Off
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onSwapCourtSides(activeCourt.courtNumber)}
                  className="min-h-[44px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white font-medium text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  Tukar Sisi
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={
                      activeCourt.scoreA === 0 &&
                      activeCourt.scoreB === 0 &&
                      activeCourt.gamesWonA === 0 &&
                      activeCourt.gamesWonB === 0 &&
                      !activeCourt.winner
                    }
                    onClick={() => onResetScore(activeCourt.courtNumber)}
                    className="min-h-[40px] px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-rose-700 dark:text-rose-400 disabled:opacity-40 flex items-center gap-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reset Skor
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCustomScoreA(activeCourt.scoreA);
                      setCustomScoreB(activeCourt.scoreB);
                      setCustomGamesA(activeCourt.gamesWonA);
                      setCustomGamesB(activeCourt.gamesWonB);
                      setShowCustomScoreModal(true);
                    }}
                    className="min-h-[40px] px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Atur Skor
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setManualLineup([
                        activeCourt.teamAIds[0],
                        activeCourt.teamAIds[1],
                        activeCourt.teamBIds[0],
                        activeCourt.teamBIds[1],
                      ]);
                      setShowManualLineupModal(true);
                    }}
                    className="min-h-[40px] px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <UserCog className="w-3.5 h-3.5" />
                    Atur Pemain
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenSpinWheel('court_only')}
                    className="min-h-[40px] px-3 rounded-lg bg-zinc-900 dark:bg-white text-xs font-semibold text-white dark:text-zinc-900 flex items-center gap-1.5 hover:opacity-90 transition"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    Putar Acak
                  </button>

                  <button
                    type="button"
                    onClick={() => onShuffleCurrentCourt(activeCourt.courtNumber)}
                    className="min-h-[40px] px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    Acak Cepat
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                    Shuttlecock:
                  </span>
                  <button
                    type="button"
                    onClick={() => onAdjustShuttle(activeCourt.courtNumber, -1)}
                    className="min-h-[38px] min-w-[38px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center text-zinc-700 dark:text-zinc-200"
                    aria-label="Kurangi shuttlecock"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono-tabular font-semibold text-sm w-6 text-center text-zinc-900 dark:text-white">
                    {activeCourt.shuttleCountThisMatch}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAdjustShuttle(activeCourt.courtNumber, 1)}
                    className="min-h-[38px] min-w-[38px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center text-zinc-700 dark:text-zinc-200"
                    aria-label="Tambah shuttlecock"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {(voice.isListening || voice.errorMsg || voiceFeedback) && (
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs space-y-1">
                  {voiceFeedback && (
                    <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {voiceFeedback}
                    </div>
                  )}
                  {voice.errorMsg ? (
                    <span className="text-rose-600 font-medium">{voice.errorMsg}</span>
                  ) : (
                    voice.isListening && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-zinc-600 dark:text-zinc-300">
                        <span>
                          Mendengarkan (id-ID): &ldquo;{voiceSettings.pointAKeywords[0]}&rdquo;, &ldquo;
                          {voiceSettings.pointBKeywords[0]}&rdquo;, &ldquo;tim A 10 tim B 8&rdquo;, &ldquo;10 sama&rdquo;, &ldquo;tim A menang&rdquo;, &ldquo;rekap&rdquo;, &ldquo;reset skor&rdquo;
                        </span>
                        {voice.lastTranscript && (
                          <span className="font-semibold text-zinc-900 dark:text-white">
                            &ldquo;{voice.lastTranscript}&rdquo;
                          </span>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>

          {/* KOLOM KANAN: ROTASI & ANTREAN */}
          <div className="lg:col-span-5 space-y-4">
            <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
              {/* Ringkasan Pertandingan & Info Rotasi */}
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Sedang Main · Lapangan {activeCourt.courtNumber}
                  </h2>
                  <span className="text-xs text-zinc-400">Ketuk 2 pemain untuk tukar</span>
                </div>
                <div className="flex items-center justify-between gap-2 py-1 text-sm">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-400 truncate flex-1">
                    {activeCourt.teamAIds.map((id) => playerMap.get(id)?.name ?? '?').join(' & ')}
                  </span>
                  <span className="font-mono-tabular font-bold text-zinc-900 dark:text-white px-2">
                    {activeCourt.scoreA} : {activeCourt.scoreB}
                  </span>
                  <span className="font-semibold text-blue-800 dark:text-blue-400 truncate flex-1 text-right">
                    {activeCourt.teamBIds.map((id) => playerMap.get(id)?.name ?? '?').join(' & ')}
                  </span>
                </div>
                {lastRotationNote && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {lastRotationNote}
                  </p>
                )}
              </div>

              {/* Pratinjau Berikutnya */}
              {nextPreview && (
                <div className="p-4 space-y-2">
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Berikutnya (Pratinjau)
                  </h2>
                  {nextPreview.teamAIds && nextPreview.teamBIds ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {nextPreview.teamAIds
                            .map((id) => playerMap.get(id)?.name ?? '?')
                            .join(' & ')}
                        </span>
                        <span className="text-xs text-zinc-400">vs</span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate text-right">
                          {nextPreview.teamBIds
                            .map((id) => playerMap.get(id)?.name ?? '?')
                            .join(' & ')}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        {nextPreview.keterangan}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {nextPreview.keterangan}
                    </p>
                  )}
                </div>
              )}

              {/* Daftar Antrean */}
              <div className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Antrean ({queueIds.length})
                  </h2>
                  <span className="text-xs text-zinc-400 flex items-center gap-1">
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    Atur urutan
                  </span>
                </div>

                {queueIds.length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 py-1">
                    Tidak ada antrean. Semua pemain aktif sedang bermain di lapangan.
                  </p>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {queueIds.map((qid, index) => {
                      const p = playerMap.get(qid);
                      if (!p) return null;
                      return (
                        <div
                          key={qid}
                          draggable
                          onDragStart={() => setDraggedId(qid)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (draggedId && draggedId !== qid && queueIds.includes(draggedId)) {
                              const next = queueIds.filter((id) => id !== draggedId);
                              const targetIdx = next.indexOf(qid);
                              next.splice(targetIdx, 0, draggedId);
                              onReorderQueue(next);
                            }
                            setDraggedId(null);
                          }}
                          className="py-2.5 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <GripVertical className="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0 hidden sm:block" />
                            <span className="font-mono-tabular font-semibold text-xs w-5 text-zinc-400 shrink-0">
                              {index + 1}.
                            </span>
                            <PlayerAvatar
                              name={p.name}
                              avatarUrl={p.avatarUrl}
                              avatarColor={p.avatarColor}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="font-semibold text-sm text-zinc-900 dark:text-white truncate">
                                {p.name}
                              </div>
                              <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-tabular">
                                Main {p.gamesPlayedSession}x · {p.winsSession}M-{p.lossesSession}K
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => {
                                const next = [...queueIds];
                                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                onReorderQueue(next);
                              }}
                              className="min-h-[38px] min-w-[38px] rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 flex items-center justify-center"
                              aria-label={`Naikkan ${p.name}`}
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={index === queueIds.length - 1}
                              onClick={() => {
                                const next = [...queueIds];
                                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                                onReorderQueue(next);
                              }}
                              className="min-h-[38px] min-w-[38px] rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 flex items-center justify-center"
                              aria-label={`Turunkan ${p.name}`}
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* LAYAR PEMENANG */}
      <AnimatePresence>
        {activeCourt?.winner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 text-center space-y-5 shadow-xl"
            >
              <div className="w-14 h-14 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-800 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                <Trophy className="w-7 h-7" />
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Pertandingan Selesai · Lapangan {activeCourt.courtNumber}
                </div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
                  Tim {activeCourt.winner} Menang
                </h2>
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                  {(activeCourt.winner === 'A'
                    ? activeCourt.teamAIds
                    : activeCourt.teamBIds
                  )
                    .map((id) => playerMap.get(id)?.name ?? '?')
                    .join(' & ')}
                </p>
              </div>

              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 space-y-1">
                <div className="font-display text-3xl font-bold font-mono-tabular text-zinc-900 dark:text-white">
                  {activeCourt.scoreA} — {activeCourt.scoreB}
                </div>
                {activeCourt.completedGames.length > 1 && (
                  <div className="text-xs font-mono-tabular text-zinc-500">
                    {activeCourt.completedGames
                      .map((g, i) => `Game ${i + 1}: ${g.scoreA}-${g.scoreB}`)
                      .join(' · ')}
                  </div>
                )}
                <div className="text-xs text-zinc-400 font-mono-tabular">
                  Durasi {formatDuration(matchElapsedSeconds)}
                </div>
              </div>

              {nextPreview && nextPreview.teamAIds && nextPreview.teamBIds && (
                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 text-left space-y-1">
                  <div className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                    Pertandingan Berikutnya (Masuk Papan Skor):
                  </div>
                  <div className="text-sm font-bold text-zinc-900 dark:text-white">
                    <span className="text-emerald-800 dark:text-emerald-400">
                      {nextPreview.teamAIds.map((id) => playerMap.get(id)?.name ?? '?').join(' & ')}
                    </span>{' '}
                    <span className="text-zinc-400 font-normal">vs</span>{' '}
                    <span className="text-blue-800 dark:text-blue-400">
                      {nextPreview.teamBIds.map((id) => playerMap.get(id)?.name ?? '?').join(' & ')}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => onFinishAndRotate(activeCourt.courtNumber)}
                  className="w-full min-h-[50px] rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-semibold text-sm transition"
                >
                  Lanjut & Taruh Match Berikutnya di Skor
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onUndoScore(activeCourt.courtNumber)}
                    className="min-h-[42px] rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Undo Poin Terakhir
                  </button>
                  <button
                    type="button"
                    onClick={() => onResetScore(activeCourt.courtNumber)}
                    className="min-h-[42px] rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    Reset Skor 0 - 0
                  </button>
                </div>
                {voice.isListening && (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium pt-1">
                    Suara aktif: katakan &ldquo;Rekap&rdquo; atau &ldquo;Lanjut&rdquo; untuk simpan &amp; rotasi.
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL ATUR SKOR AWAL */}
      {showCustomScoreModal && activeCourt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                Atur Skor Awal / Lanjutan
              </h2>
              <button
                type="button"
                onClick={() => setShowCustomScoreModal(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Berguna jika game sudah berjalan di lapangan, ada kesalahan input, atau ingin mengulang skor ke 0-0.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="font-semibold text-emerald-800 dark:text-emerald-400">
                  Skor Tim A
                </span>
                <input
                  type="number"
                  min={0}
                  max={35}
                  value={customScoreA}
                  onChange={(e) => setCustomScoreA(Math.max(0, Number(e.target.value)))}
                  className="w-full min-h-[48px] rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-lg font-bold font-mono-tabular text-zinc-900 dark:text-white"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-semibold text-blue-800 dark:text-blue-400">Skor Tim B</span>
                <input
                  type="number"
                  min={0}
                  max={35}
                  value={customScoreB}
                  onChange={(e) => setCustomScoreB(Math.max(0, Number(e.target.value)))}
                  className="w-full min-h-[48px] rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-lg font-bold font-mono-tabular text-zinc-900 dark:text-white"
                />
              </label>
            </div>

            {scoringSettings.matchFormat === 'bo3' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-sm">
                  <span className="text-zinc-600 dark:text-zinc-300 font-medium">Set Tim A</span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    value={customGamesA}
                    onChange={(e) => setCustomGamesA(Math.min(1, Math.max(0, Number(e.target.value))))}
                    className="w-full min-h-[44px] rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-base font-bold font-mono-tabular text-zinc-900 dark:text-white"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-zinc-600 dark:text-zinc-300 font-medium">Set Tim B</span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    value={customGamesB}
                    onChange={(e) => setCustomGamesB(Math.min(1, Math.max(0, Number(e.target.value))))}
                    className="w-full min-h-[44px] rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-base font-bold font-mono-tabular text-zinc-900 dark:text-white"
                  />
                </label>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onResetScore(activeCourt.courtNumber);
                  setShowCustomScoreModal(false);
                }}
                className="min-h-[46px] px-4 rounded-xl border border-rose-200 dark:border-rose-900 font-semibold text-sm text-rose-600 dark:text-rose-400"
              >
                Reset 0-0
              </button>
              <button
                type="button"
                onClick={() => {
                  onSetCustomScore(
                    activeCourt.courtNumber,
                    customScoreA,
                    customScoreB,
                    customGamesA,
                    customGamesB
                  );
                  setShowCustomScoreModal(false);
                }}
                className="flex-1 min-h-[46px] rounded-xl bg-zinc-900 dark:bg-white font-semibold text-sm text-white dark:text-zinc-900"
              >
                Terapkan Skor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ATUR PEMAIN MANUAL */}
      {showManualLineupModal && activeCourt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                Atur Pemain Sendiri (Lapangan {activeCourt.courtNumber})
              </h2>
              <button
                type="button"
                onClick={() => setShowManualLineupModal(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              Pilih manual 4 pemain untuk Tim A dan Tim B jika rotasi otomatis perlu disesuaikan.
            </p>

            <div className="space-y-3">
              {[
                { idx: 0, label: 'Tim A — Pemain 1', color: 'text-emerald-800 dark:text-emerald-400' },
                { idx: 1, label: 'Tim A — Pemain 2', color: 'text-emerald-800 dark:text-emerald-400' },
                { idx: 2, label: 'Tim B — Pemain 1', color: 'text-blue-800 dark:text-blue-400' },
                { idx: 3, label: 'Tim B — Pemain 2', color: 'text-blue-800 dark:text-blue-400' },
              ].map((slot) => (
                <label key={slot.idx} className="block space-y-1 text-xs sm:text-sm">
                  <span className={`font-semibold ${slot.color}`}>{slot.label}</span>
                  <select
                    value={manualLineup[slot.idx]}
                    onChange={(e) => {
                      const val = e.target.value;
                      setManualLineup((prev) => {
                        const next = [...prev] as [string, string, string, string];
                        const existingIdx = next.indexOf(val);
                        if (existingIdx !== -1 && existingIdx !== slot.idx) {
                          next[existingIdx] = next[slot.idx];
                        }
                        next[slot.idx] = val;
                        return next;
                      });
                    }}
                    className="w-full min-h-[42px] rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm font-semibold text-zinc-900 dark:text-white"
                  >
                    {activePlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Main {p.gamesPlayedSession}x)
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            {new Set(manualLineup).size < 4 && (
              <p className="text-xs text-rose-600 font-medium">
                Pastikan 4 slot diisi oleh pemain yang berbeda.
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowManualLineupModal(false)}
                className="flex-1 min-h-[46px] rounded-xl border border-zinc-300 dark:border-zinc-700 font-semibold text-sm text-zinc-700 dark:text-zinc-200"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={new Set(manualLineup).size < 4}
                onClick={() => {
                  onManualSetLineup(
                    activeCourt.courtNumber,
                    [manualLineup[0], manualLineup[1]],
                    [manualLineup[2], manualLineup[3]]
                  );
                  setShowManualLineupModal(false);
                }}
                className="flex-1 min-h-[46px] rounded-xl bg-zinc-900 dark:bg-white disabled:opacity-40 font-semibold text-sm text-white dark:text-zinc-900"
              >
                Taruh di Papan Skor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SKIP / TUKAR PEMAIN */}
      {swapTargetPlayerId && activeCourt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-md max-h-[80vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                Tukar {playerMap.get(swapTargetPlayerId)?.name ?? 'Pemain'}
              </h2>
              <button
                type="button"
                onClick={() => setSwapTargetPlayerId(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Pilih pemain dari antrean untuk masuk menggantikan posisi di lapangan:
            </p>
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
              {queueIds.map((qid, idx) => {
                const qp = playerMap.get(qid);
                if (!qp) return null;
                return (
                  <button
                    key={qid}
                    type="button"
                    onClick={() => {
                      onSwapCourtWithQueue(activeCourt.courtNumber, swapTargetPlayerId, qid);
                      setSwapTargetPlayerId(null);
                    }}
                    className="w-full min-h-[52px] py-2.5 px-2 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/60 rounded-lg transition text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono-tabular text-xs font-semibold text-zinc-400 w-5">
                        #{idx + 1}
                      </span>
                      <PlayerAvatar
                        name={qp.name}
                        avatarUrl={qp.avatarUrl}
                        avatarColor={qp.avatarColor}
                        size="sm"
                      />
                      <div>
                        <div className="font-semibold text-sm text-zinc-900 dark:text-white">
                          {qp.name}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-tabular">
                          Main {qp.gamesPlayedSession}x
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                      Pilih
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
