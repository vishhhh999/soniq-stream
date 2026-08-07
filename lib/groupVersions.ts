import type { Track } from "@/components/PlayerProvider";

export type TrackWithVersion = Track & {
  versionGroupId?: string | null;
  versionNumber?: number | null;
  createdAt?: string;
};

export type TrackGroup = {
  key: string;
  latest: TrackWithVersion;
  olderVersions: TrackWithVersion[];
};

// Groups tracks by versionGroupId (falling back to the track's own id when
// it has none, i.e. it's not part of any duplicate group). Within a group,
// the highest versionNumber is treated as "latest" and shown primarily.
export function groupVersions(tracks: TrackWithVersion[]): TrackGroup[] {
  const groups = new Map<string, TrackWithVersion[]>();
  for (const t of tracks) {
    const key = t.versionGroupId || t.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  return Array.from(groups.entries()).map(([key, members]) => {
    const sorted = [...members].sort((a, b) => (b.versionNumber ?? 1) - (a.versionNumber ?? 1));
    return { key, latest: sorted[0], olderVersions: sorted.slice(1) };
  });
}
