# S2C Virtual Office

A live isometric office for your team: people join a lobby, walk around as 3D characters, work at desks, take food from the pantry buffet, chat, and whisper privately to people standing nearby.

It runs on **Firebase Hosting** with **Firebase Realtime Database** and **anonymous sign-in**. People don't make accounts:

- **The Managing Partner hosts.** They create a lobby, list who holds each role (CEO, CFO, COO, Quality Manager, General Manager), and get a 6-character code and invite link.
- **Leadership joins by picking their name** from that roster. Each role can only be taken by one person at a time.
- **Everyone else joins as an Agent** and types their own name.

## Setup (about 10 minutes)

### 1. Create the Firebase project
1. Go to <https://console.firebase.google.com> and click **Add project**.
2. **Build → Authentication → Get started → Sign-in method** and turn on **Anonymous**.
3. **Build → Realtime Database → Create database.** Pick the location closest to your team (for Singapore, `asia-southeast1`), and start in **locked mode**. The rules in this repo are deployed over it.
4. **Project settings (gear icon) → General → Your apps → Web (`</>`)**. Register an app (no need for Firebase Hosting setup here), then copy the `firebaseConfig` values.

### 2. Add your settings to the repo
- **`public/firebase-config.js`:** paste in your `apiKey`, `authDomain`, `databaseURL`, `projectId` and `appId`. These are meant to be public; `database.rules.json` controls access.
- **`.firebaserc`:** replace `YOUR_PROJECT_ID` with your project ID.

### 3. Deploy

**Option A: from your computer**
```bash
npm install -g firebase-tools
firebase login
firebase deploy --only hosting,database
```
Your office is then live at `https://YOUR_PROJECT_ID.web.app`.

**Option B: automatically from GitHub on every push to `main`**
1. In Google Cloud console → **IAM & Admin → Service accounts** (for the same project), create a service account with the roles **Firebase Hosting Admin** and **Firebase Realtime Database Admin**. Create a **JSON key** for it.
2. In your GitHub repo → **Settings → Secrets and variables → Actions**, add:
   - `FIREBASE_SERVICE_ACCOUNT`: the full contents of the JSON key file
   - `FIREBASE_PROJECT_ID`: your project ID
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` deploys the site and the database rules.

## Using it
- **Managing Partner:** open the site, click **Host a new lobby**, enter names for each role, then **Create lobby**. Share the code or **Copy link**. The **Manage lobby** button in the header lets you change the roster later.
- **Everyone else:** open the invite link (the code fills in automatically), click **Find lobby**, then pick your name or choose **I'm an Agent** and type your name. Then pick a character.

## What's in here
| Path | What it is |
|---|---|
| `public/index.html` | The built office page (generated, don't edit by hand) |
| `public/firebase-config.js` | Your Firebase web settings |
| `database.rules.json` | Security rules: who can create lobbies, claim roles, move avatars and read whispers |
| `tools/office.src.html` | The office itself (3D world, characters, furniture, food, chat) |
| `tools/lobby.html`, `lobby.css`, `lobby.js` | Lobby screens and the Firebase live connection |
| `tools/build.py` | Combines the above into `public/index.html` |

After changing anything in `tools/`, rebuild with `python3 tools/build.py`, then commit and push.

## Privacy and limits
- **Whispers** are end-to-end encrypted between the two browsers. Each private message is delivered to the recipient's inbox and deleted as soon as it's read. The database never holds readable whisper text.
- **Office chat and positions** are visible to everyone in the lobby. Nothing is kept after people leave; presence and role claims clear automatically when someone disconnects.
- **Lobby codes are the only gate.** Anyone with the code can join as an Agent, and anyone who joins first can pick a roster name. Share codes only with your team.
- **Lobbies stay in the database** until you delete them. You can clear old ones under `lobbies/` in the Firebase console.

The 3D characters, furniture and food come from Kenney's Mini Characters, Furniture Kit and Food Kit (CC0, free for commercial use).
