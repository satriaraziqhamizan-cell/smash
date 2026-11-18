import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  BellRing,
  Check,
  Copy,
  Download,
  Moon,
  RotateCcw,
  Settings2,
  Smartphone,
  StickyNote,
  Sun,
  Trophy,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import type {
  AppState,
  ExpenseSettings,
  RotationSettings,
  ScoringSettings,
  VoiceSettings,
} from '../types/smashboard';
import { formatDuration, formatRupiah } from '../utils/storage';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface MoreTabProps {
  state: AppState;
  onToggleTheme: () => void;
  onUpdateScoring: (patch: Partial<ScoringSettings>) => void;
  onUpdateRotation: (patch: Partial<RotationSettings>) => void;
  onUpdateVoice: (patch: Partial<VoiceSettings>) => void;
  onUpdateExpense: (patch: Partial<ExpenseSettings>) => void;
  onUpdateNotes: (notes: string) => void;
  onStartRentalTimer: (durationMinutes: number) => void;
  onStopRentalTimer: () => void;
  onGenerateTournament: () => void;
  onUpdateTournamentScore: (matchId: string, scoreA: number, scoreB: number) => void;
  onCloseTournament: () => void;
  onRestoreBackup: (restoredState: AppState) => void;
  onResetAllPlayCounts: () => void;
  onResetAllData: () => void;
}

export const MoreTab: React.FC<MoreTabProps> = ({
  state,
  onToggleTheme,
  onUpdateScoring,
  onUpdateRotation,
  onUpdateVoice,
  onUpdateExpense,
  onUpdateNotes,
  onStartRentalTimer,
  onStopRentalTimer,
  onGenerateTournament,
  onUpdateTournamentScore,
  onCloseTournament,
  onRestoreBackup,
  onResetAllPlayCounts,
  onResetAllData,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showResetCountsModal, setShowResetCountsModal] = useState(false);
  const [copiedBill, setCopiedBill] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [rentalMinutesInput, setRentalMinutesInput] = useState(
    state.rentalReminder.durationMinutes || 120
  );
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const expenseCalc = useMemo(() => {
    const totalCourt =
      state.expenseSettings.courtPricePerHour * state.expenseSettings.courtHours;
    const totalShuttle =
      state.expenseSettings.shuttlePricePerUnit * state.expenseSettings.shuttleCount;
    const grandTotal = totalCourt + totalShuttle;

    const excludedSet = new Set(state.expenseSettings.excludedFromSplitIds ?? []);
    const candidatePlayers = state.players.filter(
      (p) => p.status !== 'pulang' || p.gamesPlayedSession > 0
    );
    const includedPlayers = candidatePlayers.filter((p) => !excludedSet.has(p.id));
    const totalGamesAcrossIncluded = includedPlayers.reduce(
      (sum, p) => sum + p.gamesPlayedSession,
      0
    );

    const equalShare = includedPlayers.length > 0 ? grandTotal / includedPlayers.length : 0;

    const breakdown = candidatePlayers.map((p) => {
      const isExcluded = excludedSet.has(p.id);
      let share = 0;
      if (!isExcluded) {
        if (state.expenseSettings.splitMode === 'equal') {
          share = equalShare;
        } else if (totalGamesAcrossIncluded > 0) {
          share = (p.gamesPlayedSession / totalGamesAcrossIncluded) * grandTotal;
        } else {
          share = equalShare;
        }
      }
      return {
        player: p,
        isExcluded,
        share,
      };
    });

    return {
      totalCourt,
      totalShuttle,
      grandTotal,
      includedCount: includedPlayers.length,
      equalShare,
      breakdown,
    };
  }, [state.expenseSettings, state.players]);

  const toggleExcludeFromSplit = (playerId: string) => {
    const current = state.expenseSettings.excludedFromSplitIds ?? [];
    const next = current.includes(playerId)
      ? current.filter((id) => id !== playerId)
      : [...current, playerId];
    onUpdateExpense({ excludedFromSplitIds: next });
  };

  const handleCopyBillWA = async () => {
    const includedBreakdown = expenseCalc.breakdown.filter((b) => !b.isExcluded);
    const lines = [
      '*PATUNGAN MABAR SMASHBOARD*',
      `Sewa Lapangan (${state.expenseSettings.courtHours} jam): ${formatRupiah(expenseCalc.totalCourt)}`,
      `Shuttlecock (${state.expenseSettings.shuttleCount} pcs): ${formatRupiah(expenseCalc.totalShuttle)}`,
      `*Total Biaya: ${formatRupiah(expenseCalc.grandTotal)}*`,
      `Metode: ${
        state.expenseSettings.splitMode === 'equal'
          ? `Bagi Rata (${expenseCalc.includedCount} orang)`
          : 'Proporsional per Jumlah Main'
      }`,
      '',
      '*Rincian Per Pemain:*',
      ...includedBreakdown.map((b, i) =>
        state.expenseSettings.splitMode === 'equal'
          ? `${i + 1}. ${b.player.name}: *${formatRupiah(b.share)}*`
          : `${i + 1}. ${b.player.name} (${b.player.gamesPlayedSession}x main): *${formatRupiah(b.share)}*`
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedBill(true);
      setTimeout(() => setCopiedBill(false), 2500);
    } catch {
      // Abaikan
    }
  };

  const rentalRemainingSec = useMemo(() => {
    if (!state.rentalReminder.active || !state.rentalReminder.startedAt) return 0;
    const endAt =
      state.rentalReminder.startedAt + state.rentalReminder.durationMinutes * 60 * 1000;
    return Math.max(0, Math.floor((endAt - nowTick) / 1000));
  }, [state.rentalReminder, nowTick]);

  const tournamentStandings = useMemo(() => {
    const statsMap = new Map<
      string,
      { id: string; name: string; played: number; wins: number; losses: number; diff: number; pts: number }
    >();
    state.players.forEach((p) => {
      if (p.status === 'aktif') {
        statsMap.set(p.id, {
          id: p.id,
          name: p.name,
          played: 0,
          wins: 0,
          losses: 0,
          diff: 0,
          pts: 0,
        });
      }
    });

    for (const m of state.tournament.matches) {
      if (!m.completed || m.scoreA === null || m.scoreB === null) continue;
      const aWon = m.scoreA > m.scoreB;
      const diffA = m.scoreA - m.scoreB;

      m.teamAIds.forEach((id) => {
        const s = statsMap.get(id);
        if (!s) return;
        s.played += 1;
        s.diff += diffA;
        if (aWon) {
          s.wins += 1;
          s.pts += 2;
        } else {
          s.losses += 1;
        }
      });

      m.teamBIds.forEach((id) => {
        const s = statsMap.get(id);
        if (!s) return;
        s.played += 1;
        s.diff -= diffA;
        if (!aWon) {
          s.wins += 1;
          s.pts += 2;
        } else {
          s.losses += 1;
        }
      });
    }

    return Array.from(statsMap.values()).sort(
      (a, b) => b.pts - a.pts || b.diff - a.diff || b.wins - a.wins
    );
  }, [state.tournament.matches, state.players]);

  const playerMap = useMemo(
    () => new Map(state.players.map((p) => [p.id, p])),
    [state.players]
  );

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupMessage('File backup JSON berhasil diunduh.');
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as AppState;
      if (!Array.isArray(parsed.players) || !parsed.scoringSettings) {
        throw new Error('Format file backup tidak valid.');
      }
      onRestoreBackup(parsed);
      setBackupMessage('Data berhasil dipulihkan dari file backup.');
    } catch {
      setBackupMessage('Gagal memulihkan data: file JSON tidak valid.');
    }
  };

  return (
    <div className="space-y-5 pb-6">
      <input
        ref={restoreInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportJSON}
      />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Lainnya & Pengaturan
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Patungan biaya, alarm sewa, turnamen mini, dan aturan main.
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          className="min-h-[42px] px-3.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 text-sm font-semibold inline-flex items-center gap-2 shrink-0"
        >
          {state.theme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              Terang
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-zinc-700" />
              Gelap
            </>
          )}
        </button>
      </div>

      {!isInstalled && (isInstallable || isIOS) && (
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Smartphone className="w-5 h-5 shrink-0 text-zinc-700 dark:text-zinc-300" />
            <div>
              <div className="font-bold text-sm text-zinc-900 dark:text-white">
                Pasang SmashBoard di Layar Utama HP
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Bisa dibuka cepat dan tetap berjalan saat offline di lapangan.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => (isInstallable ? install() : setShowIOSGuide(true))}
            className="min-h-[42px] px-4 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm shrink-0"
          >
            {isInstallable ? 'Install Aplikasi' : 'Panduan iOS'}
          </button>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* PENGHITUNG BIAYA PATUNGAN */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Wallet className="w-4 h-4 text-zinc-500" />
              Penghitung Biaya Patungan
            </h2>
            <button
              type="button"
              onClick={handleCopyBillWA}
              className="min-h-[36px] px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              {copiedBill ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedBill ? 'Tersalin' : 'Salin Tagihan'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Sewa Lapangan / Jam</span>
              <input
                type="number"
                min={0}
                step={5000}
                value={state.expenseSettings.courtPricePerHour}
                onChange={(e) =>
                  onUpdateExpense({ courtPricePerHour: Math.max(0, Number(e.target.value)) })
                }
                className="w-full min-h-[42px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 font-mono-tabular font-semibold text-zinc-900 dark:text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Durasi Sewa (Jam)</span>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={state.expenseSettings.courtHours}
                onChange={(e) =>
                  onUpdateExpense({ courtHours: Math.max(0, Number(e.target.value)) })
                }
                className="w-full min-h-[42px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 font-mono-tabular font-semibold text-zinc-900 dark:text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Harga Shuttlecock / Pcs</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={state.expenseSettings.shuttlePricePerUnit}
                onChange={(e) =>
                  onUpdateExpense({ shuttlePricePerUnit: Math.max(0, Number(e.target.value)) })
                }
                className="w-full min-h-[42px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 font-mono-tabular font-semibold text-zinc-900 dark:text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Jumlah Kok Terpakai</span>
              <input
                type="number"
                min={0}
                value={state.expenseSettings.shuttleCount}
                onChange={(e) =>
                  onUpdateExpense({ shuttleCount: Math.max(0, Number(e.target.value)) })
                }
                className="w-full min-h-[42px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 font-mono-tabular font-semibold text-zinc-900 dark:text-white"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800">
            <button
              type="button"
              onClick={() => onUpdateExpense({ splitMode: 'equal' })}
              className={`min-h-[38px] rounded-md text-xs font-semibold transition ${
                state.expenseSettings.splitMode === 'equal'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Bagi Rata (Sama Rata)
            </button>
            <button
              type="button"
              onClick={() => onUpdateExpense({ splitMode: 'proportional' })}
              className={`min-h-[38px] rounded-md text-xs font-semibold transition ${
                state.expenseSettings.splitMode === 'proportional'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Per Jumlah Main
            </button>
          </div>

          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                Total Biaya Mabar
              </span>
              <span className="font-mono-tabular text-lg font-bold text-zinc-900 dark:text-white">
                {formatRupiah(expenseCalc.grandTotal)}
              </span>
            </div>
            {state.expenseSettings.splitMode === 'equal' && expenseCalc.includedCount > 0 && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-tabular">
                {formatRupiah(expenseCalc.grandTotal)} ÷ {expenseCalc.includedCount} orang ={' '}
                <strong className="text-zinc-900 dark:text-white">
                  {formatRupiah(expenseCalc.equalShare)} / orang
                </strong>{' '}
                (rata, tidak hitung jumlah main)
              </div>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
            {expenseCalc.breakdown.map((b) => (
              <label
                key={b.player.id}
                className={`py-2 flex items-center justify-between gap-2 text-sm cursor-pointer ${
                  b.isExcluded ? 'opacity-45' : ''
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={!b.isExcluded}
                    onChange={() => toggleExcludeFromSplit(b.player.id)}
                    className="w-4 h-4 accent-zinc-900 dark:accent-white shrink-0"
                  />
                  <span className="text-zinc-800 dark:text-zinc-200 font-medium truncate">
                    {b.player.name}
                  </span>
                  {state.expenseSettings.splitMode === 'proportional' && (
                    <span className="text-xs text-zinc-400 font-mono-tabular shrink-0">
                      ({b.player.gamesPlayedSession}x main)
                    </span>
                  )}
                </span>
                <span className="font-mono-tabular font-semibold text-zinc-900 dark:text-white shrink-0">
                  {b.isExcluded ? 'Kecuali' : formatRupiah(b.share)}
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* PENGINGAT SEWA & CATATAN CEPAT */}
        <div className="space-y-5">
          <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 p-4 space-y-3">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <AlarmClock className="w-4 h-4 text-zinc-500" />
              Pengingat Durasi Sewa Lapangan
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Memberi alarm suara & peringatan 10 menit sebelum waktu sewa lapangan habis.
            </p>

            {state.rentalReminder.active ? (
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <BellRing className="w-4 h-4" />
                    Sisa Waktu Sewa
                  </div>
                  <div className="font-mono-tabular text-3xl font-bold text-zinc-900 dark:text-white mt-0.5">
                    {formatDuration(rentalRemainingSec)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onStopRentalTimer}
                  className="min-h-[42px] px-4 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm font-semibold"
                >
                  Hentikan
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1.5">
                  {[60, 90, 120, 180].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setRentalMinutesInput(m)}
                      className={`min-h-[40px] px-3 rounded-lg text-xs font-semibold border transition ${
                        rentalMinutesInput === m
                          ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-zinc-900'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
                      }`}
                    >
                      {m / 60} Jam
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => onStartRentalTimer(rentalMinutesInput)}
                  className="flex-1 min-h-[42px] px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-semibold text-sm"
                >
                  Mulai Pengingat ({rentalMinutesInput} mnt)
                </button>
              </div>
            )}
          </section>

          <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 p-4 space-y-2.5">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-zinc-500" />
              Catatan Cepat Mabar
            </h2>
            <textarea
              rows={3}
              value={state.quickNotes}
              onChange={(e) => onUpdateNotes(e.target.value)}
              placeholder='Contoh: "Besok main jam 7 di GOR Jaya, bawa kok cadangan 2 slop"'
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 p-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </section>
        </div>
      </div>

      {/* TURNAMEN MINI */}
      <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-zinc-500" />
              Mode Turnamen Mini (Round Robin)
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Buat jadwal pertandingan acak antar pemain aktif lengkap dengan klasemen poin.
            </p>
          </div>
          <div className="flex gap-2">
            {state.tournament.active && (
              <button
                type="button"
                onClick={onCloseTournament}
                className="min-h-[40px] px-3.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-200"
              >
                Tutup
              </button>
            )}
            <button
              type="button"
              onClick={onGenerateTournament}
              className="min-h-[40px] px-4 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold"
            >
              {state.tournament.active ? 'Buat Ulang Jadwal' : 'Mulai Turnamen Mini'}
            </button>
          </div>
        </div>

        {state.tournament.active && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3">
              {state.tournament.matches.length === 0 ? (
                <p className="py-4 text-sm text-zinc-500">
                  Butuh minimal 4 pemain aktif untuk membuat jadwal turnamen.
                </p>
              ) : (
                state.tournament.matches.map((tm) => (
                  <div
                    key={tm.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white">
                      <span className="text-zinc-400 font-mono-tabular mr-2">#{tm.round}</span>
                      {tm.teamAIds.map((id) => playerMap.get(id)?.name ?? '?').join(' & ')}{' '}
                      <span className="text-zinc-400 font-normal">vs</span>{' '}
                      {tm.teamBIds.map((id) => playerMap.get(id)?.name ?? '?').join(' & ')}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={30}
                        placeholder="A"
                        value={tm.scoreA ?? ''}
                        onChange={(e) => {
                          const valA = e.target.value === '' ? 0 : Number(e.target.value);
                          onUpdateTournamentScore(tm.id, valA, tm.scoreB ?? 0);
                        }}
                        className="w-14 min-h-[38px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-center font-mono-tabular font-bold text-sm"
                      />
                      <span className="text-zinc-400 font-bold">-</span>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        placeholder="B"
                        value={tm.scoreB ?? ''}
                        onChange={(e) => {
                          const valB = e.target.value === '' ? 0 : Number(e.target.value);
                          onUpdateTournamentScore(tm.id, tm.scoreA ?? 0, valB);
                        }}
                        className="w-14 min-h-[38px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-center font-mono-tabular font-bold text-sm"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="lg:col-span-5 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500">
                  <tr>
                    <th className="py-2 px-3">Pemain</th>
                    <th className="py-2 px-2 text-right">Main</th>
                    <th className="py-2 px-2 text-right">M-K</th>
                    <th className="py-2 px-2 text-right">+/-</th>
                    <th className="py-2 px-3 text-right">Poin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {tournamentStandings.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2 px-3 font-semibold text-zinc-900 dark:text-white">
                        {row.name}
                      </td>
                      <td className="py-2 px-2 text-right font-mono-tabular">{row.played}</td>
                      <td className="py-2 px-2 text-right font-mono-tabular">
                        {row.wins}-{row.losses}
                      </td>
                      <td className="py-2 px-2 text-right font-mono-tabular">
                        {row.diff > 0 ? `+${row.diff}` : row.diff}
                      </td>
                      <td className="py-2 px-3 text-right font-mono-tabular font-bold text-emerald-700 dark:text-emerald-400">
                        {row.pts}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* PENGATURAN SKOR, ROTASI, DAN PERINTAH SUARA */}
      <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 p-4 space-y-5">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-zinc-500" />
          Pengaturan Pertandingan & Rotasi
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
              Aturan Skor Badminton
            </h3>

            <div className="space-y-1.5">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Target Poin</span>
              <div className="flex flex-wrap gap-1.5">
                {[11, 15, 21].map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => onUpdateScoring({ targetPoints: pt })}
                    className={`min-h-[40px] px-4 rounded-lg text-sm font-bold border transition ${
                      state.scoringSettings.targetPoints === pt
                        ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-zinc-900'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
                    }`}
                  >
                    {pt}
                  </button>
                ))}
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={state.scoringSettings.targetPoints}
                  onChange={(e) =>
                    onUpdateScoring({ targetPoints: Math.max(5, Number(e.target.value)) })
                  }
                  className="w-20 min-h-[40px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 text-center font-mono-tabular font-bold text-sm"
                  aria-label="Target poin kustom"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Format Pertandingan</span>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                <button
                  type="button"
                  onClick={() => onUpdateScoring({ matchFormat: 'single' })}
                  className={`min-h-[38px] rounded-md text-xs font-semibold transition ${
                    state.scoringSettings.matchFormat === 'single'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  1 Game (Mabar)
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateScoring({ matchFormat: 'bo3' })}
                  className={`min-h-[38px] rounded-md text-xs font-semibold transition ${
                    state.scoringSettings.matchFormat === 'bo3'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  Best of 3
                </button>
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
              <span className="text-sm text-zinc-700 dark:text-zinc-200">
                Batas maksimal 30 poin (deuce)
              </span>
              <input
                type="checkbox"
                checked={state.scoringSettings.capAt30}
                onChange={(e) => onUpdateScoring({ capAt30: e.target.checked })}
                className="w-5 h-5 accent-zinc-900 dark:accent-white"
              />
            </label>

            <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
              <span className="text-sm text-zinc-700 dark:text-zinc-200">
                Tukar sisi otomatis di game penentu
              </span>
              <input
                type="checkbox"
                checked={state.scoringSettings.autoSideSwitchAlert}
                onChange={(e) => onUpdateScoring({ autoSideSwitchAlert: e.target.checked })}
                className="w-5 h-5 accent-zinc-900 dark:accent-white"
              />
            </label>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
              Aturan Rotasi & Lapangan
            </h3>

            <div className="space-y-1.5">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Target Jumlah Match per Sesi (1, 2, 3, atau lebih)
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateRotation({ targetSessionMatches: null })}
                  className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold border transition ${
                    state.rotationSettings.targetSessionMatches === null
                      ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-zinc-900'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
                  }`}
                >
                  Bebas
                </button>
                {[1, 2, 3, 5, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => onUpdateRotation({ targetSessionMatches: num })}
                    className={`min-h-[40px] px-3.5 rounded-lg text-sm font-bold border transition ${
                      state.rotationSettings.targetSessionMatches === num
                        ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-zinc-900'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
                    }`}
                  >
                    {num}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={99}
                  placeholder="Kustom"
                  value={state.rotationSettings.targetSessionMatches ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    onUpdateRotation({
                      targetSessionMatches: val === '' ? null : Math.max(1, Number(val)),
                    });
                  }}
                  className="w-20 min-h-[40px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 text-center font-mono-tabular font-bold text-sm"
                  aria-label="Target jumlah match kustom"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Batas Menang Beruntun Sebelum Keluar
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => onUpdateRotation({ maxConsecutiveWins: num })}
                    className={`min-h-[40px] px-4 rounded-lg text-sm font-bold border transition ${
                      state.rotationSettings.maxConsecutiveWins === num
                        ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-zinc-900'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
                    }`}
                  >
                    {num}x
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={state.rotationSettings.maxConsecutiveWins}
                  onChange={(e) =>
                    onUpdateRotation({
                      maxConsecutiveWins: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="w-20 min-h-[40px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 text-center font-mono-tabular font-bold text-sm"
                  aria-label="Batas menang beruntun kustom"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Susunan Pertandingan Pertama
              </span>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                <button
                  type="button"
                  onClick={() => onUpdateRotation({ firstMatchMode: 'random' })}
                  className={`min-h-[38px] rounded-md text-xs font-semibold transition ${
                    state.rotationSettings.firstMatchMode === 'random'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  Acak di Awal
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateRotation({ firstMatchMode: 'queue_order' })}
                  className={`min-h-[38px] rounded-md text-xs font-semibold transition ${
                    state.rotationSettings.firstMatchMode === 'queue_order'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  Urutan Antrean
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Kebijakan Pasangan Pemenang
              </span>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                <button
                  type="button"
                  onClick={() => onUpdateRotation({ winnerPairPolicy: 'stay_together' })}
                  className={`min-h-[38px] rounded-md text-xs font-semibold transition ${
                    state.rotationSettings.winnerPairPolicy === 'stay_together'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  Tetap Berpasangan
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateRotation({ winnerPairPolicy: 'split' })}
                  className={`min-h-[38px] rounded-md text-xs font-semibold transition ${
                    state.rotationSettings.winnerPairPolicy === 'split'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  Dipisah & Acak
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Jumlah Lapangan</span>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                {([1, 2] as const).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => onUpdateRotation({ courtCount: cnt })}
                    className={`min-h-[38px] rounded-md text-xs font-semibold transition ${
                      state.rotationSettings.courtCount === cnt
                        ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {cnt} Lapangan
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
              <span className="text-sm text-zinc-700 dark:text-zinc-200">
                Acak urutan otomatis saat menambah pemain
              </span>
              <input
                type="checkbox"
                checked={state.rotationSettings.autoShuffleOnAdd}
                onChange={(e) => onUpdateRotation({ autoShuffleOnAdd: e.target.checked })}
                className="w-5 h-5 accent-zinc-900 dark:accent-white"
              />
            </label>

            <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
              <span className="text-sm text-zinc-700 dark:text-zinc-200">
                Acak pasangan ulang saat tepat 4 pemain
              </span>
              <input
                type="checkbox"
                checked={state.rotationSettings.shuffle4Players}
                onChange={(e) => onUpdateRotation({ shuffle4Players: e.target.checked })}
                className="w-5 h-5 accent-zinc-900 dark:accent-white"
              />
            </label>
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
          <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
            Kata Kunci Perintah Suara (Pisahkan dengan koma)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-zinc-500 dark:text-zinc-400">Tambah Tim A (+1)</span>
              <input
                type="text"
                value={state.voiceSettings.pointAKeywords.join(', ')}
                onChange={(e) =>
                  onUpdateVoice({
                    pointAKeywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="w-full min-h-[40px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm text-zinc-900 dark:text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 dark:text-zinc-400">Tambah Tim B (+1)</span>
              <input
                type="text"
                value={state.voiceSettings.pointBKeywords.join(', ')}
                onChange={(e) =>
                  onUpdateVoice({
                    pointBKeywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="w-full min-h-[40px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm text-zinc-900 dark:text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 dark:text-zinc-400">Undo Poin</span>
              <input
                type="text"
                value={state.voiceSettings.undoKeywords.join(', ')}
                onChange={(e) =>
                  onUpdateVoice({
                    undoKeywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="w-full min-h-[40px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm text-zinc-900 dark:text-white"
              />
            </label>
          </div>
        </div>
      </section>

      {/* BACKUP & RESTORE DATA */}
      <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 p-4 space-y-3">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white">
          Backup & Restore Data (JSON)
        </h2>
        {backupMessage && (
          <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200">
            {backupMessage}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportJSON}
            className="min-h-[44px] px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export Backup JSON
          </button>
          <button
            type="button"
            onClick={() => restoreInputRef.current?.click()}
            className="min-h-[44px] px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Import Restore JSON
          </button>
          <button
            type="button"
            onClick={() => setShowResetCountsModal(true)}
            className="min-h-[44px] px-4 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-sm font-semibold inline-flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Hitungan Main (0x)
          </button>
          <button
            type="button"
            onClick={onResetAllData}
            className="min-h-[44px] px-4 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-sm font-semibold inline-flex items-center gap-2 ml-auto"
          >
            <RotateCcw className="w-4 h-4" />
            Reset ke Data Awal
          </button>
        </div>
      </section>

      {showResetCountsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
              Reset Hitungan Main Semua Pemain?
            </h3>
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
                  setBackupMessage('Hitungan main semua pemain berhasil direset ke 0x.');
                }}
                className="flex-1 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 font-semibold text-sm text-white"
              >
                Reset ke 0
              </button>
            </div>
          </div>
        </div>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                Pasang di iPhone / iPad
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
              1. Ketuk tombol <strong>Bagikan (Share)</strong> di bar Safari.<br />
              2. Gulir ke bawah dan pilih <strong>Tambah ke Layar Utama (Add to Home Screen)</strong>.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
