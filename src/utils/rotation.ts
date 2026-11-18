import type {
  ActiveCourtMatch,
  Player,
  RotationSettings,
  TournamentMatch,
} from '../types/smashboard';

/**
 * Membuat kunci pasangan yang konsisten (tidak tergantung urutan A-B atau B-A)
 * untuk melacak apakah dua pemain baru saja berpasangan pada pertandingan sebelumnya.
 */
export function buatKunciPasangan(id1: string, id2: string): string {
  return id1 < id2 ? `${id1}::${id2}` : `${id2}::${id1}`;
}

/**
 * Mengambil seluruh pemain yang berstatus 'aktif'.
 * Pemain dengan status 'istirahat' atau 'pulang' otomatis dilewati.
 */
export function ambilPemainAktif(players: Player[]): Player[] {
  return players.filter((p) => p.status === 'aktif');
}

/**
 * Mengacak urutan array menggunakan algoritma Fisher-Yates (tidak mengubah array asli).
 */
export function acakArray<T>(items: readonly T[]): T[] {
  const hasil = [...items];
  for (let i = hasil.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [hasil[i], hasil[j]] = [hasil[j], hasil[i]];
  }
  return hasil;
}

/**
 * Mengurutkan kandidat pemain berdasarkan prioritas keadilan:
 * 1. Jumlah game yang dimainkan paling sedikit (`gamesPlayedSession` terkecil).
 * 2. Waktu tunggu paling lama (`waitingSince` terkecil / paling awal masuk antrean).
 */
export function urutkanPrioritasKeadilan(
  candidateIds: string[],
  playerMap: Map<string, Player>
): string[] {
  return [...candidateIds].sort((a, b) => {
    const pA = playerMap.get(a);
    const pB = playerMap.get(b);
    if (!pA || !pB) return 0;
    if (pA.gamesPlayedSession !== pB.gamesPlayedSession) {
      return pA.gamesPlayedSession - pB.gamesPlayedSession;
    }
    return pA.waitingSince - pB.waitingSince;
  });
}

/**
 * Membentuk 2 pasangan (Tim A & Tim B) dari tepat 4 ID pemain dengan menghindari
 * pengulangan pasangan yang sama berturut-turut jika memungkinkan.
 */
export function bentukPasanganAdilDariEmpat(
  fourIds: [string, string, string, string],
  recentPairKeys: string[],
  forceShuffle: boolean
): { teamA: [string, string]; teamB: [string, string] } {
  const [p0, p1, p2, p3] = fourIds;
  // Ada 3 kemungkinan cara membagi 4 pemain menjadi 2 tim ganda:
  const opsiKombinasi: Array<{ teamA: [string, string]; teamB: [string, string] }> = [
    { teamA: [p0, p1], teamB: [p2, p3] },
    { teamA: [p0, p2], teamB: [p1, p3] },
    { teamA: [p0, p3], teamB: [p1, p2] },
  ];

  const recentSet = new Set(recentPairKeys.slice(-4));
  // Hitung penalti jika pasangan baru saja main bareng di pertandingan sebelumnya
  const skorPenalti = (opsi: { teamA: [string, string]; teamB: [string, string] }) => {
    let penalti = 0;
    if (recentSet.has(buatKunciPasangan(opsi.teamA[0], opsi.teamA[1]))) penalti += 1;
    if (recentSet.has(buatKunciPasangan(opsi.teamB[0], opsi.teamB[1]))) penalti += 1;
    return penalti;
  };

  if (forceShuffle) {
    const teracak = acakArray(opsiKombinasi);
    teracak.sort((a, b) => skorPenalti(a) - skorPenalti(b));
    return teracak[0];
  }

  // Jika tidak diacak paksa, tetap pilih kombinasi yang menghindari pasangan kembar berturut-turut
  const terurut = [...opsiKombinasi].sort((a, b) => skorPenalti(a) - skorPenalti(b));
  return terurut[0];
}

/**
 * Membuat objek pertandingan kosong untuk lapangan tertentu.
 */
export function buatPertandinganBaru(
  courtNumber: 1 | 2,
  teamAIds: [string, string],
  teamBIds: [string, string],
  streakTeam: 'A' | 'B' | null = null,
  consecutiveWins = 0
): ActiveCourtMatch {
  return {
    courtNumber,
    teamAIds,
    teamBIds,
    streakTeam,
    consecutiveWins,
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
    startedAt: Date.now(),
    shuttleCountThisMatch: 0,
    undoStack: [],
    winner: null,
  };
}

/**
 * Menyinkronkan daftar antrean (`queueIds`) dengan daftar pemain aktif saat ini.
 * - Menghapus pemain yang sedang berada di lapangan atau berstatus Istirahat/Pulang.
 * - Menambahkan pemain aktif baru yang belum masuk lapangan maupun antrean ke belakang antrean.
 */
export function sinkronkanAntreanDenganPemain(
  players: Player[],
  currentQueueIds: string[],
  courts: ActiveCourtMatch[]
): string[] {
  const aktifSet = new Set(ambilPemainAktif(players).map((p) => p.id));
  const diLapanganSet = new Set<string>();
  for (const c of courts) {
    c.teamAIds.forEach((id) => diLapanganSet.add(id));
    c.teamBIds.forEach((id) => diLapanganSet.add(id));
  }

  // Pertahankan urutan antrean yang sudah ada untuk pemain yang masih aktif & tidak di lapangan
  const antreanBaru: string[] = [];
  const sudahAda = new Set<string>();

  for (const id of currentQueueIds) {
    if (aktifSet.has(id) && !diLapanganSet.has(id) && !sudahAda.has(id)) {
      antreanBaru.push(id);
      sudahAda.add(id);
    }
  }

  // Tambahkan pemain aktif yang baru hadir atau baru selesai istirahat ke belakang antrean
  for (const p of players) {
    if (p.status === 'aktif' && !diLapanganSet.has(p.id) && !sudahAda.has(p.id)) {
      antreanBaru.push(p.id);
      sudahAda.add(p.id);
    }
  }

  return antreanBaru;
}

export interface RotationResult {
  nextMatch: ActiveCourtMatch | null;
  nextQueueIds: string[];
  alasanRotasi: string;
}

/**
 * Menginisialisasi pertandingan awal dari daftar antrean pemain aktif.
 * Jika mode `random`, 4 pemain atau seluruh antrean diacak terlebih dahulu.
 */
export function bentukPertandinganPertama(
  courtNumber: 1 | 2,
  players: Player[],
  queueIds: string[],
  courts: ActiveCourtMatch[],
  settings: RotationSettings,
  recentPairKeys: string[]
): RotationResult {
  const antreanBersih = sinkronkanAntreanDenganPemain(players, queueIds, courts);

  if (antreanBersih.length < 4) {
    return {
      nextMatch: null,
      nextQueueIds: antreanBersih,
      alasanRotasi: `Butuh minimal 4 pemain aktif untuk memulai Lapangan ${courtNumber}.`,
    };
  }

  const kandidat =
    settings.firstMatchMode === 'random' ? acakArray(antreanBersih) : [...antreanBersih];

  const empatTerpilih = kandidat.slice(0, 4) as [string, string, string, string];
  const sisaAntrean = kandidat.slice(4);

  const { teamA, teamB } =
    settings.firstMatchMode === 'random'
      ? bentukPasanganAdilDariEmpat(empatTerpilih, recentPairKeys, true)
      : {
          teamA: [empatTerpilih[0], empatTerpilih[1]] as [string, string],
          teamB: [empatTerpilih[2], empatTerpilih[3]] as [string, string],
        };

  return {
    nextMatch: buatPertandinganBaru(courtNumber, teamA, teamB, null, 0),
    nextQueueIds: sisaAntrean,
    alasanRotasi:
      settings.firstMatchMode === 'random'
        ? 'Pertandingan awal dibentuk secara acak dari pemain aktif.'
        : 'Pertandingan awal mengambil 4 pemain terdepan dari antrean.',
  };
}

/**
 * INTI SISTEM ROTASI OTOMATIS:
 * Menghitung siapa yang lanjut main, siapa yang masuk antrean belakang, dan siapa yang masuk lapangan
 * setelah sebuah pertandingan selesai.
 *
 * Aturan yang ditangani:
 * 1. Tim kalah selalu keluar ke belakang antrean.
 * 2. Tim menang bertahan (maksimal sesuai `maxConsecutiveWins`, default 2x).
 *    Jika sudah mencapai batas kemenangan beruntun, tim menang juga ikut keluar ke belakang antrean!
 * 3. Pengaturan `winnerPairPolicy`: tetap berpasangan atau dipisah/diacak dengan pemain baru.
 * 4. Kasus khusus tepat 4 pemain aktif: rematch terus dengan opsi acak ulang pasangan.
 * 5. Kasus khusus 5 atau 6 pemain aktif (atau antrean tersisa hanya 1 orang saat butuh 2 orang):
 *    gabungkan 1 pemain yang menunggu dengan 1 pemain dari tim yang baru keluar
 *    (prioritaskan yang paling sedikit main & paling lama tidak istirahat) + berikan penjelasan di layar.
 * 6. Kasus 7+ pemain: antrean normal, dan saat 4 pemain baru masuk tetap hindari pasangan sama berturut-turut.
 */
export function prosesRotasiSetelahPertandingan(
  finishedMatch: ActiveCourtMatch,
  winner: 'A' | 'B',
  players: Player[],
  currentQueueIds: string[],
  otherCourts: ActiveCourtMatch[],
  settings: RotationSettings,
  recentPairKeys: string[]
): RotationResult {
  const playerMap = new Map(players.map((p) => [p.id, p]));

  // Pastikan hanya pemain berstatus 'aktif' yang ikut rotasi
  const aktifFilter = (ids: string[]) => ids.filter((id) => playerMap.get(id)?.status === 'aktif');

  const winnerIdsRaw = winner === 'A' ? finishedMatch.teamAIds : finishedMatch.teamBIds;
  const loserIdsRaw = winner === 'A' ? finishedMatch.teamBIds : finishedMatch.teamAIds;

  const winnerActive = aktifFilter(winnerIdsRaw);
  const loserActive = aktifFilter(loserIdsRaw);

  // Hitung kemenangan beruntun tim pemenang
  const wasSameWinner = finishedMatch.streakTeam === winner;
  const newWinStreak = wasSameWinner ? finishedMatch.consecutiveWins + 1 : 1;
  const winnerReachedMaxStreak = newWinStreak >= settings.maxConsecutiveWins;

  // Bersihkan antrean saat ini agar hanya berisi pemain aktif yang tidak sedang bermain di lapangan lain
  const onOtherCourts = new Set<string>();
  for (const oc of otherCourts) {
    oc.teamAIds.forEach((id) => onOtherCourts.add(id));
    oc.teamBIds.forEach((id) => onOtherCourts.add(id));
  }
  const onThisCourt = new Set([...finishedMatch.teamAIds, ...finishedMatch.teamBIds]);
  const waitingQueue = currentQueueIds.filter(
    (id) =>
      playerMap.get(id)?.status === 'aktif' && !onOtherCourts.has(id) && !onThisCourt.has(id)
  );

  // Tambahkan pemain aktif baru yang mungkin belum masuk list antrean
  for (const p of players) {
    if (
      p.status === 'aktif' &&
      !onOtherCourts.has(p.id) &&
      !onThisCourt.has(p.id) &&
      !waitingQueue.includes(p.id)
    ) {
      waitingQueue.push(p.id);
    }
  }

  const totalTersediaUntukLapanganIni =
    waitingQueue.length + winnerActive.length + loserActive.length;

  // Edge case: Kurang dari 4 pemain aktif yang tersedia
  if (totalTersediaUntukLapanganIni < 4) {
    const semuaKembaliKeAntrean = [...waitingQueue, ...winnerActive, ...loserActive];
    return {
      nextMatch: null,
      nextQueueIds: semuaKembaliKeAntrean,
      alasanRotasi: `Butuh minimal 4 pemain aktif (saat ini hanya ${totalTersediaUntukLapanganIni} pemain aktif tersedia).`,
    };
  }

  // KASUS KHUSUS 1: Tepat 4 pemain aktif (tidak ada antrean) -> Rematch terus
  if (waitingQueue.length === 0) {
    const empatPemain = [...winnerActive, ...loserActive] as [string, string, string, string];
    if (settings.shuffle4Players) {
      const { teamA, teamB } = bentukPasanganAdilDariEmpat(empatPemain, recentPairKeys, true);
      return {
        nextMatch: buatPertandinganBaru(finishedMatch.courtNumber, teamA, teamB, null, 0),
        nextQueueIds: [],
        alasanRotasi:
          'Tepat 4 pemain aktif (tanpa antrean): pasangan diacak ulang agar pertandingan tetap adil dan seru.',
      };
    } else {
      return {
        nextMatch: buatPertandinganBaru(
          finishedMatch.courtNumber,
          [winnerActive[0], winnerActive[1]],
          [loserActive[0], loserActive[1]],
          winner === 'A' ? 'A' : 'B',
          winnerReachedMaxStreak ? 0 : newWinStreak
        ),
        nextQueueIds: [],
        alasanRotasi: 'Tepat 4 pemain aktif: tanding ulang langsung dengan formasi yang sama.',
      };
    }
  }

  // Tentukan apakah tim pemenang lanjut bertahan atau ikut keluar karena batas streak tercapai
  // Catatan: Jika hanya ada 1 orang di antrean & pemenang mencapai batas streak,
  // cek dulu apakah ada cukup pemain untuk ganti 4 orang. Jika total pemain 5 atau 6, tidak mungkin ganti 4 orang baru sekaligus!
  const canSwapAllFour = waitingQueue.length >= 4;
  const bothTeamsExit = winnerReachedMaxStreak && totalTersediaUntukLapanganIni >= 5;

  if (bothTeamsExit) {
    if (canSwapAllFour) {
      // KASUS NORMAL (8+ pemain, antrean >= 4): Tim menang sudah capai batas streak -> kedua tim keluar, 4 pemain baru masuk
      const fourIn = waitingQueue.slice(0, 4) as [string, string, string, string];
      const remainingQueue = waitingQueue.slice(4);
      const { teamA, teamB } = bentukPasanganAdilDariEmpat(fourIn, recentPairKeys, false);

      // Tim kalah keluar lebih dulu atau bergantian ke belakang antrean
      const nextQueue = [...remainingQueue, ...loserActive, ...winnerActive];
      return {
        nextMatch: buatPertandinganBaru(finishedMatch.courtNumber, teamA, teamB, null, 0),
        nextQueueIds: nextQueue,
        alasanRotasi: `Tim pemenang mencapai batas ${settings.maxConsecutiveWins}x menang beruntun. Kedua tim istirahat ke belakang antrean, 4 pemain berikutnya masuk.`,
      };
    } else {
      // KASUS KHUSUS (5–7 pemain): Tim pemenang capai batas streak, tetapi antrean kurang dari 4 orang!
      // Tim yang sudah mencapai batas menang beruntun WAJIB keluar lebih dulu ke antrean!
      // Ambil seluruh antrean yang menunggu, lalu lengkapi kekurangannya dari tim kalah dulu
      // (baru ambil dari tim pemenang jika antrean hanya 1 orang / total 5 pemain).
      const needFromCourt = 4 - waitingQueue.length;
      const loserTerurut = urutkanPrioritasKeadilan(loserActive, playerMap);
      const winnerTerurut = urutkanPrioritasKeadilan(winnerActive, playerMap);
      const poolDariLapangan = [...loserTerurut, ...winnerTerurut];

      const bertahanUntukLengkapi = poolDariLapangan.slice(0, needFromCourt);
      const keluarKeAntrean = poolDariLapangan.slice(needFromCourt);

      const fourIn = [...waitingQueue, ...bertahanUntukLengkapi] as [
        string,
        string,
        string,
        string,
      ];

      // Untuk 5 pemain (1 antre): pasangkan pemain baru dengan 1 mantan pemenang vs tim kalah.
      // Untuk 6-7 pemain: pasangkan pemain yang baru masuk dari antrean terlebih dahulu.
      const teamA: [string, string] =
        waitingQueue.length === 1 ? [fourIn[0], fourIn[3]] : [fourIn[0], fourIn[1]];
      const teamB: [string, string] =
        waitingQueue.length === 1 ? [fourIn[1], fourIn[2]] : [fourIn[2], fourIn[3]];

      const namaMasuk = waitingQueue
        .map((id) => playerMap.get(id)?.name ?? '')
        .filter(Boolean)
        .join(', ');
      const namaKeluar = keluarKeAntrean
        .map((id) => playerMap.get(id)?.name ?? '')
        .filter(Boolean)
        .join(', ');

      return {
        nextMatch: buatPertandinganBaru(finishedMatch.courtNumber, teamA, teamB, null, 0),
        nextQueueIds: keluarKeAntrean,
        alasanRotasi: `Tim pemenang sudah ${settings.maxConsecutiveWins}x menang beruntun dan harus ganti! ${namaKeluar} istirahat ke antrean, ${namaMasuk} masuk ke lapangan.`,
      };
    }
  }

  // KASUS TIM PEMENANG BERTAHAN (belum mencapai batas streak)
  // Jika ada pemain tim pemenang yang tiba-tiba istirahat/pulang (winnerActive.length < 2),
  // kita hanya butuh mengisi kekosongan sampai genap 4 pemain.
  const slotsNeeded = 4 - winnerActive.length; // normalnya 2

  if (waitingQueue.length >= slotsNeeded) {
    // Antrean cukup untuk menggantikan tim yang kalah (misal 6+ pemain total)
    const challengers = waitingQueue.slice(0, slotsNeeded);
    const remainingQueue = waitingQueue.slice(slotsNeeded);
    const nextQueue = [...remainingQueue, ...loserActive];

    if (
      settings.winnerPairPolicy === 'stay_together' &&
      winnerActive.length === 2 &&
      challengers.length === 2
    ) {
      const winnerNames = winnerActive.map((id) => playerMap.get(id)?.name).join(' & ');
      return {
        nextMatch: buatPertandinganBaru(
          finishedMatch.courtNumber,
          [winnerActive[0], winnerActive[1]],
          [challengers[0], challengers[1]],
          'A',
          newWinStreak
        ),
        nextQueueIds: nextQueue,
        alasanRotasi: `Tim pemenang (${winnerNames}) lanjut main (${newWinStreak}/${settings.maxConsecutiveWins} menang beruntun) melawan 2 penantang terdepan dari antrean.`,
      };
    } else {
      // Kebijakan: Pasangan pemenang dipisah dan dipasangkan dengan pemain baru dari antrean
      const fourIn = [...winnerActive, ...challengers] as [string, string, string, string];
      // Paksa pemisahan pasangan pemenang jika memungkinkan
      const opsiSplit: Array<{ teamA: [string, string]; teamB: [string, string] }> = [
        { teamA: [fourIn[0], fourIn[2]], teamB: [fourIn[1], fourIn[3]] },
        { teamA: [fourIn[0], fourIn[3]], teamB: [fourIn[1], fourIn[2]] },
      ];
      const recentSet = new Set(recentPairKeys.slice(-4));
      opsiSplit.sort((a, b) => {
        const pA =
          (recentSet.has(buatKunciPasangan(a.teamA[0], a.teamA[1])) ? 1 : 0) +
          (recentSet.has(buatKunciPasangan(a.teamB[0], a.teamB[1])) ? 1 : 0);
        const pB =
          (recentSet.has(buatKunciPasangan(b.teamA[0], b.teamA[1])) ? 1 : 0) +
          (recentSet.has(buatKunciPasangan(b.teamB[0], b.teamB[1])) ? 1 : 0);
        return pA - pB;
      });
      return {
        nextMatch: buatPertandinganBaru(
          finishedMatch.courtNumber,
          opsiSplit[0].teamA,
          opsiSplit[0].teamB,
          null,
          0
        ),
        nextQueueIds: nextQueue,
        alasanRotasi:
          'Pemain pemenang lanjut bermain namun dipisah dan dipasangkan ulang dengan pemain baru dari antrean agar bervariasi.',
      };
    }
  } else {
    // KASUS KHUSUS 5 PEMAIN (atau antrean hanya tersisa 1 orang saat tim kalah keluar):
    // Tim menang tetap lanjut berpasangan. Dari tim yang kalah, 1 pemain dengan main terbanyak
    // keluar ke antrean untuk digantikan pemain yang sedang menunggu di antrean.
    const challengersFromQueue = [...waitingQueue];
    const masihKurang = slotsNeeded - challengersFromQueue.length;
    const loserTerurutAdil = urutkanPrioritasKeadilan(loserActive, playerMap);
    const dipilihDariTimKalah = loserTerurutAdil.slice(0, masihKurang);
    const keluarKeAntrean = loserTerurutAdil.slice(masihKurang);

    const penantangLengkap = [...challengersFromQueue, ...dipilihDariTimKalah];
    const namaAntre = challengersFromQueue
      .map((id) => playerMap.get(id)?.name ?? '')
      .filter(Boolean)
      .join(', ');
    const namaKeluar = keluarKeAntrean
      .map((id) => playerMap.get(id)?.name ?? '')
      .filter(Boolean)
      .join(', ');

    if (
      settings.winnerPairPolicy === 'stay_together' &&
      winnerActive.length === 2 &&
      penantangLengkap.length === 2
    ) {
      const winnerNames = winnerActive.map((id) => playerMap.get(id)?.name).join(' & ');
      return {
        nextMatch: buatPertandinganBaru(
          finishedMatch.courtNumber,
          [winnerActive[0], winnerActive[1]],
          [penantangLengkap[0], penantangLengkap[1]],
          'A',
          newWinStreak
        ),
        nextQueueIds: keluarKeAntrean,
        alasanRotasi: `Tim pemenang (${winnerNames}) lanjut (${newWinStreak}/${settings.maxConsecutiveWins}). Dari tim kalah, ${namaKeluar} istirahat dan digantikan ${namaAntre} dari antrean.`,
      };
    }

    const fourIn = [...winnerActive, ...penantangLengkap] as [string, string, string, string];
    const { teamA, teamB } = bentukPasanganAdilDariEmpat(fourIn, recentPairKeys, false);
    return {
      nextMatch: buatPertandinganBaru(finishedMatch.courtNumber, teamA, teamB, null, 0),
      nextQueueIds: keluarKeAntrean,
      alasanRotasi: `${namaKeluar} (kalah) gantian keluar ke antrean dan digantikan ${namaAntre}.`,
    };
  }
}

/**
 * Menghasilkan pratinjau siapa 4 pemain yang akan bermain di pertandingan BERIKUTNYA
 * (berdasarkan asumsi pemenang sementara atau tim yang unggul, atau menampilkan kedua skenario secara ringkas).
 */
export function pratinjauPertandinganBerikutnya(
  currentMatch: ActiveCourtMatch,
  players: Player[],
  queueIds: string[],
  otherCourts: ActiveCourtMatch[],
  settings: RotationSettings,
  recentPairKeys: string[]
): {
  playerIds: string[];
  teamAIds: [string, string] | null;
  teamBIds: [string, string] | null;
  keterangan: string;
} {
  // Simulasikan tim yang sedang unggul (default Tim A jika seri)
  const assumedWinner: 'A' | 'B' = currentMatch.scoreB > currentMatch.scoreA ? 'B' : 'A';
  const sim = prosesRotasiSetelahPertandingan(
    currentMatch,
    assumedWinner,
    players,
    queueIds,
    otherCourts,
    settings,
    recentPairKeys
  );

  if (!sim.nextMatch) {
    return {
      playerIds: [],
      teamAIds: null,
      teamBIds: null,
      keterangan: sim.alasanRotasi,
    };
  }

  return {
    playerIds: [...sim.nextMatch.teamAIds, ...sim.nextMatch.teamBIds],
    teamAIds: sim.nextMatch.teamAIds,
    teamBIds: sim.nextMatch.teamBIds,
    keterangan: sim.alasanRotasi,
  };
}

/**
 * Menukar salah satu pemain di lapangan dengan pemain dari antrean (tombol "Skip / Tukar").
 */
export function tukarPemainLapanganDenganAntrean(
  match: ActiveCourtMatch,
  courtPlayerId: string,
  replacementPlayerId: string,
  queueIds: string[]
): { updatedMatch: ActiveCourtMatch; updatedQueueIds: string[] } {
  const newTeamA: [string, string] = [
    match.teamAIds[0] === courtPlayerId ? replacementPlayerId : match.teamAIds[0],
    match.teamAIds[1] === courtPlayerId ? replacementPlayerId : match.teamAIds[1],
  ];
  const newTeamB: [string, string] = [
    match.teamBIds[0] === courtPlayerId ? replacementPlayerId : match.teamBIds[0],
    match.teamBIds[1] === courtPlayerId ? replacementPlayerId : match.teamBIds[1],
  ];

  // Pemain pengganti keluar dari antrean; pemain yang diganti masuk ke antrean depan agar tidak kehilangan giliran
  const filteredQueue = queueIds.filter((id) => id !== replacementPlayerId);
  const updatedQueueIds = [courtPlayerId, ...filteredQueue];

  return {
    updatedMatch: {
      ...match,
      teamAIds: newTeamA,
      teamBIds: newTeamB,
    },
    updatedQueueIds,
  };
}

/**
 * Membuat jadwal Turnamen Mini (Round Robin ganda santai) dari pemain aktif yang tersedia.
 * Menggenerasikan pasangan pertandingan 2 vs 2 secara bergiliran agar setiap pemain bertemu lawan yang beragam.
 */
export function buatJadwalTurnamenMini(activePlayers: Player[]): TournamentMatch[] {
  if (activePlayers.length < 4) return [];
  const ids = acakArray(activePlayers.map((p) => p.id));
  const matches: TournamentMatch[] = [];

  // Buat putaran round-robin kombinasi pasangan unik maksimal 8 ronde agar ringan untuk mabar santai
  const totalRounds = Math.min(Math.max(activePlayers.length, 4), 8);
  const usedMatchups = new Set<string>();

  for (let r = 0; r < totalRounds; r++) {
    // Rotasikan array untuk menghasilkan variasi di setiap ronde
    const rotated = [...ids.slice(r % ids.length), ...ids.slice(0, r % ids.length)];
    for (let i = 0; i + 3 < rotated.length; i += 4) {
      const a1 = rotated[i];
      const a2 = rotated[i + 2];
      const b1 = rotated[i + 1];
      const b2 = rotated[i + 3];
      const key = [buatKunciPasangan(a1, a2), buatKunciPasangan(b1, b2)].sort().join(' vs ');
      if (!usedMatchups.has(key)) {
        usedMatchups.add(key);
        matches.push({
          id: `tm_${Date.now()}_${matches.length}`,
          round: matches.length + 1,
          teamAIds: [a1, a2],
          teamBIds: [b1, b2],
          scoreA: null,
          scoreB: null,
          completed: false,
        });
      }
    }
  }

  // Fallback jika kombinasi masih sedikit (misal tepat 4 atau 5 pemain), buat 4 pertandingan acak variasi pasangan
  if (matches.length < 3) {
    for (let k = matches.length; k < 4; k++) {
      const shuffled = acakArray(ids);
      matches.push({
        id: `tm_${Date.now()}_${k}`,
        round: k + 1,
        teamAIds: [shuffled[0], shuffled[1]],
        teamBIds: [shuffled[2], shuffled[3]],
        scoreA: null,
        scoreB: null,
        completed: false,
      });
    }
  }

  return matches;
}
