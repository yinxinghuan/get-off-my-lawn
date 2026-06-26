// Drop-in guestbook hook. Any game with a wall of user-authored artifacts can
// add public notes with this: pass your save mirror + persist + event trigger,
// render `byTarget.get(artifact.id)`, and call `send(...)` from a compose box.
//
// Two modes:
//   - Pass `rows` (e.g. the same get/data/list rows your wall already fetched)
//     and the hook just aggregates them — no extra network call.
//   - Omit `rows` and the hook fetches get/data/list itself on mount / refresh.
//
// Storage + notify reliability are exactly as documented in guestbook.ts: notes
// live in the SENDER's own blob, cross-user display is best-effort, the author
// is pinged via notify.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  callAigramAPI,
  isInAigram,
  type AigramResponse,
} from '../runtime/bridge';
import { getGameUuid } from '../runtime/game-id';
import {
  appendMessage,
  guestbookNotifyConfig,
  messagesByTarget,
  newMessage,
  type GuestMessage,
  type SaveRow,
  type WithMessages,
} from './guestbook';

export interface UseGuestbookOptions<S extends WithMessages> {
  /** Update the local save mirror. The functional updater receives the current
   *  blob; we append the note and persist as a side-effect (the established
   *  pattern in these games — see useSameBrain). */
  setMirror: Dispatch<SetStateAction<S | undefined>>;
  persist: (data: S) => void;
  /** Base blob used when the mirror is still undefined. */
  empty: S;
  /** From useGameEvent — fires the author ping. */
  trigger: (event: string, config: object | string) => void;
  /** Current player's id (skip self-notify, render own notes as "you"). */
  myUserId?: string | null;
  /** Wall rows to aggregate. Omit to make the hook self-fetch. */
  rows?: SaveRow[];
  /** Notify event name + copy (each game keeps its own voice). */
  event?: string;
  template?: string;
  imagePrompt?: string;
}

export interface UseGuestbook {
  /** Best-effort notes from every readable blob, grouped by artifact id. */
  byTarget: Map<string, GuestMessage[]>;
  loaded: boolean;
  refresh: () => void;
  /** Leave a note on an artifact; persists locally + pings the author once. */
  send: (target: string, toUserId: string | undefined, text: string, refUrl?: string) => void;
}

export function useGuestbook<S extends WithMessages>(
  opts: UseGuestbookOptions<S>,
): UseGuestbook {
  const { setMirror, persist, empty, trigger, myUserId, rows } = opts;
  const eventName = opts.event || 'guestbook_message';

  const [fetched, setFetched] = useState<SaveRow[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce(n => n + 1), []);

  // Self-fetch path — only when the host didn't hand us rows.
  useEffect(() => {
    if (rows) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    const sessionId = getGameUuid();
    if (!isInAigram || !sessionId) {
      setLoaded(true);
      return;
    }
    (async () => {
      try {
        const res = await callAigramAPI<AigramResponse<SaveRow[]>>(
          `/note/aigram/ai/game/get/data/list?session_id=${encodeURIComponent(sessionId)}`,
          'GET',
        );
        if (!cancelled) setFetched(Array.isArray(res?.data) ? res.data : []);
      } catch {
        if (!cancelled) setFetched([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rows, nonce]);

  const byTarget = useMemo(
    () => messagesByTarget(rows ?? fetched ?? []),
    [rows, fetched],
  );

  // Ping an author at most once per target per session.
  const notified = useRef<Set<string>>(new Set());

  const send = useCallback(
    (target: string, toUserId: string | undefined, text: string, refUrl?: string) => {
      const msg = newMessage(target, toUserId, text);
      if (!msg) return;

      setMirror(prev => {
        const next = appendMessage((prev ?? empty) as S, msg);
        persist(next);
        return next;
      });

      if (toUserId && toUserId !== myUserId && !notified.current.has(target)) {
        notified.current.add(target);
        trigger(
          eventName,
          guestbookNotifyConfig({
            toUserId,
            refUrl,
            template: opts.template,
            imagePrompt: opts.imagePrompt,
          }),
        );
      }
    },
    [setMirror, persist, empty, trigger, myUserId, eventName, opts.template, opts.imagePrompt],
  );

  return { byTarget, loaded, refresh, send };
}
