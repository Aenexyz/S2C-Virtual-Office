"""Builds public/index.html (Firebase version) from the office page source.

Usage:  python3 tools/build.py
The office source (tools/office.src.html) is the same page that runs on claude.ai.
This script adds the lobby screens, the host panel and the Firebase-backed live room.
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
T = ROOT / "tools"
src = (T / "office.src.html").read_text()
lobby_html = (T / "lobby.html").read_text()
lobby_css = (T / "lobby.css").read_text()
lobby_js = (T / "lobby.js").read_text()
FIREBASE = "10.12.2"

def rep(s, a, b, count=1):
    if a not in s:
        sys.exit(f"build: anchor not found: {a[:70]!r}")
    return s.replace(a, b, count)

s = src
# styles
s = rep(s, "@media (prefers-reduced-motion:reduce)", lobby_css + "\n@media (prefers-reduced-motion:reduce)")
# sign-in overlay: lobby steps first, character form after
s = rep(s, '<form id="signinForm" autocomplete="off">', lobby_html + '        <form id="signinForm" autocomplete="off" hidden>')
s = rep(s, "<h2>Sign in to the office</h2>", '<h2 id="signinTitle">Choose your character</h2>')
s = rep(s, "<p>Your avatar appears at the front entrance. Everyone with this page open sees you walk around and chat.</p>",
        '<p id="signinLead">Pick a character, then walk in through the front entrance.</p>')
s = rep(s, '''          <div class="field">
            <span>Role</span>''', '''          <div class="field" id="roleField">
            <span>Role</span>''')
# header: lobby code + host controls
s = rep(s, '<button class="btn" id="demoBtn" aria-pressed="true">Demo staff: on</button>',
        '<button class="pill lobby-pill" id="lobbyPill" type="button" title="Copy the invite link" hidden><span>Lobby</span> <b id="lobbyPillCode">------</b></button>'
        '<button class="btn" id="hostBtn" type="button" hidden>Manage lobby</button>'
        '<button class="btn" id="demoBtn" aria-pressed="false">Demo staff: off</button>')
# host panel overlay inside the stage
s = rep(s, '      <div class="toast" id="toast" role="status" hidden></div>', '''      <div class="host-panel" id="hostPanel" hidden>
        <form class="lobby" id="hostPanelForm" autocomplete="off">
          <h2>Manage lobby</h2>
          <div class="code-box"><b id="hostPanelCode">------</b><button type="button" id="hostPanelCopy">Copy link</button></div>
          <p style="margin:0">Change who holds each role. People already in the office keep their current role until they rejoin.</p>
          <div class="roster-grid">
            <label for="edit-mp">Managing Partner</label><input type="text" id="edit-mp" maxlength="20" required>
            <label for="edit-ceo">CEO</label><input type="text" id="edit-ceo" maxlength="20" placeholder="Name (optional)">
            <label for="edit-cfo">CFO</label><input type="text" id="edit-cfo" maxlength="20" placeholder="Name (optional)">
            <label for="edit-coo">COO</label><input type="text" id="edit-coo" maxlength="20" placeholder="Name (optional)">
            <label for="edit-qm">Quality Manager</label><input type="text" id="edit-qm" maxlength="20" placeholder="Name (optional)">
            <label for="edit-gm">General Manager</label><input type="text" id="edit-gm" maxlength="20" placeholder="Name (optional)">
          </div>
          <div class="lobby-err" id="hostPanelErr" hidden></div>
          <div class="row"><button class="ghost" type="button" id="hostPanelClose">Close</button><button class="enter" type="submit">Save roster</button></div>
        </form>
      </div>
      <div class="toast" id="toast" role="status" hidden></div>''')
# demo staff off by default on the hosted version
s = rep(s, 'demoOn = store.get("hq.demo") !== false', 'demoOn = store.get("hq.demo") === true')
s = rep(s, 'addMsg({sys:true, text:"Live sync isn\'t available in this view, so you\'re exploring solo."});',
        'addMsg({sys:true, text:"Couldn\'t connect to the office. Reload to try again."});')
# Firebase SDK + config + lobby before the office script
idx = s.index("<script>\n(() => {")
scripts = f'''<script src="https://www.gstatic.com/firebasejs/{FIREBASE}/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/{FIREBASE}/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/{FIREBASE}/firebase-database-compat.js"></script>
<script src="firebase-config.js"></script>
<script>
{lobby_js}
</script>
'''
s = s[:idx] + scripts + s[idx:]

head = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,-apple-system,"Segoe UI",sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
'''
cut = s.index('<div class="app">')
head = head.replace("</head>", s[:cut] + "</head>")
out = head + s[cut:] + "\n</body>\n</html>\n"
(ROOT / "public" / "index.html").write_text(out)
print(f"built public/index.html ({len(out)//1024} KB)")
