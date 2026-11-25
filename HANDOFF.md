# Handoff Notes — Dirtflix Playlist Generator

_Last updated: 2026-11-25_

## What this is

Standalone static web app (open `index.html` directly) that searches a Jellyfin server and builds **video or music** playlists via `POST /Playlists`. Three core files + demo assets; Bootstrap 5 / Font Awesome via CDN; no backend, no build step. Full technical docs: `README.md`.

## State right now

- **v2.0 published and complete. v2.1 music playlist support: BUILT and browser-tested by the user against .200** (searches, album cards, drill-in, songs section, filters — all confirmed working). Changes are committed to `main`; the zip/release for v2.1 are NOT yet made.
- **App works against both Jellyfin servers on the LAN**: `192.168.1.200:8096` (DirtFlix 2.0, **12.4.0** — the one in use, has a Music library) and `192.168.1.10:8096` (DS923-NAS, 10.10.7, not probed for music).
- **Git**: folder is a git repo (`main`), pushed with `-f` to `https://github.com/DirtFlixJFUtilities/Jellyfin-Playlist-Generator` — remote mirrors the folder. Committer identity is set **locally only**.

## Probe findings (2026-11-25, against .200 / 12.4.0)

- Music library exists (`CollectionType=music`); `/Artists`, `Genres?IncludeItemTypes=Audio`, `MusicAlbum` searches, album `ParentId` child fetches all work.
- **`ArtistSearchTerm` on `/Items` is silently ignored** (returns unfiltered results). Working route: `GET /Artists?SearchTerm=` → `GET /Items?IncludeItemTypes=MusicAlbum&ArtistIds=`.
- `POST /Playlists` with `MediaType:"audio"` + track ids → 200; playlist children stored as `Audio`. Passing an **album** id expands to its tracks server-side — the app still expands client-side for dedup/order consistency.
- Append works: `POST /Playlists/{id}/Items?userId=&ids=` → 204. Used for the >1000-track save path.
- `DELETE /Items/{playlistId}` → 204 (probe playlists cleaned up; could back a future "delete playlist" feature).

## Decisions made this session (why things look like they do)

1. **`Authorization` header, not `X-Emby-Authorization`** — Jellyfin 12.x ignores the legacy header by default (`EnableLegacyAuthorization = false`, migration-disbled on upgrade). This was the cause of the 401 mystery. Both 10.x and 12.x accept the standard header. Don't switch it back.
2. **Two-pane transfer UI replaced the working-list/master-list/tabs flow** — search results are disposable (left), playlist accumulates (right rail). No "Send To Master List" ceremony.
3. **No playlist persistence (deliberate)** — user chose this. Only theme (`localStorage.theme`) and opt-in login (`localStorage['dirtflix.connection']`, contains server URL + API key + owner) persist.
4. **`file://` realities**: cookies don't work on file origins; File System Access API is unavailable there; all `file://` pages share one localStorage bucket. State stays browser-side by design — a companion-server option for folder-side state was discussed and declined.
5. **Library pills** use batch `GET /Items?Ids=` parent-chain resolution with **id-or-name matching**, because physical folder ids differ from `/Library/MediaFolders` virtual view ids (caught with the "Rome" probe).
6. **Images requested `?width=300` only** — asking for `width+height` made Jellyfin crop 2:3 posters into 300×200 (the "squashed cards" complaint).
7. **Guided tour ("Show Me")**: 7 steps, fixed transparent floating banner (no layout shift), fake demo cards ("Five Star Movie", "The Show I'm Looking For") shown on steps 4–5 only.
8. **Showcase section** at page bottom embeds `new_and_improved.jpg` + `new_and_improved.mp4` (9.2 MB — under GitHub's 100 MB limit).
9. **v2.1 Music is an exclusive mode via the Music chip** (hard separation): Music ↔ video chips are mutually exclusive in the click handler; body gets `data-mode="music|video"` and CSS `.video-only`/`.music-only` blocks swap the Refine panel (Studios ↔ Artists, rating hidden for music).
10. **Mode switch confirm-and-clears the playlist** when non-empty (no dual/stash playlists — user chose this). Playlist kind therefore always equals current mode.
11. **No `mediaTypeSelect` dropdown anymore** — `MediaType` is derived (`audio`/`video`); a passive kind badge sits in the pl-form. Don't re-add a selector.
12. **Music results are album cards** (square art + meta + "Add album" + scrollable tracklist, one card per disc — discs not merged). Tracklists lazy-load per card via IntersectionObserver (cache in `albumTracks`); "Add album" stages all tracks in disc order, toggles remove-all, shows "Add N more" when partial.
13. **Music search is SECTIONED: Artists → Albums → Songs** (user asked for the priority + separate card types). Artists = photo cards (round photo via `/Items/{artistId}/Images/Primary`, 404→placeholder via capture-phase error listener; live album counts via `ArtistIds&Limit=1` TotalRecordCount, cached in `artistCounts`) with **Show albums drill-in that REPLACES the Albums section** (`artistAlbums` cache + `drillArtist` state, "Back to name matches"). Songs = compact rows; tracks on displayed albums are dropped (dedup by `ParentId` vs shown album ids, zero extra requests). Artist-matched albums only via drill-in. Render caps per section: 24/100/150 with "Show more (+200)".
14. **Save appends in 1000-id batches** via `POST /Playlists/{id}/Items` — music playlists exceed the create cap easily. `addAllBtn` hidden in music mode; "By album" sort option exists only in music mode.
15. **Sectioned music results got polish rounds**: album cards float in a `flex-wrap` grid (340–480px, tightened internals, "Add album" as a full-width bar); sections have chevron Hide/Show collapse toggles (`collapsedSections` session state); Songs rows carry 38px album-art thumbs (`ParentId` Primary image; the capture-phase image-error listener covers `.artist-photo` + `.song-thumb`).
16. **Favicon**: `favicon.svg` (FA 6 `fa-film` glyph path from Fonticons repo, filled `#2e9e63`) + 64px `favicon.png` (rendered via WPF `Geometry.Parse` — GDI PrivateFontCollection was flaky in PS 5.1). Both linked in `<head>`; FA art is CC BY 4.0. Remember both files in any new zip.

## Gotchas / open items

- **SECURITY: API keys `b564ce45…` and `677da591…` were pasted into chat sessions AGAIN on 2026-11-25 during the music probes and still must be rotated** on the .200 server (Dashboard → API Keys). The old hardcoded sample key `59572469…` was removed from the UI but still exists inside older zips/snapshots — don't publish pre-2026-11-25 archives.
- `dirtflixplaylist20.zip` was removed from the working folder on 2026-11-25 (the copy attached to the GitHub v2.0 release is the archived one — built from cleaned files, safe). Don't publish pre-2026-11-25 archives; they contain the old hardcoded sample key.
- Search is capped at 1000 results; `POST /Playlists` ignores `Description` (API has no such field — do not re-add the UI field expecting it to work).
- Tour step indices are hardcoded (`tourIndex === 3` fake cards, `=== 4` opens Refine popover) — if steps are reordered, update those checks in `script.js`. Tour fake cards are movie-themed (video flow) even in music mode — harmless, could get music variants later.
- `albumTracks` is a session cache with no invalidation — album edits on the server won't show until reload.
- `GET /Artists` name list is capped at 3000; artist checkboxes filter by **name** (`Artists=` param), so duplicate-name artists merge.
- **All music queries scope to Music libraries via singular `ParentId=`** (`musicFolderIds` from `/Library/MediaFolders` where `CollectionType==='music'`; `fetchScopedItems`/`musicFolders()`). Without it, .200 leaks 2,100+ stray Audio items (orphan "Theme Song" DB rows with empty ParentId, audio files in TV libs) into search and into the genre list as video genres (Action: 631 Audio items globally, **0 inside the Music lib**). `ParentIds` (plural) is ignored by the API — singular only. If the user adds more music libraries, scoping loops per folder automatically.
- Server-side cleanup opportunity (not our bug): those orphan Audio items are stale DB rows — a library scan/rescan of .200 may clear them.
- Lint/format: none configured. Verify JS with `node --check script.js`; verify server connectivity with the curl probes in the README Troubleshooting section.
- README documents all endpoints/parameters — keep it in sync when the API layer changes.
- **Preserve the README banner copy** ("New and improved. All new drastically improved interface and logic, same old unzip and run. Nothing to install.") — user explicitly wants it kept in any README edits.

## Suggested next steps (not started)

- **Cut the v2.1 release**: build `dirtflixplaylist21.zip` from current files (must include favicon.svg/png and music mode), tag/push, publish GitHub Release with the zip — same flow as v2.0.
- Optional: GitHub Pages so the tool is reachable from any browser without the folder.
- Optional: drag-and-drop reorder in the playlist rail (currently ↑/↓ buttons).
- Optional: playlist export (`.m3u`) without touching the server.
- Optional: delete-playlist-from-app feature (`DELETE /Items/{id}` verified → 204).
- **Top priority housekeeping: rotate the leaked API keys** (see SECURITY gotcha — pasted into chat twice, still live on .200).

## How to run / test

1. Double-click `index.html` (or serve statically).
2. Enter `http://192.168.1.200:8096` + a current API key → users/genres/studios/libraries load.
3. Search a term → add cards → **owner required** before Save works.
4. Hard-refresh (Ctrl+F5) after editing files — no cache-busting otherwise.
