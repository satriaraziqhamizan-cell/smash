import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceSettings } from '../types/smashboard';

export type VoiceAction =
  | { type: 'pointA' }
  | { type: 'pointB' }
  | { type: 'minusA' }
  | { type: 'minusB' }
  | { type: 'undo' }
  | { type: 'resetScore' }
  | { type: 'setScores'; scoreA?: number; scoreB?: number }
  | { type: 'recapMatch' }
  | {
      type: 'declareWinner';
      winner: 'A' | 'B';
      scoreA?: number;
      scoreB?: number;
      autoRecap: boolean;
    };

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const SPOKEN_NUMBER_WORDS: Array<[RegExp, string]> = [
  [/\btiga puluh lima\b/g, '35'],
  [/\btiga puluh empat\b/g, '34'],
  [/\btiga puluh tiga\b/g, '33'],
  [/\btiga puluh dua\b/g, '32'],
  [/\btiga puluh satu\b/g, '31'],
  [/\btiga puluh\b/g, '30'],
  [/\bdua puluh sembilan\b/g, '29'],
  [/\bdua puluh delapan\b/g, '28'],
  [/\bdua puluh tujuh\b/g, '27'],
  [/\bdua puluh enam\b/g, '26'],
  [/\bdua puluh lima\b/g, '25'],
  [/\bdua puluh empat\b/g, '24'],
  [/\bdua puluh tiga\b/g, '23'],
  [/\bdua puluh dua\b/g, '22'],
  [/\bdua puluh satu\b/g, '21'],
  [/\bdua puluh\b/g, '20'],
  [/\bsembilan belas\b/g, '19'],
  [/\bdelapan belas\b/g, '18'],
  [/\btujuh belas\b/g, '17'],
  [/\benam belas\b/g, '16'],
  [/\blima belas\b/g, '15'],
  [/\bempat belas\b/g, '14'],
  [/\btiga belas\b/g, '13'],
  [/\bdua belas\b/g, '12'],
  [/\bsebelas\b/g, '11'],
  [/\bsepuluh\b/g, '10'],
  [/\bsembilan\b/g, '9'],
  [/\bdelapan\b/g, '8'],
  [/\btujuh\b/g, '7'],
  [/\benam\b/g, '6'],
  [/\blima\b/g, '5'],
  [/\bempat\b/g, '4'],
  [/\btiga\b/g, '3'],
  [/\bdua\b/g, '2'],
  [/\bsatu\b/g, '1'],
  [/\bkosong\b/g, '0'],
  [/\bnol\b/g, '0'],
];

function normalizeIndonesianNumbers(text: string): string {
  let out = text.toLowerCase().trim();
  for (const [pattern, replacement] of SPOKEN_NUMBER_WORDS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function isValidScoreNumber(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 35;
}

export function parseVoiceTranscript(
  rawText: string,
  settings: VoiceSettings
): VoiceAction | null {
  const clean = normalizeIndonesianNumbers(rawText);

  // 0A. Cek deklarasi pemenang + opsional skor & rekap:
  // Contoh: "tim a menang", "tim b menang 21 15", "tim a menang rekap", "rekap tim b menang"
  const winMatch =
    clean.match(/\b(?:tim\s+|team\s+)?(a|b)\b(?:\s+(?:udah|sudah|yang))?\s+(?:menang|win|juara)\b/) ||
    clean.match(/\b(?:pemenang(?:nya)?|yang\s+menang)\s+(?:tim\s+|team\s+)?(a|b)\b/);

  if (winMatch) {
    const winner = winMatch[1].toUpperCase() as 'A' | 'B';
    const autoRecap = /\b(rekap|simpan|lanjut|rotasi|arsip|catat)\b/.test(clean);
    const numbers = Array.from(clean.matchAll(/\b(\d{1,2})\b/g))
      .map((m) => Number(m[1]))
      .filter(isValidScoreNumber);

    if (numbers.length >= 2) {
      const high = Math.max(numbers[0], numbers[1]);
      const low = Math.min(numbers[0], numbers[1]);
      return {
        type: 'declareWinner',
        winner,
        scoreA: winner === 'A' ? high : low,
        scoreB: winner === 'B' ? high : low,
        autoRecap,
      };
    }

    return {
      type: 'declareWinner',
      winner,
      autoRecap,
    };
  }

  // 0B. Cek perintah rekap / simpan hasil / lanjut rotasi setelah match selesai
  if (
    /\b(rekap(?:\s+(?:hasil|skor|pertandingan|sekarang|match|main))?|simpan\s+(?:hasil|skor|pertandingan|match)|pertandingan\s+selesai|match\s+selesai|selesai\s+main|sudah\s+selesai|udah\s+selesai|lanjut\s+(?:main|match|berikutnya|rotasi)|rotasi(?:\s+pemain)?|ganti\s+pemain)\b/.test(
      clean
    )
  ) {
    return { type: 'recapMatch' };
  }

  if (/\b(reset skor|ulang skor|skor ulang|0 0)\b/.test(clean)) {
    return { type: 'resetScore' };
  }

  // 1. Cek penyebutan skor spesifik untuk Tim A dan/atau Tim B
  // Contoh: "tim a 10 tim b 8", "tim a poinnya sekarang 12", "poin tim b jadi 9", "a 15 b 14"
  const teamAMatch = clean.match(
    /(?:^|[\s,])(?:(?:poin|skor|angka)\s+)?(?:tim\s+|team\s+)?a\b(?:\s+(?:poin(?:nya)?|skor(?:nya)?|angka(?:nya)?|sekarang|jadi|adalah|menjadi|udah|sudah|saat|ini|ke|di|dapat)){0,5}\s+(\d{1,2})\b/
  );
  const teamBMatch = clean.match(
    /(?:^|[\s,])(?:(?:poin|skor|angka)\s+)?(?:tim\s+|team\s+)?b\b(?:\s+(?:poin(?:nya)?|skor(?:nya)?|angka(?:nya)?|sekarang|jadi|adalah|menjadi|udah|sudah|saat|ini|ke|di|dapat)){0,5}\s+(\d{1,2})\b/
  );

  const parsedA = teamAMatch ? Number(teamAMatch[1]) : undefined;
  const parsedB = teamBMatch ? Number(teamBMatch[1]) : undefined;
  const validA = parsedA !== undefined && isValidScoreNumber(parsedA) ? parsedA : undefined;
  const validB = parsedB !== undefined && isValidScoreNumber(parsedB) ? parsedB : undefined;

  if (validA !== undefined || validB !== undefined) {
    return {
      type: 'setScores',
      scoreA: validA,
      scoreB: validB,
    };
  }

  // 2. Cek skor seri: "10 sama", "15 semua", "sama 12"
  const tieMatch =
    clean.match(/\b(\d{1,2})\s*(?:sama|semua)\b/) ||
    clean.match(/\b(?:sama|semua)\s*(\d{1,2})\b/);
  if (tieMatch) {
    const tieScore = Number(tieMatch[1]);
    if (isValidScoreNumber(tieScore)) {
      return { type: 'setScores', scoreA: tieScore, scoreB: tieScore };
    }
  }

  // 3. Cek penyebutan dua angka sekaligus: "skor 10 8", "skor sekarang 10 8", "10 lawan 8", "10-8", "10 8"
  const dualScoreMatch =
    clean.match(
      /(?:skor|poin)(?:\s+sekarang)?\s+(\d{1,2})\s*(?:-|–|:|lawan|vs|sama|ke|dan)?\s*(\d{1,2})\b/
    ) ||
    clean.match(/^\s*(\d{1,2})\s*(?:-|–|:|lawan|vs|\s)\s*(\d{1,2})\s*$/);
  if (dualScoreMatch) {
    const sA = Number(dualScoreMatch[1]);
    const sB = Number(dualScoreMatch[2]);
    if (isValidScoreNumber(sA) && isValidScoreNumber(sB)) {
      return { type: 'setScores', scoreA: sA, scoreB: sB };
    }
  }

  // 4. Perintah standar (+1, -1, undo)
  const hasMatch = (list: string[]) =>
    list.some((kw) => kw.trim().length > 0 && clean.includes(kw.toLowerCase().trim()));

  if (hasMatch(settings.undoKeywords)) return { type: 'undo' };
  if (hasMatch(settings.minusAKeywords)) return { type: 'minusA' };
  if (hasMatch(settings.minusBKeywords)) return { type: 'minusB' };
  if (hasMatch(settings.pointAKeywords)) return { type: 'pointA' };
  if (hasMatch(settings.pointBKeywords)) return { type: 'pointB' };

  return null;
}

export function speakIndonesian(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Abaikan jika browser memblokir TTS
  }
}

export function useVoiceControl(
  settings: VoiceSettings,
  onCommand: (action: VoiceAction, transcript: string) => void
) {
  const [isListening, setIsListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldBeListeningRef = useRef(false);
  const lastTriggerAtRef = useRef(0);
  const onCommandRef = useRef(onCommand);
  const settingsRef = useRef(settings);

  onCommandRef.current = onCommand;
  settingsRef.current = settings;

  const isSupported =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    );

  const matchTranscript = useCallback((rawText: string): VoiceAction | null => {
    return parseVoiceTranscript(rawText, settingsRef.current);
  }, []);

  const stop = useCallback(() => {
    shouldBeListeningRef.current = false;
    setIsListening(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      // Abaikan
    }
  }, []);

  const start = useCallback(() => {
    if (!isSupported) {
      setErrorMsg('Browser ini belum mendukung kontrol suara (gunakan Chrome/Edge di Android/Desktop).');
      return;
    }
    setErrorMsg(null);
    shouldBeListeningRef.current = true;

    const SpeechCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;

    if (!SpeechCtor) return;

    const rec = new SpeechCtor();
    rec.lang = 'id-ID';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        setLastTranscript(transcript);

        if (result.isFinal) {
          const now = Date.now();
          if (now - lastTriggerAtRef.current < 900) continue;
          const action = matchTranscript(transcript);
          if (action) {
            lastTriggerAtRef.current = now;
            onCommandRef.current(action, transcript);
          }
        }
      }
    };

    rec.onerror = (event: { error: string }) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setErrorMsg('Izin mikrofon ditolak. Aktifkan izin mikrofon di browser.');
        shouldBeListeningRef.current = false;
        setIsListening(false);
      }
    };

    rec.onend = () => {
      if (shouldBeListeningRef.current) {
        try {
          rec.start();
        } catch {
          setIsListening(false);
          shouldBeListeningRef.current = false;
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setIsListening(true);
    } catch {
      setErrorMsg('Tidak dapat memulai mikrofon.');
      setIsListening(false);
      shouldBeListeningRef.current = false;
    }
  }, [isSupported, matchTranscript]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  useEffect(() => {
    return () => {
      shouldBeListeningRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {
        // Abaikan
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    lastTranscript,
    errorMsg,
    start,
    stop,
    toggle,
  };
}
