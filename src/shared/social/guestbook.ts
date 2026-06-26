// Reusable in-game guestbook — public text notes left on a user-authored
// "artifact" (a Same Brain vision, an Hour Capsule, an Album cover, …).
//
// Platform reality this is built around (see RUNTIME.md / game-persistence skill):
//   - A user can ONLY write their own session save blob.
//   - get/data/list returns just the ~most-recent-6 users' latest blobs, so any
//     cross-user read is BEST-EFFORT (same reliability class as a wall / twins).
//   - The only RELIABLE cross-user channel is notify(target_user_id).
//
// So a note is stored in the SENDER's own save blob (under `messages`), shown by
// aggregating every readable blob's `messages` grouped by target, and the
// artifact's author is pinged via notify so they always learn about it.
//
// Framework-agnostic: no React here. Hosts wire persistence + notify; the
// `useGuestbook` hook is a ready-made drop-in built on these helpers.

export interface GuestMessage {
  /** Unique id for this note. */
  id: string;
  /** The artifact this note is attached to (e.g. vision.id, capsule.id). */
  target: string;
  /** The artifact's author — who gets notified. Omitted for self/anon targets. */
  toUserId?: string;
  text: string;
  ts: number;
  /** Filled on READ from the owning save row's user_id. Senders never store it. */
  fromUserId?: string;
  /** Read-time display fields (resolved from the author's profile by the host,
   *  same pattern as a wall entry). Never stored by the sender. */
  userName?: string;
  userAvatarUrl?: string;
}

/** Host save blobs that carry a guestbook add this field. */
export interface WithMessages {
  messages?: GuestMessage[];
}

/** Raw save row as returned by /note/aigram/ai/game/get/data/list. */
export interface SaveRow {
  user_id: string;
  resource_data: string;
}

export const MAX_LEN = 140; // per-note character cap
export const MAX_STORED = 30; // notes kept in one user's save blob

let _seq = 0;
/** A unique-enough id without depending on crypto being present. */
export function newId(): string {
  _seq = (_seq + 1) % 1e6;
  try {
    return crypto.randomUUID();
  } catch {
    return 'm' + Date.now().toString(36) + _seq.toString(36);
  }
}

/** Clamp + trim raw user input. Returns '' when nothing sendable remains. */
export function cleanText(raw: string): string {
  return (raw || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
}

/** Build a note to store in the sender's own blob (no fromUserId — that's a
 *  read-time field). Returns null if the text is empty after cleaning. */
export function newMessage(
  target: string,
  toUserId: string | undefined,
  text: string,
): GuestMessage | null {
  const clean = cleanText(text);
  if (!clean || !target) return null;
  return { id: newId(), target, toUserId, text: clean, ts: Date.now() };
}

/** Append a note to a save blob's `messages`, newest-first, capped. Pure. */
export function appendMessage<S extends WithMessages>(save: S, msg: GuestMessage): S {
  const list = [msg, ...(save.messages ?? [])].slice(0, MAX_STORED);
  return { ...save, messages: list };
}

/** Read every blob's notes, stamp each with its author (fromUserId = row
 *  user_id), and group by target. Corrupt rows are skipped. Best-effort by
 *  platform design. */
export function messagesByTarget(rows: SaveRow[]): Map<string, GuestMessage[]> {
  const out = new Map<string, GuestMessage[]>();
  for (const row of rows) {
    if (!row?.user_id || !row.resource_data) continue;
    let parsed: WithMessages;
    try {
      parsed = JSON.parse(row.resource_data) as WithMessages;
    } catch {
      continue;
    }
    for (const m of parsed.messages ?? []) {
      if (!m || !m.id || !m.target || !m.text) continue;
      const stamped: GuestMessage = { ...m, fromUserId: row.user_id };
      const bucket = out.get(m.target);
      if (bucket) bucket.push(stamped);
      else out.set(m.target, [stamped]);
    }
  }
  return out;
}

/** Merge the best-effort wall notes for one target with the viewer's OWN
 *  outgoing notes (so a just-sent note is visible immediately, before the
 *  debounced cloud write + read window catch up). De-duped by id, oldest-first
 *  for a natural thread read. */
export function threadFor(
  target: string,
  byTarget: Map<string, GuestMessage[]>,
  myMessages: GuestMessage[] | undefined,
  myUserId?: string,
): GuestMessage[] {
  const seen = new Map<string, GuestMessage>();
  for (const m of byTarget.get(target) ?? []) seen.set(m.id, m);
  for (const m of myMessages ?? []) {
    if (m.target !== target) continue;
    // Stamp my own notes with my id so the UI can render them as "you".
    seen.set(m.id, { ...m, fromUserId: m.fromUserId ?? myUserId });
  }
  return [...seen.values()].sort((a, b) => a.ts - b.ts);
}

/** Sanitize + clamp a note for safe inlining into a notification template.
 *  Strips braces (so user text can't collide with the platform's {variable}
 *  substitution), collapses whitespace, truncates with an ellipsis. */
export function notePreview(text: string, max = 60): string {
  const clean = (text || '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() + '…' : clean;
}

/** The platform event `config_json` that pings an artifact's author. Mirrors
 *  the shape the game's notify actions already use. The platform only resolves
 *  a fixed variable whitelist ({sender_name}, {count}), but `template` is a
 *  free client string, so when `note` is supplied the note's own (sanitized,
 *  truncated) text rides into the push as "{sender_name}: <preview>". Verified
 *  shape: shipped games already inline dynamic text into `template`
 *  (block-party score, pebble-pocket item). `template` / `imagePrompt` are
 *  overridable so each game keeps its own voice for the no-note fallback. */
export function guestbookNotifyConfig(opts: {
  toUserId: string;
  refUrl?: string;
  template?: string;
  imagePrompt?: string;
  /** Raw note text. When non-empty it's previewed into the push body. */
  note?: string;
  /** Preview character budget (default 60 — short enough to dodge OS truncation). */
  notePreviewLen?: number;
}): object {
  const preview = opts.note != null ? notePreview(opts.note, opts.notePreviewLen ?? 60) : '';
  const template = preview
    ? '{sender_name}: ' + preview
    : opts.template || '{sender_name} left you a note';
  const action: Record<string, unknown> = {
    type: 'notify',
    target_user_id: opts.toUserId,
    message: { template, variables: ['sender_name'] },
  };
  if (opts.refUrl) {
    action.image = {
      ref_url: opts.refUrl,
      prompt: opts.imagePrompt || 'Someone left a note on what you made.',
    };
  }
  return { actions: [action] };
}

/** Compact relative time, English-default with zh/es/pt. */
export function timeAgo(ts: number, lang = 'en'): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const pick = (en: string, zh: string, es: string, pt: string) =>
    lang === 'zh' ? zh : lang === 'es' ? es : lang === 'pt' ? pt : en;
  if (s < 45) return pick('now', '刚刚', 'ahora', 'agora');
  if (m < 60) return pick(`${m}m`, `${m}分钟前`, `hace ${m}m`, `há ${m}m`);
  if (h < 24) return pick(`${h}h`, `${h}小时前`, `hace ${h}h`, `há ${h}h`);
  return pick(`${d}d`, `${d}天前`, `hace ${d}d`, `há ${d}d`);
}
