export const PINNED_RELEASE_ORDER = "admin_new_release_order.asc.nullslast,release_date.desc.nullslast,name.asc,id.asc";

export function compareReleaseDates(a, b) {
  return (Date.parse(b.release_date) || 0) - (Date.parse(a.release_date) || 0)
    || a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id);
}

export function sortPinnedReleases(games) {
  return [...games].sort((a, b) => {
    const rankA = a.admin_new_release_order ?? Infinity;
    const rankB = b.admin_new_release_order ?? Infinity;
    return (rankA === rankB ? 0 : rankA - rankB) || compareReleaseDates(a, b);
  });
}

export function featuredNewReleases(pinned, automatic, limit = 15) {
  const ordered = sortPinnedReleases(pinned);
  const ids = new Set(ordered.map(game => game.id));
  const combined = [...ordered, ...automatic.filter(game => !ids.has(game.id))].slice(0, limit);
  // Until an administrator saves a manual order, preserve the release-date layout.
  return ordered.some(game => game.admin_new_release_order != null)
    ? combined : combined.sort(compareReleaseDates);
}
