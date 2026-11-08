/* S2C Virtual Office — Firebase lobby + live room.
   The office code talks to a small "room" interface (presence, peers, private messages).
   On claude.ai that came from the artifact runtime; here it is backed by Firebase Realtime Database. */
(function(){
"use strict";
const ROLES = [["mp","Managing Partner"],["ceo","CEO"],["cfo","CFO"],["coo","COO"],["qm","Quality Manager"],["gm","General Manager"]];
const ROLE_NAME = Object.fromEntries(ROLES);
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const $ = id => document.getElementById(id);
const tidy = (s, n) => String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g, "").trim().slice(0, n);

let resolveRoom; const roomReady = new Promise(r => { resolveRoom = r; });
window.claude = { use: async name => name === "room" ? roomReady : null };

let db = null, uid = null, code = null, meta = null, claims = {}, claimsRef = null, myRole = "agent";
const show = id => { for (const s of ["lobbyStart","lobbyHost","lobbyCreated","lobbyPick"]) $(s).hidden = s !== id; $("signinForm").hidden = id !== "form"; };
const err = (id, text) => { $(id).textContent = text || ""; $(id).hidden = !text; };

/* ---------- live room on Firebase ---------- */
function makeRoom(){
  const base = db.ref("lobbies/" + code), me = base.child("presence/" + uid), inbox = base.child("inbox/" + uid);
  const peers = new Map(), peerFns = [];
  let local = {}, pending = {}, timer = 0, connected = false;
  const peerOf = (key, val) => ({peer:key, by:null, isMe:key === uid, sameTab:key === uid, kind:"viewer", guest:false, presence:val || {}, updatedAt:Date.now()});
  const notify = ch => { const list = [...peers.values()]; for (const f of peerFns) try { f({peers:list, joined:ch.joined || [], left:ch.left || [], updated:ch.updated || []}); } catch (e) { console.error(e); } };
  const pres = base.child("presence");
  pres.on("child_added", s => { const p = peerOf(s.key, s.val()); peers.set(s.key, p); notify({joined:[p]}); });
  pres.on("child_changed", s => { const p = peerOf(s.key, s.val()); peers.set(s.key, p); notify({updated:[p]}); });
  pres.on("child_removed", s => { const p = peers.get(s.key) || peerOf(s.key, s.val()); peers.delete(s.key); notify({left:[p]}); });
  const flush = () => { timer = 0; const patch = pending; pending = {}; if (Object.keys(patch).length) me.update(patch).catch(e => console.warn("presence", e)); };
  // re-register on every (re)connect: presence and the role claim are removed when the connection drops
  db.ref(".info/connected").on("value", s => {
    connected = !!s.val(); if (!connected) return;
    me.onDisconnect().remove();
    if (myRole !== "agent"){ const c = base.child("claims/" + myRole); c.onDisconnect().remove(); c.transaction(v => (v === null || v === uid) ? uid : undefined); }
    if (Object.keys(local).length) me.set(local).catch(e => console.warn("presence", e));
  });
  const handlers = {};
  inbox.on("child_added", s => {
    const v = s.val(); s.ref.remove().catch(() => {});
    if (!v || typeof v !== "object") return;
    const fn = handlers[v.topic]; if (fn) fn({topic:v.topic, data:v.data, peer:v.from, by:null, isMe:false, sameTab:false, kind:"viewer", guest:false});
  });
  return {
    onConnection(fn){ const r = db.ref(".info/connected"), h = s => fn(!!s.val()); r.on("value", h); return () => r.off("value", h); },
    on(topic, fn){ handlers[topic] = fn; return () => { if (handlers[topic] === fn) delete handlers[topic]; }; },
    async emit(topic, data){
      const to = data && typeof data.to === "string" ? data.to : null; if (!to) return;
      await base.child("inbox/" + to).push({topic, data, from:uid, ts:firebase.database.ServerValue.TIMESTAMP});
    },
    async presence(patch){
      for (const [k, v] of Object.entries(patch || {})){
        const val = v === undefined ? null : (Array.isArray(v) && !v.length ? null : v);
        if (val === null) delete local[k]; else local[k] = val;
        pending[k] = val;
      }
      if (!timer) timer = setTimeout(flush, 90);
    },
    onPeers(fn){ peerFns.push(fn); if (peers.size) setTimeout(() => fn({peers:[...peers.values()], joined:[...peers.values()], left:[], updated:[]}), 0); return () => { const i = peerFns.indexOf(fn); if (i >= 0) peerFns.splice(i, 1); }; },
    peers(){ return [...peers.values()]; },
  };
}

/* ---------- lobby screens ---------- */
function setHash(c){ try { history.replaceState(null, "", "#" + c); } catch {} }
async function lookup(c){
  const snap = await db.ref("lobbies/" + c + "/meta").once("value");
  return snap.exists() ? snap.val() : null;
}
function watchClaims(){
  if (claimsRef) claimsRef.off();
  claimsRef = db.ref("lobbies/" + code + "/claims");
  claimsRef.on("value", s => { claims = s.val() || {}; renderPick(); });
}
function renderPick(){
  if ($("lobbyPick").hidden) return;
  const list = $("pickList"), prev = (list.querySelector("input:checked") || {}).value;
  list.replaceChildren();
  const roster = (meta && meta.roster) || {};
  for (const [role, label] of ROLES){
    const name = tidy(roster[role], 20); if (!name || role === "mp") continue;
    const takenByOther = claims[role] && claims[role] !== uid;
    list.append(pickRow(role, name, takenByOther ? "Already in the office" : label, takenByOther));
  }
  list.append(pickRow("agent", "I'm an Agent", "Type your name", false));
  const sel = list.querySelector(`input[value="${prev}"]:not(:disabled)`) || null;
  if (sel) sel.checked = true;
  $("agentNameField").hidden = !(sel && sel.value === "agent");
}
function pickRow(value, name, state, disabled){
  const l = document.createElement("label"), i = document.createElement("input");
  i.type = "radio"; i.name = "who"; i.value = value; i.id = "who-" + value; i.disabled = disabled;
  i.addEventListener("change", () => { $("agentNameField").hidden = value !== "agent"; if (value === "agent") $("agentName").focus(); });
  const w = document.createElement("span"); w.className = "who"; w.textContent = name;
  const st = document.createElement("span"); st.className = "state"; st.textContent = state;
  l.append(i, w, st); return l;
}
async function claim(role){
  if (role === "agent") return true;
  const ref = db.ref("lobbies/" + code + "/claims/" + role);
  const res = await ref.transaction(v => (v === null || v === uid) ? uid : undefined);
  if (!res.committed) return false;
  ref.onDisconnect().remove();
  return true;
}
function enterOffice(name, role){
  myRole = role;
  if (claimsRef) claimsRef.off();
  resolveRoom(makeRoom());
  $("nameInput").value = name; $("nameInput").readOnly = role !== "agent";
  const radio = document.getElementById("role-" + role); if (radio) radio.checked = true;
  $("roleField").hidden = true;
  $("signinTitle").textContent = role === "agent" ? "Choose your character" : `Welcome, ${name}`;
  $("signinLead").textContent = role === "agent" ? "Pick a character, then walk in through the front entrance." : `You're joining as ${ROLE_NAME[role]}. Pick a character, then walk in through the front entrance.`;
  $("lobbyPill").hidden = false; $("lobbyPillCode").textContent = code;
  $("hostBtn").hidden = !(meta && meta.host === uid);
  show("form");
}

async function boot(){
  show("lobbyStart");
  const cfg = window.FIREBASE_CONFIG;
  if (!window.firebase || !cfg || !cfg.apiKey || /^YOUR_/.test(cfg.apiKey)){
    err("startErr", "Firebase isn't set up yet. Add your project's settings to firebase-config.js, then reload.");
    $("findBtn").disabled = true; $("hostStartBtn").disabled = true; return;
  }
  try {
    firebase.initializeApp(cfg);
    const cred = await firebase.auth().signInAnonymously(); uid = cred.user.uid; db = firebase.database();
  } catch (e) {
    err("startErr", "Couldn't connect to Firebase. Check that Anonymous sign-in is turned on, then reload."); console.error(e); return;
  }
  const h = (location.hash || "").replace("#", "").toUpperCase();
  if (/^[A-Z0-9]{6}$/.test(h)) $("codeInput").value = h;
}

$("joinForm").addEventListener("submit", async e => {
  e.preventDefault(); err("startErr", "");
  if (!db) return;
  const c = tidy($("codeInput").value, 6).toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(c)){ err("startErr", "Lobby codes are 6 letters and numbers."); return; }
  $("findBtn").disabled = true;
  try {
    const m = await lookup(c);
    if (!m){ err("startErr", "No lobby has that code. Check it with your Managing Partner."); return; }
    code = c; meta = m; setHash(c);
    if (m.host === uid){ const ok = await claim("mp"); if (ok){ enterOffice(tidy(m.roster && m.roster.mp, 20) || "Managing Partner", "mp"); return; } }
    $("pickIntro").textContent = `Lobby ${c}. Pick your name from the roster, or join as an Agent.`;
    show("lobbyPick"); renderPick(); watchClaims();
    db.ref("lobbies/" + c + "/meta").on("value", s => { if (s.exists()){ meta = s.val(); renderPick(); } });
  } catch (e2) { err("startErr", "Couldn't reach the lobby. Check your connection and try again."); console.error(e2); }
  finally { $("findBtn").disabled = false; }
});
$("hostStartBtn").addEventListener("click", () => { if (db) show("lobbyHost"); });
$("hostBackBtn").addEventListener("click", () => show("lobbyStart"));
$("pickBackBtn").addEventListener("click", () => { if (claimsRef) claimsRef.off(); show("lobbyStart"); });

$("lobbyHost").addEventListener("submit", async e => {
  e.preventDefault(); err("hostErr", "");
  const roster = {}; for (const [role] of ROLES) roster[role] = tidy($("host-" + role).value, 20);
  if (!roster.mp){ err("hostErr", "Add your name as the Managing Partner."); return; }
  $("hostCreateBtn").disabled = true;
  try {
    for (let tries = 0; tries < 6; tries++){
      const c = Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CODE_CHARS[b % CODE_CHARS.length]).join("");
      const res = await db.ref("lobbies/" + c + "/meta").transaction(v => v === null ? {host:uid, created:Date.now(), roster} : undefined);
      if (res.committed){ code = c; meta = res.snapshot.val(); break; }
    }
    if (!code){ err("hostErr", "Couldn't create a lobby. Try again."); return; }
    await claim("mp"); setHash(code);
    $("createdCode").textContent = code; show("lobbyCreated");
  } catch (e2) { err("hostErr", "Couldn't create the lobby. Check your Firebase rules and connection."); console.error(e2); }
  finally { $("hostCreateBtn").disabled = false; }
});
const shareLink = () => location.origin + location.pathname + "#" + code;
async function copyText(text, btn){
  try { await navigator.clipboard.writeText(text); const t = btn.textContent; btn.textContent = "Copied"; setTimeout(() => { btn.textContent = t; }, 1500); }
  catch { prompt("Copy this link:", text); }
}
$("copyLinkBtn").addEventListener("click", e => copyText(shareLink(), e.currentTarget));
$("hostEnterBtn").addEventListener("click", () => enterOffice(meta.roster.mp, "mp"));

$("lobbyPick").addEventListener("submit", async e => {
  e.preventDefault(); err("pickErr", "");
  const sel = $("pickList").querySelector("input:checked");
  if (!sel){ err("pickErr", "Pick your name, or choose Agent."); return; }
  const role = sel.value;
  if (role === "agent"){
    const n = tidy($("agentName").value, 20); if (!n){ err("pickErr", "Type your name to join as an Agent."); $("agentName").focus(); return; }
    enterOffice(n, "agent"); return;
  }
  $("pickGoBtn").disabled = true;
  try {
    const ok = await claim(role);
    if (!ok){ err("pickErr", `${tidy(meta.roster[role], 20)} is already in the office.`); return; }
    enterOffice(tidy(meta.roster[role], 20), role);
  } catch (e2) { err("pickErr", "Couldn't join. Try again."); console.error(e2); }
  finally { $("pickGoBtn").disabled = false; }
});

/* ---------- host panel: share code, edit roster ---------- */
$("lobbyPill").addEventListener("click", () => copyText(shareLink(), $("lobbyPillCode")));
$("hostBtn").addEventListener("click", () => {
  for (const [role] of ROLES) $("edit-" + role).value = tidy(meta.roster && meta.roster[role], 20);
  $("hostPanelCode").textContent = code; err("hostPanelErr", ""); $("hostPanel").hidden = false;
});
$("hostPanelClose").addEventListener("click", () => { $("hostPanel").hidden = true; });
$("hostPanelCopy").addEventListener("click", e => copyText(shareLink(), e.currentTarget));
$("hostPanelForm").addEventListener("submit", async e => {
  e.preventDefault();
  const roster = {}; for (const [role] of ROLES) roster[role] = tidy($("edit-" + role).value, 20);
  if (!roster.mp){ err("hostPanelErr", "The Managing Partner needs a name."); return; }
  try { await db.ref("lobbies/" + code + "/meta/roster").set(roster); meta.roster = roster; $("hostPanel").hidden = true; }
  catch (e2) { err("hostPanelErr", "Couldn't save the roster. Try again."); console.error(e2); }
});

boot();
})();
