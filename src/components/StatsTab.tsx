import React, { useMemo, useState } from 'react';
import {
  Award,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Scale,
  Trophy,
  X,
} from 'lucide-react';
import type { AppState, Player } from '../types/smashboard';
import {
  downloadRecapCardPNG,
  exportMatchHistoryCSV,
  formatClock,
  formatDuration,
  generateWhatsAppSummary,
} from '../utils/storage';
import { PlayerAvatar } from './PlayerAvatar';

interface StatsTabProps {
  state: AppState;
  onStartNewSession: () => void;
  onResetAllPlayCounts: () => void;
  onApplySuggestedPairs: (teamANames: string[], teamBNames: string[]) => void;
}

export const StatsTab: React.FC<StatsTabProps> = ({
  state,
  onStartNewSession,
  onResetAllPlayCounts,
  onApplySuggestedPairs,
}) => {
  const [scope, setScope] = useState<'session' | 'alltime'>('session');
  const [copiedWA, setCopiedWA] = useState(false);
  const [showRecapCard, setShowRecapCard] = useState(false);
  const [showResetCountsModal, setShowResetCountsModal] = useState(false);

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);

  const [aiPairs, setAiPairs] = useState<{
    teamA: string[];
    teamB: string[];
    alasan: string;
  } | null>(null);
  const [aiPairsLoading, setAiPairsLoading] = useState(false);
  const [aiPairsError, setAiPairsError] = useState<string | null>(null);

  const playerMap = useMemo(
    () => new Map(state.players.map((p) => [p.id, p])),
    [state.players]
  );

  const leaderboard = useMemo(() => {
    return [...state.players]
      .map((p: Player) => {
        const games = scope === 'session' ? p.gamesPlayedSession : p.allTimeGames;
        const wins = scope === 'session' ? p.winsSession : p.allTimeWins;
        const losses = scope === 'session' ? p.lossesSession : p.allTimeLosses;
        const points = scope === 'session' ? p.pointsSession : p.allTimePoints;
        const bestStreak = scope === 'session' ? p.bestStreakSession : p.allTimeBestStreak;
        const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;
        return {
          ...p,
          games,
          wins,
          losses,
          points,
          bestStreak,
          winRate,
        };
      })
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.points - a.points;
      });
  }, [state.players, scope]);

  const bestDuos = useMemo(() => {
    const entries = Object.entries(state.duoStats)
      .map(([key, item]) => {
        const p1 = playerMap.get(item.playerIds[0]);
        const p2 = playerMap.get(item.playerIds[1]);
        if (!p1 || !p2 || item.games === 0) return null;
        return {
          key,
          names: `${p1.name} & ${p2.name}`,
          players: [p1, p2] as [Player, Player],
          games: item.games,
          wins: item.wins,
          winRate: Math.round((item.wins / item.games) * 100),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.wins - a.wins;
      });
    return entries.slice(0, 6);
  }, [state.duoStats, playerMap]);

  const displayedMatches = useMemo(() => {
    const list =
      scope === 'session'
        ? state.matchHistory
        : [...state.allTimeMatchHistory, ...state.matchHistory];
    return [...list].reverse();
  }, [scope, state.matchHistory, state.allTimeMatchHistory]);

  const handleCopyWhatsApp = async () => {
    const text = generateWhatsAppSummary(state);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedWA(true);
      setTimeout(() => setCopiedWA(false), 2500);
    } catch {
      setShowRecapCard(true);
    }
  };

  const handleGenerateAISummary = async () => {
    setAiSummaryLoading(true);
    setAiSummaryError(null);
    try {
      const payload = {
        totalMatches: state.matchHistory.length,
        shuttlesUsed: state.expenseSettings.shuttleCount,
        players: state.players
          .filter((p) => p.gamesPlayedSession > 0)
          .map((p) => ({
            name: p.name,
            games: p.gamesPlayedSession,
            wins: p.winsSession,
            losses: p.lossesSession,
            points: p.pointsSession,
            bestStreak: p.bestStreakSession,
          })),
        recentMatches: state.matchHistory.slice(-10).map((m) => ({
          teamA: m.teamANames.join(' & '),
          teamB: m.teamBNames.join(' & '),
          score: `${m.finalScoreA}-${m.finalScoreB}`,
          winner: m.winner === 'A' ? m.teamANames.join(' & ') : m.teamBNames.join(' & '),
        })),
      };

      const res = await fetch('/api/gemini/session-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionStats: payload }),
      });
      const data = (await res.json()) as { summary?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Gagal membuat ringkasan.');
      setAiSummary(data.summary ?? '');
    } catch (err) {
      setAiSummaryError(
        err instanceof Error ? err.message : 'Gagal menghubungi layanan ringkasan.'
      );
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const handleSuggestBalancedPairs = async () => {
    const active = state.players.filter((p) => p.status === 'aktif');
    if (active.length < 4) {
      setAiPairsError('Butuh minimal 4 pemain aktif untuk menyarankan pasangan.');
      return;
    }
    setAiPairsLoading(true);
    setAiPairsError(null);
    try {
      const payload = active.map((p) => ({
        name: p.name,
        games: p.gamesPlayedSession + p.allTimeGames,
        wins: p.winsSession + p.allTimeWins,
        points: p.pointsSession + p.allTimePoints,
      }));
      const res = await fetch('/api/gemini/suggest-pairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: payload }),
      });
      const data = (await res.json()) as {
        teamA?: string[];
        teamB?: string[];
        alasan?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Gagal membuat saran pasangan.');
      if (data.teamA && data.teamB && data.alasan) {
        setAiPairs({ teamA: data.teamA, teamB: data.teamB, alasan: data.alasan });
      }
    } catch (err) {
      setAiPairsError(
        err instanceof Error ? err.message : 'Gagal menghubungi layanan saran pasangan.'
      );
    } finally {
      setAiPairsLoading(false);
    }
  };

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Statistik & Riwayat
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {state.matchHistory.length} pertandingan selesai hari ini
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-200/70 dark:bg-zinc-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setScope('session')}
            className={`min-h-[38px] px-3.5 rounded-md text-xs font-semibold transition ${
              scope === 'session'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400'
            }`}
          >
            Sesi Hari Ini
          </button>
          <button
            type="button"
            onClick={() => setScope('alltime')}
            className={`min-h-[38px] px-3.5 rounded-md text-xs font-semibold transition ${
              scope === 'alltime'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400'
            }`}
          >
            Semua Sesi
          </button>
        </div>
      </div>

      {/* Tombol Bagikan & Ekspor */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <button
          type="button"
          onClick={handleCopyWhatsApp}
          className="min-h-[46px] rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-semibold text-sm px-3 flex items-center justify-center gap-2 transition"
        >
          {copiedWA ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span className="truncate">{copiedWA ? 'Tersalin!' : 'Salin ke WhatsApp'}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowRecapCard(true)}
          className="min-h-[46px] rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white font-semibold text-sm px-3 flex items-center justify-center gap-2 transition"
        >
          <ImageIcon className="w-4 h-4 text-zinc-500" />
          <span className="truncate">Kartu Rekap</span>
        </button>

        <button
          type="button"
          disabled={displayedMatches.length === 0}
          onClick={() => exportMatchHistoryCSV(displayedMatches)}
          className="min-h-[46px] rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 text-zinc-900 dark:text-white font-semibold text-sm px-3 flex items-center justify-center gap-2 transition"
        >
          <FileSpreadsheet className="w-4 h-4 text-zinc-500" />
          <span className="truncate">Ekspor CSV</span>
        </button>

        <button
          type="button"
          onClick={onStartNewSession}
          className="min-h-[46px] rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white font-semibold text-sm px-3 flex items-center justify-center gap-2 transition"
        >
          <RefreshCw className="w-4 h-4 text-zinc-500" />
          <span className="truncate">Arsip & Sesi Baru</span>
        </button>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowResetCountsModal(true)}
          className="min-h-[40px] px-3.5 rounded-lg border border-rose-200 dark:border-rose-900 bg-white dark:bg-zinc-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold inline-flex items-center gap-1.5 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset Semua Hitungan Main (0x)
        </button>
      </div>

      {/* Ringkasan & Rekomendasi Pasangan */}
      <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">
              Ringkasan & Rekomendasi Pasangan
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Buat catatan rekap gaya komentator atau susun pasangan 2 vs 2 yang berimbang.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={aiSummaryLoading}
              onClick={handleGenerateAISummary}
              className="min-h-[42px] px-3.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white font-semibold text-xs flex items-center gap-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              {aiSummaryLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MessageSquareText className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
              )}
              Buat Rekap Komentator
            </button>
            <button
              type="button"
              disabled={aiPairsLoading}
              onClick={handleSuggestBalancedPairs}
              className="min-h-[42px] px-3.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white font-semibold text-xs flex items-center gap-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              {aiPairsLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Scale className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
              )}
              Rekomendasi Pasangan
            </button>
          </div>
        </div>

        {aiSummaryError && (
          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-3 text-xs text-rose-700 dark:text-rose-300">
            {aiSummaryError}
          </div>
        )}
        {aiSummary && (
          <div className="rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-line leading-relaxed">
            {aiSummary}
          </div>
        )}

        {aiPairsError && (
          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-3 text-xs text-rose-700 dark:text-rose-300">
            {aiPairsError}
          </div>
        )}
        {aiPairs && (
          <div className="rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-zinc-900 dark:text-white">
                {aiPairs.teamA.join(' & ')} <span className="text-zinc-400 font-normal">vs</span>{' '}
                {aiPairs.teamB.join(' & ')}
              </div>
              <button
                type="button"
                onClick={() => onApplySuggestedPairs(aiPairs.teamA, aiPairs.teamB)}
                className="min-h-[38px] px-3 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold"
              >
                Terapkan ke Lapangan 1
              </button>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300">{aiPairs.alasan}</p>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEADERBOARD */}
        <section className="lg:col-span-7 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 overflow-hidden">
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-600" />
              Leaderboard {scope === 'session' ? 'Sesi Ini' : 'Semua Sesi'}
            </h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {leaderboard.length} Pemain
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  <th className="py-2.5 pl-4 pr-2">#</th>
                  <th className="py-2.5 px-2">Pemain</th>
                  <th className="py-2.5 px-2 text-right">Main</th>
                  <th className="py-2.5 px-2 text-right">M-K</th>
                  <th className="py-2.5 px-2 text-right">Win%</th>
                  <th className="py-2.5 px-2 text-right">Poin</th>
                  <th className="py-2.5 pl-2 pr-4 text-right">Streak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
                {leaderboard.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <td className="py-3 pl-4 pr-2 font-mono-tabular font-semibold text-zinc-400">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2.5 min-w-[110px]">
                        <PlayerAvatar
                          name={p.name}
                          avatarUrl={p.avatarUrl}
                          avatarColor={p.avatarColor}
                          size="xs"
                        />
                        <span className="font-semibold text-zinc-900 dark:text-white truncate max-w-[120px]">
                          {p.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-right font-mono-tabular text-zinc-700 dark:text-zinc-300">
                      {p.games}
                    </td>
                    <td className="py-3 px-2 text-right font-mono-tabular text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                      {p.wins}-{p.losses}
                    </td>
                    <td className="py-3 px-2 text-right font-mono-tabular font-bold text-emerald-700 dark:text-emerald-400">
                      {p.winRate}%
                    </td>
                    <td className="py-3 px-2 text-right font-mono-tabular text-zinc-700 dark:text-zinc-300">
                      {p.points}
                    </td>
                    <td className="py-3 pl-2 pr-4 text-right font-mono-tabular text-zinc-600 dark:text-zinc-400">
                      {p.bestStreak}x
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* DUO & RIWAYAT */}
        <div className="lg:col-span-5 space-y-5">
          <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 p-4 space-y-3">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-zinc-500" />
              Pasangan Terbaik
            </h2>
            {bestDuos.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Selesaikan minimal 1 pertandingan untuk melihat statistik pasangan terbaik.
              </p>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {bestDuos.map((duo, idx) => (
                  <div
                    key={duo.key}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono-tabular text-xs font-semibold text-zinc-400 w-4">
                        {idx + 1}.
                      </span>
                      <div className="flex -space-x-2 shrink-0">
                        <PlayerAvatar
                          name={duo.players[0].name}
                          avatarUrl={duo.players[0].avatarUrl}
                          avatarColor={duo.players[0].avatarColor}
                          size="xs"
                        />
                        <PlayerAvatar
                          name={duo.players[1].name}
                          avatarUrl={duo.players[1].avatarUrl}
                          avatarColor={duo.players[1].avatarColor}
                          size="xs"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                          {duo.names}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-tabular">
                          {duo.wins} Menang dari {duo.games} Main
                        </div>
                      </div>
                    </div>
                    <span className="font-mono-tabular text-sm font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                      {duo.winRate}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 p-4 space-y-3">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">
              Riwayat Pertandingan ({displayedMatches.length})
            </h2>
            {displayedMatches.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Belum ada pertandingan yang selesai dicatat.
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800 pr-1">
                {displayedMatches.map((m) => (
                  <div key={m.id} className="py-3 space-y-1">
                    <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 font-mono-tabular">
                      <span>
                        {formatClock(m.timestamp)} · Lap. {m.courtNumber}
                      </span>
                      <span>
                        {formatDuration(m.durationSeconds)} · {m.shuttlesUsed} kok
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span
                        className={`flex-1 truncate ${
                          m.winner === 'A'
                            ? 'font-bold text-emerald-800 dark:text-emerald-400'
                            : 'text-zinc-600 dark:text-zinc-300'
                        }`}
                      >
                        {m.teamANames.join(' & ')}
                      </span>
                      <span className="font-mono-tabular font-bold text-zinc-900 dark:text-white px-2">
                        {m.finalScoreA} - {m.finalScoreB}
                      </span>
                      <span
                        className={`flex-1 text-right truncate ${
                          m.winner === 'B'
                            ? 'font-bold text-blue-800 dark:text-blue-400'
                            : 'text-zinc-600 dark:text-zinc-300'
                        }`}
                      >
                        {m.teamBNames.join(' & ')}
                      </span>
                    </div>
                    {m.gameScores.length > 1 && (
                      <div className="text-[11px] font-mono-tabular text-zinc-400 text-center">
                        {m.gameScores.map((g, i) => `G${i + 1}: ${g.scoreA}-${g.scoreB}`).join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* MODAL KARTU REKAP */}
      {showRecapCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                SmashBoard · Rekap Sesi
              </span>
              <button
                type="button"
                onClick={() => setShowRecapCard(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h3 className="text-xl font-bold">
                {new Date().toLocaleDateString('id-ID', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </h3>
              <p className="text-xs text-zinc-500 font-mono-tabular mt-0.5">
                {state.matchHistory.length} Pertandingan · {state.expenseSettings.shuttleCount} Shuttlecock
              </p>
            </div>

            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200/70 dark:divide-zinc-800">
              {leaderboard.filter((p) => p.games > 0).length === 0 ? (
                <p className="p-4 text-sm text-zinc-500 text-center">
                  Belum ada pertandingan selesai pada sesi ini.
                </p>
              ) : (
                leaderboard
                  .filter((p) => p.games > 0)
                  .slice(0, 6)
                  .map((p, idx) => (
                    <div
                      key={p.id}
                      className="px-3.5 py-2.5 flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono-tabular font-semibold text-zinc-400 w-4">
                          {idx + 1}.
                        </span>
                        <span className="font-semibold">{p.name}</span>
                      </div>
                      <div className="font-mono-tabular text-xs text-zinc-600 dark:text-zinc-300">
                        {p.wins}M-{p.losses}K ·{' '}
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                          {p.winRate}%
                        </span>
                      </div>
                    </div>
                  ))
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => downloadRecapCardPNG(state)}
                className="flex-1 min-h-[46px] rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Unduh Gambar PNG
              </button>
              <button
                type="button"
                onClick={handleCopyWhatsApp}
                className="min-h-[46px] px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 font-semibold text-sm flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                WA
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetCountsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
              Reset Hitungan Main Semua Pemain?
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Jumlah main (Main 0x), menang-kalah, streak, dan riwayat match akan direset ke 0. Daftar nama & foto pemain tetap tersimpan.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowResetCountsModal(false)}
                className="flex-1 min-h-[44px] rounded-xl border border-zinc-300 dark:border-zinc-700 font-semibold text-sm text-zinc-700 dark:text-zinc-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetAllPlayCounts();
                  setShowResetCountsModal(false);
                }}
                className="flex-1 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 font-semibold text-sm text-white"
              >
                Reset ke 0
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
