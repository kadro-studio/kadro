// Linked clips: a video and its sound on an audio track (like grouped events in
// Vegas). Clips with the same `link` stay together when they are cut, and
// insert edits push every track that holds a partner so the pair keeps in sync.
import { clipEnd, findClip, uid } from './project';
import { openGap, splitClip } from './edit';
import { EPS } from './time';
import type { Clip, Project, Track } from './types';

/** The other clips linked to this one, with their tracks. */
export function partnersOf(p: Project, clip: Clip): { clip: Clip; track: Track }[] {
  if (!clip.link) return [];
  const out: { clip: Clip; track: Track }[] = [];
  for (const track of p.tracks) for (const c of track.clips) if (c.link === clip.link && c.id !== clip.id) out.push({ clip: c, track });
  return out;
}

/** The ids plus every clip linked to them, in order, without repeats. */
export function withPartners(p: Project, ids: string[]): string[] {
  const out = [...ids];
  const seen = new Set(ids);
  for (const id of ids) {
    const f = findClip(p, id);
    if (!f) continue;
    for (const x of partnersOf(p, f.clip)) {
      if (seen.has(x.clip.id)) continue;
      seen.add(x.clip.id);
      out.push(x.clip.id);
    }
  }
  return out;
}

/** Partners whose start (side 'l') or end (side 'r') is at the same time as this clip's. */
export function edgePartners(p: Project, clip: Clip, side: 'l' | 'r'): { clip: Clip; track: Track }[] {
  const edge = side === 'l' ? clip.start : clipEnd(clip);
  const tol = 0.5 / p.settings.fps;
  return partnersOf(p, clip).filter((x) => Math.abs((side === 'l' ? x.clip.start : clipEnd(x.clip)) - edge) <= tol);
}

/** True when every id belongs to one link group (so the inspector can show the first). */
export function oneGroup(p: Project, ids: string[]): boolean {
  if (ids.length < 2) return false;
  const links = ids.map((id) => findClip(p, id)?.clip.link);
  return !!links[0] && links.every((l) => l === links[0]);
}

/**
 * Cuts a clip at t and, when `linked`, its partners too. The right-hand pieces
 * get a link of their own, so the two halves of a pair are separate pairs.
 * Returns the right piece of every clip that was cut, by the original id.
 */
export function splitLinked(p: Project, clipId: string, t: number, minLen: number, linked = true): Map<string, string> {
  const rights = new Map<string, string>();
  const f = findClip(p, clipId);
  if (!f) return rights;
  const group = [{ clip: f.clip, track: f.track }, ...(linked ? partnersOf(p, f.clip) : [])];
  const pieces: Clip[] = [];
  for (const g of group) {
    if (g.track.locked && g.clip.id !== clipId) continue;
    const right = splitClip(g.track, g.clip.id, t, minLen);
    if (!right) continue;
    rights.set(g.clip.id, right);
    const piece = g.track.clips.find((c) => c.id === right);
    if (piece) pieces.push(piece);
  }
  relink(pieces);
  return rights;
}

/**
 * Gives the clips (copies or cut-off pieces of linked clips) fresh links,
 * keeping together those that were together; a clip left alone is unlinked.
 */
export function relink(clips: Clip[]): void {
  const count = new Map<string, number>();
  for (const c of clips) if (c.link) count.set(c.link, (count.get(c.link) ?? 0) + 1);
  const fresh = new Map<string, string>();
  for (const c of clips) {
    if (!c.link) continue;
    if ((count.get(c.link) ?? 0) < 2) {
      delete c.link;
      continue;
    }
    if (!fresh.has(c.link)) fresh.set(c.link, uid());
    c.link = fresh.get(c.link);
  }
}

/** Links that more than one clip shares (a clip whose partner was deleted is not shown as linked). */
export function pairedLinks(p: Project): Set<string> {
  const seen = new Set<string>();
  const paired = new Set<string>();
  for (const track of p.tracks) {
    for (const c of track.clips) {
      if (!c.link) continue;
      if (seen.has(c.link)) paired.add(c.link);
      seen.add(c.link);
    }
  }
  return paired;
}

/**
 * Insert edit: cuts whatever straddles `time` on the tracks and pushes their
 * later clips right by `duration`. When `linked`, the partners of clips that
 * move (a video's sound) move too, with whatever follows them on their track;
 * other clips there, such as music before them, stay where they are.
 */
export function insertGap(p: Project, trackIds: Iterable<string>, time: number, duration: number, minLen: number, linked = true): void {
  const ids = new Set(trackIds);
  const tracks = p.tracks.filter((tr) => ids.has(tr.id));
  for (const track of tracks) {
    const straddling = track.clips.find((c) => c.start < time - EPS && clipEnd(c) > time + EPS);
    if (straddling) splitLinked(p, straddling.id, time, minLen, linked);
  }
  let moving = tracks.flatMap((tr) => tr.clips.filter((c) => c.start >= time - EPS));
  for (const track of tracks) openGap(track, time, duration);
  if (!linked) return;
  const done = new Set(ids);
  while (moving.length) {
    // Each further track moves from its first partner of a moved clip onwards.
    const from = new Map<Track, number>();
    for (const c of moving) {
      for (const x of partnersOf(p, c)) {
        if (done.has(x.track.id) || x.track.locked) continue;
        from.set(x.track, Math.min(from.get(x.track) ?? Infinity, x.clip.start));
      }
    }
    moving = [];
    for (const [track, start] of from) {
      done.add(track.id);
      const later = track.clips.filter((c) => c.start >= start - EPS);
      for (const c of later) c.start += duration;
      moving.push(...later);
    }
  }
}
