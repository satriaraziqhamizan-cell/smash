import React, { useRef, useState } from 'react';
import {
  Camera,
  Check,
  FileText,
  ImagePlus,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { Player, PlayerStatus, SavedGroupMember } from '../types/smashboard';
import {
  compressAvatarImage,
  createPlayer,
  fileToBase64Payload,
  pickRandomAvatarColor,
} from '../utils/storage';
import { PlayerAvatar } from './PlayerAvatar';

interface PlayersTabProps {
  players: Player[];
  savedGroup: SavedGroupMember[];
  onCourtPlayerIds: Set<string>;
  currentCourtMatch?: { teamAIds: [string, string]; teamBIds: [string, string] } | null;
  autoShuffleOnAdd: boolean;
  onToggleAutoShuffleOnAdd: () => void;
  onOpenSpinWheel: () => void;
  onGoToMatch?: () => void;
  onResetAllPlayCounts: () => void;
  onAddPlayers: (newPlayers: Player[]) => void;
  onUpdatePlayerStatus: (playerId: string, status: PlayerStatus) => void;
  onUpdatePlayerAvatar: (playerId: string, avatarUrl: string | undefined) => void;
  onRenamePlayer: (playerId: string, newName: string) => void;
  onRemovePlayer: (playerId: string) => void;
  onSaveToGroup: (playersToSave: Player[]) => void;
  onRemoveFromGroup: (groupMemberId: string) => void;
  onLoadFromGroup: (members: SavedGroupMember[]) => void;
}

export const PlayersTab: React.FC<PlayersTabProps> = ({
  players,
  savedGroup,
  onCourtPlayerIds,
  currentCourtMatch,
  autoShuffleOnAdd,
  onToggleAutoShuffleOnAdd,
  onOpenSpinWheel,
  onGoToMatch,
  onResetAllPlayCounts,
  onAddPlayers,
  onUpdatePlayerStatus,
  onUpdatePlayerAvatar,
  onRenamePlayer,
  onRemovePlayer,
  onSaveToGroup,
  onRemoveFromGroup,
  onLoadFromGroup,
}) => {
  const [singleName, setSingleName] = useState('');
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [showResetCountsModal, setShowResetCountsModal] = useState(false);

  const [showScanModal, setShowScanModal] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedCandidates, setScannedCandidates] = useState<
    Array<{ id: string; name: string; checked: boolean }>
  >([]);

  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const fileImportRef = useRef<HTMLInputElement | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const avatarTargetIdRef = useRef<string | null>(null);

  const showTempFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleAddSingle = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = singleName.trim();
    if (!clean) return;
    onAddPlayers([createPlayer(clean)]);
    setSingleName('');
    showTempFeedback(`${clean} ditambahkan ke daftar hadir.`);
  };

  const handleAddBulk = () => {
    const names = bulkText
      .split(/\r?\n/)
      .map((line) => line.replace(/^\d+[.)\-\s]+/, '').trim())
      .filter((n) => n.length > 0);
    if (names.length === 0) return;
    onAddPlayers(names.map((n) => createPlayer(n)));
    setBulkText('');
    setShowBulkModal(false);
    showTempFeedback(`${names.length} pemain berhasil ditambahkan.`);
  };

  const handleTxtCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .flatMap((line) => line.split(/[,;]/))
        .map((s) => s.replace(/^["']|["']$/g, '').trim())
        .filter((s) => s.length > 0 && s.toLowerCase() !== 'nama' && s.toLowerCase() !== 'name');

      if (lines.length === 0) {
        showTempFeedback('Tidak ada nama yang ditemukan di file.');
        return;
      }
      onAddPlayers(lines.map((n) => createPlayer(n)));
      showTempFeedback(`${lines.length} pemain diimpor dari ${file.name}.`);
    } catch {
      showTempFeedback('Gagal membaca file teks/CSV.');
    }
  };

  const handleScanPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setShowScanModal(true);
    setScanLoading(true);
    setScanError(null);
    setScannedCandidates([]);

    try {
      const payload = await fileToBase64Payload(file);
      setScanPreviewUrl(payload.previewUrl);

      const res = await fetch('/api/gemini/scan-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: payload.imageBase64,
          mimeType: payload.mimeType,
        }),
      });
      const data = (await res.json()) as { names?: string[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memindai foto.');
      }
      const names = data.names ?? [];
      if (names.length === 0) {
        setScanError('Tidak ada nama pemain yang terbaca dari foto ini. Coba foto yang lebih jelas.');
      } else {
        setScannedCandidates(
          names.map((name, i) => ({
            id: `scan_${Date.now()}_${i}`,
            name,
            checked: true,
          }))
        );
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Terjadi kesalahan saat memindai foto.');
    } finally {
      setScanLoading(false);
    }
  };

  const handleConfirmScanned = () => {
    const chosen = scannedCandidates
      .filter((c) => c.checked && c.name.trim().length > 0)
      .map((c) => createPlayer(c.name.trim()));
    if (chosen.length > 0) {
      onAddPlayers(chosen);
      showTempFeedback(`${chosen.length} pemain hasil scan ditambahkan.`);
    }
    setShowScanModal(false);
  };

  const handleTriggerAvatarUpload = (playerId: string) => {
    avatarTargetIdRef.current = playerId;
    avatarInputRef.current?.click();
  };

  const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const targetId = avatarTargetIdRef.current;
    if (!file || !targetId) return;
    try {
      const compressed = await compressAvatarImage(file);
      onUpdatePlayerAvatar(targetId, compressed);
      showTempFeedback('Foto profil diperbarui.');
    } catch {
      showTempFeedback('Gagal memproses foto profil.');
    }
  };

  const openGroupModal = () => {
    const existingNames = new Set(players.map((p) => p.name.toLowerCase()));
    const preselected = new Set(
      savedGroup.filter((g) => !existingNames.has(g.name.toLowerCase())).map((g) => g.id)
    );
    setSelectedGroupIds(preselected);
    setShowGroupModal(true);
  };

  const handleLoadSelectedGroup = () => {
    const chosen = savedGroup.filter((g) => selectedGroupIds.has(g.id));
    if (chosen.length > 0) {
      onLoadFromGroup(chosen);
      showTempFeedback(`${chosen.length} pemain dari Grup Saya dimasukkan ke sesi.`);
    }
    setShowGroupModal(false);
  };

  const aktifCount = players.filter((p) => p.status === 'aktif').length;
  const istirahatCount = players.filter((p) => p.status === 'istirahat').length;
  const pulangCount = players.filter((p) => p.status === 'pulang').length;

  return (
    <div className="space-y-5 pb-6">
      <input
        ref={fileImportRef}
        type="file"
        accept=".txt,.csv,text/plain,text/csv"
        className="hidden"
        onChange={handleTxtCsvImport}
      />
      <input
        ref={scanInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleScanPhotoSelect}
      />
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarSelected}
      />

      {feedback && (
        <div className="rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-3 text-sm font-medium flex items-center justify-between shadow-sm">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="min-h-[32px] min-w-[32px] flex items-center justify-center"
            aria-label="Tutup notifikasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Daftar Hadir Pemain
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 font-mono-tabular">
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              {aktifCount} Aktif
            </span>
            <span aria-hidden="true">·</span>
            <span>{istirahatCount} Istirahat</span>
            <span aria-hidden="true">·</span>
            <span>{pulangCount} Pulang</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={aktifCount < 4}
            onClick={onOpenSpinWheel}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-40 px-4 py-2 text-sm font-semibold text-white dark:text-zinc-900 active:scale-[0.99] transition"
          >
            <RotateCw className="w-4 h-4" />
            Putar Undian
          </button>

          <button
            type="button"
            onClick={() => {
              onSaveToGroup(players);
              showTempFeedback('Daftar pemain hari ini disimpan ke Grup Saya.');
            }}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 active:scale-[0.99] transition"
          >
            <UserCheck className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
            Simpan ke Grup Saya
          </button>

          <button
            type="button"
            disabled={players.length === 0}
            onClick={() => setShowResetCountsModal(true)}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-white dark:bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40 active:scale-[0.99] transition"
          >
            <RefreshCw className="w-4 h-4" />
            Reset Main (0x)
          </button>
        </div>
      </div>

      {/* Form Tambah Cepat */}
      <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 p-4 space-y-3">
        <form onSubmit={handleAddSingle} className="flex gap-2">
          <input
            type="text"
            value={singleName}
            onChange={(e) => setSingleName(e.target.value)}
            placeholder="Ketik nama pemain baru..."
            className="flex-1 min-h-[46px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3.5 text-base text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
          />
          <button
            type="submit"
            disabled={!singleName.trim()}
            className="min-h-[46px] px-5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-40 text-white dark:text-zinc-900 font-semibold text-sm inline-flex items-center gap-2 active:scale-[0.99] transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            Tambah
          </button>
        </form>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => scanInputRef.current?.click()}
            className="min-h-[44px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-100 flex items-center justify-center gap-2 transition"
          >
            <Camera className="w-4 h-4 shrink-0 text-zinc-600 dark:text-zinc-300" />
            <span className="truncate">Scan Foto Daftar</span>
          </button>

          <button
            type="button"
            onClick={() => setShowBulkModal(true)}
            className="min-h-[44px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-100 flex items-center justify-center gap-2 transition"
          >
            <FileText className="w-4 h-4 shrink-0 text-zinc-600 dark:text-zinc-300" />
            <span className="truncate">Tempel Banyak</span>
          </button>

          <button
            type="button"
            onClick={() => fileImportRef.current?.click()}
            className="min-h-[44px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-100 flex items-center justify-center gap-2 transition"
          >
            <Upload className="w-4 h-4 shrink-0 text-zinc-600 dark:text-zinc-300" />
            <span className="truncate">Impor .txt / .csv</span>
          </button>

          <button
            type="button"
            onClick={openGroupModal}
            className="min-h-[44px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-100 flex items-center justify-center gap-2 transition"
          >
            <Users className="w-4 h-4 shrink-0 text-zinc-600 dark:text-zinc-300" />
            <span className="truncate">Grup Saya ({savedGroup.length})</span>
          </button>
        </div>

        <label className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300">
            Acak urutan pemain otomatis saat menambah pemain baru
          </span>
          <input
            type="checkbox"
            checked={autoShuffleOnAdd}
            onChange={onToggleAutoShuffleOnAdd}
            className="w-4.5 h-4.5 accent-zinc-900 dark:accent-white shrink-0"
          />
        </label>
      </section>

      {currentCourtMatch && (
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Yang Main di Lapangan 1 Sekarang
            </div>
            <div className="text-sm font-bold text-zinc-900 dark:text-white truncate">
              <span className="text-emerald-800 dark:text-emerald-400">
                {currentCourtMatch.teamAIds
                  .map((id) => players.find((p) => p.id === id)?.name ?? '?')
                  .join(' & ')}
              </span>{' '}
              <span className="text-zinc-400 font-normal">vs</span>{' '}
              <span className="text-blue-800 dark:text-blue-400">
                {currentCourtMatch.teamBIds
                  .map((id) => players.find((p) => p.id === id)?.name ?? '?')
                  .join(' & ')}
              </span>
            </div>
          </div>
          {onGoToMatch && (
            <button
              type="button"
              onClick={onGoToMatch}
              className="min-h-[42px] px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-sm font-semibold inline-flex items-center justify-center gap-2 shrink-0"
            >
              <Play className="w-4 h-4" />
              Buka Papan Skor
            </button>
          )}
        </section>
      )}

      {/* Daftar Pemain */}
      <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
        {players.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">
            <UserPlus className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-semibold text-zinc-800 dark:text-zinc-200">
              Belum ada pemain di sesi ini
            </p>
            <p className="text-sm mt-1">
              Tambahkan nama pemain di atas, scan foto catatan, atau muat dari Grup Saya.
            </p>
          </div>
        ) : (
          players.map((player) => {
            const isOnCourt = onCourtPlayerIds.has(player.id);
            const isEditing = editingPlayerId === player.id;
            return (
              <div
                key={player.id}
                className="p-3.5 sm:p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleTriggerAvatarUpload(player.id)}
                    className="relative shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full"
                    title="Ubah foto profil"
                  >
                    <PlayerAvatar
                      name={player.name}
                      avatarUrl={player.avatarUrl}
                      avatarColor={player.avatarColor}
                      size="md"
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 flex items-center justify-center border border-zinc-300 dark:border-zinc-600">
                      <ImagePlus className="w-3 h-3" />
                    </span>
                  </button>

                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && editingName.trim()) {
                              onRenamePlayer(player.id, editingName.trim());
                              setEditingPlayerId(null);
                            } else if (e.key === 'Escape') {
                              setEditingPlayerId(null);
                            }
                          }}
                          autoFocus
                          className="min-h-[38px] w-full max-w-[180px] rounded-lg border border-zinc-900 dark:border-white bg-zinc-50 dark:bg-zinc-950 px-2.5 text-sm font-semibold text-zinc-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (editingName.trim()) {
                              onRenamePlayer(player.id, editingName.trim());
                            }
                            setEditingPlayerId(null);
                          }}
                          className="min-h-[38px] min-w-[38px] rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center"
                          aria-label="Simpan nama"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPlayerId(player.id);
                          setEditingName(player.name);
                        }}
                        className="text-left font-semibold text-base text-zinc-900 dark:text-white hover:underline truncate max-w-full block"
                      >
                        {player.name}
                      </button>
                    )}

                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono-tabular">
                      <span>Main {player.gamesPlayedSession}x</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {player.winsSession}M - {player.lossesSession}K
                      </span>
                      {isOnCourt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold font-sans">
                            Di Lapangan
                          </span>
                        </>
                      )}
                      {player.avatarUrl && (
                        <>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            onClick={() => onUpdatePlayerAvatar(player.id, undefined)}
                            className="text-rose-600 hover:underline font-sans"
                          >
                            Hapus Foto
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 justify-between sm:justify-end">
                  <div
                    role="group"
                    aria-label={`Status ${player.name}`}
                    className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex-1 sm:flex-initial"
                  >
                    {(
                      [
                        { value: 'aktif', label: 'Aktif' },
                        { value: 'istirahat', label: 'Istirahat' },
                        { value: 'pulang', label: 'Pulang' },
                      ] as const
                    ).map((opt) => {
                      const active = player.status === opt.value;
                      let activeClass =
                        'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs';
                      if (active && opt.value === 'aktif') {
                        activeClass = 'bg-emerald-700 text-white shadow-xs';
                      } else if (active && opt.value === 'istirahat') {
                        activeClass = 'bg-amber-600 text-white shadow-xs';
                      } else if (active && opt.value === 'pulang') {
                        activeClass = 'bg-zinc-700 text-white shadow-xs';
                      }
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => onUpdatePlayerStatus(player.id, opt.value)}
                          className={`min-h-[38px] px-2.5 rounded-md text-xs font-semibold transition whitespace-nowrap ${
                            active
                              ? activeClass
                              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemovePlayer(player.id)}
                    className="min-h-[42px] min-w-[42px] rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center transition"
                    aria-label={`Hapus ${player.name}`}
                    title="Hapus pemain"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Modal Tempel Banyak Nama */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                Tambah Banyak Pemain
              </h2>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Tempel daftar nama dari WhatsApp atau catatan, satu nama per baris. Nomor urut otomatis dibersihkan.
            </p>
            <textarea
              rows={7}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={'1. Budi\n2. Andi\n3. Rina\n4. Sari'}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 p-3.5 text-base text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="flex-1 min-h-[46px] rounded-xl border border-zinc-300 dark:border-zinc-700 font-semibold text-sm text-zinc-700 dark:text-zinc-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleAddBulk}
                className="flex-1 min-h-[46px] rounded-xl bg-zinc-900 dark:bg-white font-semibold text-sm text-white dark:text-zinc-900"
              >
                Tambahkan Semua
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Scan Foto */}
      {showScanModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                Scan Daftar Nama dari Foto
              </h2>
              <button
                type="button"
                onClick={() => setShowScanModal(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {scanPreviewUrl && (
              <img
                src={scanPreviewUrl}
                alt="Pratinjau foto daftar nama"
                className="w-full max-h-44 object-contain rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
              />
            )}

            {scanLoading && (
              <div className="py-8 flex flex-col items-center gap-3 text-zinc-600 dark:text-zinc-300">
                <Loader2 className="w-7 h-7 animate-spin text-zinc-900 dark:text-white" />
                <p className="text-sm font-medium">Membaca daftar nama dari foto...</p>
              </div>
            )}

            {scanError && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-4 text-sm text-rose-700 dark:text-rose-300">
                {scanError}
              </div>
            )}

            {!scanLoading && scannedCandidates.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Periksa atau edit nama yang terbaca sebelum ditambahkan:
                </p>
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {scannedCandidates.map((item) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setScannedCandidates((prev) =>
                            prev.map((c) => (c.id === item.id ? { ...c, checked: !c.checked } : c))
                          )
                        }
                        className={`min-h-[42px] min-w-[42px] rounded-lg flex items-center justify-center border transition ${
                          item.checked
                            ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-zinc-900'
                            : 'border-zinc-300 dark:border-zinc-700 text-transparent'
                        }`}
                        aria-label={`Pilih ${item.name}`}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) =>
                          setScannedCandidates((prev) =>
                            prev.map((c) => (c.id === item.id ? { ...c, name: e.target.value } : c))
                          )
                        }
                        className="flex-1 min-h-[42px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm text-zinc-900 dark:text-white"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => scanInputRef.current?.click()}
                className="min-h-[46px] px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 font-semibold text-sm text-zinc-700 dark:text-zinc-200"
              >
                Foto Lain
              </button>
              <button
                type="button"
                disabled={scanLoading || scannedCandidates.filter((c) => c.checked).length === 0}
                onClick={handleConfirmScanned}
                className="flex-1 min-h-[46px] rounded-xl bg-zinc-900 dark:bg-white disabled:opacity-40 font-semibold text-sm text-white dark:text-zinc-900"
              >
                Tambahkan ({scannedCandidates.filter((c) => c.checked).length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Grup Saya */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                Grup Saya (Pemain Tetap)
              </h2>
              <button
                type="button"
                onClick={() => setShowGroupModal(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Pilih anggota grup tetap yang hadir hari ini untuk dimasukkan ke daftar hadir.
            </p>

            <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
              {savedGroup.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-500">
                  Grup Saya masih kosong. Tekan &ldquo;Simpan ke Grup Saya&rdquo; di halaman Pemain.
                </p>
              ) : (
                savedGroup.map((member) => {
                  const selected = selectedGroupIds.has(member.id);
                  const alreadyInSession = players.some(
                    (p) => p.name.toLowerCase() === member.name.toLowerCase()
                  );
                  return (
                    <div
                      key={member.id}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedGroupIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(member.id)) next.delete(member.id);
                            else next.add(member.id);
                            return next;
                          });
                        }}
                        className="flex-1 flex items-center gap-3 text-left min-h-[44px]"
                      >
                        <span
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                            selected
                              ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-zinc-900'
                              : 'border-zinc-300 dark:border-zinc-700'
                          }`}
                        >
                          {selected && <Check className="w-3.5 h-3.5" />}
                        </span>
                        <PlayerAvatar
                          name={member.name}
                          avatarUrl={member.avatarUrl}
                          avatarColor={member.avatarColor || pickRandomAvatarColor(member.name)}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-zinc-900 dark:text-white truncate">
                            {member.name}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-tabular">
                            {alreadyInSession ? 'Sudah di daftar hari ini' : `Total ${member.allTimeGames} main`}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemoveFromGroup(member.id)}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center text-zinc-400 hover:text-rose-600"
                        aria-label={`Hapus ${member.name} dari grup`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowGroupModal(false)}
                className="flex-1 min-h-[46px] rounded-xl border border-zinc-300 dark:border-zinc-700 font-semibold text-sm text-zinc-700 dark:text-zinc-200"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={selectedGroupIds.size === 0}
                onClick={handleLoadSelectedGroup}
                className="flex-1 min-h-[46px] rounded-xl bg-zinc-900 dark:bg-white disabled:opacity-40 font-semibold text-sm text-white dark:text-zinc-900"
              >
                Masukkan ({selectedGroupIds.size})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Reset Hitungan Main */}
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
                  showTempFeedback('Hitungan main semua pemain berhasil direset ke 0x.');
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
