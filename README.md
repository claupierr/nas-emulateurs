# nas-emulateurs

A self-hosted web front end for playing retro console games in the browser, built for a home server. It lists the ROMs stored on the server, launches them with [EmulatorJS](https://emulatorjs.org/), and keeps save states, per-console controller settings and cheat codes on the server, so a game started on one device can be resumed on another.

All emulation runs **in the browser**. The server only does three things: it indexes the ROM folders, serves the files, and stores saves and settings. ROMs are opened read-only and nothing is ever written to the ROM folders.

The user interface is in French.

## Features

- **Six consoles**: NES, Super NES, Game Boy, Mega Drive, Nintendo 64 and Neo Geo, each with a default emulation core and one or more alternatives selectable per console.
- **Library**: games with saves appear first as thumbnails taken from their latest state; the others are listed compactly. Type anywhere to search.
- **Server-side save states**: six slots per game, each with a thumbnail and a record of the core that wrote it. Loading a slot saved with another core switches to that core for the session.
- **In-game overlay menu** (pauses the game): resume, save, load, toggle smoothing (SABR shader), cheat codes, controllers and keys, quit.
- **Cheat codes per game**: add, enable, disable or delete codes from the in-game menu. Codes and their on/off state are stored on the server and re-applied on the next launch.
- **Controllers**: keyboard, mouse and up to four USB gamepads. Each player can be assigned a specific device, axes are calibrated against their resting position (useful for HID pedals and joysticks), and quick save, quick load and menu shortcuts can be mapped to any button. All settings are kept separately for each console.
- **Mouse, keyboard and gamepad navigation** throughout the menus.
- **Mobile support**: compact responsive layout, a touch menu button in the top-right corner, and an EmulatorJS virtual gamepad enlarged by 20 %.

## How it works

```
browser ──► FastAPI (web/app.py) ──► ROM folders (read-only)
   │                │
   │                └──► saves/ and config/ (states, thumbnails, cheats, settings)
   └──► EmulatorJS (loaded from its CDN, or a local copy)
```

| Path | Role |
|---|---|
| `web/app.py` | FastAPI server: ROM inventory, file serving, saves, settings, cheat codes |
| `web/index.html` | single-page front end |
| `web/static/js/app.js` | menus, navigation, controller mapping page |
| `web/static/js/player.js` | game player: EmulatorJS setup, overlay menu, gamepad bridge, cheats |
| `web/static/js/diag.js` | browser-console diagnostic toolbox, loaded on demand |
| `web/static/css/app.css` | styles (Material-inspired dark theme) |
| `web/static/img/` | controller illustrations shown on the mapping page |
| `emulateurs-web.service` | example systemd unit |
| `EMULATEURS.md` | detailed reference documentation (French) |

Data written at runtime, excluded from the repository:

```
saves/<console>/<game id>/slot1-6.state, .png, .json   save states, thumbnails, core used
saves/<console>/<game id>/codes.json                    cheat codes
saves/<console>/<game id>/jeu.txt                       human-readable game name
config/<console>.json                                   per-console settings
```

The game id is the first 16 characters of the SHA-1 of the ROM's path relative to its console folder: renaming or moving a ROM detaches its saves.

## Requirements

- Python 3.10 or later, with `fastapi` and `uvicorn`
- A modern browser with WebAssembly support; the browser needs access to `cdn.emulatorjs.org`, unless EmulatorJS is hosted locally
- ROMs you own, and for Neo Geo the FBNeo `neogeo.zip` BIOS

No ROM or BIOS file is included in this repository.

## Installation

```bash
git clone git@github.com:claupierr/nas-emulateurs.git emulateurs
cd emulateurs
pip install fastapi uvicorn
```

Create a `.env` file at the repository root:

```ini
EMU_ROMS=/path/to/Emulateurs
EMU_ROMS_NES=A-NES
EMU_ROMS_SNES=D-SNES
EMU_ROMS_GB=B-Game-Boy
EMU_ROMS_MEGADRIVE=C-Mega-Drive
EMU_ROMS_N64=E-N64
EMU_ROMS_NEOGEO=F-NEOGEO
```

Each `EMU_ROMS_<CONSOLE>` is either a subfolder of `EMU_ROMS` or an absolute path. If a line is left empty or omitted, the folder is recognised from its name (`NES`, `SNES`, `MEGADRIVE`, `SEGAGENESIS`…). Write values without quotes and without trailing comments.

Check what the server finds, then start it:

```bash
cd web
set -a; . ../.env; set +a
python app.py --info       # folders found, number of games, unrecognised folders
python app.py              # serves on http://0.0.0.0:8097
```

To run it as a service, adapt the paths, user and port in `emulateurs-web.service`, copy it to `/etc/systemd/system/`, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now emulateurs-web
curl -s http://localhost:8097/sante      # prints "ok"
```

### Optional settings

| Variable | Default | Meaning |
|---|---|---|
| `EMU_SAVES` | `saves/` | where states, thumbnails and cheats are stored |
| `EMU_CONFIG` | `config/` | where per-console settings are stored |
| `EMU_SLOTS` | `6` | save slots per game |
| `EMU_PORT` | `8097` | port, only when started with `python app.py` |

`config/reglages.json` can override the EmulatorJS source (for instance `/static/emulatorjs/data/` for a local copy) and the fallback gamepad shortcut combination. `config/dossiers.json` can map a console to a folder by hand, for example `{"neogeo": "F-NEOGEO"}`.

New ROMs dropped into the folders appear within 45 seconds; no restart is needed.

## Usage

- **Home**: pick a console. **Library**: pick a game, then a slot. An empty slot starts a new game; an occupied slot resumes it.
- **In game**, open the menu with `Esc`, a mapped gamepad button, by moving the mouse, or with the touch menu button. Default keys: `F2` quick save, `F4` quick load, `P` pause.
- **Controllers and keys**: from the console page, or from the in-game menu. Gamepads are only scanned after pressing **⟳ manettes**.
- **Cheat codes**: in-game menu → *Codes de triche*. The accepted formats depend on the core. Typical ones are Game Genie or raw `ADDR:VAL` codes on NES, Game Genie or Pro Action Replay on Super NES and Mega Drive, Game Genie or GameShark on Game Boy, and GameShark on N64. Several codes forming one effect are joined with `+`. A code the core does not understand is ignored silently, and codes written for one regional version of a game may not work on another.

## Security

The server has **no authentication**. It is meant for a private network, here a Tailscale tailnet behind a host firewall. Do not expose it to the internet as is.

## API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/sante` | health check |
| `GET` | `/api/consoles`, `/api/consoles/{cid}/jeux`, `/api/jeux/{cid}/{jid}` | inventory |
| `GET` `HEAD` | `/api/rom/{cid}/{jid}/{name}` | ROM file, served under its real name |
| `GET` `HEAD` `PUT` `DELETE` | `/api/etat/{cid}/{jid}/{slot}` | save state (`?core=` on write) |
| `GET` `HEAD` `PUT` | `/api/image/{cid}/{jid}/{slot}` | slot thumbnail |
| `GET` `PUT` | `/api/codes/{cid}/{jid}` | cheat codes of a game |
| `GET` `PUT` `DELETE` | `/api/config/{cid}` | per-console settings (`DELETE` resets them) |
| `GET` | `/api/reglages` | global settings |
| `GET` `HEAD` | `/{name}` | system file at the root (`neogeo.zip`) |

## Notes for developers

EmulatorJS has a number of undocumented behaviours that this project works around: arcade ROM URLs must end with the real file name, `HEAD` must be allowed on file routes, the arcade BIOS must not be extracted, controls must not be rewritten after start-up, cores cannot disable a single cheat code, and more. They are all listed in section 5 of [`EMULATEURS.md`](EMULATEURS.md), which should be read before changing the player.

Static files are versioned automatically from their modification time, so a browser refresh is enough after editing them; only changes to `app.py` require restarting the server.

## Credits

- [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS) and the [libretro](https://www.libretro.com/) cores it packages (FCEUmm, Nestopia, Snes9x, Gambatte, mGBA, Genesis Plus GX, PicoDrive, Mupen64Plus-Next, ParaLLEl N64, FinalBurn Neo, MAME 2003).
- [FastAPI](https://fastapi.tiangolo.com/) and [Uvicorn](https://www.uvicorn.org/).

## License

No license has been chosen yet: all rights reserved. Each emulator core keeps its own license.
