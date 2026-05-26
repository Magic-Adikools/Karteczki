// ─────────────────────────────────────────────────────────────
//  app.js  –  Nasza Tablica v2  |  PWA + Reakcje + Deadline + PUSH
// ─────────────────────────────────────────────────────────────
import { initializeApp }       from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore,
         collection, addDoc, deleteDoc, doc,
         onSnapshot, serverTimestamp,
         query, orderBy,
         updateDoc, getDoc, setDoc, getDocs }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Stałe ────────────────────────────────────────────────────
const COLOR_MAP = {
  yellow:'#fef08a', pink:'#fbcfe8', blue:'#bfdbfe',
  green:'#bbf7d0',  orange:'#fed7aa', lilac:'#e9d5ff',
};
const PIN_COLOR = {
  yellow:'#ca8a04', pink:'#db2777', blue:'#2563eb',
  green:'#16a34a',  orange:'#ea580c', lilac:'#7c3aed',
};
const REACTIONS = ['❤️','😂','👍','🎉','😘','🤔','😍','👀','✅','🔥'];
const rotations = ['-rotate-2','-rotate-1','rotate-0','rotate-1','rotate-2','-rotate-3','rotate-3'];
function rnd(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

// ── Stan ─────────────────────────────────────────────────────
let db = null, unsubscribe = null, firebaseApp = null;
let selectedColor = 'yellow';
let currentAuthor = '', currentEmoji = '';
let emojiTargetId = null;
let deferredInstallPrompt = null;

// ── LocalStorage ─────────────────────────────────────────────
const LS_AUTH = 'nasza_tablica_author';
function saveAuthorLS(a){ localStorage.setItem(LS_AUTH, JSON.stringify(a)); }
function loadAuthorLS() { try { return JSON.parse(localStorage.getItem(LS_AUTH)); } catch { return null; } }

// ── Wybór autora ─────────────────────────────────────────────
window.setAuthor = function(name, emoji) {
  currentAuthor = name; currentEmoji = emoji;
  document.querySelectorAll('.author-btn').forEach(b => {
    b.classList.remove('bg-white/20','border-white'); b.classList.add('border-white/20');
  });
  const btn = document.getElementById(name === 'Ona' ? 'btn-ona' : 'btn-on');
  btn.classList.add('bg-white/20','border-white'); btn.classList.remove('border-white/20');
};

// ── Start (Ignoruje pola tekstowe, bierze config z kodu) ───
window.startApp = async function() {
  if (!currentAuthor) { showError('Wybierz, kim jesteś – Ona czy On?'); return; }
  document.getElementById('cfg-error').classList.add('hidden');
  
  saveAuthorLS({ name: currentAuthor, emoji: currentEmoji });
  try { 
    await initFirebase(); 
    showApp(); 
  }
  catch(e) { showError('Błąd połączenia: ' + e.message); }
};

function showError(msg) {
  const el = document.getElementById('cfg-error');
  el.textContent = msg; el.classList.remove('hidden');
}

// ── Firebase init ────────────────────────────────────────────
const FIREBASE_FULL_CONFIG = {
  apiKey:            'AIzaSyCazP8eaEu66_q05CJM_ay70rOg0YDnZaY',
  authDomain:        'karteczki-883d8.firebaseapp.com',
  projectId:         'karteczki-883d8',
  storageBucket:     'karteczki-883d8.firebasestorage.app',
  messagingSenderId: '558209472773',
  appId:             '1:558209472773:web:be7abb30669a1fdf71bf6c',
};

async function initFirebase() {
  firebaseApp = initializeApp(FIREBASE_FULL_CONFIG);
  db = getFirestore(firebaseApp);
  startListening();
}

// ── Real-time listener ───────────────────────────────────────
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
    const firestoreIds = new Set(); snapshot.forEach(d => firestoreIds.add(d.id));

    // Usuń usunięte
    container.querySelectorAll('[data-note-id]').forEach(el => {
      if (!firestoreIds.has(el.dataset.noteId)) {
        el.style.transition = 'opacity 0.3s, transform 0.3s';
        el.style.opacity = '0'; el.style.transform = 'scale(0.8)';
        setTimeout(() => el.remove(), 300);
      }
    });

    // Dodaj nowe / zaktualizuj zmodyfikowane
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added' && !existingIds.has(change.doc.id)) {
        container.prepend(buildNoteElement(change.doc.id, change.doc.data()));
      }
      if (change.type === 'modified') {
        const old = container.querySelector(`[data-note-id="${change.doc.id}"]`);
        if (old) {
          const newEl = buildNoteElement(change.doc.id, change.doc.data());
          old.replaceWith(newEl);
        }
      }
    });

    isFirstLoad = false;

    emptyEl.classList.toggle('hidden', firestoreIds.size > 0);
    emptyEl.classList.toggle('flex',   firestoreIds.size === 0);

    snapshot.forEach(d => checkDeadlineAlert(d.id, d.data()));
  }, err => { showToast('Błąd Firestore: ' + err.message, true); });
}

// ── Budowanie karteczki ──────────────────────────────────────
function buildNoteElement(id, data) {
  const color  = data.color || 'yellow';
  const bg     = COLOR_MAP[color] || COLOR_MAP.yellow;
  const pin    = PIN_COLOR[color] || '#ca8a04';
  const rot    = rnd(rotations);

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
    const dl    = new Date(data.deadline);
    const now   = new Date();
    const diff  = dl - now;
    const hoursLeft = diff / 36e5;
    let cls, label;
    if (diff < 0) {
      cls = 'deadline-overdue'; label = '⚠️ Przeterminowane';
    } else if (hoursLeft < 24) {
      cls = 'deadline-soon';
      label = `⏰ Za ${Math.round(hoursLeft)}h`;
    } else {
      cls = 'deadline-ok';
      label = `📅 ${dl.toLocaleDateString('pl-PL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`;
    }
    deadlineHtml = `<div class="deadline-badge ${cls}">${label}</div>`;
  }

  const reactions = data.reactions || {};
  const reactionPills = Object.entries(reactions).map(([emoji, users]) => {
    const count = users.length;
    const mine  = users.includes(currentAuthor);
    return `<span class="reaction-pill ${mine?'mine':''}" onclick="toggleReaction('${id}','${emoji}')">${emoji} <span>${count}</span></span>`;
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
    </div>
  `;
  return wrapper;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Zapis notatki ────────────────────────────────────────────
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
    
    const pushBody = content.length > 40 ? content.slice(0, 40) + "..." : content;
    await sendPushToPartner(`📌 Nowa wiadomość od: ${currentAuthor}`, pushBody);
    
  } catch(e) { showToast('Błąd zapisu: ' + e.message, true); }
};

// ── Usuwanie ─────────────────────────────────────────────────
window.deleteNote = async function(id) {
  if (!confirm('Usunąć tę karteczkę?')) return;
  try { await deleteDoc(doc(db, 'notes', id)); }
  catch(e) { showToast('Błąd usuwania: ' + e.message, true); }
};

// ── Reakcje ──────────────────────────────────────────────────
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
    let updated;
    if (users.includes(currentAuthor)) {
      updated = users.filter(u => u !== currentAuthor);
    } else {
      updated = [...users, currentAuthor];
    }
    const newReactions = { ...reactions, [emoji]: updated };
    if (newReactions[emoji].length === 0) delete newReactions[emoji];
    await updateDoc(ref, { reactions: newReactions });
  } catch(e) { showToast('Błąd reakcji: ' + e.message, true); }
};

// ── Deadline alert ───────────────────────────────────────────
const alertedDeadlines = new Set();

function checkDeadlineAlert(id, data) {
  if (!data.deadline || alertedDeadlines.has(id)) return;
  const dl   = new Date(data.deadline);
  const diff = dl - new Date();
  if (diff > 0 && diff < 60 * 60 * 1000) {
    alertedDeadlines.add(id);
    showToast(`⏰ Termin karteczki "${data.title||data.content.slice(0,20)}" za mniej niż godzinę!`, false);
  }
}

setInterval(() => {
  const container = document.getElementById('notes-container');
  if (!container || !db) return;
  container.querySelectorAll('[data-note-id]').forEach(el => {
    const badge = el.querySelector('.deadline-badge');
    if (badge) el.classList.toggle('note-expired', el.querySelector('.deadline-overdue') !== null);
  });
}, 60000);

// ── FCM Push Notifications ───────────────────────────────────
let fcmMessaging = null;

async function initFCM() {
  try {
    if (!currentAuthor) {
      console.warn('[FCM] Próba inicjalizacji bez wybranego autora. Przerywam.');
      return;
    }

    const { getMessaging, getToken, onMessage } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js'
    );

    fcmMessaging = getMessaging(firebaseApp);
    const swReg = await navigator.serviceWorker.ready;

    const token = await getToken(fcmMessaging, {
      vapidKey: 'BHUXtF6k8ZeXYIoLXj2VVlcETyX8NB6tHMqINeB0vKhmK6FlD-zcRU_oY39HjnVGL1RvaRkaf95XY0llJEagxk8',
      serviceWorkerRegistration: swReg,
    });

    if (token) {
      console.log('[FCM] token OK:', token.slice(0,20) + '...');
      const safeTokenId = btoa(token).replace(/[/+=]/g, '_');
      
      await setDoc(doc(db, 'fcm_tokens', safeTokenId), {
        token,
        author: currentAuthor,
        updatedAt: new Date().toISOString(),
      });
      console.log('[FCM] token zapisany dla użytkownika:', currentAuthor);
      showToast('🔔 Powiadomienia włączone!');
    } else {
      console.warn('[FCM] brak tokena');
    }

    onMessage(fcmMessaging, (payload) => {
      showToast(`🔔 ${payload.notification?.title || 'Nowa karteczka!'}`);
    });

  } catch(e) {
    console.error('[FCM] błąd:', e.message);
  }
}

// ── Funkcja wysyłająca powiadomienie do partnera ─────────────
async function sendPushToPartner(title, body) {
  try {
    const querySnapshot = await getDocs(collection(db, 'fcm_tokens'));
    querySnapshot.forEach(async (docSnap) => {
      const data = docSnap.data();
      if (data.author !== currentAuthor && data.token) {
        await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'key=AIzaSyCazP8eaEu66_q05CJM_ay70rOg0YDnZaY'
          },
          body: JSON.stringify({
            to: data.token,
            notification: {
              title: title,
              body: body,
              icon: '/Karteczki/icon-192.png',
              click_action: 'https://magic-adikools.github.io/Karteczki/'
            }
          })
        });
        console.log(`[FCM] W
