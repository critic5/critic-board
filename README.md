# The Board — cloud version

The same casting board, moved off your PC so the phone can reach it from anywhere.

What changed from `Scheduling_board.py`:

| | Python version | This version |
|---|---|---|
| Where data lives | `critic_board.json` on your PC | Cloudflare KV |
| Reachable from | your wifi only | anywhere with signal |
| PC has to be on | yes | no |
| Protection | none (LAN only) | passphrase |
| Two devices editing | last one wins, silently | second one is warned |

The UI, the icon, and the seed source list are all yours, unchanged.

```
wrangler.jsonc       <- Worker config: assets dir + KV binding
src/index.js         <- replaces the Python server
public/              <- the static site
  index.html
  sw.js
  manifest.webmanifest
  icon-180.png  icon-192.png  icon-512.png
```

This is a **Worker with static assets**, not a Pages project. Cloudflare now
points new projects at Workers, and the dashboard's "Create an application"
flow builds a Worker. Everything except `/api/state` is served straight from
`public/` and never runs the script.

## Deploy

Do steps 1 and 2 **before** you finish the dashboard's setup screen. The deploy
command is `npx wrangler deploy`, which reads `wrangler.jsonc` — if the KV id
isn't filled in, the deploy fails.

**1. Create the KV namespace.** Cloudflare dashboard → Storage & Databases → KV
→ Create. Name it `critic-board`. Copy the **namespace ID** it gives you.

**2. Paste the id and push.** Open `wrangler.jsonc`, replace
`PASTE_YOUR_KV_NAMESPACE_ID_HERE` with that id, commit, push to a new repo.

**3. Create the Worker.** Workers & Pages → Create → connect the repo. On the
setup screen:

- Project name: `critic-board`
- Build command: **leave empty**
- Deploy command: `npx wrangler deploy`
- Path: `/`

Then Deploy.

**4. Set the passphrase.** Worker → Settings → Variables and Secrets → Add.

- Name: `BOARD_KEY`
- Type: **Secret**
- Value: whatever you want to type on your phone

Or from the terminal: `npx wrangler secret put BOARD_KEY`

Until this is set, every request returns 401 by design — no secret means no access.

**5. Redeploy.** Secrets only take effect on a new deployment. Push a commit or
hit Retry deployment.

**6. Custom domain (optional).** Worker → Settings → Domains & Routes →
`board.criticcast.com`. Your DNS is already at Cloudflare, so this is quick.

**7. Install on the phone.** Open the URL, enter the passphrase once, then
Share → Add to Home Screen. It launches without browser chrome and keeps the
passphrase until you clear site data.

## How the pieces behave

**Passphrase.** Stored in the phone's `localStorage`, sent as `X-Board-Key` on every request. Never written into the board data. A rejected key clears itself and returns you to the unlock screen.

**Conflicts.** Every board carries a revision number. A write sends the revision it loaded; if the stored board has moved past it, the write is refused with a 409 and the app pulls the newer copy instead of overwriting it. You'll see `BOARD CHANGED ON YOUR OTHER DEVICE` and redo that one edit. This also stops an offline phone from pushing a blank board over a real one.

**No signal.** The service worker serves the last board this device downloaded, so you can still check what you're casting Thursday from a parking lot. The banner tells you it's a cached copy, and edits fail loudly rather than pretending to save.

**KV consistency.** Writes can take up to a minute to reach every Cloudflare location. Edit on the phone and refresh the PC ten seconds later and you might see the old board for a moment. Refresh again. It doesn't lose anything — the revision guard makes sure of that.

## Local development

```
npx wrangler dev
```

Serves on `http://localhost:8787`. Add a `vars` block with a test `BOARD_KEY`
to a scratch config if you want to poke at it without touching the real secret.

## If something's wrong

**Every request 401s.** `BOARD_KEY` isn't set, or you didn't redeploy after setting it.

**Deploy fails on wrangler.** The KV namespace id in `wrangler.jsonc` is still the placeholder, or the id doesn't exist in this account.

**500 on `/api/state`.** `BOARD_KV` didn't bind. Confirm the id in `wrangler.jsonc` matches the namespace in Storage & Databases → KV.

**Board looks stale after an edit.** KV propagation. Wait and refresh.

**App won't update after a deploy.** The service worker holds the old shell. Close all tabs and reopen, or bump the cache names in `sw.js`.

## Retiring the Python version

Keep `Scheduling_board.py` around until you've used the cloud board for a week. It writes to its own file and can't interfere. Once you trust this, the only reason to keep it is as a reference.
