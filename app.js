// ─────────────────────────────────────────────────────────────
//  app.js  –  Nasza Tablica v3  |  ntfy.sh push notifications
// ─────────────────────────────────────────────────────────────
import { initializeApp }     from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore,
         collection, addDoc, deleteDoc, doc,
         onSnapshot, serverTimestamp,
         query, orderBy,
         updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Stałe ────────────────────────────────────────────────────
const COLOR_MAP = {
  yellow:'#fef08a', pink:'#fbcfe8', blue:'#bfdbfe',
  green:'#bbf7d0',  orange:'#fed7aa', lilac:'#e9d5ff',
};
const PIN_COLOR = {
  yellow:'#ca8a04', pink:'#db2777', blue:'#2563eb',
  green:'#16a34a',  orange:'#ea580c', lilac:'#7c3aed',
};
const REACTIONS  = ['❤️','😂','👍','🎉','😘','🤔','😍','👀','✅','🔥'];
const rotations  = ['-rotate-2','-rotate-1','rotate-0','rotate-1','rotate-2','-rotate-3','rotate-3'];
function rnd(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

// ── ntfy ──────────────────────────────────────────────────────
let NTFY_TOPIC = '';

function initNtfyTopic(projectId) {
  const slug = projectId.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 20);
  NTFY_TOPIC = 'nasza-tablica-' + slug;
  console.log('[ntfy] topic ustawiony:', NTFY_TOPIC);
  // Przekaż temat do Service Workera
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'NTFY_SUBSCRIBE', topic: NTFY_TOPIC });
  }
  navigator.serviceWorker?.ready.then(reg => {
    (reg.active || reg.waiting)?.postMessage({ type: 'NTFY_SUBSCRIBE', topic: NTFY_TOPIC });
  });
}

async function ntfyPush(title, body, priority = 3) {
  if (!NTFY_TOPIC) { console.warn('[ntfy] brak tematu'); return; }
  const url = `https://ntfy.sh/${NTFY_TOPIC}`;
  console.log('[ntfy] wysylam:', url, title);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Title':        title,
        'Priority':     String(priority),
        'Tags':         'pushpin',
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: body,
    });
    console.log('[ntfy] status:', res.status);
  } catch(e) {
    console.error('[ntfy] blad:', e.message);
  }
}

// ── Stan ──────────────────────────────────────────────────────
let db = null, unsubscribe = null;
let selectedColor = 'yellow';
let currentAuthor = '', currentEmoji = '';
let emojiTargetId = null;
let deferredInstallPrompt = null;

// ── LocalStorage ─────────────────────────────────────────────
const LS_CFG  = 'nasza_tablica_config';
const LS_AUTH = 'nasza_tablica_author';
function saveConfig(c)  { localStorage.setItem(LS_CFG,  JSON.stringify(c)); }
function loadConfig()   { try { return JSON.parse(localStorage.getItem(LS_CFG));  } catch { return null; } }
function saveAuthorLS(a){ localStorage.setItem(LS_AUTH, JSON.stringify(a)); }
function loadAuthorLS() { try { return JSON.parse(localStorage.getItem(LS_AUTH)); } catch { return null; } }

// ── Wybór autora ─────────────────────────────────────────────
window.setAuthor = function(name, emoji) {
  currentAuthor = name; currentEmoji = emoji;
  document.querySelectorAll('.author-btn').forEach(b => {
    b.classList.remove('bg-white/20','border-white');
    b.classList.add('border-white/20');
  });
  const btn = document.getElementById(name === 'Ona' ? 'btn-ona' : 'btn-on');
  btn.classList.add('bg-white/20','border-white');
  btn.classList.remove('border-white/20');
};

// ── Start ─────────────────────────────────────────────────────
window.startApp = async function() {
  const apiKey     = document.getElementById('cfg-apiKey').value.trim();
  const authDomain = document.getElementById('cfg-authDomain').value.trim();
  const projectId  = document.getElementById('cfg-projectId').value.trim();
  if (!apiKey || !authDomain || !projectId) { showError('Uzupełnij wszystkie pola Firebase.'); return; }
  if (!currentAuthor)                        { showError('Wybierz, kim jesteś – Ona czy On?'); return; }
  document.getElementById('cfg-error').classList.add('hidden');
  const cfg = { apiKey, authDomain, projectId };
  saveConfig(cfg);
  saveAuthorLS({ name: currentAuthor, emoji: currentEmoji });
  initNtfyTopic(projectId);
  try {
    await initFirebase(cfg);
    showApp();
  } catch(e) { showError('Błąd połączenia: ' + e.message); }
};

function showError(msg) {
  const el = document.getElementById('cfg-error');
  el.textContent = msg; el.classList.remove('hidden');
}

// ── Firebase init ─────────────────────────────────────────────
async function initFirebase(cfg) {
  const app = initializeApp(cfg);
  db = getFirestore(app);
  startListening();
}

// ── Real-time listener ────────────────────────────────────────
let isFirstLoad = true;

function startListening() {
  if (unsubscribe) unsubscribe();
  isFirstLoad = true;
  const q = query(collection(db, 'notes'), orderBy('createdAt', 'desc'));

  unsubscribe = onSnapshot(q, (snapshot) => {
    const container = document.getElementById('notes-container');
    const loadingEl = document.getElementById('loading-state');
    const emptyEl   = document.getElementById('empty-state');
    loadingEl.classList.add('hidden');

    const existingIds  = new Set([...container.querySelectorAll('[data-note-id]')].map(e => e.dataset.noteId));
    const firestoreIds = new Set();
    snapshot.forEach(d => firestoreIds.add(d.id));

    // Usuń usunięte
    container.querySelectorAll('[data-note-id]').forEach(el => {
      if (!firestoreIds.has(el.dataset.noteId)) {
        el.style.transition = 'opacity 0.3s, transform 0.3s';
        el.style.opacity = '0'; el.style.transform = 'scale(0.8)';
        setTimeout(() => el.remove(), 300);
      }
    });

    // Dodaj nowe / zaktualizuj
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added' && !existingIds.has(change.doc.id)) {
        container.prepend(buildNoteElement(change.doc.id, change.doc.data()));
      }
      if (change.type === 'modified') {
        const old = container.querySelector(`[data-note-id="${change.doc.id}"]`);
        if (old) old.replaceWith(buildNoteElement(change.doc.id, change.doc.data()));
      }
    });

    isFirstLoad = false;
    emptyEl.classList.toggle('hidden', firestoreIds.size > 0);
    emptyEl.classList.toggle('flex',   firestoreIds.size === 0);
    snapshot.forEach(d => checkDeadlineAlert(d.id, d.data()));
  }, err => showToast('Błąd Firestore: ' + err.message, true));
}

// ── Budowanie karteczki ───────────────────────────────────────
function buildNoteElement(id, data) {
  const color = data.color || 'yellow';
  const bg    = COLOR_MAP[color] || COLOR_MAP.yellow;
  const pin   = PIN_COLOR[color] || '#ca8a04';
  const rot   = rnd(rotations);

  const wrapper = document.createElement('div');
  wrapper.style.breakInside = 'avoid';
  wrapper.style.marginBottom = '12px';
  wrapper.dataset.noteId = id;
  wrapper.classList.add('note-appear');

  let timeStr = '';
  if (data.createdAt?.toDate) {
    const d = data.createdAt.toDate();
    timeStr = d.toLocaleDateString('pl-PL',{day:'numeric',month:'short'})
            + ' ' + d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
  }

  let deadlineHtml = '';
  if (data.deadline) {
    const dl = new Date(data.deadline);
    const diff = dl - new Date();
    const hoursLeft = diff / 36e5;
    let cls, label;
    if      (diff < 0)         { cls = 'deadline-overdue'; label = '⚠️ Przeterminowane'; }
    else if (hoursLeft < 24)   { cls = 'deadline-soon';    label = `⏰ Za ${Math.round(hoursLeft)}h`; }
    else                       { cls = 'deadline-ok';      label = `📅 ${dl.toLocaleDateString('pl-PL',{day:'numeric',month:'short'})}`; }
    deadlineHtml = `<div class="deadline-badge ${cls}">${label}</div>`;
  }

  const reactions = data.reactions || {};
  const reactionPills = Object.entries(reactions).map(([emoji, users]) => {
    const mine = users.includes(currentAuthor);
    return `<span class="reaction-pill ${mine?'mine':''}" onclick="toggleReaction('${id}','${emoji}')">${emoji} <span>${users.length}</span></span>`;
  }).join('');

  const expired = data.deadline && new Date(data.deadline) < new Date();

  wrapper.innerHTML = `
    <div class="sticky-note rounded-sm p-4 pt-6 relative ${rot} ${expired?'note-expired':''}" style="background:${bg}">
      <div class="note-pin" style="background:${pin}"></div>
      <button class="delete-btn absolute top-2 right-2 w-6 h-6 rounded-full bg-black/10 hover:bg-red-400 hover:text-white text-gray-500 text-xs flex items-center justify-center transition leading-none"
        onclick="deleteNote('${id}')">✕</button>
      <div class="flex items-center gap-1 mb-1">
        <span class="text-base leading-none">${data.emoji||''}</span>
        <span class="author-badge text-gray-500">${data.author||''}</span>
      </div>
      ${data.title ? `<h3 class="font-handwritten font-bold text-lg text-gray-800 leading-tight mb-1">${escHtml(data.title)}</h3>` : ''}
      <p class="font-handwritten text-base text-gray-700 leading-snug whitespace-pre-wrap">${escHtml(data.content)}</p>
      ${deadlineHtml}
      <div class="reaction-bar mt-2">
        ${reactionPills}
        <span class="reaction-add" onclick="openEmojiModal('${id}')">＋</span>
      </div>
      ${timeStr ? `<p class="text-right text-gray-400 text-xs font-body mt-1 opacity-70">${timeStr}</p>` : ''}
    </div>`;
  return wrapper;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Zapis notatki ─────────────────────────────────────────────
window.saveNote = async function() {
  const title    = document.getElementById('note-title').value.trim();
  const content  = document.getElementById('note-content').value.trim();
  const deadline = document.getElementById('note-deadline').value;
  if (!content) { document.getElementById('note-content').focus(); return; }

  try {
    await addDoc(collection(db, 'notes'), {
      title, content, color: selectedColor,
      author: currentAuthor, emoji: currentEmoji,
      deadline: deadline || null,
      reactions: {},
      createdAt: serverTimestamp(),
    });
    closeModal();
    showToast('Karteczka przypięta! 📌');

    // 🔔 Wyślij push przez ntfy do drugiej osoby
    const pushTitle = `${currentEmoji} ${currentAuthor} dodał/a karteczkę`;
    const pushBody  = title ? `${title}: ${content.slice(0,80)}` : content.slice(0,100);
    await ntfyPush(pushTitle, pushBody, 4);

  } catch(e) { showToast('Błąd zapisu: ' + e.message, true); }
};

// ── Usuwanie ──────────────────────────────────────────────────
window.deleteNote = async function(id) {
  if (!confirm('Usunąć tę karteczkę?')) return;
  try { await deleteDoc(doc(db, 'notes', id)); }
  catch(e) { showToast('Błąd usuwania: ' + e.message, true); }
};

// ── Reakcje ───────────────────────────────────────────────────
window.openEmojiModal = function(noteId) {
  emojiTargetId = noteId;
  const container = document.getElementById('emoji-options');
  container.innerHTML = REACTIONS.map(e =>
    `<span class="emoji-opt" onclick="addReaction('${e}')">${e}</span>`
  ).join('');
  document.getElementById('emoji-modal').classList.remove('hidden');
  document.getElementById('emoji-modal').classList.add('flex');
};

window.closeEmojiModal = function(e) {
  if (!e || e.target === document.getElementById('emoji-modal')) {
    document.getElementById('emoji-modal').classList.add('hidden');
    document.getElementById('emoji-modal').classList.remove('flex');
  }
};

window.addReaction = async function(emoji) {
  closeEmojiModal();
  if (!emojiTargetId) return;
  await toggleReaction(emojiTargetId, emoji);
};

window.toggleReaction = async function(noteId, emoji) {
  try {
    const ref  = doc(db, 'notes', noteId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const reactions = snap.data().reactions || {};
    const users     = reactions[emoji] || [];
    const updated   = users.includes(currentAuthor)
      ? users.filter(u => u !== currentAuthor)
      : [...users, currentAuthor];
    const newReactions = { ...reactions, [emoji]: updated };
    if (!newReactions[emoji].length) delete newReactions[emoji];
    await updateDoc(ref, { reactions: newReactions });

    // Push reakcji do drugiej osoby
    if (!users.includes(currentAuthor)) {
      const noteData = snap.data();
      await ntfyPush(
        `${emoji} Reakcja od ${currentEmoji} ${currentAuthor}`,
        noteData.title || noteData.content.slice(0,60),
        2
      );
    }
  } catch(e) { showToast('Błąd reakcji: ' + e.message, true); }
};

// ── Deadline alert ────────────────────────────────────────────
const alertedDeadlines = new Set();
function checkDeadlineAlert(id, data) {
  if (!data.deadline || alertedDeadlines.has(id)) return;
  const diff = new Date(data.deadline) - new Date();
  if (diff > 0 && diff < 60 * 60 * 1000) {
    alertedDeadlines.add(id);
    const label = data.title || data.content.slice(0,20);
    showToast(`⏰ Termin "${label}" za mniej niż godzinę!`);
    ntfyPush('⏰ Nadchodzący termin!', `Karteczka "${label}" wygasa za mniej niż godzinę.`, 5);
  }
}
setInterval(() => {
  if (!db) return;
  alertedDeadlines.clear(); // odśwież co minutę
}, 60000);

// ── Modal ─────────────────────────────────────────────────────
window.openModal = function() {
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
  selectColor(document.querySelector('[data-color="yellow"]'), 'yellow');
  document.getElementById('note-title').value    = '';
  document.getElementById('note-content').value  = '';
  document.getElementById('note-deadline').value = '';
  updateModalBg();
  setTimeout(() => document.getElementById('note-content').focus(), 100);
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
  document.getElementById('modal-inner').style.background = COLOR_MAP[selectedColor] || '#fffde7';
}
document.getElementById('modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// ── Show App ──────────────────────────────────────────────────
function showApp() {
  document.getElementById('config-screen').style.display = 'none';
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('app').classList.add('flex');
  document.getElementById('header-author').textContent =
    `zalogowana/y jako: ${currentEmoji} ${currentAuthor}`;
  // Pokaż temat ntfy w headerze
  document.getElementById('ntfy-topic-display').textContent = NTFY_TOPIC;
  document.getElementById('ntfy-info').classList.remove('hidden');
}

window.showConfig = function() {
  if (!confirm('Wylogować się i wrócić do konfiguracji?')) return;
  if (unsubscribe) unsubscribe();
  document.getElementById('config-screen').style.display = 'flex';
  document.getElementById('app').classList.add('hidden');
  document.getElementById('app').classList.remove('flex');
};

window.copyNtfyTopic = function() {
  navigator.clipboard.writeText(NTFY_TOPIC).then(() => showToast('Skopiowano nazwę kanału! 📋'));
};

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = `fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-white text-sm font-body font-bold shadow-xl transition-all ${isError?'bg-red-500':'bg-gray-900'}`;
  el.style.whiteSpace = 'nowrap';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0'; el.style.transform = 'translate(-50%, 8px)';
    setTimeout(() => el.remove(), 400);
  }, 3000);
}

// ── PWA: Service Worker + ntfy background subscription ───────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      // Poczekaj aż SW będzie aktywny, potem wyślij temat ntfy
      await navigator.serviceWorker.ready;
      const sw = reg.active || reg.waiting || reg.installing;
      if (sw) {
        sw.postMessage({ type: 'NTFY_SUBSCRIBE', topic: NTFY_TOPIC });
      }
      // Też wyślij gdy SW się aktywuje
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        navigator.serviceWorker.controller?.postMessage({ type: 'NTFY_SUBSCRIBE', topic: NTFY_TOPIC });
      });
    } catch(e) {
      console.warn('SW registration failed:', e);
    }
  });
}

// ── PWA: Install Banner ───────────────────────────────────────
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  setTimeout(() => document.getElementById('install-banner').classList.add('visible'), 2000);
});
document.getElementById('install-btn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') showToast('Aplikacja zainstalowana! 🎉');
  deferredInstallPrompt = null;
  document.getElementById('install-banner').classList.remove('visible');
});
window.dismissInstall = function() {
  document.getElementById('install-banner').classList.remove('visible');
};
window.addEventListener('appinstalled', () => {
  document.getElementById('install-banner').classList.remove('visible');
  showToast('Aplikacja zainstalowana! 🎉');
});

// ── Auto-start ────────────────────────────────────────────────
(function autoStart() {
  const cfg    = loadConfig();
  const author = loadAuthorLS();
  if (cfg) {
    document.getElementById('cfg-apiKey').value     = cfg.apiKey     || '';
    document.getElementById('cfg-authDomain').value = cfg.authDomain || '';
    document.getElementById('cfg-projectId').value  = cfg.projectId  || '';
  }
  if (author) window.setAuthor(author.name, author.emoji);
  if (cfg?.apiKey && cfg?.projectId && author?.name) {
    currentAuthor = author.name; currentEmoji = author.emoji;
    initNtfyTopic(cfg.projectId);
    initFirebase(cfg).then(showApp).catch(e => showError('Błąd: ' + e.message));
  }
})();
