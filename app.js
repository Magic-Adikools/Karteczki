// ─────────────────────────────────────────────────────────────
//  app.js  –  Nasza Tablica  |  Firebase Firestore + real-time
// ─────────────────────────────────────────────────────────────
import { initializeApp }          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore,
         collection,
         addDoc,
         deleteDoc,
         doc,
         onSnapshot,
         serverTimestamp,
         query,
         orderBy }                from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Kolor karteczki → hex ────────────────────────────────────
const COLOR_MAP = {
  yellow: '#fef08a',
  pink:   '#fbcfe8',
  blue:   '#bfdbfe',
  green:  '#bbf7d0',
  orange: '#fed7aa',
  lilac:  '#e9d5ff',
};

// Kolor pinezki pasujący do karteczki
const PIN_COLOR = {
  yellow: '#ca8a04',
  pink:   '#db2777',
  blue:   '#2563eb',
  green:  '#16a34a',
  orange: '#ea580c',
  lilac:  '#7c3aed',
};

// Losowy lekki obrót karteczki
const rotations = ['-rotate-2', '-rotate-1', 'rotate-0', 'rotate-1', 'rotate-2', '-rotate-3', 'rotate-3'];
function randomRotation() { return rotations[Math.floor(Math.random() * rotations.length)]; }

// ── Stan aplikacji ───────────────────────────────────────────
let db            = null;
let unsubscribe   = null;
let selectedColor = 'yellow';
let currentAuthor = '';
let currentEmoji  = '';

// ── LocalStorage helpers ─────────────────────────────────────
const LS_CONFIG = 'nasza_tablica_config';
const LS_AUTHOR = 'nasza_tablica_author';

function saveConfig(cfg) { localStorage.setItem(LS_CONFIG, JSON.stringify(cfg)); }
function loadConfig()    { try { return JSON.parse(localStorage.getItem(LS_CONFIG)); } catch { return null; } }
function saveAuthorLS(a) { localStorage.setItem(LS_AUTHOR, JSON.stringify(a)); }
function loadAuthorLS()  { try { return JSON.parse(localStorage.getItem(LS_AUTHOR)); } catch { return null; } }

// ── Wybór autora (przycisk Ona / On) ────────────────────────
window.setAuthor = function(name, emoji) {
  currentAuthor = name;
  currentEmoji  = emoji;
  document.querySelectorAll('.author-btn').forEach(b => {
    b.classList.remove('bg-white/20', 'border-white');
    b.classList.add('border-white/20');
  });
  const id = name === 'Ona' ? 'btn-ona' : 'btn-on';
  const btn = document.getElementById(id);
  btn.classList.add('bg-white/20', 'border-white');
  btn.classList.remove('border-white/20');
};

// ── Start aplikacji ──────────────────────────────────────────
window.startApp = async function() {
  const apiKey     = document.getElementById('cfg-apiKey').value.trim();
  const authDomain = document.getElementById('cfg-authDomain').value.trim();
  const projectId  = document.getElementById('cfg-projectId').value.trim();
  const errEl      = document.getElementById('cfg-error');

  if (!apiKey || !authDomain || !projectId) {
    showError('Uzupełnij wszystkie pola konfiguracji Firebase.'); return;
  }
  if (!currentAuthor) {
    showError('Wybierz, kim jesteś – Ona czy On?'); return;
  }

  errEl.classList.add('hidden');

  const cfg = { apiKey, authDomain, projectId };
  saveConfig(cfg);
  saveAuthorLS({ name: currentAuthor, emoji: currentEmoji });

  try {
    await initFirebase(cfg);
    showApp();
  } catch (e) {
    showError('Błąd połączenia z Firebase: ' + e.message);
  }
};

function showError(msg) {
  const el = document.getElementById('cfg-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ── Inicjalizacja Firebase ───────────────────────────────────
async function initFirebase(cfg) {
  const app = initializeApp(cfg);
  db = getFirestore(app);
  startListening();
}

// ── Nasłuchiwanie w czasie rzeczywistym ─────────────────────
function startListening() {
  if (unsubscribe) unsubscribe(); // odepnij poprzednie

  const q = query(collection(db, 'notes'), orderBy('createdAt', 'desc'));

  unsubscribe = onSnapshot(q, (snapshot) => {
    const container  = document.getElementById('notes-container');
    const loadingEl  = document.getElementById('loading-state');
    const emptyEl    = document.getElementById('empty-state');

    loadingEl.classList.add('hidden');

    // Tworzymy mapę obecnych notatek w DOM
    const existingIds = new Set();
    container.querySelectorAll('[data-note-id]').forEach(el => existingIds.add(el.dataset.noteId));

    // Zbieramy ID z Firestore
    const firestoreIds = new Set();
    snapshot.forEach(d => firestoreIds.add(d.id));

    // Usuń z DOM to, czego nie ma w Firestore
    container.querySelectorAll('[data-note-id]').forEach(el => {
      if (!firestoreIds.has(el.dataset.noteId)) {
        el.style.transition = 'opacity 0.3s, transform 0.3s';
        el.style.opacity = '0';
        el.style.transform = 'scale(0.8)';
        setTimeout(() => el.remove(), 300);
      }
    });

    // Dodaj nowe
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        if (!existingIds.has(change.doc.id)) {
          const noteEl = buildNoteElement(change.doc.id, change.doc.data());
          container.prepend(noteEl);
        }
      }
    });

    // Pokaż / ukryj empty state
    if (firestoreIds.size === 0) {
      emptyEl.classList.remove('hidden');
      emptyEl.classList.add('flex');
    } else {
      emptyEl.classList.add('hidden');
      emptyEl.classList.remove('flex');
    }
  }, (err) => {
    console.error(err);
    showToast('Błąd Firestore: ' + err.message, true);
  });
}

// ── Budowanie elementu karteczki ─────────────────────────────
function buildNoteElement(id, data) {
  const color  = data.color  || 'yellow';
  const bg     = COLOR_MAP[color] || COLOR_MAP.yellow;
  const pin    = PIN_COLOR[color] || '#ca8a04';
  const rot    = randomRotation();

  const wrapper = document.createElement('div');
  wrapper.style.breakInside = 'avoid';
  wrapper.style.marginBottom = '12px';
  wrapper.dataset.noteId = id;
  wrapper.classList.add('note-appear');

  // Czas
  let timeStr = '';
  if (data.createdAt?.toDate) {
    const d = data.createdAt.toDate();
    timeStr = d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
            + ' ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  }

  wrapper.innerHTML = `
    <div class="sticky-note rounded-sm p-4 pt-6 relative ${rot}" style="background:${bg}">
      <!-- Pin -->
      <div class="note-pin" style="background:${pin}"></div>
      <!-- Delete -->
      <button class="delete-btn absolute top-2 right-2 w-6 h-6 rounded-full bg-black/10 hover:bg-red-400 hover:text-white text-gray-500 text-xs flex items-center justify-center transition leading-none"
        onclick="deleteNote('${id}')">✕</button>
      <!-- Author badge -->
      <div class="flex items-center gap-1 mb-2">
        <span class="text-base leading-none">${data.emoji || ''}</span>
        <span class="author-badge text-gray-500">${data.author || ''}</span>
      </div>
      ${data.title ? `<h3 class="font-handwritten font-bold text-lg text-gray-800 leading-tight mb-1">${escHtml(data.title)}</h3>` : ''}
      <p class="font-handwritten text-base text-gray-700 leading-snug whitespace-pre-wrap">${escHtml(data.content)}</p>
      ${timeStr ? `<p class="text-right text-gray-400 text-xs font-body mt-2 opacity-70">${timeStr}</p>` : ''}
    </div>
  `;

  return wrapper;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── Dodawanie notatki ────────────────────────────────────────
window.saveNote = async function() {
  const title   = document.getElementById('note-title').value.trim();
  const content = document.getElementById('note-content').value.trim();

  if (!content) {
    document.getElementById('note-content').focus();
    return;
  }

  try {
    await addDoc(collection(db, 'notes'), {
      title,
      content,
      color:     selectedColor,
      author:    currentAuthor,
      emoji:     currentEmoji,
      createdAt: serverTimestamp(),
    });
    closeModal();
    showToast('Karteczka przypięta! 📌');
  } catch (e) {
    showToast('Błąd zapisu: ' + e.message, true);
  }
};

// ── Usuwanie notatki ─────────────────────────────────────────
window.deleteNote = async function(id) {
  if (!confirm('Usunąć tę karteczkę?')) return;
  try {
    await deleteDoc(doc(db, 'notes', id));
  } catch (e) {
    showToast('Błąd usuwania: ' + e.message, true);
  }
};

// ── Modal ────────────────────────────────────────────────────
window.openModal = function() {
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
  document.getElementById('note-content').focus();
  // Reset do żółtego
  selectColor(document.querySelector('[data-color="yellow"]'), 'yellow');
  document.getElementById('note-title').value   = '';
  document.getElementById('note-content').value = '';
  // Ustaw tło modala
  updateModalBg();
};

window.closeModal = function() {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('modal').classList.remove('flex');
};

window.selectColor = function(el, color) {
  selectedColor = color;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  updateModalBg();
};

function updateModalBg() {
  const card = document.getElementById('modal-inner');
  card.style.background = COLOR_MAP[selectedColor] || '#fffde7';
}

// Zamknij modal klikając poza nim
document.getElementById('modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// ── Pokazywanie ekranu aplikacji ─────────────────────────────
function showApp() {
  document.getElementById('config-screen').style.display = 'none';
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('app').classList.add('flex');
  document.getElementById('header-author').textContent =
    `zalogowana/y jako: ${currentEmoji} ${currentAuthor}`;
}

// ── Powrót do konfiguracji ───────────────────────────────────
window.showConfig = function() {
  if (!confirm('Wylogować się i wrócić do konfiguracji?')) return;
  if (unsubscribe) unsubscribe();
  document.getElementById('config-screen').style.display = 'flex';
  document.getElementById('app').classList.add('hidden');
  document.getElementById('app').classList.remove('flex');
};

// ── Toast powiadomienie ──────────────────────────────────────
function showToast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = `fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-white text-sm font-body font-bold shadow-xl transition-all
    ${isError ? 'bg-red-500' : 'bg-gray-900'}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, 8px)';
    setTimeout(() => el.remove(), 400);
  }, 2500);
}

// ── Auto-start jeśli config zapisana ────────────────────────
(function autoStart() {
  const cfg    = loadConfig();
  const author = loadAuthorLS();

  if (cfg) {
    document.getElementById('cfg-apiKey').value     = cfg.apiKey     || '';
    document.getElementById('cfg-authDomain').value = cfg.authDomain || '';
    document.getElementById('cfg-projectId').value  = cfg.projectId  || '';
  }

  if (author) {
    window.setAuthor(author.name, author.emoji);
  }

  // Jeśli wszystko jest zapisane – wejdź od razu
  if (cfg && cfg.apiKey && cfg.projectId && author?.name) {
    currentAuthor = author.name;
    currentEmoji  = author.emoji;
    initFirebase(cfg).then(showApp).catch(e => {
      showError('Błąd połączenia: ' + e.message);
    });
  }
})();
