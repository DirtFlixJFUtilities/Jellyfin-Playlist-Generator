# Dirtflix Playlist Generator

## Overview

The Dirtflix Playlist Generator is a standalone web app for building playlists on a Jellyfin media server. Search a term, browse the results, click titles into the right-hand "My Playlist" rail, then save the playlist directly on the server via the Jellyfin REST API. Works with Jellyfin 10.x and 12.x. Supports **video playlists** (movies/TV) and **music playlists** (songs staged from album cards) — one kind per playlist. New and improved. All new drastically improved interface and logic, same old unzip and run. Nothing to install.

https://github.com/user-attachments/assets/618b42f1-a6b1-435e-a9cf-eb6a4199f76e

The workflow is a two-pane transfer model: **Results** (left) are disposable — re-search freely. The **Playlist rail** (right) is the only list that matters — it accumulates across searches until you save.

## Features

- 🎬 **Movies & TV playlists** — poster-card search results, library pills, details modal, batch "Add all shown".
- 🎵 **Music mode** — results sectioned **Artists → Albums → Songs**. Browse artist cards with album counts and drill into discographies; add a whole album at once (tracks staged in album order) or cherry-pick individual songs from lazy-loaded tracklists or the Songs section.
- 🔎 **One search does all the thinking** — type an artist, album, or song name and the right section surfaces it. Searches stay pinned to your Music libraries so nothing unrelated leaks in.
- 🎛️ **Refine as you go** — years, minimum rating (video), genres, studios, and artists, each narrowing the last search instantly.
- 🧭 **Guided tour** — "Show Me" walks new users through connect → search → add → save.
- 🌗 **Light & dark themes**, fully responsive from phone to desktop, and an opt-in "Remember login".
- 📦 **Zero install** — three files, open `index.html` and go. No backend, no build step, no dependencies to manage.

<img width="1987" height="1723" alt="new_and_improved" src="https://github.com/user-attachments/assets/3b48fdcb-971a-47eb-b63b-bff4e8521e2f" />

V2.1 support for music playlists

<img width="1770" height="2494" alt="music_playlists" src="https://github.com/user-attachments/assets/f651cedd-de8f-49fa-8c09-1818dad284ee" />

---

## Project Structure

```
Dirtflix Playlist Generator/
├── index.html            # Markup: connection bar, search bar, refine popover, two-pane workspace, tour banner, modals, showcase
├── script.js             # API client + UI state (results, playlist, refine selections, tour, library cache)
├── style.css             # CSS custom-property theme system (light/dark)
├── favicon.svg           # Tab icon: Font Awesome film glyph in the accent green (CC BY 4.0, Fonticons)
├── favicon.png           # 64px PNG fallback for the tab icon (Safari)
├── new_and_improved.jpg  # Screenshot (shown in the in-app showcase, embedded via <img>)
└── new_and_improved.mp4  # Demo video (embedded via <video> with the screenshot as poster)
```

No build step, no framework, no backend. Bootstrap 5 and Font Awesome are CDN-hosted. Release snapshots are distributed as zips via GitHub Releases, not kept in the working folder.

## System Architecture

All processing is client-side; the browser talks directly to the Jellyfin server with `fetch`.

### Core Components
1. **User Interface (index.html)**: Bootstrap 5 layout — connection bar (server URL, API key, owner select, "Remember login"), search bar with media-type chips, Refine popover, results grid + sticky playlist rail, and a "Show Me" guided tour. Below 992px the panes become tabbed (Results / Playlist).
2. **Logic (script.js)**: One event-delegation handler per container (no per-card listeners), HTML escaping of item names (XSS-safe), debounced re-search on filter change.
3. **Styling (style.css)**: Single theme system driven by CSS variables on `:root` and `[data-theme="dark"]`; `data-bs-theme` is mirrored onto `<html>` so Bootstrap controls follow the theme. Only theme choice and (opt-in) login credentials persist in `localStorage`.

## Jellyfin API Integration

### Authentication
MediaBrowser client specification sent via the standard `Authorization` header. Jellyfin 12.x ignores the legacy `X-Emby-Authorization` header by default (`EnableLegacyAuthorization = false`); Jellyfin 10.x accepts both, so this header works on all supported versions:
```
Authorization: MediaBrowser Client="Dirtflix Playlist Generator", Device="Web Browser", Version="1.0.0", Token="{API_KEY}"
```
When an owner user is selected, `UserId="{USER_ID}"` is appended to the header and the `UserId` query parameter.

### API Endpoints Used

1. **GET /Users** - List users (requires API key)
2. **GET /Genres** - Genre names scoped to the selected media types (`IncludeItemTypes`, `Recursive`)
3. **GET /Items** (Fields=Studios) - Studio names for the Refine list; falls back to **GET /Studios** if the Items-based probe fails
4. **GET /Artists** - Artist names for the music Refine list (`Limit=3000`); also used with `SearchTerm` to resolve artist-name searches
5. **GET /Library/MediaFolders** - Top-level library folders (id → name map for the card library pills)
6. **GET /Items** - Search results (video: Movie/Series/Audio items; music: the album union, see Music Mode)
7. **GET /Items?Ids=...** (Fields=ParentId,Name) - Batch-resolves result items' parent folder chains (batches of 100) to find each item's top-level library
8. **GET /Items?ParentId=...&IncludeItemTypes=Audio** - Album tracklist, loaded lazily per album card (`SortBy=ParentIndexNumber,IndexNumber,SortName`)
9. **POST /Playlists** - Creates the playlist with up to 1000 item IDs inline
10. **POST /Playlists/{id}/Items** - Appends further batches when a playlist exceeds 1000 items (music playlists reach this easily)

### Data Flow
1. Enter server URL + API key → users, genres/studios, and library folders load automatically; pick the playlist **Owner**.
2. Toggle Movies / TV chips, or switch to the exclusive **Music** chip → genre and studio/artist lists reload for the active mode. Switching Music ↔ Videos clears a non-empty playlist after a confirm.
3. Search (Enter or Search button) → video: `GET /Items` with `SearchTerm`, type, and Refine parameters (max 1000 results), then `enrichLibraries()` batch-resolves parent chains for library pills. Music: three parallel section queries (Artists/Albums/Songs, see Music Mode).
4. Click `+` on a result card to add it to the playlist (`✓` once added); `ℹ` opens a details modal. "Add all shown" batch-adds the current results (video mode only).
5. Arrange the playlist with ↑/↓, sort dropdown, or remove with ✕.
6. Save → `POST /Playlists` with `Name`, `UserId`, `Users:[{UserId, CanEdit}]` (CanEdit is currently always true), `IsPublic`, `MediaType` (derived from mode: `video` or `audio`), and `Ids` (first 1000 GUIDs in creation order). Any overflow is appended via `POST /Playlists/{id}/Items` in 1000-item batches.

## Library Pills

Each result card and playlist row shows the top-level library a title lives in (e.g. `TV Shows`, `Chick Flicks`). Physical folder ids in item `ParentId` chains differ from the virtual `/Library/MediaFolders` view ids, so resolution walks the chain upward (batch `Ids` lookups) and matches by folder id **or** folder name. Unresolvable items simply show no pill.

## Music Mode

The Music chip is an **exclusive mode** — activating it clears Movies/TV, and activating either video chip clears Music. A playlist can only hold one kind; switching modes with a staged playlist prompts to confirm (switching clears it). The playlist form shows a passive **Videos / Music** badge; `MediaType` is derived from the mode, not chosen.

**Search (music):** results are **sectioned by priority — Artists → Albums → Songs**, one query per section:

1. **Artists** — `GET /Artists?SearchTerm=…` → compact circular-photo cards (name, live album count via a cheap `ArtistIds` count query, "Show albums" button). Artist cards never stage to a playlist; **Show albums** swaps the Albums section to that artist's discography (fetched on demand, cached, "Back to name matches" to exit).
2. **Albums** — `GET /Items?IncludeItemTypes=MusicAlbum&SearchTerm=…` → the album cards below.
3. **Songs** — `GET /Items?IncludeItemTypes=Audio&SearchTerm=…` → compact rows (title, `artist · album`, length, individual `+`). Songs living on a *displayed* album are dropped so the section stays complementary.

(`ArtistSearchTerm` on `/Items` is silently ignored by Jellyfin 12.x — hence artist search going through `/Artists`.) All music-mode queries (albums, songs, artists, artist counts, genres/artist filter lists) are scoped with singular `ParentId=` to library folders where `CollectionType=music` — otherwise stray `Audio` items outside the Music library (orphaned DB rows, theme-song files in TV folders) leak into results and pollute the genre filter with video genres. (`ParentIds` plural is ignored — it is not a real filter.) Genre/artist/year selections are applied client-side per section. An empty term lists all albums (A-Z), no sections. Artist-matched albums only appear via drill-in, never dumped into the Albums section. Sections render up to 24 artists / 100 albums / 150 songs with "Show more (+200)" buttons; each query still caps at 1000 per music library. Section bodies collapse via a chevron toggle (Hide/Show) held in session state.

**Album cards:** square art, title, artist, year, genres, and a "Add album" button. The tracklist loads lazily via `IntersectionObserver` (`ParentId` lookup) to avoid a request storm on wide searches. Rows are `# · title · length` with an individual `+`; "Add album" stages every track in disc order (toggles to remove-all when the album is fully staged, shows "Add N more" when partial). Rail rows for songs use square album art and `Artist · Album` sub-lines; a "By album" sort appears in music mode.

## Search & Refine

### Media Types
Video chips map to `IncludeItemTypes`: `Movie`, `Series`. The Music chip switches to album-based music search (`MusicAlbum` / `Audio`). At least one chip must stay active; Music is mutually exclusive with the video chips.

### Refine Popover
- **Years** → `minPremiereDate` / `maxPremiereDate` (Jan 1 / Dec 31 of the entered years; client-side on the album set in music mode)
- **Min community rating** (0-10, step 0.5) → `MinCommunityRating` — video mode only (tracks carry no community ratings)
- **Genres** → checkbox lists with type-to-filter inputs; selections join with `|` into the `Genres` parameter (any-match, like the API semantics).
- **Studios** (video) / **Artists** (music) → same checkbox-list machinery; studios join into `Studios`, artists into `Artists` (by name). Active selection count badges on the Refine button.
- Changing any refinement re-runs the last search automatically (debounced 300ms).

Genre/studio lists are cleaned of junk entries (code-like names, ISBNs, punctuation-heavy labels) before display.

## Playlist Rail

- **Dedup**: items are matched by `Id`; cards already in the playlist render with a green check.
- **One kind**: the playlist holds videos or songs, never both — mode switches confirm-and-clear it.
- **Ordering**: manual order by default (↑/↓ buttons), or sort A-Z / Z-A / newest / oldest / top-rated / By album (music only) / shuffle. Order is sent to the server as-is.
- **No persistence**: the playlist lives in memory only. A refresh loses it — save before closing. Login credentials are cached only when "Remember login" is ticked.
- **Owner required**: saving without an owner selection is blocked (playlists need a user to belong to).

## Guided Tour

"Show Me" (header) runs a 7-step PowerPoint-style walkthrough: connection → owner → chips + search → search/results → Refine (opens the popover) → add to playlist → name & save. Each step shows text in a fixed, transparent floating banner (no layout shift) and pulses an accent ring on the relevant controls. On the search step two fake demo cards ("Five Star Movie", "The Show I'm Looking For") pop into the results pane; they stay visible but dimmed during the Refine step, then are removed. Auto-advances every 3.2s with Back/Next/Skip; dismisses automatically when the user presses Search.

## Login Caching

The "Remember login" checkbox (opt-in, off by default) stores `{serverUrl, apiKey, userId}` in `localStorage` under `dirtflix.connection`, auto-restoring the connection, user list selection, and filter data on the next page load. Unchecking deletes the entry immediately. Note: `file://` pages share one storage bucket and the value sits in the browser profile as recoverable plain text — see Security Considerations.

## Error Handling

- HTTP status validated on every call; failures surface as dismissible status toasts (auto-dismiss after 5s) and `console.error` detail.
- Buttons show spinners/disable during network operations.
- Confirmation dialog for playlist clear.
- Destructive and empty states show guidance instead of sample/fake data (the old demo-data fallback was removed).

## Responsive Design

- ≥992px: results grid + sticky 350px playlist rail side by side.
- <992px: Results/Playlist pill tabs switch panes (`body.is-narrow[data-pane]`).
- Result cards wrap as flex items: ~4 columns on wide screens, 3 / 2 / 1 at 992px / 768px / 576px breakpoints. Posters keep native 2:3 aspect ratio (`aspect-ratio: 2/3` + `object-fit: cover`; images are requested at `width=300` only so the server never crops them).

## Security Considerations

1. **API keys are bearer secrets.** They sit in the page (password field, in-memory) for the session, and in `localStorage` (unencrypted) if "Remember login" is ticked. Do not hardcode keys in `index.html`, do not commit real keys, avoid this option on shared machines, and revoke any key that leaks. The app is intended for LAN/trusted-network use.
2. **XSS**: all library-supplied strings (titles, genres) are HTML-escaped before rendering.
3. **CORS**: Jellyfin 12.x allows `authorization` and `x-emby-authorization` headers with `Access-Control-Allow-Origin: *`, so the page can be opened from `file://` or a local static server. Serve over HTTPS if the server requires it — mixed-content blocking, not CORS, is the usual failure in that case.

## Performance

- Search capped at 1000 items per request (`Limit=1000`).
- Event delegation: one click handler per container; result-card states refreshed in place instead of re-rendering grids on every add.
- Images lazy-load (`loading="lazy"`).

## Dependencies & Compatibility

- Bootstrap 5.3 + Font Awesome 6 (CDN)
- ES6+, Fetch API, CSS `aspect-ratio` / `color-mix` (Chrome/Edge 111+, Firefox 113+, Safari 16.4+)

## Known Limitations

1. **Playlist not persisted** — filter state and staged items are lost on refresh (deliberate). Theme and opt-in login (URL, key, owner in `localStorage` under `dirtflix.connection`) survive; untick "Remember login" to erase them.
2. **1000-result cap** per query; music search runs one query per section (artists/albums/songs), each capped. Narrow with Refine or shorter terms for larger libraries.
3. **One kind per playlist** — videos or songs, never mixed (a Jellyfin playlist constraint; the app enforces it via the exclusive Music chip).
4. **Description field absent** — Jellyfin's `POST /Playlists` accepts no description, so the UI no longer offers one.
5. **Any-match genre semantics** — Jellyfin's `Genres` filter matches items with *any* selected genre, not all.

## Troubleshooting

- **401 Unauthorized** — API key is invalid/revoked, or typed with whitespace. Create a fresh key (Dashboard → API Keys). On 12.x the server ignores `X-Emby-Authorization`; this app already uses the `Authorization` header.
- **404** — server URL/port wrong; include the scheme (`http://192.168.1.200:8096`) and no trailing slash.
- **"Failed to fetch"** — browser couldn't reach the server at all: wrong URL, server down, or mixed content (HTTPS page vs HTTP server).
- **Empty results** — broaden: fewer refinements, other media-type chips, shorter term.
- **Missing images** — item has no Primary image tag; placeholder shown.
- Debug via browser Network tab (every call is a plain GET/POST) and console logging.
