import type { AppState, MatchRecord, Player, SavedGroupMember } from '../types/smashboard';
import { bentukPertandinganPertama } from './rotation';

export const STORAGE_KEY = 'smashboard_state_v1';

export const AVATAR_COLORS = [
  '#059669', // Emerald
  '#0284C7', // Sky
  '#D97706', // Amber
  '#E11D48', // Rose
  '#7C3AED', // Violet
  '#0D9488', // Teal
  '#EA580C', // Orange
  '#4F46E5', // Indigo
];

export function pickRandomAvatarColor(seed?: string): string {
  if (seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
  }
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function createPlayer(
  name: string,
  opts?: Partial<Omit<Player, 'id' | 'name'>>
): Player {
  const now = Date.now();
  return {
    id: opts?.avatarColor ? `p_${now}_${Math.random().toString(36).slice(2, 7)}` : `p_${now}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    avatarUrl: opts?.avatarUrl,
    avatarColor: opts?.avatarColor ?? pickRandomAvatarColor(name),
    status: opts?.status ?? 'aktif',
    gamesPlayedSession: opts?.gamesPlayedSession ?? 0,
    winsSession: opts?.winsSession ?? 0,
    lossesSession: opts?.lossesSession ?? 0,
    pointsSession: opts?.pointsSession ?? 0,
    currentStreak: opts?.currentStreak ?? 0,
    bestStreakSession: opts?.bestStreakSession ?? 0,
    waitingSince: opts?.waitingSince ?? now,
    allTimeGames: opts?.allTimeGames ?? 0,
    allTimeWins: opts?.allTimeWins ?? 0,
    allTimeLosses: opts?.allTimeLosses ?? 0,
    allTimePoints: opts?.allTimePoints ?? 0,
    allTimeBestStreak: opts?.allTimeBestStreak ?? 0,
  };
}

export function createInitialState(): AppState {
  const now = Date.now();
  const sampleNames = ['Budi', 'Andi', 'Rina', 'Sari', 'Dimas', 'Fajar'];
  const samplePlayers: Player[] = sampleNames.map((name, idx) => ({
    id: `p_sample_${idx + 1}`,
    name,
    avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length],
    status: 'aktif',
    gamesPlayedSession: 0,
    winsSession: 0,
    lossesSession: 0,
    pointsSession: 0,
    currentStreak: 0,
    bestStreakSession: 0,
    waitingSince: now + idx * 100,
    allTimeGames: 0,
    allTimeWins: 0,
    allTimeLosses: 0,
    allTimePoints: 0,
    allTimeBestStreak: 0,
  }));

  const savedGroup: SavedGroupMember[] = samplePlayers.map((p) => ({
    id: `grp_${p.id}`,
    name: p.name,
    avatarColor: p.avatarColor,
    allTimeGames: 0,
    allTimeWins: 0,
    allTimeLosses: 0,
    allTimePoints: 0,
    allTimeBestStreak: 0,
  }));

  const rotationSettings = {
    maxConsecutiveWins: 2,
    winnerPairPolicy: 'stay_together' as const,
    shuffle4Players: true,
    firstMatchMode: 'random' as const,
    autoShuffleOnAdd: true,
    targetSessionMatches: null as number | null,
    courtCount: 1 as const,
  };

  const first = bentukPertandinganPertama(
    1,
    samplePlayers,
    samplePlayers.map((p) => p.id),
    [],
    rotationSettings,
    []
  );

  return {
    theme: 'light',
    sessionStartedAt: now,
    players: samplePlayers,
    savedGroup,
    queueIds: first.nextQueueIds,
    lastRotationNote:
      'Sesi siap dengan 6 pemain contoh yang sudah diacak. 4 pemain di lapangan, 2 pemain di antrean.',
    recentPairKeys: [],
    courts: first.nextMatch ? [first.nextMatch] : [],
    matchHistory: [],
    allTimeMatchHistory: [],
    scoringSettings: {
      targetPoints: 21,
      matchFormat: 'single',
      capAt30: true,
      ttsEnabled: false,
      autoSideSwitchAlert: true,
    },
    rotationSettings,
    voiceSettings: {
      enabled: false,
      pointAKeywords: ['poin a', 'tambah a', 'skor a', 'point a'],
      pointBKeywords: ['poin b', 'tambah b', 'skor b', 'point b'],
      minusAKeywords: ['kurang a', 'min a', 'minus a'],
      minusBKeywords: ['kurang b', 'min b', 'minus b'],
      undoKeywords: ['undo', 'batal', 'ulang'],
    },
    expenseSettings: {
      courtPricePerHour: 60000,
      courtHours: 2,
      shuttlePricePerUnit: 15000,
      shuttleCount: 2,
      splitMode: 'equal',
      excludedFromSplitIds: [],
    },
    rentalReminder: {
      active: false,
      durationMinutes: 120,
      startedAt: null,
      alerted10Min: false,
      alertedEnded: false,
    },
    tournament: {
      active: false,
      matches: [],
      createdAt: now,
    },
    quickNotes: '',
    duoStats: {},
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const defaults = createInitialState();
    const migratedFlagKey = 'smashboard_light_default_v1';
    let resolvedTheme = parsed.theme ?? defaults.theme;
    if (!localStorage.getItem(migratedFlagKey)) {
      resolvedTheme = 'light';
      localStorage.setItem(migratedFlagKey, '1');
    }
    return {
      ...defaults,
      ...parsed,
      theme: resolvedTheme,
      scoringSettings: { ...defaults.scoringSettings, ...parsed.scoringSettings },
      rotationSettings: { ...defaults.rotationSettings, ...parsed.rotationSettings },
      voiceSettings: { ...defaults.voiceSettings, ...parsed.voiceSettings },
      expenseSettings: { ...defaults.expenseSettings, ...parsed.expenseSettings },
      rentalReminder: { ...defaults.rentalReminder, ...parsed.rentalReminder },
      tournament: { ...defaults.tournament, ...parsed.tournament },
      duoStats: parsed.duoStats ?? {},
    };
  } catch {
    return createInitialState();
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Gagal menyimpan ke localStorage:', err);
  }
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Mengompres foto profil yang diupload menjadi gambar persegi kecil (160x160 JPEG)
 * agar hemat ruang di localStorage.
 */
export function compressAvatarImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung.'));
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak tersedia.'));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Mengonversi file gambar menjadi base64 & mimeType untuk dikirim ke Gemini Vision.
 */
export function fileToBase64Payload(
  file: File
): Promise<{ imageBase64: string; mimeType: string; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file foto.'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        reject(new Error('Data gambar tidak valid.'));
        return;
      }
      resolve({
        mimeType: match[1],
        imageBase64: match[2],
        previewUrl: dataUrl,
      });
    };
    reader.readAsDataURL(file);
  });
}

export function exportMatchHistoryCSV(matches: MatchRecord[]): void {
  const header = ['Waktu', 'Lapangan', 'Tim A', 'Tim B', 'Skor Akhir', 'Detail Game', 'Pemenang', 'Durasi (detik)', 'Shuttlecock'];
  const rows = matches.map((m) => [
    new Date(m.timestamp).toLocaleString('id-ID'),
    `Lapangan ${m.courtNumber}`,
    m.teamANames.join(' & '),
    m.teamBNames.join(' & '),
    `${m.finalScoreA} - ${m.finalScoreB}`,
    m.gameScores.map((g) => `${g.scoreA}-${g.scoreB}`).join(' | '),
    m.winner === 'A' ? m.teamANames.join(' & ') : m.teamBNames.join(' & '),
    String(m.durationSeconds),
    String(m.shuttlesUsed),
  ]);

  const csvContent = [header, ...rows]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `smashboard-riwayat-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function generateWhatsAppSummary(state: AppState): string {
  const dateStr = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const totalMatches = state.matchHistory.length;
  const sortedPlayers = [...state.players]
    .filter((p) => p.gamesPlayedSession > 0)
    .sort((a, b) => {
      const wrA = a.gamesPlayedSession > 0 ? a.winsSession / a.gamesPlayedSession : 0;
      const wrB = b.gamesPlayedSession > 0 ? b.winsSession / b.gamesPlayedSession : 0;
      if (wrB !== wrA) return wrB - wrA;
      return b.winsSession - a.winsSession;
    });

  const lines: string[] = [
    `*REKAP MABAR SMASHBOARD*`,
    `${dateStr}`,
    `Total Pertandingan: ${totalMatches} game · Shuttlecock: ${state.expenseSettings.shuttleCount} pcs`,
    ``,
    `*KLASEMEN SESI HARI INI:*`,
  ];

  if (sortedPlayers.length === 0) {
    lines.push('Belum ada pertandingan selesai.');
  } else {
    sortedPlayers.forEach((p, idx) => {
      const wr = Math.round((p.winsSession / p.gamesPlayedSession) * 100);
      lines.push(
        `${idx + 1}. ${p.name} — ${p.winsSession}M / ${p.lossesSession}K (${wr}% · ${p.pointsSession} poin)`
      );
    });
  }

  if (state.matchHistory.length > 0) {
    lines.push(``);
    lines.push(`*RIWAYAT PERTANDINGAN:*`);
    state.matchHistory.slice(-10).forEach((m, idx) => {
      const scoreText = m.gameScores.map((g) => `${g.scoreA}-${g.scoreB}`).join(', ');
      lines.push(
        `${idx + 1}. ${m.teamANames.join(' & ')} (${scoreText}) ${m.teamBNames.join(' & ')}`
      );
    });
  }

  return lines.join('\n');
}

/**
 * Menggambar kartu rekap sesi ke Canvas dan mengunduhnya sebagai PNG siap bagikan.
 */
export function downloadRecapCardPNG(state: AppState): void {
  const width = 900;
  const topPlayers = [...state.players]
    .filter((p) => p.gamesPlayedSession > 0)
    .sort((a, b) => b.winsSession - a.winsSession || b.pointsSession - a.pointsSession)
    .slice(0, 8);

  const height = 380 + Math.max(1, topPlayers.length) * 62;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Latar belakang putih bersih
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Garis bingkai halus
  ctx.strokeStyle = '#E4E4E7';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, width - 48, height - 48);

  // Header
  ctx.fillStyle = '#047857';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('SMASHBOARD · REKAP MABAR BADMINTON', 56, 76);

  ctx.fillStyle = '#18181B';
  ctx.font = 'bold 36px sans-serif';
  const dateStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  ctx.fillText(dateStr, 56, 126);

  ctx.fillStyle = '#71717A';
  ctx.font = '20px sans-serif';
  ctx.fillText(
    `${state.matchHistory.length} Pertandingan · ${state.players.filter((p) => p.gamesPlayedSession > 0).length} Pemain · ${state.expenseSettings.shuttleCount} Shuttlecock`,
    56,
    162
  );

  // Divider
  ctx.strokeStyle = '#E4E4E7';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(56, 190);
  ctx.lineTo(width - 56, 190);
  ctx.stroke();

  // Tabel header
  ctx.fillStyle = '#71717A';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('PEMAIN', 56, 232);
  ctx.fillText('MAIN', 470, 232);
  ctx.fillText('MENANG', 580, 232);
  ctx.fillText('WIN RATE', 720, 232);

  if (topPlayers.length === 0) {
    ctx.fillStyle = '#71717A';
    ctx.font = '22px sans-serif';
    ctx.fillText('Belum ada pertandingan yang tercatat.', 56, 300);
  } else {
    topPlayers.forEach((p, idx) => {
      const y = 290 + idx * 62;
      ctx.fillStyle = idx % 2 === 0 ? '#FAFAFA' : '#FFFFFF';
      ctx.fillRect(52, y - 36, width - 104, 52);

      ctx.fillStyle = idx === 0 ? '#047857' : '#18181B';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(`${idx + 1}. ${p.name}`, 72, y);

      ctx.fillStyle = '#3F3F46';
      ctx.font = '20px monospace';
      ctx.fillText(String(p.gamesPlayedSession), 485, y);
      ctx.fillText(`${p.winsSession}M / ${p.lossesSession}K`, 575, y);

      const wr = Math.round((p.winsSession / p.gamesPlayedSession) * 100);
      ctx.fillStyle = wr >= 50 ? '#047857' : '#71717A';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`${wr}%`, 735, y);
    });
  }

  ctx.fillStyle = '#A1A1AA';
  ctx.font = '16px sans-serif';
  ctx.fillText('Dibuat dengan SmashBoard', 56, height - 48);

  const link = document.createElement('a');
  link.download = `smashboard-rekap-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
