// A failed API call (expired session, transient 500, etc.) should never take
// the whole page down — this was the direct cause of "e.filter is not a
// function": a 401 error object got passed straight into setTracks(), and
// the next .filter() call on it crashed since it's not an array.
export async function fetchArray<T>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url);
    if (res.status === 401) {
      // Session expired/invalid — send them to log back in rather than
      // rendering a broken page with no indication of why.
      window.location.href = "/login";
      return [];
    }
    if (!res.ok) {
      console.error(`${url} returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`Fetch failed for ${url}:`, err);
    return [];
  }
}
