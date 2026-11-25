// Dirtflix Playlist Generator — two-pane search/add model
// API layer targets Jellyfin 10.x and 12.x (Authorization header, POST /Playlists).

let results = [];
let musicAlbums = [];
let musicSongs = [];
let musicArtistHits = [];
let drillArtist = null;
const artistAlbums = {};
const artistCounts = new Map();
const collapsedSections = new Set();
let sectionLimits = { artists: 24, albums: 100, songs: 150 };
let playlist = [];
let genres = [];
let studios = [];
let artists = [];
let userId = '';
let genresLoaded = false;
let studiosLoaded = false;
let artistsLoaded = false;
let hasSearched = false;
let searchTimer = null;
let libraryNames = {};
let musicFolderIds = [];

const activeGenres = new Set();
const activeStudios = new Set();
const activeArtists = new Set();
const albumTracks = {};
let tracklistObserver = null;

// DOM elements
const serverUrlInput = document.getElementById('serverUrl');
const apiKeyInput = document.getElementById('apiKey');
const userSelect = document.getElementById('userSelect');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const refineBtn = document.getElementById('refineBtn');
const refineBadge = document.getElementById('refineBadge');
const refinePopover = document.getElementById('refinePopover');
const genreSearch = document.getElementById('genreSearch');
const genreList = document.getElementById('genreList');
const studioSearch = document.getElementById('studioSearch');
const studioList = document.getElementById('studioList');
const artistSearch = document.getElementById('artistSearch');
const artistList = document.getElementById('artistList');
const yearFrom = document.getElementById('yearFrom');
const yearTo = document.getElementById('yearTo');
const ratingFilter = document.getElementById('ratingFilter');
const ratingValue = document.getElementById('ratingValue');
const resultsCount = document.getElementById('resultsCount');
const resultsContainer = document.getElementById('resultsContainer');
const addAllBtn = document.getElementById('addAllBtn');
const playlistCount = document.getElementById('playlistCount');
const tabPlaylistCount = document.getElementById('tabPlaylistCount');
const playlistSort = document.getElementById('playlistSort');
const clearPlaylistBtn = document.getElementById('clearPlaylistBtn');
const playlistContainer = document.getElementById('playlistContainer');
const playlistName = document.getElementById('playlistName');
const isPublicCheckbox = document.getElementById('isPublicCheckbox');
const playlistKindBadge = document.getElementById('playlistKindBadge');
const sortAlbumOption = document.getElementById('sortAlbumOption');
const savePlaylistBtn = document.getElementById('savePlaylistBtn');
const statusMessages = document.getElementById('statusMessages');
const tabResultsBtn = document.getElementById('tabResultsBtn');
const tabPlaylistBtn = document.getElementById('tabPlaylistBtn');
const rememberLogin = document.getElementById('rememberLogin');
const tourBtn = document.getElementById('tourBtn');
const tourBanner = document.getElementById('tourBanner');
const tourStepEl = document.getElementById('tourStep');
const tourTextEl = document.getElementById('tourText');
const tourPrevBtn = document.getElementById('tourPrev');
const tourNextBtn = document.getElementById('tourNext');
const tourSkipBtn = document.getElementById('tourSkip');
const chips = Array.from(document.querySelectorAll('.chip'));
const chipMusic = document.getElementById('chipMusic');

const CONN_KEY = 'dirtflix.connection';

function getSavedConnection() {
    try {
        return JSON.parse(localStorage.getItem(CONN_KEY) || 'null');
    } catch {
        return null;
    }
}

function saveConnection() {
    if (!rememberLogin.checked) return;
    localStorage.setItem(CONN_KEY, JSON.stringify({
        serverUrl: serverUrlInput.value.trim(),
        apiKey: apiKeyInput.value.trim(),
        userId
    }));
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function authHeader() {
    let header = `MediaBrowser Client="Dirtflix Playlist Generator", Device="Web Browser", Version="1.0.0", Token="${apiKeyInput.value.trim()}"`;
    if (userId) {
        header += `, UserId="${userId}"`;
    }
    return header;
}

function connectionReady() {
    return serverUrlInput.value.trim() && apiKeyInput.value.trim();
}

// ---------- Modes (Video / Music) ----------
function isMusicMode() {
    return chipMusic.classList.contains('active');
}

function onModeChanged() {
    const music = isMusicMode();
    document.body.dataset.mode = music ? 'music' : 'video';
    addAllBtn.hidden = music;
    sortAlbumOption.hidden = !music;
    if (!music && playlistSort.value === 'album') playlistSort.value = 'none';
    updateKindBadge();
    updateRefineBadge();
}

function updateKindBadge() {
    playlistKindBadge.innerHTML = isMusicMode()
        ? '<i class="fas fa-compact-disc me-1"></i>Music'
        : '<i class="fas fa-film me-1"></i>Videos';
}

// Theme toggle
function applyTheme(theme) {
    const body = document.body;
    const icon = document.getElementById('themeToggle').querySelector('i');

    body.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-bs-theme', theme);
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    localStorage.setItem('theme', theme);
}

// Responsive pane switching
function updateNarrowMode() {
    document.body.classList.toggle('is-narrow', window.innerWidth < 992);
}

function setActivePane(pane) {
    document.body.setAttribute('data-pane', pane);
    tabResultsBtn.classList.toggle('active', pane === 'results');
    tabPlaylistBtn.classList.toggle('active', pane === 'playlist');
}

document.addEventListener('DOMContentLoaded', function () {
    applyTheme(localStorage.getItem('theme') || 'dark');
    document.getElementById('themeToggle').addEventListener('click', () => {
        applyTheme(document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    updateNarrowMode();
    setActivePane('results');
    onModeChanged();
    window.addEventListener('resize', updateNarrowMode);

    tabResultsBtn.addEventListener('click', () => setActivePane('results'));
    tabPlaylistBtn.addEventListener('click', () => setActivePane('playlist'));

    yearFrom.placeholder = '1900';
    yearTo.placeholder = new Date().getFullYear().toString();

    // Connection
    const saved = getSavedConnection();
    if (saved) {
        serverUrlInput.value = saved.serverUrl || '';
        apiKeyInput.value = saved.apiKey || '';
        rememberLogin.checked = true;
    }

    function onConnectionChange() {
        saveConnection();
        if (connectionReady()) {
            fetchUsers();
            loadLibraries().then(() => loadGenresAndStudios());
        }
    }
    serverUrlInput.addEventListener('change', onConnectionChange);
    apiKeyInput.addEventListener('change', onConnectionChange);

    rememberLogin.addEventListener('change', () => {
        if (rememberLogin.checked) {
            saveConnection();
        } else {
            localStorage.removeItem(CONN_KEY);
        }
    });

    userSelect.addEventListener('change', function () {
        userId = this.value;
        saveConnection();
        updateSaveButtonLabel();
        if (hasSearched) {
            runSearch();
        }
    });

    // Search triggers
    searchBtn.addEventListener('click', runSearch);
    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') runSearch();
    });

    // Type chips — Music is an exclusive mode, hard-separated from video
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const isMusicChip = chip === chipMusic;
            const wasActive = chip.classList.contains('active');
            const oldMusic = isMusicMode();

            let keep;
            if (isMusicChip) {
                if (wasActive) return; // nothing else is active to fall back to
                keep = [chip];
            } else if (wasActive) {
                keep = chips.filter(c => c !== chip && c !== chipMusic && c.classList.contains('active'));
                if (keep.length === 0) return; // keep at least one video chip
            } else {
                keep = chips.filter(c => c.classList.contains('active') && c !== chipMusic);
                keep.push(chip);
            }

            if (isMusicChip !== oldMusic && playlist.length > 0) {
                const from = oldMusic ? 'songs' : 'videos';
                const to = isMusicChip ? 'music mode' : 'video mode';
                if (!confirm(`Your playlist holds ${playlist.length} ${from}. Switching to ${to} will clear it — save it first, or press Cancel to stay.`)) return;
                playlist = [];
                renderPlaylist();
            }

            chips.forEach(c => c.classList.toggle('active', keep.includes(c)));
            onModeChanged();
            if (connectionReady()) loadGenresAndStudios(true);
            if (hasSearched) scheduleSearch();
        });
    });

    // Refine popover
    refineBtn.addEventListener('click', e => {
        e.stopPropagation();
        refinePopover.hidden = !refinePopover.hidden;
    });
    document.addEventListener('click', e => {
        if (!refinePopover.hidden && !refinePopover.contains(e.target) && e.target !== refineBtn) {
            refinePopover.hidden = true;
        }
    });

    ratingFilter.addEventListener('input', function () {
        ratingValue.textContent = this.value;
        if (hasSearched) scheduleSearch();
    });

    yearFrom.addEventListener('change', () => { if (hasSearched) scheduleSearch(); });
    yearTo.addEventListener('change', () => { if (hasSearched) scheduleSearch(); });

    genreSearch.addEventListener('input', () => filterCheckList(genreList, genreSearch.value));
    studioSearch.addEventListener('input', () => filterCheckList(studioList, studioSearch.value));
    artistSearch.addEventListener('input', () => filterCheckList(artistList, artistSearch.value));

    // Results delegation: add/remove + details
    resultsContainer.addEventListener('click', async e => {
        const collapseBtn = e.target.closest('.section-toggle');
        if (collapseBtn) {
            const key = collapseBtn.dataset.section;
            if (collapsedSections.has(key)) collapsedSections.delete(key);
            else collapsedSections.add(key);
            renderMusicResults();
            return;
        }
        const drillBtn = e.target.closest('.artist-show-albums');
        if (drillBtn) {
            const artistId = drillBtn.dataset.artist;
            if (drillArtist && drillArtist.id === artistId) {
                drillArtist = null;
            } else {
                if (!artistAlbums[artistId]) {
                    artistAlbums[artistId] = (await fetchScopedItems(() => {
                        const params = albumParams();
                        params.append('ArtistIds', artistId);
                        return params;
                    }))
                        .filter(albumPassesFilters)
                        .sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
                }
                drillArtist = { id: artistId, name: drillBtn.dataset.name };
            }
            renderMusicResults();
            return;
        }
        if (e.target.closest('.drill-back')) {
            drillArtist = null;
            renderMusicResults();
            return;
        }
        const moreBtn = e.target.closest('.show-more');
        if (moreBtn) {
            sectionLimits[moreBtn.dataset.more] += 200;
            renderMusicResults();
            return;
        }
        const songRow = e.target.closest('.song-row');
        if (songRow) {
            const song = musicSongs.find(t => t.Id === songRow.dataset.id);
            if (song) togglePlaylist(song);
            return;
        }
        const albumBtn = e.target.closest('.add-album-btn');
        if (albumBtn) {
            toggleAlbumTracks(albumBtn.dataset.album);
            return;
        }
        const trackRow = e.target.closest('.tr-row');
        if (trackRow) {
            const track = (albumTracks[trackRow.dataset.album] || []).find(t => t.Id === trackRow.dataset.id);
            if (track) togglePlaylist(track);
            return;
        }
        const card = e.target.closest('.item-card');
        if (!card) return;
        const item = results.find(it => it.Id === card.dataset.id);
        if (!item) return;
        if (e.target.closest('.info-btn')) {
            showItemDetails(item);
        } else {
            togglePlaylist(item);
        }
    });

    // Artist/song images 404 when no image exists — swap in a placeholder
    resultsContainer.addEventListener('error', e => {
        if (e.target.matches && e.target.matches('.artist-photo, .song-thumb')) {
            const placeholder = document.createElement('div');
            placeholder.className = `${e.target.className} item-placeholder`;
            placeholder.innerHTML = e.target.matches('.artist-photo')
                ? '<i class="fas fa-microphone fa-2x"></i>'
                : '<i class="fas fa-music"></i>';
            e.target.replaceWith(placeholder);
        }
    }, true);

    // Playlist rail thumbnails 404 the same way (album without Primary image)
    playlistContainer.addEventListener('error', e => {
        if (e.target.matches && e.target.matches('img.pl-thumb')) {
            const music = e.target.classList.contains('pl-thumb-music');
            const placeholder = document.createElement('div');
            placeholder.className = `pl-thumb ${music ? 'pl-thumb-music' : ''} pl-placeholder`;
            placeholder.innerHTML = `<i class="fas ${music ? 'fa-music' : 'fa-film'}"></i>`;
            e.target.replaceWith(placeholder);
        }
    }, true);

    addAllBtn.addEventListener('click', () => {
        let added = 0;
        results.forEach(item => {
            if (!playlist.some(p => p.Id === item.Id)) {
                playlist.push(item);
                added++;
            }
        });
        renderPlaylist();
        refreshResultCards();
        showStatusMessage(added > 0 ? `Added ${added} item(s) to your playlist` : 'All shown items are already in your playlist', added > 0 ? 'success' : 'info');
    });

    // Playlist delegation
    playlistContainer.addEventListener('click', e => {
        const row = e.target.closest('.pl-row');
        if (!row) return;
        const id = row.dataset.id;
        const idx = playlist.findIndex(p => p.Id === id);
        if (idx === -1) return;

        if (e.target.closest('.pl-remove')) {
            playlist.splice(idx, 1);
        } else if (e.target.closest('.pl-up') && idx > 0) {
            [playlist[idx - 1], playlist[idx]] = [playlist[idx], playlist[idx - 1]];
        } else if (e.target.closest('.pl-down') && idx < playlist.length - 1) {
            [playlist[idx + 1], playlist[idx]] = [playlist[idx], playlist[idx + 1]];
        } else if (e.target.closest('.pl-detail')) {
            showItemDetails(playlist[idx]);
            return;
        } else {
            return;
        }
        renderPlaylist();
        refreshResultCards();
    });

    playlistSort.addEventListener('change', function () {
        sortPlaylist(this.value);
    });

    clearPlaylistBtn.addEventListener('click', () => {
        if (playlist.length === 0) return;
        if (confirm(`Clear all ${playlist.length} item(s) from your playlist?`)) {
            playlist = [];
            renderPlaylist();
            refreshResultCards();
        }
    });

    savePlaylistBtn.addEventListener('click', savePlaylist);

    document.getElementById('helpModalTrigger').addEventListener('click', e => {
        e.preventDefault();
        new bootstrap.Modal(document.getElementById('helpModal')).show();
    });

    tourBtn.addEventListener('click', startTour);
    tourNextBtn.addEventListener('click', nextTourStep);
    tourPrevBtn.addEventListener('click', prevTourStep);
    tourSkipBtn.addEventListener('click', endTour);

    if (connectionReady()) {
        fetchUsers();
        loadLibraries().then(() => loadGenresAndStudios());
    }

    renderPlaylist();
});

function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 300);
}

function updateSaveButtonLabel() {
    const userName = userSelect.value ? userSelect.options[userSelect.selectedIndex].textContent : '';
    savePlaylistBtn.innerHTML = `<i class="fas fa-save me-2"></i>Save Playlist${userName ? ` for ${esc(userName)}` : ' to Jellyfin'}`;
}

// ---------- Libraries ----------
async function loadLibraries() {
    if (!connectionReady()) return;
    try {
        const response = await fetch(`${serverUrlInput.value.trim()}/Library/MediaFolders`, {
            headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        libraryNames = {};
        (data.Items || []).forEach(folder => { libraryNames[folder.Id] = folder.Name; });
        musicFolderIds = (data.Items || [])
            .filter(f => f.CollectionType === 'music')
            .map(f => f.Id);
    } catch (error) {
        console.error('Error loading libraries:', error);
    }
}

// Batch-resolve each item's ancestor folder chain, then tag items with their
// top-level library (matched by folder id or folder name — physical folder ids
// differ from the virtual MediaFolders view ids).
async function enrichLibraries(items) {
    if (!Object.keys(libraryNames).length || items.length === 0) return;
    const libNames = new Set(Object.values(libraryNames));
    const nameOf = {};
    const parentOf = {};

    let frontier = new Set(items.map(it => it.ParentId).filter(Boolean));
    let guard = 0;
    while (frontier.size && guard++ < 6) {
        const ids = Array.from(frontier).filter(id => !(id in nameOf));
        if (ids.length === 0) break;
        for (let i = 0; i < ids.length; i += 100) {
            const batch = ids.slice(i, i + 100);
            const params = new URLSearchParams();
            params.append('Ids', batch.join(','));
            params.append('Fields', 'ParentId,Name');
            try {
                const response = await fetch(`${serverUrlInput.value.trim()}/Items?${params}`, {
                    headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
                });
                if (!response.ok) return;
                const data = await response.json();
                (data.Items || []).forEach(f => {
                    nameOf[f.Id] = f.Name;
                    parentOf[f.Id] = f.ParentId || '';
                });
            } catch (error) {
                console.error('Error resolving library folders:', error);
                return;
            }
        }
        const next = new Set();
        for (const id of ids) {
            const parent = parentOf[id];
            if (parent && !(parent in nameOf) && !libraryNames[parent] && !libNames.has(nameOf[id] || '')) {
                next.add(parent);
            }
        }
        frontier = next;
    }

    items.forEach(item => {
        let cur = item.ParentId;
        const seen = new Set();
        for (let depth = 0; cur && depth < 8 && !seen.has(cur); depth++) {
            seen.add(cur);
            if (libraryNames[cur]) { item._library = libraryNames[cur]; return; }
            const nm = nameOf[cur];
            if (nm && libNames.has(nm)) { item._library = nm; return; }
            cur = nm ? parentOf[cur] : '';
        }
    });
}

function libraryName(item) {
    return item._library || (item.ParentId && libraryNames[item.ParentId]) || '';
}

// ---------- Users ----------
async function fetchUsers() {
    try {
        const response = await fetch(`${serverUrlInput.value.trim()}/Users`, {
            headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const users = await response.json();
        const usersArray = Array.isArray(users) ? users : (users.Items || []);

        const previous = userSelect.value || (getSavedConnection() || {}).userId || '';
        userSelect.innerHTML = '<option value="">Select a user...</option>';
        usersArray.forEach(user => {
            const option = document.createElement('option');
            option.value = user.Id;
            option.textContent = user.Name;
            userSelect.appendChild(option);
        });
        if (previous && usersArray.some(u => u.Id === previous)) {
            userSelect.value = previous;
        }
        userId = userSelect.value;
        saveConnection();
        updateSaveButtonLabel();
        showStatusMessage(`Successfully loaded ${usersArray.length} users`, 'success');
    } catch (error) {
        console.error('Error fetching users:', error);
        showStatusMessage(`Error loading users: ${error.message}`, 'danger');
    }
}

// ---------- Genres & studios ----------
function selectedTypes() {
    return chips.filter(c => c.classList.contains('active')).map(c => c.dataset.type);
}

async function fetchGenresForTypes(itemTypes) {
    const musicOnly = itemTypes.every(t => t === 'Audio');
    const folders = musicOnly ? musicFolders() : [''];
    const names = [];
    for (const folder of folders) {
        const params = new URLSearchParams();
        params.append('IncludeItemTypes', itemTypes.join(','));
        params.append('Recursive', 'true');
        if (folder) params.append('ParentId', folder);

        const response = await fetch(`${serverUrlInput.value.trim()}/Genres?${params}`, {
            headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP error fetching genres! status: ${response.status}`);

        const data = await response.json();
        (data.Items || []).forEach(i => { if (i.Name && !names.includes(i.Name)) names.push(i.Name); });
    }

    // Drop junk genres: not title-case, code-looking names, ISBNs, heavy punctuation
    return names.filter(name => {
        if (!name) return false;
        if (name[0] !== name[0].toUpperCase()) return false;
        const words = name.split(' ');
        if (words.length > 1 && words.some(w => w.length > 0 && w[0] !== w[0].toUpperCase())) return false;
        if ((name.match(/[^a-zA-Z0-9]/g) || []).length > 1) return false;
        if (name.includes(':') || name.includes(';')) return false;
        if (/^FIC\d{6}$/.test(name)) return false;
        if (/^[A-Z]{3}\d{6}$/.test(name)) return false;
        if (/[A-Za-z]{3}\d{6}/.test(name)) return false;
        if (/ISBN(\s\d+)+/.test(name) || /ISBN\d+/.test(name)) return false;
        return true;
    });
}

async function fetchStudiosForTypes(itemTypes) {
    const serverUrl = serverUrlInput.value.trim();
    const params = new URLSearchParams();
    params.append('IncludeItemTypes', itemTypes.join(','));
    params.append('Recursive', 'true');
    params.append('Fields', 'Studios');
    params.append('Limit', '1000');

    const clean = names => names.filter(name => {
        if (!name) return false;
        if (name[0] !== name[0].toUpperCase()) return false;
        if (/^\d+$/.test(name)) return false;
        if (name.includes('\ufffd')) return false;
        if ((name.match(/[^a-zA-Z0-9]/g) || []).length >= 4) return false;
        return true;
    });

    try {
        const response = await fetch(`${serverUrl}/Items?${params}`, {
            headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP error fetching items for studios! status: ${response.status}`);
        const data = await response.json();
        const names = [];
        (data.Items || []).forEach(item => {
            (item.Studios || []).forEach(s => {
                const n = typeof s === 'string' ? s : s.Name;
                if (n && !names.includes(n)) names.push(n);
            });
        });
        return clean(names);
    } catch (error) {
        console.error('Error fetching studios:', error);
        try {
            const response = await fetch(`${serverUrl}/Studios`, {
                headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
            });
            if (response.ok) {
                const data = await response.json();
                return clean(data.Items ? data.Items.map(i => i.Name) : []);
            }
        } catch (fallbackError) {
            console.error('Fallback error fetching studios:', fallbackError);
        }
        throw error;
    }
}

async function fetchArtists() {
    const names = [];
    for (const folder of musicFolders()) {
        const params = new URLSearchParams();
        params.append('Limit', '3000');
        if (folder) params.append('ParentId', folder);

        const response = await fetch(`${serverUrlInput.value.trim()}/Artists?${params}`, {
            headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP error fetching artists! status: ${response.status}`);

        const data = await response.json();
        (data.Items || []).forEach(i => { const n = i.Name; if (n && !n.includes('\ufffd') && !names.includes(n)) names.push(n); });
    }
    return names;
}

async function loadGenresAndStudios(force = false) {
    if (!connectionReady()) return;
    const music = isMusicMode();
    const needGenres = force || !genresLoaded;
    const needList = music ? (force || !artistsLoaded) : (force || !studiosLoaded);
    if (!needGenres && !needList) return;

    const itemTypes = selectedTypes();
    if (itemTypes.length === 0) return;

    try {
        if (needGenres) {
            genres = await fetchGenresForTypes(itemTypes);
            genresLoaded = true;
        }

        if (music) {
            artists = await fetchArtists();
            artistsLoaded = true;
            activeArtists.forEach(a => { if (!artists.includes(a)) activeArtists.delete(a); });
            buildCheckList(artistList, artists, activeArtists, () => { if (hasSearched) scheduleSearch(); });
        } else {
            studios = await fetchStudiosForTypes(itemTypes);
            studiosLoaded = true;
            activeStudios.forEach(s => { if (!studios.includes(s)) activeStudios.delete(s); });
            buildCheckList(studioList, studios, activeStudios, () => { if (hasSearched) scheduleSearch(); });
        }

        buildCheckList(genreList, genres, activeGenres, () => { if (hasSearched) scheduleSearch(); });
        updateRefineBadge();
    } catch (error) {
        console.error('Error loading genres and filter lists:', error);
        showStatusMessage(`Could not load genres/studios: ${error.message}`, 'warning');
    }
}

function buildCheckList(container, items, activeSet, onChange) {
    container.innerHTML = '';
    items.forEach(name => {
        const label = document.createElement('label');
        label.className = 'check-item';
        label.dataset.name = name.toLowerCase();
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = activeSet.has(name);
        input.addEventListener('change', () => {
            if (input.checked) activeSet.add(name); else activeSet.delete(name);
            updateRefineBadge();
            onChange();
        });
        const span = document.createElement('span');
        span.textContent = name;
        label.appendChild(input);
        label.appendChild(span);
        container.appendChild(label);
    });
}

function filterCheckList(container, term) {
    const needle = term.trim().toLowerCase();
    container.querySelectorAll('.check-item').forEach(label => {
        label.style.display = !needle || label.dataset.name.includes(needle) ? '' : 'none';
    });
}

function updateRefineBadge() {
    const n = activeGenres.size + (isMusicMode() ? activeArtists.size : activeStudios.size);
    refineBadge.hidden = n === 0;
    refineBadge.textContent = n;
}

// ---------- Search ----------
async function runSearch() {
    if (tourTimer) endTour();
    if (!connectionReady()) {
        showStatusMessage('Enter your server URL and API key first', 'warning');
        return;
    }
    const itemTypes = selectedTypes();
    if (itemTypes.length === 0) {
        showStatusMessage('Select at least one media type (Movies/TV/Music)', 'warning');
        return;
    }

    searchBtn.disabled = true;
    searchBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    try {
        if (isMusicMode()) {
            await runMusicSearch(searchInput.value.trim());
            return;
        }

        const params = new URLSearchParams();
        params.append('IncludeItemTypes', itemTypes.join(','));
        params.append('Recursive', 'true');
        params.append('EnableImageTypes', 'Primary,Backdrop');
        params.append('Limit', '1000');
        params.append('Fields', 'Overview,Taglines,CriticRating,CommunityRating,ProductionYear,Studios,ImageTags,Name,Type,Genres,ParentId');

        const minRating = parseFloat(ratingFilter.value);
        if (minRating > 0) params.append('MinCommunityRating', minRating.toString());

        const yFrom = parseInt(yearFrom.value);
        const yTo = parseInt(yearTo.value);
        if (!isNaN(yFrom)) params.append('minPremiereDate', new Date(yFrom, 0, 1).toISOString());
        if (!isNaN(yTo)) params.append('maxPremiereDate', new Date(yTo, 11, 31).toISOString());

        if (activeGenres.size > 0) params.append('Genres', Array.from(activeGenres).join('|'));
        if (activeStudios.size > 0) params.append('Studios', Array.from(activeStudios).join('|'));

        const term = searchInput.value.trim();
        if (term) params.append('SearchTerm', term);
        if (userId) params.append('UserId', userId);

        const response = await fetch(`${serverUrlInput.value.trim()}/Items?${params}`, {
            headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        results = data.Items || [];
        hasSearched = true;
        await enrichLibraries(results);
        renderResults();
    } catch (error) {
        console.error('Error fetching items:', error);
        showStatusMessage(`Search failed: ${error.message}`, 'danger');
    } finally {
        searchBtn.disabled = false;
        searchBtn.innerHTML = '<i class="fas fa-search me-2"></i>Search';
    }
}

// ---------- Music search ----------
async function fetchItemsJson(params) {
    const response = await fetch(`${serverUrlInput.value.trim()}/Items?${params}`, {
        headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return (await response.json()).Items || [];
}

// Music libraries are the only scope for music mode — otherwise stray Audio
// items (orphans, theme-song files in TV libraries, audiobooks) leak into
// searches and the genre filter with video genres. Singular ParentId is a
// real filter on /Items, /Genres and /Artists (ParentIds is not).
function musicFolders() {
    return musicFolderIds.length ? musicFolderIds : [''];
}

async function fetchScopedItems(buildParams) {
    const folders = musicFolders();
    if (folders.length === 1) {
        const p = buildParams();
        if (folders[0]) p.append('ParentId', folders[0]);
        return fetchItemsJson(p);
    }
    const seen = new Map();
    for (const folder of folders) {
        const p = buildParams();
        p.append('ParentId', folder);
        (await fetchItemsJson(p)).forEach(i => seen.set(i.Id, i));
    }
    return Array.from(seen.values());
}

function albumParams() {
    const p = new URLSearchParams();
    p.append('IncludeItemTypes', 'MusicAlbum');
    p.append('Recursive', 'true');
    p.append('EnableImageTypes', 'Primary');
    p.append('Limit', '1000');
    p.append('Fields', 'Overview,CommunityRating,ProductionYear,Genres,ImageTags,Name,Type,ParentId,AlbumArtist,Artists');
    if (userId) p.append('UserId', userId);
    return p;
}

function albumPassesFilters(a) {
    if (activeGenres.size && !(a.Genres || []).some(g => activeGenres.has(g))) return false;
    if (activeArtists.size) {
        const albumArtistNames = Array.isArray(a.AlbumArtist) ? a.AlbumArtist : (a.AlbumArtist ? [a.AlbumArtist] : []);
        const names = (a.Artists || []).concat(albumArtistNames);
        if (!names.some(n => activeArtists.has(n))) return false;
    }
    const yFrom = parseInt(yearFrom.value);
    const yTo = parseInt(yearTo.value);
    const y = a.ProductionYear;
    if (!isNaN(yFrom) && y && y < yFrom) return false;
    if (!isNaN(yTo) && y && y > yTo) return false;
    return true;
}

// Sectioned music search: Artists > Albums > Songs. Each section is fed by
// one query; songs whose album is already displayed are dropped so the
// Songs section stays complementary. Artist-matched albums are not dumped
// into Albums — they load on artist-card drill-in.
async function runMusicSearch(term) {
    drillArtist = null;

    musicAlbums = (await fetchScopedItems(() => {
        const p = albumParams();
        if (term) p.append('SearchTerm', term);
        else p.append('SortBy', 'SortName');
        return p;
    }))
        .filter(albumPassesFilters)
        .sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));

    musicArtistHits = [];
    musicSongs = [];

    if (term) {
        try {
            const seen = new Map();
            for (const folder of musicFolders()) {
                const artistParams = new URLSearchParams();
                artistParams.append('SearchTerm', term);
                artistParams.append('Limit', '50');
                if (userId) artistParams.append('UserId', userId);
                if (folder) artistParams.append('ParentId', folder);
                const artistResponse = await fetch(`${serverUrlInput.value.trim()}/Artists?${artistParams}`, {
                    headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
                });
                if (artistResponse.ok) {
                    ((await artistResponse.json()).Items || []).forEach(a => seen.set(a.Id, a));
                }
            }
            musicArtistHits = Array.from(seen.values())
                .sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
        } catch (error) {
            console.error('Error searching artists:', error);
        }

        const shownAlbumIds = new Set(musicAlbums.map(a => a.Id));
        musicSongs = (await fetchScopedItems(() => {
            const p = new URLSearchParams();
            p.append('IncludeItemTypes', 'Audio');
            p.append('Recursive', 'true');
            p.append('Limit', '1000');
            p.append('Fields', 'Name,ParentId,Album,Artists,RunTimeTicks,ProductionYear,Genres');
            p.append('SearchTerm', term);
            if (userId) p.append('UserId', userId);
            return p;
        }))
            .filter(t => !shownAlbumIds.has(t.ParentId) && songPassesFilters(t))
            .sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
    }

    hasSearched = true;
    renderResults();
}

function songPassesFilters(t) {
    if (activeGenres.size && !(t.Genres || []).some(g => activeGenres.has(g))) return false;
    if (activeArtists.size && !(t.Artists || []).some(n => activeArtists.has(n))) return false;
    const yFrom = parseInt(yearFrom.value);
    const yTo = parseInt(yearTo.value);
    const y = t.ProductionYear;
    if (!isNaN(yFrom) && y && y < yFrom) return false;
    if (!isNaN(yTo) && y && y > yTo) return false;
    return true;
}

function displayedAlbums() {
    if (drillArtist) return artistAlbums[drillArtist.id] || [];
    return musicAlbums;
}

function typeLabel(item) {
    if (item.Type === 'Movie') return 'Movie';
    if (item.Type === 'Series' || item.Type === 'TvProgram') return 'TV Series';
    return item.Type || '';
}

function renderResults() {
    if (isMusicMode()) {
        renderMusicResults();
        return;
    }

    if (results.length === 0) {
        resultsCount.textContent = 'No matches';
        addAllBtn.disabled = true;
        resultsContainer.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="fas fa-inbox fa-3x mb-3"></i>
                <p>No titles matched that search</p>
                <p>Try different keywords, media types, or fewer refinements</p>
            </div>`;
        return;
    }

    addAllBtn.disabled = false;
    resultsCount.textContent = `${results.length} match${results.length === 1 ? '' : 'es'}`;
    resultsContainer.innerHTML = results.map(cardHtml).join('');
}

function renderMusicResults() {
    const albums = displayedAlbums();
    if (musicArtistHits.length === 0 && albums.length === 0 && musicSongs.length === 0) {
        resultsCount.textContent = 'No matches';
        resultsContainer.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="fas fa-inbox fa-3x mb-3"></i>
                <p>No artists, albums, or songs matched that search</p>
                <p>Try fewer refinements or a shorter term</p>
            </div>`;
        return;
    }

    const summary = [];
    if (musicArtistHits.length) summary.push(`${musicArtistHits.length} artist${musicArtistHits.length === 1 ? '' : 's'}`);
    if (musicAlbums.length) summary.push(`${musicAlbums.length} album${musicAlbums.length === 1 ? '' : 's'}`);
    if (musicSongs.length) summary.push(`${musicSongs.length} song${musicSongs.length === 1 ? '' : 's'}`);
    resultsCount.textContent = summary.join(' · ');

    const toggleBtn = key => {
        const collapsed = collapsedSections.has(key);
        return `<button type="button" class="section-toggle" data-section="${key}" title="${collapsed ? 'Show' : 'Hide'}">
                    <i class="fas ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i>
                </button>`;
    };
    const sectionShell = (key, head, body) => {
        const collapsed = collapsedSections.has(key);
        return `
            <section class="music-section">
                ${head}
                <div class="section-body"${collapsed ? ' hidden' : ''}>${body}</div>
            </section>`;
    };

    let html = '';

    if (musicArtistHits.length) {
        html += sectionShell('artists',
            `<h4 class="section-head"><i class="fas fa-microphone me-2"></i>Artists <span class="section-count">${musicArtistHits.length}</span>${toggleBtn('artists')}</h4>`,
            `<div class="artist-row">${musicArtistHits.slice(0, sectionLimits.artists).map(artistCardHtml).join('')}</div>
             ${showMoreButton('artists', musicArtistHits.length, sectionLimits.artists)}`);
    }

    const albumsHeader = drillArtist
        ? `<h4 class="section-head"><i class="fas fa-compact-disc me-2"></i>Albums by ${esc(drillArtist.name)} <span class="section-count">${albums.length}</span>
               <button type="button" class="btn btn-sm btn-link drill-back" title="Back to albums matching the search term"><i class="fas fa-arrow-left me-1"></i>Back to name matches</button>${toggleBtn('albums')}</h4>`
        : `<h4 class="section-head"><i class="fas fa-compact-disc me-2"></i>Albums <span class="section-count">${albums.length}</span>${toggleBtn('albums')}</h4>`;
    html += sectionShell('albums',
        albumsHeader,
        `<div class="album-grid">${albums.slice(0, sectionLimits.albums).map(albumCardHtml).join('')}</div>
         ${showMoreButton('albums', albums.length, sectionLimits.albums)}`);

    if (musicSongs.length) {
        html += sectionShell('songs',
            `<h4 class="section-head"><i class="fas fa-music me-2"></i>Songs <span class="section-count">${musicSongs.length}</span>${toggleBtn('songs')}</h4>`,
            `<div class="song-list">${musicSongs.slice(0, sectionLimits.songs).map(songRowHtml).join('')}</div>
             ${showMoreButton('songs', musicSongs.length, sectionLimits.songs)}`);
    }

    resultsContainer.innerHTML = html;
    observeTracklists();
    fillArtistCounts();
}

function showMoreButton(key, total, shown) {
    if (total <= shown) return '';
    return `<button type="button" class="btn btn-sm btn-outline-secondary show-more" data-more="${key}">Show more (${total - shown} remaining)</button>`;
}

function artistCardHtml(artist) {
    const drilled = drillArtist && drillArtist.id === artist.Id;
    const cached = artistCounts.get(artist.Id);
    return `
        <div class="artist-card ${drilled ? 'drilled' : ''}" data-artist="${artist.Id}">
            <img src="${serverUrlInput.value.trim()}/Items/${artist.Id}/Images/Primary?width=200" alt="${esc(artist.Name)}" class="artist-photo" loading="lazy">
            <div class="artist-name" title="${esc(artist.Name)}">${esc(artist.Name)}</div>
            <div class="artist-count" data-count-for="${artist.Id}">${cached != null ? `${cached} album${cached === 1 ? '' : 's'}` : ''}</div>
            <button type="button" class="btn btn-sm artist-show-albums" data-artist="${artist.Id}" data-name="${esc(artist.Name)}">
                ${drilled
                    ? '<i class="fas fa-arrow-left me-1"></i>Name matches'
                    : '<i class="fas fa-compact-disc me-1"></i>Show albums'}
            </button>
        </div>`;
}

function songRowHtml(song) {
    const inList = playlist.some(p => p.Id === song.Id);
    const meta = [(song.Artists || []).join(', '), song.Album || ''].filter(Boolean).join(' · ');
    const thumb = song.ParentId
        ? `<img src="${serverUrlInput.value.trim()}/Items/${song.ParentId}/Images/Primary?width=90" alt="" class="song-thumb" loading="lazy">`
        : `<div class="song-thumb item-placeholder"><i class="fas fa-music"></i></div>`;
    return `
        <div class="song-row ${inList ? 'staged' : ''}" data-id="${song.Id}">
            ${thumb}
            <span class="song-title">${esc(song.Name)}</span>
            <span class="song-meta">${esc(meta)}</span>
            <span class="song-dur">${fmtDur(song.RunTimeTicks)}</span>
            <button type="button" class="card-btn song-add" title="${inList ? 'Remove song' : 'Add song'}">
                <i class="fas ${inList ? 'fa-check' : 'fa-plus'}"></i>
            </button>
        </div>`;
}

async function fetchArtistAlbumCount(artistId) {
    let total = 0;
    for (const folder of musicFolders()) {
        const params = new URLSearchParams();
        params.append('IncludeItemTypes', 'MusicAlbum');
        params.append('Recursive', 'true');
        params.append('ArtistIds', artistId);
        params.append('Limit', '1');
        if (userId) params.append('UserId', userId);
        if (folder) params.append('ParentId', folder);
        const response = await fetch(`${serverUrlInput.value.trim()}/Items?${params}`, {
            headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        total += (await response.json()).TotalRecordCount || 0;
    }
    return total;
}

function fillArtistCounts() {
    resultsContainer.querySelectorAll('.artist-count[data-count-for]').forEach(el => {
        const id = el.dataset.countFor;
        const cached = artistCounts.get(id);
        if (cached != null) {
            el.textContent = `${cached} album${cached === 1 ? '' : 's'}`;
            return;
        }
        fetchArtistAlbumCount(id).then(count => {
            artistCounts.set(id, count);
            const fresh = resultsContainer.querySelector(`.artist-count[data-count-for="${id}"]`);
            if (fresh) fresh.textContent = `${count} album${count === 1 ? '' : 's'}`;
        }).catch(() => { /* leave count blank on failure */ });
    });
}

function albumCardHtml(album) {
    const art = album.ImageTags && album.ImageTags.Primary
        ? `<img src="${serverUrlInput.value.trim()}/Items/${album.Id}/Images/Primary?width=300" alt="${esc(album.Name)}" class="album-art" loading="lazy">`
        : `<div class="album-art item-placeholder"><i class="fas fa-compact-disc fa-2x"></i></div>`;
    const artist = album.AlbumArtist || (album.Artists || []).join(', ');
    const metaLine = [album.ProductionYear || '', artist].filter(Boolean).join(' · ');

    return `
        <div class="album-card" data-id="${album.Id}">
            <div class="album-head">
                ${art}
                <div class="album-meta">
                    <div class="album-title">${esc(album.Name)}</div>
                    ${metaLine ? `<div class="album-artist">${esc(metaLine)}</div>` : ''}
                    ${album.Genres && album.Genres.length ? `<div class="album-genres">${esc(album.Genres.join(', '))}</div>` : ''}
                    <div class="album-count" data-count-for="${album.Id}"></div>
                </div>
            </div>
            <button type="button" class="btn add-album-btn" data-album="${album.Id}"><i class="fas fa-plus me-1"></i>Add album</button>
            <div class="tracklist" data-album="${album.Id}"><div class="tr-loading"><span class="spinner-border spinner-border-sm"></span></div></div>
        </div>`;
}

function tracklistBox(albumId) {
    return resultsContainer.querySelector(`.tracklist[data-album="${albumId}"]`);
}

function observeTracklists() {
    if (!tracklistObserver) {
        tracklistObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    tracklistObserver.unobserve(entry.target);
                    loadAlbumTracks(entry.target.dataset.album);
                }
            });
        }, { rootMargin: '200px' });
    }
    resultsContainer.querySelectorAll('.tracklist').forEach(el => {
        if (albumTracks[el.dataset.album]) paintTracklist(el.dataset.album);
        else tracklistObserver.observe(el);
    });
}

async function loadAlbumTracks(albumId) {
    if (albumTracks[albumId]) {
        paintTracklist(albumId);
        return;
    }
    const params = new URLSearchParams();
    params.append('ParentId', albumId);
    params.append('IncludeItemTypes', 'Audio');
    params.append('Recursive', 'true');
    params.append('SortBy', 'ParentIndexNumber,IndexNumber,SortName');
    params.append('Limit', '1000');
    params.append('Fields', 'IndexNumber,ParentIndexNumber,RunTimeTicks,Artists,Album,ImageTags,Name,Type,ParentId');
    if (userId) params.append('UserId', userId);

    try {
        albumTracks[albumId] = await fetchItemsJson(params);
        paintTracklist(albumId);
        refreshAlbumButton(albumId);
    } catch (error) {
        console.error('Error loading album tracks:', error);
        const box = tracklistBox(albumId);
        if (box) box.innerHTML = '<div class="tr-loading">Could not load tracks</div>';
    }
}

function fmtDur(ticks) {
    const seconds = Math.round((ticks || 0) / 10000000);
    if (!seconds) return '';
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function paintTracklist(albumId) {
    const box = tracklistBox(albumId);
    const tracks = albumTracks[albumId];
    if (!box || !tracks) return;

    if (tracks.length === 0) {
        box.innerHTML = '<div class="tr-loading">No tracks</div>';
        return;
    }

    box.innerHTML = tracks.map(track => {
        const inList = playlist.some(p => p.Id === track.Id);
        return `
            <div class="tr-row ${inList ? 'staged' : ''}" data-id="${track.Id}" data-album="${albumId}">
                <span class="tr-no">${track.IndexNumber != null ? track.IndexNumber : ''}</span>
                <span class="tr-name">${esc(track.Name)}</span>
                <span class="tr-dur">${fmtDur(track.RunTimeTicks)}</span>
                <button type="button" class="card-btn tr-add" title="${inList ? 'Remove song' : 'Add song'}">
                    <i class="fas ${inList ? 'fa-check' : 'fa-plus'}"></i>
                </button>
            </div>`;
    }).join('');

    const countEl = resultsContainer.querySelector(`[data-count-for="${albumId}"]`);
    if (countEl) {
        const totalMinutes = Math.round(tracks.reduce((sum, t) => sum + (t.RunTimeTicks || 0), 0) / 600000000);
        countEl.textContent = `${tracks.length} track${tracks.length === 1 ? '' : 's'} · ${totalMinutes} min`;
    }
}

async function toggleAlbumTracks(albumId) {
    if (!albumTracks[albumId]) {
        await loadAlbumTracks(albumId);
        if (!albumTracks[albumId]) return;
    }
    const tracks = albumTracks[albumId];
    if (tracks.length === 0) return;

    const albumName = (displayedAlbums().find(a => a.Id === albumId) || {}).Name || 'album';
    if (tracks.every(t => playlist.some(p => p.Id === t.Id))) {
        const ids = new Set(tracks.map(t => t.Id));
        playlist = playlist.filter(p => !ids.has(p.Id));
        showStatusMessage(`Removed ${tracks.length} tracks from "${esc(albumName)}"`, 'info');
    } else {
        let added = 0;
        tracks.forEach(t => {
            if (!playlist.some(p => p.Id === t.Id)) {
                playlist.push(t);
                added++;
            }
        });
        showStatusMessage(`Added ${added} track${added === 1 ? '' : 's'} from "${esc(albumName)}"`, 'success');
    }
    renderPlaylist();
    refreshResultCards();
}

function refreshAlbumButton(albumId) {
    const btn = resultsContainer.querySelector(`.add-album-btn[data-album="${albumId}"]`);
    if (!btn) return;
    const tracks = albumTracks[albumId];
    const staged = tracks ? tracks.filter(t => playlist.some(p => p.Id === t.Id)).length : 0;

    if (tracks && tracks.length && staged === tracks.length) {
        btn.innerHTML = '<i class="fas fa-check me-1"></i>Album added';
        btn.classList.add('added');
    } else {
        btn.classList.remove('added');
        btn.innerHTML = (tracks && staged > 0)
            ? `<i class="fas fa-plus me-1"></i>Add ${tracks.length - staged} more`
            : '<i class="fas fa-plus me-1"></i>Add album';
    }
}

function cardHtml(item) {
    const inList = playlist.some(p => p.Id === item.Id);
    const lib = libraryName(item);
    const img = item.ImageTags && item.ImageTags.Primary
        ? `<img src="${serverUrlInput.value.trim()}/Items/${item.Id}/Images/Primary?width=300" alt="${esc(item.Name)}" class="item-image" loading="lazy">`
        : `<div class="item-image item-placeholder"><i class="fas fa-film fa-3x"></i></div>`;

    return `
        <div class="item-card ${inList ? 'in-playlist' : ''}" data-id="${item.Id}">
            <div class="card-actions">
                <button type="button" class="card-btn add-btn" title="${inList ? 'Remove from playlist' : 'Add to playlist'}">
                    <i class="fas ${inList ? 'fa-check' : 'fa-plus'}"></i>
                </button>
                <button type="button" class="card-btn info-btn" title="Details">
                    <i class="fas fa-circle-info"></i>
                </button>
            </div>
            ${img}
            <div class="item-body">
                <div class="item-title">${esc(item.Name)}</div>
                ${item.ProductionYear ? `<div class="item-year">Released: ${item.ProductionYear}</div>` : ''}
                ${item.CommunityRating ? `<div class="item-rating"><i class="fas fa-star"></i> ${item.CommunityRating}/10</div>` : ''}
                ${item.Genres && item.Genres.length ? `<div class="item-genres">${esc(item.Genres.join(', '))}</div>` : ''}
                <div class="item-type">${typeLabel(item)}${lib ? `<span class="lib-chip">${esc(lib)}</span>` : ''}</div>
            </div>
        </div>`;
}

function refreshResultCards() {
    resultsContainer.querySelectorAll('.item-card').forEach(card => {
        const inList = playlist.some(p => p.Id === card.dataset.id);
        card.classList.toggle('in-playlist', inList);
        const btn = card.querySelector('.add-btn i');
        if (btn) btn.className = `fas ${inList ? 'fa-check' : 'fa-plus'}`;
    });
    resultsContainer.querySelectorAll('.tr-row').forEach(row => {
        const inList = playlist.some(p => p.Id === row.dataset.id);
        row.classList.toggle('staged', inList);
        const icon = row.querySelector('.tr-add i');
        if (icon) icon.className = `fas ${inList ? 'fa-check' : 'fa-plus'}`;
    });
    resultsContainer.querySelectorAll('.song-row').forEach(row => {
        const inList = playlist.some(p => p.Id === row.dataset.id);
        row.classList.toggle('staged', inList);
        const icon = row.querySelector('.song-add i');
        if (icon) icon.className = `fas ${inList ? 'fa-check' : 'fa-plus'}`;
    });
    resultsContainer.querySelectorAll('.add-album-btn').forEach(btn => refreshAlbumButton(btn.dataset.album));
}

// ---------- Playlist ----------
function togglePlaylist(item) {
    const idx = playlist.findIndex(p => p.Id === item.Id);
    if (idx >= 0) {
        playlist.splice(idx, 1);
    } else {
        if (item.Type === 'Audio') {
            const parentAlbum = displayedAlbums().find(a => a.Id === item.ParentId) || musicAlbums.find(a => a.Id === item.ParentId);
            item._album = item.Album || (parentAlbum && parentAlbum.Name) || '';
            item._artist = (item.Artists && item.Artists[0]) || '';
        }
        playlist.push(item);
    }
    renderPlaylist();
    refreshResultCards();
}

function renderPlaylist() {
    const n = playlist.length;
    playlistCount.textContent = n;
    tabPlaylistCount.textContent = n;
    savePlaylistBtn.disabled = n === 0;
    clearPlaylistBtn.disabled = n === 0;

    if (n === 0) {
        const hint = isMusicMode() ? 'add songs from the album cards' : 'add titles from the results';
        playlistContainer.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="fas ${isMusicMode() ? 'fa-music' : 'fa-list'} fa-2x mb-2"></i>
                <p class="mb-0">Your playlist is empty — ${hint}</p>
            </div>`;
        return;
    }

    playlistContainer.innerHTML = playlist.map((item, idx) => {
        const music = item.Type === 'Audio';
        const thumbSrc = music && item.ParentId
            ? `${serverUrlInput.value.trim()}/Items/${item.ParentId}/Images/Primary?width=90`
            : (item.ImageTags && item.ImageTags.Primary
                ? `${serverUrlInput.value.trim()}/Items/${item.Id}/Images/Primary?width=90`
                : '');
        const thumb = thumbSrc
            ? `<img src="${thumbSrc}" alt="" class="pl-thumb ${music ? 'pl-thumb-music' : ''}" loading="lazy">`
            : `<div class="pl-thumb ${music ? 'pl-thumb-music' : ''} pl-placeholder"><i class="fas ${music ? 'fa-music' : 'fa-film'}"></i></div>`;
        const sub = music
            ? [item._artist || (item.Artists || [])[0] || '', item._album || item.Album || ''].filter(Boolean).join(' · ')
            : [item.ProductionYear || '', typeLabel(item), libraryName(item)].filter(Boolean).join(' · ');
        const detailBtn = music
            ? ''
            : `<button type="button" class="pl-tool pl-detail" title="Details"><i class="fas fa-circle-info"></i></button>`;
        return `
            <div class="pl-row" data-id="${item.Id}">
                ${thumb}
                <div class="pl-meta">
                    <div class="pl-title">${esc(item.Name)}</div>
                    <div class="pl-sub">${esc(sub)}</div>
                </div>
                <div class="pl-tools">
                    ${detailBtn}
                    <button type="button" class="pl-tool pl-up" title="Move up" ${idx === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
                    <button type="button" class="pl-tool pl-down" title="Move down" ${idx === n - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
                    <button type="button" class="pl-tool pl-remove" title="Remove"><i class="fas fa-xmark"></i></button>
                </div>
            </div>`;
    }).join('');
}

function sortPlaylist(mode) {
    if (playlist.length === 0 || mode === 'none') return;

    switch (mode) {
        case 'alphabetical':
            playlist.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
            break;
        case 'alphabeticalDesc':
            playlist.sort((a, b) => (b.Name || '').localeCompare(a.Name || ''));
            break;
        case 'album':
            playlist.sort((a, b) => {
                const byAlbum = (a._album || a.Album || '').localeCompare(b._album || b.Album || '');
                if (byAlbum !== 0) return byAlbum;
                return (a.ParentIndexNumber || 0) - (b.ParentIndexNumber || 0)
                    || (a.IndexNumber || 0) - (b.IndexNumber || 0);
            });
            break;
        case 'releaseDate':
            playlist.sort((a, b) => (b.ProductionYear || 0) - (a.ProductionYear || 0));
            break;
        case 'oldest':
            playlist.sort((a, b) => (a.ProductionYear || 0) - (b.ProductionYear || 0));
            break;
        case 'rating':
            playlist.sort((a, b) => (b.CommunityRating || 0) - (a.CommunityRating || 0));
            break;
        case 'random':
            for (let i = playlist.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
            }
            break;
    }
    renderPlaylist();
}

// ---------- Save ----------
async function savePlaylist() {
    if (playlist.length === 0) {
        showStatusMessage('Your playlist is empty', 'warning');
        return;
    }
    const name = playlistName.value.trim();
    if (!name) {
        showStatusMessage('Give your playlist a name first', 'warning');
        return;
    }
    if (!userId) {
        showStatusMessage('Select a playlist owner in the Owner dropdown first', 'warning');
        return;
    }

    savePlaylistBtn.disabled = true;
    savePlaylistBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    try {
        const ids = playlist.map(item => item.Id);
        const playlistData = {
            Name: name,
            UserId: userId,
            Users: [{ UserId: userId, CanEdit: true }],
            IsPublic: isPublicCheckbox.checked,
            MediaType: isMusicMode() ? 'audio' : 'video',
            Ids: ids.slice(0, 1000)
        };

        const response = await fetch(`${serverUrlInput.value.trim()}/Playlists`, {
            method: 'POST',
            headers: {
                'Authorization': authHeader(),
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(playlistData)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const result = await response.json();

        // Music playlists can exceed the 1000-id create cap; append the rest.
        for (let i = 1000; i < ids.length; i += 1000) {
            const chunk = ids.slice(i, i + 1000);
            const appendUrl = `${serverUrlInput.value.trim()}/Playlists/${result.Id}/Items?userId=${userId}&ids=${encodeURIComponent(chunk.join(','))}`;
            const appendResponse = await fetch(appendUrl, {
                method: 'POST',
                headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
            });
            if (!appendResponse.ok) throw new Error(`Playlist created but appending items ${i + 1}-${i + chunk.length} failed (HTTP ${appendResponse.status})`);
        }

        showStatusMessage(`Playlist "${esc(name)}" created on your server (${ids.length} item${ids.length === 1 ? '' : 's'})`, 'success');
    } catch (error) {
        console.error('Error saving playlist:', error);
        showStatusMessage(`Error creating playlist: ${error.message}`, 'danger');
    } finally {
        savePlaylistBtn.disabled = false;
        updateSaveButtonLabel();
    }
}

// ---------- Details modal ----------
function showItemDetails(item) {
    document.getElementById('detailTitle').textContent = item.Name || '';
    document.getElementById('detailType').textContent = typeLabel(item);

    let studio = '';
    if (item.Studios && item.Studios.length > 0) {
        studio = typeof item.Studios[0] === 'string' ? item.Studios[0] : (item.Studios[0].Name || '');
    }
    document.getElementById('detailStudio').textContent = studio || 'N/A';
    document.getElementById('detailCriticRating').textContent = item.CriticRating != null ? item.CriticRating.toFixed(1) : 'N/A';
    document.getElementById('detailCommunityRating').textContent = item.CommunityRating != null ? item.CommunityRating.toFixed(1) : 'N/A';
    document.getElementById('detailYear').textContent = item.ProductionYear || 'N/A';
    document.getElementById('detailOverview').textContent = item.Overview || 'No overview available.';

    const taglineSection = document.getElementById('taglineSection');
    if (item.Taglines && item.Taglines.length > 0) {
        document.getElementById('detailTagline').textContent = item.Taglines[0];
        taglineSection.style.display = 'block';
    } else {
        taglineSection.style.display = 'none';
    }

    const detailImage = document.getElementById('detailImage');
    if (item.ImageTags && item.ImageTags.Primary) {
        detailImage.src = `${serverUrlInput.value.trim()}/Items/${item.Id}/Images/Primary?width=300&height=450`;
        detailImage.alt = item.Name;
    } else {
        detailImage.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"%3E%3Crect fill="%23e9ecef" width="300" height="450"/%3E%3Ctext fill="%236c757d" font-family="Verdana" font-size="24" x="150" y="225" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E';
        detailImage.alt = 'No image available';
    }

    new bootstrap.Modal(document.getElementById('itemDetailModal')).show();
}

// ---------- Guided tour ----------
const TOUR_STEPS = [
    { text: 'Enter your Jellyfin server address & API key', targets: ['#serverUrl', '#apiKey'] },
    { text: 'Select the user who will own the playlist', targets: ['#userSelect'] },
    { text: 'Pick Movies / TV, or switch to Music — then type a search phrase', targets: ['.type-chips', '.search-main'] },
    { text: 'Hit Search — matching titles appear in this pane', targets: ['#searchBtn', '#resultsContainer'] },
    { text: 'Refine What You See — dial in years, rating, genres, studios', targets: ['#refineBtn', '#refinePopover'] },
    { text: 'Click the + on any card — it lands in your playlist over here', targets: ['.playlist-pane'] },
    { text: 'Name it, tweak the order, and save it to Jellyfin', targets: ['.pl-form'] }
];

let tourIndex = 0;
let tourTimer = null;
let tourOpenedRefine = false;

function fakeDemoCards() {
    return `
        <div class="item-card tour-fake" aria-hidden="true">
            <div class="card-actions"><span class="card-btn add-btn"><i class="fas fa-plus"></i></span></div>
            <div class="item-image item-placeholder tour-poster tour-poster-a"><span class="tour-poster-title">★ Five Star Movie ★</span></div>
            <div class="item-body">
                <div class="item-title">Five Star Movie</div>
                <div class="item-rating"><i class="fas fa-star"></i> 9.5/10</div>
                <div class="item-type">Movie<span class="lib-chip">Movies</span></div>
            </div>
        </div>
        <div class="item-card tour-fake" aria-hidden="true">
            <div class="card-actions"><span class="card-btn add-btn"><i class="fas fa-plus"></i></span></div>
            <div class="item-image item-placeholder tour-poster tour-poster-b"><span class="tour-poster-title"><i class="fas fa-magnifying-glass fa-2x"></i></span></div>
            <div class="item-body">
                <div class="item-title">The Show I'm Looking For</div>
                <div class="item-year">Released: 2026</div>
                <div class="item-type">TV Series<span class="lib-chip">TV Shows</span></div>
            </div>
        </div>`;
}

function startTour() {
    tourIndex = 0;
    tourBanner.hidden = false;
    showTourStep();
}

function showTourStep() {
    document.querySelectorAll('.tour-flash').forEach(el => el.classList.remove('tour-flash'));
    if (tourIndex > 4) {
        document.querySelectorAll('.tour-fake').forEach(el => el.remove());
    }

    const step = TOUR_STEPS[tourIndex];
    tourStepEl.textContent = `${tourIndex + 1}/${TOUR_STEPS.length}`;
    tourTextEl.textContent = step.text;
    tourBanner.classList.remove('tour-in');
    void tourBanner.offsetWidth;
    tourBanner.classList.add('tour-in');
    tourPrevBtn.disabled = tourIndex === 0;
    tourNextBtn.textContent = tourIndex === TOUR_STEPS.length - 1 ? 'Done' : 'Next';

    if (tourIndex === 3) {
        if (!resultsContainer.querySelector('.tour-fake')) {
            resultsContainer.insertAdjacentHTML('afterbegin', fakeDemoCards());
        }
        document.querySelectorAll('.tour-fake.static').forEach(el => el.classList.remove('static'));
    } else if (tourIndex === 4) {
        if (!resultsContainer.querySelector('.tour-fake')) {
            resultsContainer.insertAdjacentHTML('afterbegin', fakeDemoCards());
        }
        document.querySelectorAll('.tour-fake').forEach(el => el.classList.add('static'));
    }

    if (tourIndex === 4) {
        refinePopover.hidden = false;
        tourOpenedRefine = true;
    } else if (tourOpenedRefine) {
        refinePopover.hidden = true;
        tourOpenedRefine = false;
    }

    step.targets.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            el.classList.remove('tour-flash');
            void el.offsetWidth;
            el.classList.add('tour-flash');
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    });

    clearTimeout(tourTimer);
    tourTimer = setTimeout(nextTourStep, 3200);
}

function nextTourStep() {
    if (tourIndex < TOUR_STEPS.length - 1) {
        tourIndex++;
        showTourStep();
    } else {
        endTour();
    }
}

function prevTourStep() {
    if (tourIndex > 0) {
        tourIndex--;
        showTourStep();
    }
}

function endTour() {
    clearTimeout(tourTimer);
    tourTimer = null;
    document.querySelectorAll('.tour-flash').forEach(el => el.classList.remove('tour-flash'));
    document.querySelectorAll('.tour-fake').forEach(el => el.remove());
    if (tourOpenedRefine) {
        refinePopover.hidden = true;
        tourOpenedRefine = false;
    }
    tourBanner.hidden = true;
}

// ---------- Status ----------
function showStatusMessage(message, type) {
    const wrapper = document.createElement('div');
    wrapper.className = `alert alert-${type} alert-dismissible fade show`;
    wrapper.setAttribute('role', 'alert');
    wrapper.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
    statusMessages.insertAdjacentHTML('afterbegin', wrapper.outerHTML);

    setTimeout(() => {
        const first = statusMessages.querySelector('.alert');
        if (first) first.remove();
    }, 5000);
}
