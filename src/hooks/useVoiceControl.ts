import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceSettings } from '../types/smashboard';

export type VoiceAction = 'pointA' | 'pointB' | 'minusA' | 'minusB' | 'undo';

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
    const clean = rawText.toLowerCase().trim();
    const s = settingsRef.current;
    const hasMatch = (list: string[]) =>
      list.some((kw) => kw.trim().length > 0 && clean.includes(kw.toLowerCase().trim()));

    if (hasMatch(s.undoKeywords)) return 'undo';
    if (hasMatch(s.minusAKeywords)) return 'minusA';
    if (hasMatch(s.minusBKeywords)) return 'minusB';
    if (hasMatch(s.pointAKeywords)) return 'pointA';
    if (hasMatch(s.pointBKeywords)) return 'pointB';
    return null;
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
