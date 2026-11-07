# Site émulateur du serveur « nas » (port 8097)

> Référence du projet, à la racine de `/srv/data/server/emulateurs/` ; dépôt privé
> `git@github.com:claupierr/nas-emulateurs.git`. Contexte général : `/srv/data/server/admin/CONTEXTE-SERVEUR-nas.md`.
> **Le système réel fait foi.** Mise à jour : **04/11/2026**.

---

## 1. Ce que c'est

Six consoles rétro jouées dans le navigateur, ROM rangées dans `/srv/data/Documents/Emulateurs/`. Page
**`http://nas:8097`**, tuile Homepage « Consoles ». Émulation par **EmulatorJS 4.2.3** (CDN
`https://cdn.emulatorjs.org/4.2.3/data/`), **entièrement dans le navigateur** : le serveur inventorie les ROM,
sert les fichiers, garde sauvegardes et réglages. ROM ouvertes **en lecture seule**, rien n'est écrit dans
`Documents/`.

| Console | Dossier | Cœur d'origine | Variantes | Extensions |
|---|---|---|---|---|
| NES | `A-NES` | `fceumm` | `nestopia` | `.nes` `.fds` `.unf` `.unif` `.zip` `.7z` |
| Super NES | `D-SNES` | `snes9x` | `snes9x2010`, `snes9x2005` | `.sfc` `.smc` `.fig` `.swc` `.zip` `.7z` |
| Game Boy | `B-Game-Boy` | `gambatte` | `mgba` | `.gb` `.gbc` `.dmg` `.zip` `.7z` |
| Mega Drive | `C-Mega-Drive` | `genesis_plus_gx` | `picodrive` | `.md` `.gen` `.smd` `.bin` `.zip` `.7z` |
| Nintendo 64 | `E-N64` | `mupen64plus_next` | `parallel_n64` | `.n64` `.z64` `.v64` `.zip` `.7z` |
| Neo Geo | `F-NEOGEO` | `fbneo` | `mame2003_plus`, `mame2003` | `.zip` `.7z` `.neo` |

- Autre extension, ou nom commençant par un point : **absent** de la bibliothèque. Parcours **récursif**.
- Neo Geo : `neogeo.zip`, `neogeo.7z`, `pgm.zip`, `decrypted.zip` écartés (fichiers système) ; BIOS servi :
  `neogeo.zip`, à défaut `neogeo.7z` (clé `bios` dans `app.py`).
- **Dossier d'une console**, par priorité : `EMU_ROMS_<CONSOLE>` du `.env`, puis `config/dossiers.json`
  (`{"neogeo": "F-NEOGEO"}`, écrit à la main), puis reconnaissance par le nom (`NES`, `SNES`, `MEGADRIVE`,
  `SUPERNINTENDO`, `SEGAGENESIS`…). Un `..` ne sort pas de `EMU_ROMS`. Cache **45 s**, comme l'inventaire.

---

## 2. Arborescence et fichiers

```
/srv/data/server/emulateurs/
├── EMULATEURS.md · .env (600) · .gitignore · notes.txt (non suivi) · emulateurs-web.service (copie de l'unité)
├── web/
│   ├── app.py              FastAPI : inventaire, fichiers, sauvegardes, réglages
│   ├── index.html          page unique
│   └── static/  css/app.css · js/app.js (menus, mappage) · js/player.js (EmulatorJS, surimpression,
│                pont manettes) · js/diag.js (diagnostic, à la demande) · img/ (illustrations des manettes)
├── saves/<console>/<id jeu>/  slot1-6.state + .png + .json (cœur) · codes.json · jeu.txt
└── config/  <console>.json (écrit par le site) · reglages.json et dossiers.json (facultatifs, à la main)
```
`saves/` et `config/` sont dans le miroir ; l'unité systemd dans l'archive `CONFIGS`.

### `.env` (600, `pc:pc`) — lu au démarrage du service seulement
```
EMU_ROMS=/srv/data/Documents/Emulateurs
EMU_ROMS_NES=A-NES
EMU_ROMS_SNES=D-SNES
EMU_ROMS_GB=B-Game-Boy
EMU_ROMS_MEGADRIVE=C-Mega-Drive
EMU_ROMS_N64=E-N64
EMU_ROMS_NEOGEO=F-NEOGEO
```
Sous-dossier ou chemin absolu ; vide = reconnaissance par le nom. Sans guillemets ni commentaire en fin de ligne.
Facultatifs : `EMU_SAVES`, `EMU_CONFIG`, `EMU_SLOTS` (6). ⚠️ `EMU_PORT` n'agit qu'en lancement direct : le port du
service se change dans l'unité systemd (`--port 8097`).

---

## 3. Usage

- **Accueil** : une vignette par console. **Bibliothèque** : *Mes jeux* (avec sauvegarde, vignette du dernier
  état), puis *Autres jeux* ; recherche en tapant ; sélecteur de cœur par console ; « Manettes et touches ».
- **Emplacements** : six par jeu ; libre = partie neuve ; suppression **avec confirmation** (« Annuler » a le
  focus) ; écrasement par sauvegarde sans confirmation.
- **Plein écran** demandé au lancement, sur la page entière ; refusé par le navigateur sans geste de
  l'utilisateur (lancement **à la manette**, relance après changement de cœur) : le jeu démarre alors en fenêtre.
- **En jeu** : menu (pause) par **Échap**, raccourci manette, **300 px de souris** ou clic ; boutons Reprendre,
  Sauvegarder, Charger, lissage (shader SABR), Codes de triche, Manettes et touches, Quitter (confirmation), et
  hors plein écran **Reprendre en plein écran** (sélectionné d'office). Sortie du plein écran par le navigateur
  = menu. Clic dans le vide = reprise. Pointeur masqué après 3 s.
- **Codes de triche** : par jeu, interrupteur et suppression (confirmation) par code ; **conservés sur le serveur
  avec leur état** et réappliqués au lancement. Majuscules ; codes d'un même effet séparés par `+`. Formats :
  Game Genie ou `0079:05` (NES), Game Genie ou Pro Action Replay (SNES, Mega Drive), Game Genie ou GameShark (GB),
  GameShark (N64) ; arcade peu fiable. Code incompris : **ignoré sans message**.
- **Tactile** : menu par le bouton à trois barres (`#btn-menu-tactile`, appareil sans souris, décalé de 76 px à
  l'horizontale pour la gâchette R) ; manette virtuelle **agrandie de 20 %** ; menus resserrés sur petit écran.
- **Raccourcis** : **F2** sauvegarde rapide, **F4** chargement rapide, **Échap** menu, **P** pause (remappables).
- **Mappage** (par console) : quatre joueurs, colonnes clavier et manette, raccourcis de sauvegarde et chargement
  rapides ; **un périphérique précis par joueur** (témoin d'activité) ; **Enregistrer** valide. **Saisie
  enchaînée** de case en case (manette : après relâchement et retour au repos) ; **Suppr** vide, **Échap** arrête.
  Tout est propre à la console (touches, périphériques, raccourcis, cœur, volume 0,5, options) ; « origine »
  supprime `config/<console>.json`.
- **Manettes** détectées **à la demande** (bouton `⟳ manettes`) ; aucune scrutation tant qu'aucune n'est connue.

---

## 4. Sauvegardes

`saves/<console>/<id jeu>/` : `slot<n>.state`, `slot<n>.png`, `slot<n>.json` (cœur, date), `codes.json`, `jeu.txt`
(console, chemin et nom de la ROM). Identifiant = **SHA-1 du chemin relatif, 16 caractères** : renommer ou déplacer
une ROM **détache** ses sauvegardes et ses codes.

⚠️ **Un état n'est relisible que par le cœur qui l'a écrit.** Au lancement, un emplacement d'un autre cœur bascule
sur ce cœur pour la partie ; en cours de partie, il est refusé (cœur compilé une fois par chargement).

**Restauration** : état téléchargé pendant le chargement du cœur, appliqué **deux fois** (le cœur l'écrase en fin
d'initialisation), derrière un voile noir son coupé, levé 150 ms après (4 s au plus dans tous les cas).

Garde-fous du serveur : état ≤ **96 Mo**, vignette ≤ **4 Mo**, réglages ≤ **512 ko**, codes ≤ **100** et **64 ko**
(nom 120, code 1000 caractères) ; identifiant 16 hexadécimaux, emplacement 1 à `EMU_SLOTS` ; cœur validé contre la
liste de la console ; JSON abîmé remplacé par les valeurs d'origine et signalé (`journalctl -u emulateurs-web`).
Les sauvegardes internes (SRAM) restent dans le navigateur.

---

## 5. Pièges d'EmulatorJS — à lire avant toute modification

Rien de ceci n'est documenté en amont.

- ⚠️ **URL de ROM et de BIOS terminées par le vrai nom de fichier** (`…/mslug.zip`) : les cœurs arcade
  identifient le jeu par ce nom.
- ⚠️ **HEAD autorisé** sur les routes de fichiers (`api_route(methods=["GET","HEAD"])`) : sinon blocage sur
  « Download Game Data », sans message.
- ⚠️ **BIOS arcade** : `EJS_dontExtractBIOS = true` et URL réduite à `neogeo.zip` (route racine) ; sinon FBNeo croit
  l'archive incomplète. `neogeo.zip` = **version FBNeo à 38 fichiers**, sets modernes (`201-p1.p1`…) ; les sets MAME
  0.78 ne vont qu'aux cœurs `mame2003*`.
- **Manettes** : EmulatorJS n'en lit aucune (`value2` vidé dans `EJS_defaultControls`) ; `player.js` les relaie par
  `gameManager.simulateInput`, avec **calibrage du repos des axes** (périphériques HID dont les axes ne reposent pas
  à zéro). L'ordre des périphériques n'a rien à voir avec les joueurs, d'où le choix par joueur.
- **Contrôles jamais réécrits après le démarrage** : `setupKeys()` convertit les noms en codes ; les réinjecter dans
  `EJS_ready` remet des chaînes et le clavier ne répond plus.
- **Clavier** écouté sur le cadre de jeu : relais dans `player.js` quand un bouton du menu a le focus, focus rendu
  à la fermeture.
- **Fenêtres d'EmulatorJS** : tant qu'une est ouverte, toutes les entrées sont ignorées (`isPopupOpen`) : refermées
  de force à la reprise.
- **Barre** : clés `play` et `pause` (pas `playPause`) ; `contextMenu` non masquable et `play` réaffiché à la
  pause : neutralisés par une classe CSS `!important`.
- **Plein écran** : `toggleFullscreen` remplacé pour basculer **la page entière** (`document.documentElement`). ⚠️ Pas
  `#scene` : `#confirmation`, `#dialogue`, `#mappage`, `#triche` et `#messages` en sont voisins et resteraient
  invisibles. Ne pas sortir puis redemander le plein écran (refusé sans geste ; un appui de manette n'en est pas un).
  Keyboard Lock exige HTTPS : indisponible.
- **Bouton à trois barres d'EmulatorJS** (`menu-bar-button`) : invisible mais cliquable en mode `hidden` ; retiré par
  CSS (`.ejs_virtualGamepad_open`) et remplacé par `#btn-menu-tactile`.
- **Manette virtuelle** : `transform: scale(1.2)` depuis le coin extérieur de chaque bloc, **sauf la croix** : sa
  direction est calculée avec `getBoundingClientRect()` moins `clientWidth / 2`, un transform décalerait le centre de
  12 px. Son bloc est agrandi par la taille (125 → 150 px, `:has(.ejs_dpad_main)`), ses voisins (L de la SNES) un
  par un. Le stick N64 (nipplejs) supporte le transform.
- **Forme de l'objet EmulatorJS** : la 4.2.3 porte tout sur l'objet principal, les récentes dans `.frontend` ;
  `player.js` accepte les deux.
- **Codes de triche** : bouton `cheat` masqué ; `gameManager.resetCheat()` puis `setCheat(index, 1, code)`. ⚠️ Le
  cœur **ne sait pas désactiver un code** (fceumm ignore `enabled`) : chaque changement vide la liste et remet les
  seuls actifs, index consécutifs. Un code « RAM » laisse sa dernière valeur. EmulatorJS vide la liste juste avant
  `EJS_onGameStart` : les codes sont appliqués là, jamais avant.
- `fr-FR` **n'existe pas** sur le CDN : ne pas définir `EJS_language`.

---

## 6. Service, réseau, modification

`/etc/systemd/system/emulateurs-web.service` : `User/Group=pc`, `UMask=0002`, `Nice=10`, E/S `best-effort` 6,
`WorkingDirectory=…/emulateurs/web`, `EnvironmentFile=-…/emulateurs/.env`, `RequiresMountsFor=/srv/data`,
`ExecStart=/opt/miniconda3/bin/python -m uvicorn app:app --host 0.0.0.0 --port 8097`,
`Restart=on-failure`, `RestartSec=10`, `NoNewPrivileges=yes`, `PrivateTmp=yes`, `ProtectSystem=full`.
FastAPI et uvicorn de Miniconda `base`. Tailscale seulement (UFW), sans mot de passe ; tuile sans `siteMonitor`.

**`config/reglages.json`** (facultatif, jamais écrit par le site) :
```json
{
  "emulatorjs": "https://cdn.emulatorjs.org/4.2.3/data/",
  "manette": { "modificateur": 8, "sauver": 4, "charger": 5, "menu": 9 }
}
```
Source d'EmulatorJS (`/static/emulatorjs/data/` pour une copie locale ; vide = CDN) et combinaison manette de repli
(Select + L1 / R1 / Start) tant qu'aucun raccourci n'est affecté.

**Version d'EmulatorJS épinglée** (`4.2.3`, dans `CDN_DEFAUT` de `app.py` et dans `reglages.json` s'il la
définit) : `stable/` change sans prévenir, et les sauvegardes d'état dépendent de la version des cœurs. Changer de
version : lire les notes (GitHub `EmulatorJS/EmulatorJS` → Releases ; suivi par Watch → Custom → Releases),
vérifier l'adresse (`curl -s -o /dev/null -w '%{http_code}\n' https://cdn.emulatorjs.org/<V>/data/loader.js`
→ `200`), remplacer le numéro aux deux endroits, `py_compile`, `sudo systemctl restart emulateurs-web`, puis
lancer un jeu et charger une sauvegarde d'état. Une ancienne sauvegarde d'état peut ne plus se charger avec de
nouveaux cœurs : faire une sauvegarde en jeu avant de changer.

Modifier : copie datée, `diff`, `py_compile`, `sha256sum`. Statiques versionnés (`?v=<date>`) : un rafraîchissement
suffit ; seul `app.py` demande `sudo systemctl restart emulateurs-web`. Un jeu déposé par Samba apparaît en 45 s.

---

## 7. Contrôles et diagnostic

```bash
systemctl is-active emulateurs-web; curl -s http://localhost:8097/sante; echo      # active / ok
cd /srv/data/server/emulateurs/web && /opt/miniconda3/bin/python app.py --info # dossiers, jeux, dossiers non reconnus
curl -s -I http://localhost:8097/neogeo.zip | head -3            # 200 + content-length
ls -l /srv/data/server/emulateurs/saves/*/*/slot*.state          # tailles plausibles (13 Ko NES, 823 Ko SNES)
```
Console du navigateur, jeu lancé :
```js
await import('/static/js/diag.js?x=' + Date.now())
DIAG.aide()        // état, manettes, espion des entrées, test d'appui, focus
```

| Symptôme | Cause |
|---|---|
| Bloqué sur « Download Game Data » | HEAD refusé sur `/api/rom/…` |
| FBNeo : « romset is missing files » | BIOS décompressé, ou set non FBNeo |
| Manette muette en jeu, reconnue au mappage | mauvais périphérique affecté au joueur |
| Direction maintenue sans rien toucher | axe au repos non nul d'un autre périphérique : l'affecter ou désactiver le joueur |
| Clavier mort après le menu | focus resté sur le menu |
| Jeu en fenêtre | lancé à la manette ou relancé : « Reprendre en plein écran » à la souris ou au clavier |
| Fenêtre du menu invisible en plein écran | plein écran demandé ailleurs que sur la page entière |
| Croix virtuelle en diagonale au centre | bloc de la croix agrandi par `transform` |
| Code de triche sans effet | format non reconnu, ou code d'une autre version du jeu |
| Page inchangée après modification | Ctrl+Maj+R |
| Jeu déposé absent | extension hors tableau, ou cache de 45 s |
| Sauvegardes « disparues » | ROM renommée ou déplacée |
| Console absente de l'accueil | `app.py --info`, puis `.env` ou `config/dossiers.json` |

---

## 8. Routes HTTP

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/`, et toute URL inconnue hors `/api` et `/static` | la page |
| `GET` | `/sante` | `ok` |
| `GET` | `/api/consoles` · `/api/consoles/{cid}/jeux` · `/api/jeux/{cid}/{jid}` | inventaire |
| `GET`/`HEAD` | `/api/rom/{cid}/{jid}[/{nom}]` | la ROM, sous son vrai nom |
| `GET`/`HEAD` | `/{nom}` | fichier système à la racine (`neogeo.zip`), déclarée en dernier |
| `GET`/`HEAD` · `PUT` · `DELETE` | `/api/etat/{cid}/{jid}/{slot}` | état (`?core=` à l'écriture) |
| `GET`/`HEAD` · `PUT` | `/api/image/{cid}/{jid}/{slot}` | vignette (cache 7 jours ; états jamais) |
| `GET` · `PUT` | `/api/codes/{cid}/{jid}` | codes ; `PUT` remplace la liste (vide = supprime `codes.json`) |
| `GET` · `PUT` · `DELETE` | `/api/config/{cid}` | réglages d'une console ; `DELETE` = origine |
| `GET` | `/api/reglages` | réglages communs (lecture seule) |

---

## 9. Dépôt git

Privé, branche `main`, dans le dossier du projet (`.git` dans le miroir). `.gitignore` : `.env`, `saves/`,
`config/`, `emu-*` (copies de livraison), `*.bak-*`, `__pycache__/`, `web/static/emulatorjs/`, `notes.txt`, ROM et
BIOS ; `*.md` écarte les ROM Mega Drive, d'où les exceptions `!README.md` et `!EMULATEURS.md`.
```bash
cd /srv/data/server/emulateurs
git status --short      # À RELIRE : rien sous saves/, config/, .env, ni copie oubliée
git add -A && git commit -m "…" && git push
```
En cas de doute : `git check-ignore -v .env config/nes.json saves/…/slot1.state` (un chemin sans réponse serait
versionné). Passage en public possible (Settings → General → Danger Zone) : **tout l'historique** devient visible,
prévoir une `LICENSE` et une note d'installation.
