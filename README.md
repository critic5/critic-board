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
board/
  public/            <- static site (build output directory)
    index.html
    sw.js
    manifest.webmanifest
    icon-180.png  icon-192.png  icon-512.png
  functions/
    api/state.js     <- replaces the Python server
```

## Deploy

**1. Push to GitHub.** New repo, drop this folder's contents at the root.

**2. Create the KV namespace.** Cloudflare dashboard → Workers & Pages → KV → Create a namespace. Call it `critic-board`.

**3. Create the Pages project.** Workers & Pages → Create → Pages → Connect to Git → pick the repo.

- Framework preset: **None**
- Build command: **leave empty**
- Build output directory: **`public`**

**4. Bind the namespace.** Project → Settings → Functions → KV namespace bindings.

- Variable name: `BOARD_KV`
- Namespace: `critic-board`

Add it under **both** Production and Preview, or preview deploys will 500.

**5. Set the passphrase.** Project → Settings → Environment variables.

- Variable name: `BOARD_KEY`
- Value: whatever you want to type on your phone
- Click **Encrypt** so it's stored as a secret

Again, Production and Preview both.

**6. Redeploy.** Environment variables only take effect on a new deployment — hit Retry deployment or push a commit.

**7. Custom domain (optional).** Project → Custom domains → `board.criticcast.com`. Your DNS is already at Cloudflare so this is a two-click job.

**8. Install on the phone.** Open the URL, enter the passphrase once, then Share → Add to Home Screen. It launches without browser chrome and keeps the passphrase until you clear site data.

## How the pieces behave

**Passphrase.** Stored in the phone's `localStorage`, sent as `X-Board-Key` on every request. Never written into the board data. A rejected key clears itself and returns you to the unlock screen.

**Conflicts.** Every board carries a revision number. A write sends the revision it loaded; if the stored board has moved past it, the write is refused with a 409 and the app pulls the newer copy instead of overwriting it. You'll see `BOARD CHANGED ON YOUR OTHER DEVICE` and redo that one edit. This also stops an offline phone from pushing a blank board over a real one.

**No signal.** The service worker serves the last board this device downloaded, so you can still check what you're casting Thursday from a parking lot. Edits fail loudly rather than pretending to save.

**KV consistency.** Writes can take up to a minute to reach every Cloudflare location. Edit on the phone and refresh the PC ten seconds later and you might see the old board for a moment. Refresh again. It doesn't lose anything — the revision guard makes sure of that.

## Local development

```
npx wrangler pages dev public --kv BOARD_KV --binding BOARD_KEY=yourpassphrase
```

## If something's wrong

**Every request 401s.** `BOARD_KEY` isn't set on the environment you're hitting, or you didn't redeploy after setting it.

**500 on `/api/state`.** `BOARD_KV` isn't bound. Check the binding exists on the environment you're actually on — preview deploys need their own.

**Board looks stale after an edit.** KV propagation. Wait and refresh.

**App won't update after a deploy.** The service worker holds the old shell. Close all tabs and reopen, or bump the cache names in `sw.js`.

## Retiring the Python version

Keep `Scheduling_board.py` around until you've used the cloud board for a week. It writes to its own file and can't interfere. Once you trust this, the only reason to keep it is as a reference.
