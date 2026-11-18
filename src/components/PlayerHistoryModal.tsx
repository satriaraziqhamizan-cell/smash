import React, { useMemo, useState } from 'react';
import { History, Trophy, X } from 'lucide-react';
import type { MatchRecord, Player } from '../types/smashboard';
import { formatClock, formatDuration } from '../utils/storage';
import { PlayerAvatar } from './PlayerAvatar';

interface PlayerHistoryModalProps {
  player: Player | null;
  sessionMatches: MatchRecord[];
  allTimeMatches: MatchRecord[];
  initialScope?: 'session' | 'alltime';
  onClose: () => void;
}

export const PlayerHistoryModal: React.FC<PlayerHistoryModalProps> = ({
  player,
  sessionMatches,
  allTimeMatches,
  initialScope = 'session',
  onClose,
}) => {
  const [scope, setScope] = useState<'session' | 'alltime'>(initialScope);

  const playerMatches = useMemo(() => {
    if (!player) return [];
    const source =
      scope === 'session' ? sessionMatches : [...allTimeMatches, ...sessionMatches];
    const filtered = source.filter(
      (m) => m.teamAIds.includes(player.id) || m.teamBIds.includes(player.id)
    );
    return filtered.map((m, idx) => {
      const inTeamA = m.teamAIds.includes(player.id);
      const teamIds = inTeamA ? m.teamAIds : m.teamBIds;
      const teamNames = inTeamA ? m.teamANames : m.teamBNames;
      const oppNames = inTeamA ? m.teamBNames : m.teamANames;
      const partnerIndex = teamIds.findIndex((id) => id !== player.id);
      const partnerName =
        partnerIndex >= 0 ? teamNames[partnerIndex] ?? '?' : null;
      const won = m.winner === (inTeamA ? 'A' : 'B');
      const playerScore = inTeamA ? m.finalScoreA : m.finalScoreB;
      const oppScore = inTeamA ? m.finalScoreB : m.finalScoreA;

      return {
        record: m,
        matchNumber: idx + 1,
        won,
        partnerName,
        oppNames,
        playerScore,
        oppScore,
      };
    }).reverse();
  }, [player, scope, sessionMatches, allTimeMatches]);

  if (!player) return null;

  const games = scope === 'session' ? player.gamesPlayedSession : player.allTimeGames;
  const wins = scope === 'session' ? player.winsSession : player.allTimeWins;
  const losses = scope === 'session' ? player.lossesSession : player.allTimeLosses;
  const bestStreak =
    scope === 'session' ? player.bestStreakSession : player.allTimeBestStreak;
  const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-lg max-h-[86vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <PlayerAvatar
              name={player.name}
              avatarUrl={player.avatarUrl}
              avatarColor={player.avatarColor}
              size="md"
            />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white truncate">
                {player.name}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Histori Main &amp; Catatan Pertandingan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-lg"
            aria-label="Tutup histori pemain"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scope switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => setScope('session')}
            className={`min-h-[36px] rounded-md text-xs font-semibold transition ${
              scope === 'session'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400'
            }`}
          >
            Sesi Hari Ini ({player.gamesPlayedSession}x)
          </button>
          <button
            type="button"
            onClick={() => setScope('alltime')}
            className={`min-h-[36px] rounded-md text-xs font-semibold transition ${
              scope === 'alltime'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400'
            }`}
          >
            Semua Sesi ({player.allTimeGames}x)
          </button>
        </div>

        {/* Ringkasan Angka */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-2.5">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Main</div>
            <div className="text-lg font-bold font-mono-tabular text-zinc-900 dark:text-white">
              {games}x
            </div>
          </div>
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-2.5">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Menang-Kalah</div>
            <div className="text-base font-bold font-mono-tabular text-zinc-900 dark:text-white mt-0.5">
              {wins}-{losses}
            </div>
          </div>
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-2.5">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Win Rate</div>
            <div className="text-lg font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400">
              {winRate}%
            </div>
          </div>
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-2.5">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Streak</div>
            <div className="text-lg font-bold font-mono-tabular text-zinc-900 dark:text-white">
              {bestStreak}x
            </div>
          </div>
        </div>

        {/* Daftar Pertandingan */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
          {playerMatches.length === 0 ? (
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-6 text-center space-y-1.5">
              <History className="w-7 h-7 mx-auto text-zinc-400 opacity-60" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Belum ada riwayat pertandingan
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {games > 0
                  ? `Tercatat ${games}x main, namun detail pertandingan belum tersimpan untuk sesi lama.`
                  : 'Selesaikan pertandingan dan klik Lanjut / Rekap untuk mencatat histori pemain ini.'}
              </p>
            </div>
          ) : (
            playerMatches.map((item) => (
              <div
                key={item.record.id}
                className="rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/90 dark:border-zinc-800 p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-mono-tabular text-zinc-500 dark:text-zinc-400">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      Main ke-{item.matchNumber}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatClock(item.record.timestamp)}</span>
                    <span aria-hidden="true">·</span>
                    <span>Lap. {item.record.courtNumber}</span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 font-bold text-xs ${
                      item.won
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {item.won && <Trophy className="w-3 h-3" />}
                    {item.won ? 'Menang' : 'Kalah'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 text-xs sm:text-sm space-y-0.5">
                    {item.partnerName && (
                      <div className="text-zinc-700 dark:text-zinc-200 truncate">
                        <span className="text-zinc-400">Partner:</span>{' '}
                        <span className="font-semibold">{item.partnerName}</span>
                      </div>
                    )}
                    <div className="text-zinc-600 dark:text-zinc-300 truncate">
                      <span className="text-zinc-400">Lawan:</span>{' '}
                      <span>{item.oppNames.join(' & ')}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono-tabular font-bold text-base text-zinc-900 dark:text-white">
                      {item.playerScore} - {item.oppScore}
                    </div>
                    <div className="text-[11px] font-mono-tabular text-zinc-400">
                      {formatDuration(item.record.durationSeconds)}
                    </div>
                  </div>
                </div>

                {item.record.gameScores.length > 1 && (
                  <div className="text-[11px] font-mono-tabular text-zinc-400 pt-0.5 border-t border-zinc-200/70 dark:border-zinc-800">
                    {item.record.gameScores
                      .map((g, i) => `G${i + 1}: ${g.scoreA}-${g.scoreB}`)
                      .join(' · ')}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
