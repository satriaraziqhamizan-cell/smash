import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, RotateCw, Shuffle, X } from 'lucide-react';
import type { Player } from '../types/smashboard';
import { acakArray } from '../utils/rotation';
import { PlayerAvatar } from './PlayerAvatar';

interface SpinWheelModalProps {
  isOpen: boolean;
  players: Player[];
  courtPlayerIds: string[];
  initialScope?: 'all_active' | 'court_only';
  onClose: () => void;
  onApplyResult: (result: {
    scope: 'all_active' | 'court_only';
    teamAIds: [string, string];
    teamBIds: [string, string];
    queueIds: string[];
  }) => void;
}

const WHEEL_PALETTE = [
  '#F4F4F5',
  '#FFFFFF',
  '#ECFDF5',
  '#EFF6FF',
  '#FAFAFA',
  '#F0FDF4',
];

function playWheelTick() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(780, ctx.currentTime);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.035);
  } catch {
    // Abaikan jika browser memblokir audio
  }
}

export const SpinWheelModal: React.FC<SpinWheelModalProps> = ({
  isOpen,
  players,
  courtPlayerIds,
  initialScope = 'all_active',
  onClose,
  onApplyResult,
}) => {
  const [scope, setScope] = useState<'all_active' | 'court_only'>(initialScope);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [drawnResult, setDrawnResult] = useState<{
    teamAIds: [string, string];
    teamBIds: [string, string];
    queueIds: string[];
  } | null>(null);

  const animRef = useRef<number | null>(null);
  const rotationRef = useRef(0);
  const lastSegmentIdxRef = useRef(-1);
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setScope(initialScope);
      setDrawnResult(null);
      setIsSpinning(false);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isOpen, initialScope]);

  const poolPlayers = useMemo(() => {
    const active = players.filter((p) => p.status === 'aktif');
    if (scope === 'court_only' && courtPlayerIds.length === 4) {
      const set = new Set(courtPlayerIds);
      const onCourt = active.filter((p) => set.has(p.id));
      if (onCourt.length === 4) return onCourt;
    }
    return active;
  }, [players, scope, courtPlayerIds]);

  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const pointedPlayer = useMemo(() => {
    if (poolPlayers.length === 0) return null;
    const count = poolPlayers.length;
    const slice = 360 / count;
    // Jarum berada di atas (0 derajat), roda berputar searah jarum jam
    const normalized = ((360 - (rotationDeg % 360)) + 360) % 360;
    const idx = Math.floor(normalized / slice) % count;
    return poolPlayers[idx];
  }, [poolPlayers, rotationDeg]);

  const handleSpin = () => {
    if (isSpinning || poolPlayers.length < 4) return;
    setIsSpinning(true);
    setDrawnResult(null);

    const startDeg = rotationRef.current;
    const extraSpins = 360 * (5 + Math.floor(Math.random() * 3));
    const randomOffset = Math.random() * 360;
    const targetDeg = startDeg + extraSpins + randomOffset;
    const duration = 2600;
    const startTime = performance.now();
    const slice = 360 / poolPlayers.length;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - t, 3);
      const current = startDeg + (targetDeg - startDeg) * eased;
      rotationRef.current = current;
      setRotationDeg(current);

      const segIdx = Math.floor((((360 - (current % 360)) + 360) % 360) / slice);
      if (segIdx !== lastSegmentIdxRef.current) {
        lastSegmentIdxRef.current = segIdx;
        if (t < 0.96) playWheelTick();
      }

      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        setIsSpinning(false);
        // Mulai urutan dari pemain yang ditunjuk jarum sebagai pemain #1, lalu acak sisanya
        const normalized = ((360 - (current % 360)) + 360) % 360;
        const firstIdx = Math.floor(normalized / slice) % poolPlayers.length;
        const firstId = poolPlayers[firstIdx].id;
        const restIds = acakArray(
          poolPlayers.filter((p) => p.id !== firstId).map((p) => p.id)
        );
        const ordered = [firstId, ...restIds];
        setDrawnResult({
          teamAIds: [ordered[0], ordered[1]],
          teamBIds: [ordered[2], ordered[3]],
          queueIds: ordered.slice(4),
        });
        setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 60);
      }
    };

    animRef.current = requestAnimationFrame(tick);
  };

  if (!isOpen) return null;

  const count = poolPlayers.length;
  const radius = 135;
  const cx = 150;
  const cy = 150;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
              Putar Undian Pemain
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Putar roda untuk mengacak pasangan & urutan antrean secara interaktif.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            aria-label="Tutup undian"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pilihan cakupan pengacakan */}
        {courtPlayerIds.length === 4 && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800">
            <button
              type="button"
              disabled={isSpinning}
              onClick={() => {
                setScope('all_active');
                setDrawnResult(null);
              }}
              className={`min-h-[38px] rounded-md text-xs font-semibold transition ${
                scope === 'all_active'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Semua Aktif ({players.filter((p) => p.status === 'aktif').length})
            </button>
            <button
              type="button"
              disabled={isSpinning}
              onClick={() => {
                setScope('court_only');
                setDrawnResult(null);
              }}
              className={`min-h-[38px] rounded-md text-xs font-semibold transition ${
                scope === 'court_only'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              4 Pemain di Lapangan
            </button>
          </div>
        )}

        {poolPlayers.length < 4 ? (
          <div className="py-8 text-center text-sm text-zinc-500">
            Butuh minimal 4 pemain aktif untuk memutar undian.
          </div>
        ) : (
          <>
            {/* Roda Putar Interaktif */}
            <div className="flex flex-col items-center">
              {/* Penunjuk jarum atas */}
              <div className="relative flex flex-col items-center">
                <div
                  className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[18px] border-t-zinc-900 dark:border-t-white z-10 -mb-2"
                  aria-hidden="true"
                />
                <div className="relative w-[224px] h-[224px] sm:w-[260px] sm:h-[260px]">
                  <svg
                    viewBox="0 0 300 300"
                    className="w-full h-full drop-shadow-xs"
                    style={{
                      transform: `rotate(${rotationDeg}deg)`,
                    }}
                  >
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius + 4}
                      fill="none"
                      stroke="#E4E4E7"
                      strokeWidth="2"
                    />
                    {poolPlayers.map((p, idx) => {
                      const anglePer = (2 * Math.PI) / count;
                      const startAngle = idx * anglePer - Math.PI / 2;
                      const endAngle = startAngle + anglePer;
                      const x1 = cx + radius * Math.cos(startAngle);
                      const y1 = cy + radius * Math.sin(startAngle);
                      const x2 = cx + radius * Math.cos(endAngle);
                      const y2 = cy + radius * Math.sin(endAngle);
                      const largeArc = anglePer > Math.PI ? 1 : 0;
                      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
                      const midDeg = ((idx + 0.5) * 360) / count - 90;
                      const fill = WHEEL_PALETTE[idx % WHEEL_PALETTE.length];

                      return (
                        <g key={p.id}>
                          <path
                            d={d}
                            fill={fill}
                            stroke="#D4D4D8"
                            strokeWidth="1"
                          />
                          <text
                            x={cx + radius * 0.62}
                            y={cy}
                            fill="#18181B"
                            fontSize={count > 10 ? '10' : '12'}
                            fontWeight="700"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            transform={`rotate(${midDeg} ${cx} ${cy})`}
                          >
                            {p.name.length > 10 ? `${p.name.slice(0, 9)}…` : p.name}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  {/* Tombol PUTAR di tengah roda */}
                  <button
                    type="button"
                    disabled={isSpinning}
                    onClick={handleSpin}
                    className="absolute inset-0 m-auto w-18 h-18 rounded-full bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-bold text-xs shadow-md border-4 border-white dark:border-zinc-900 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition disabled:opacity-70"
                  >
                    <RotateCw className={`w-4 h-4 ${isSpinning ? 'animate-spin' : ''}`} />
                    <span>{isSpinning ? '...' : 'PUTAR'}</span>
                  </button>
                </div>
              </div>

              {/* Indikator nama yang sedang ditunjuk jarum */}
              <div className="mt-2 text-center">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {isSpinning ? 'Mengacak...' : drawnResult ? 'Pemain Pertama Terpilih:' : 'Siap diputar'}
                </span>
                {pointedPlayer && (isSpinning || drawnResult) && (
                  <div className="text-sm font-bold text-zinc-900 dark:text-white">
                    {pointedPlayer.name}
                  </div>
                )}
              </div>
            </div>

            {/* Hasil Undian */}
            {drawnResult && (
              <div
                ref={resultRef}
                className="rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-3"
              >
                <div className="text-xs font-bold text-zinc-900 dark:text-white">
                  Yang Main Sekarang (Siap Taruh di Papan Skor):
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2.5">
                    <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 mb-1.5">
                      Tim A
                    </div>
                    <div className="space-y-1.5">
                      {drawnResult.teamAIds.map((id) => {
                        const p = playerMap.get(id);
                        return (
                          <div key={id} className="flex items-center gap-2">
                            <PlayerAvatar
                              name={p?.name ?? '?'}
                              avatarUrl={p?.avatarUrl}
                              avatarColor={p?.avatarColor ?? '#3f3f46'}
                              size="xs"
                            />
                            <span className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                              {p?.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2.5">
                    <div className="text-[11px] font-bold text-blue-800 dark:text-blue-400 mb-1.5">
                      Tim B
                    </div>
                    <div className="space-y-1.5">
                      {drawnResult.teamBIds.map((id) => {
                        const p = playerMap.get(id);
                        return (
                          <div key={id} className="flex items-center gap-2">
                            <PlayerAvatar
                              name={p?.name ?? '?'}
                              avatarUrl={p?.avatarUrl}
                              avatarColor={p?.avatarColor ?? '#3f3f46'}
                              size="xs"
                            />
                            <span className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                              {p?.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {drawnResult.queueIds.length > 0 && (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Antrean:{' '}
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {drawnResult.queueIds
                        .map((id, i) => `${i + 1}. ${playerMap.get(id)?.name ?? '?'}`)
                        .join(', ')}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={isSpinning}
                onClick={handleSpin}
                className="min-h-[46px] px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 font-semibold text-sm text-zinc-800 dark:text-zinc-200 flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Shuffle className="w-4 h-4" />
                {drawnResult ? 'Putar Ulang' : 'Mulai Putar'}
              </button>
              <button
                type="button"
                disabled={!drawnResult || isSpinning}
                onClick={() => {
                  if (!drawnResult) return;
                  onApplyResult({
                    scope,
                    teamAIds: drawnResult.teamAIds,
                    teamBIds: drawnResult.teamBIds,
                    queueIds: drawnResult.queueIds,
                  });
                  onClose();
                }}
                className="flex-1 min-h-[46px] rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-40 font-semibold text-sm text-white dark:text-zinc-900 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Taruh di Papan Skor & Main
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
