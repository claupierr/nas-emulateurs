# Site émulateur du serveur « nas »

> Fichier de référence du projet, à la racine de `/srv/data/server/emulateurs/`.
> Le fichier général `server/CONTEXTE-SERVEUR-nas.md` n'en garde qu'un résumé.
> **Le système réel fait foi** : en cas de doute, vérifier et corriger ce fichier.
> Dernière mise à jour : **05/10/2026**.

---

## 1. Ce que c'est

Site web joué dans le navigateur, qui donne accès aux ROM de six consoles rétro rangées dans
`/srv/data/Documents/Emulateurs/`. Page **`http://nas:8097`**, tuile Homepage « Consoles ».

L'émulation est faite par **EmulatorJS 4.2.3**, chargé du CDN `https://cdn.emulatorjs.org/stable/data/` :
tout le calcul se passe **dans le navigateur**. Le serveur ne fait que trois choses — inventorier les ROM,
servir les fichiers, et conserver les sauvegardes et les réglages. Les ROM sont ouvertes **en lecture
seule** ; rien n'est jamais écrit dans `Documents/`.

| Console | Dossier | Cœur d'origine | Variantes | Extensions reconnues |
|---|---|---|---|---|
| NES | `A-NES` | `fceumm` | `nestopia` | `.nes` `.fds` `.unf` `.unif` `.zip` `.7z` |
| Super NES | `D-SNES` | `snes9x` | `snes9x2010`, `snes9x2005` | `.sfc` `.smc` `.fig` `.swc` `.zip` `.7z` |
| Game Boy | `B-Game-Boy` | `gambatte` | `mgba` | `.gb` `.gbc` `.dmg` `.zip` `.7z` |
| Mega Drive | `C-Mega-Drive` | `genesis_plus_gx` | `picodrive` | `.md` `.gen` `.smd` `.bin` `.zip` `.7z` |
| Nintendo 64 | `E-N64` | `mupen64plus_next` | `parallel_n64` | `.n64` `.z64` `.v64` `.zip` `.7z` |
| Neo Geo | `F-NEOGEO` | `fbneo` | `mame2003_plus`, `mame2003` | `.zip` `.7z` `.neo` |

Une extension absente de ce tableau n'apparaît **pas** dans la bibliothèque, pas plus qu'un fichier dont le nom
commence par un point. Les dossiers sont parcourus **récursivement** : un jeu rangé dans un sous-dossier est
quand même listé, sous le nom de son fichier. Pour le Neo Geo, `neogeo.zip`, `pgm.zip` et `decrypted.zip` sont
écartés de la liste : ce sont des fichiers système, pas des jeux.

**Trouver le dossier d'une console** — par ordre de priorité : la variable `EMU_ROMS_<CONSOLE>` du `.env`, puis
`config/dossiers.json` (`{"neogeo": "F-NEOGEO"}`, à créer à la main si besoin), puis la reconnaissance
automatique par le nom du dossier (jetons `NES`, `SNES`, `MEGADRIVE`… et motifs `SUPERNINTENDO`,
`SEGAGENESIS`…). Un `..` glissé dans `dossiers.json` ne permet pas de sortir de `EMU_ROMS`.

---

## 2. Arborescence et fichiers

```
/srv/data/server/emulateurs/
├── EMULATEURS.md        ce fichier
├── .env                 (600) racines des ROM — lu au DÉMARRAGE du service
├── .gitignore           · notes git.txt  · emulateurs-web.service (copie du service)
├── web/
│   ├── app.py           serveur FastAPI : inventaire, fichiers, sauvegardes, réglages
│   ├── index.html       page unique
│   └── static/
│       ├── css/app.css
│       ├── js/app.js    menus, navigation, page de mappage
│       ├── js/player.js lecteur : EmulatorJS, surimpression, pont manettes
│       ├── js/diag.js   outil de diagnostic, chargé à la demande (section 7)
│       └── img/         illustrations des manettes (NES.jpg, SNES.jpg, GBA.jpg,
│                        MegaDrive.jpg, N64.jpg, NEOGEO.jpg)
├── saves/<console>/<id jeu>/slot1-6.state + .png + .json (cœur) + jeu.txt
└── config/<console>.json      écrit par le site (un par console réglée)
    config/reglages.json       facultatif, écrit à la main (section 6)
    config/dossiers.json       facultatif, écrit à la main (section 1)
```

`saves/` et `config/` sont dans le miroir du mardi ; `/etc/systemd/system/emulateurs-web.service` est dans
l'archive `CONFIGS` de `nas-backup.sh`, et une copie du fichier d'unité vit aussi à la racine du projet.

### `.env` (600, `pc:pc`)
```
EMU_ROMS=/srv/data/Documents/Emulateurs
EMU_ROMS_NES=A-NES
EMU_ROMS_SNES=D-SNES
EMU_ROMS_GB=B-Game-Boy
EMU_ROMS_MEGADRIVE=C-Mega-Drive
EMU_ROMS_N64=E-N64
EMU_ROMS_NEOGEO=F-NEOGEO
```
Nom d'un sous-dossier ou chemin absolu ; ligne vide ou absente = reconnaissance par le nom du dossier.
Sans guillemets, sans commentaire en fin de ligne. **Lu au démarrage du service seulement.**
Variables facultatives : `EMU_SAVES`, `EMU_CONFIG`, `EMU_SLOTS` (6).
⚠️ `EMU_PORT` (8097) n'agit **qu'en lancement direct** (`python app.py`) : le service passe `--port 8097` à
uvicorn, donc changer de port demande d'éditer l'unité systemd.

---

## 3. Usage

**Accueil** une vignette par console. **Bibliothèque** : *Mes jeux* (ceux qui ont une sauvegarde, en
vignettes tirées du dernier état) puis *Autres jeux* en liste compacte ; recherche en tapant ; sélecteur de
cœur valable pour toute la console ; bouton « Manettes et touches ». **Emplacements** : six par jeu, un
emplacement libre démarre une partie neuve ; un emplacement occupé peut être **supprimé** (état, vignette et
cœur partent ensemble).

**En jeu** : le menu s'ouvre par **Échap**, par le raccourci manette, par **300 px de déplacement de souris**
ou par un clic, et met la partie **en pause**. Six boutons : Reprendre, Sauvegarder, Charger, Activer /
Désactiver le lissage (shader SABR), Manettes et touches, Quitter (confirmation). Un clic dans le vide
reprend la partie. Le pointeur s'efface 3 s après son dernier mouvement.

**Raccourcis clavier d'origine** : **F2** sauvegarde rapide, **F4** chargement rapide, **Échap** menu,
**P** pause — tous remappables, et sans équivalent manette tant que rien n'a été affecté.

**Mappage** (menu de la console, ou en jeu partie en pause) : tableau de 550 px à gauche, illustration de la
manette à droite, quatre onglets de joueur, deux colonnes clavier et manette, et en bas deux raccourcis —
sauvegarde et chargement rapides, mappables y compris sur une gâchette. Un menu déroulant affecte un
**périphérique précis à chaque joueur** (ou le désactive), un témoin s'allume quand ce périphérique envoie
quelque chose, et le bouton **Enregistrer** valide l'ensemble. Tout est propre à chaque console : touches,
périphériques, raccourcis, cœur choisi, volume (0,5 au départ) et options. Un bouton remet la console dans
son état d'origine en supprimant son `config/<console>.json`.

**Manettes** : détectées **à la demande** seulement, par le bouton `⟳ manettes` de la barre ou de la page de
mappage. Tant qu'aucune manette n'est connue, aucune scrutation n'a lieu ; branchement et débranchement
restent pris en compte, ce sont des événements.

---

## 4. Sauvegardes

`saves/<console>/<id jeu>/` contient `slot<n>.state`, sa vignette `slot<n>.png`, `slot<n>.json` (cœur
utilisé et date) et `jeu.txt` (console, chemin relatif et nom lisible de la ROM). L'identifiant du jeu est un
condensé **SHA-1 du chemin relatif, tronqué à 16 caractères** : renommer ou déplacer une ROM détache donc ses
sauvegardes.

⚠️ **Un état n'est relisible que par le cœur qui l'a écrit.** Au **lancement** d'un jeu, choisir un
emplacement enregistré avec un autre cœur bascule sur ce cœur pour cette partie, sans modifier le réglage de
la console. **En cours de partie**, le même emplacement est refusé : le cœur est compilé une fois par
chargement de page. Le cœur annoncé est validé contre la liste de la console, au serveur comme au navigateur.

**Restauration** : l'état est téléchargé pendant le chargement du cœur, puis appliqué **deux fois** — le cœur
écrase l'état en fin d'initialisation — derrière un voile noir avec le son coupé, levé 150 ms après la
seconde application. Filet de sécurité : le voile se lève dans tous les cas au bout de 4 s.

Garde-fous du serveur : un état est refusé au-delà de **96 Mo**, une vignette au-delà de **4 Mo**, un fichier
de réglages au-delà de **512 ko** ; l'identifiant doit être 16 caractères hexadécimaux et le numéro
d'emplacement compris entre 1 et `EMU_SLOTS`.

Les sauvegardes « pile » internes aux jeux (SRAM) restent dans le navigateur, pas sur le serveur.

---

## 5. Pièges d'EmulatorJS — à lire avant toute modification

Rien de ce qui suit n'est documenté en amont ; chacun de ces points a coûté une séance de mise au point.

- ⚠️ **Les URL de ROM et de BIOS se terminent par le vrai nom de fichier** (`…/mslug.zip`) : les cœurs arcade
  identifient le jeu par ce nom, et EmulatorJS écrit le fichier sous le dernier segment de l'URL.
- ⚠️ **HEAD doit être autorisé** sur les routes de fichiers — `api_route(methods=["GET","HEAD"])`, FastAPI ne
  l'ajoute pas — sinon le chargement s'arrête à « Download Game Data », sans message.
- ⚠️ **BIOS arcade** : `EJS_dontExtractBIOS = true` et URL réduite à `neogeo.zip` (route racine de `app.py`),
  sinon EmulatorJS décompresse l'archive et FBNeo la croit incomplète en listant des fichiers pourtant
  présents. `neogeo.zip` doit être la **version FBNeo à 38 fichiers**, à côté des jeux, sets modernes
  (`201-p1.p1`…) ; les sets MAME 0.78 ne conviennent qu'aux cœurs `mame2003*`.
- **Manettes** : EmulatorJS n'en lit aucune ici (`value2` vidé dans `EJS_defaultControls`). Un pont de
  `player.js` transmet les entrées par `gameManager.simulateInput`, avec **calibrage de la position de repos
  des axes** — indispensable avec des périphériques HID (pédales, joysticks) dont les axes ne reposent pas à
  zéro, et qui provoquaient une direction maintenue en permanence. L'ordre dans lequel le navigateur voit les
  périphériques n'a rien à voir avec les joueurs : d'où le choix explicite par joueur.
- **Les contrôles ne doivent pas être réécrits après le démarrage** : `EJS_defaultControls` est appliqué
  avant, puis `setupKeys()` convertit les noms de touches en codes. Les réinjecter dans `EJS_ready` remet des
  chaînes et le clavier ne répond plus.
- **Clavier** : EmulatorJS l'écoute **sur son cadre de jeu**. Dès qu'un bouton du menu prend le focus, le jeu
  ne reçoit plus rien, d'où un relais dans `player.js` et la restitution du focus à la fermeture.
- **Fenêtres d'EmulatorJS** : tant que l'une est ouverte, il ignore **toutes** les entrées (`isPopupOpen`).
  Elles sont donc refermées de force en reprenant la partie.
- **Boutons de la barre** : les clés sont `play` et `pause` (pas `playPause`) ; `contextMenu` est protégé et
  ne peut pas être masqué par configuration ; la pause réaffiche `play` en forçant son style. Ces deux-là
  sont donc neutralisés par une classe CSS portant `!important`.
- **Plein écran** : EmulatorJS le demande sur son seul cadre, ce qui laisserait la surimpression hors écran ;
  sa méthode `toggleFullscreen` est remplacée par la nôtre, qui bascule toute la scène. Ne pas tenter de
  sortir puis redemander le plein écran : le navigateur refuse sans geste de l'utilisateur.
- **L'objet d'EmulatorJS change de forme d'une version à l'autre** : la 4.2.3 porte tout sur l'objet
  principal, les versions récentes déplacent l'interface dans `.frontend`. `player.js` accepte les deux.
- La traduction `fr-FR` **n'existe pas** sur le CDN : ne pas définir `EJS_language`.

---

## 6. Service, réseau, modification

`/etc/systemd/system/emulateurs-web.service` : `User/Group=pc`, `UMask=0002`, `Nice=10`, E/S `best-effort` 6,
`WorkingDirectory=…/emulateurs/web`, `EnvironmentFile=-…/emulateurs/.env`, `RequiresMountsFor=/srv/data`,
`ExecStart=/home/pc/miniconda3/bin/python -m uvicorn app:app --host 0.0.0.0 --port 8097`,
`Restart=on-failure`, `RestartSec=10`, `NoNewPrivileges=yes`, `PrivateTmp=yes`, `ProtectSystem=full`.
Dépendances : FastAPI et uvicorn, dans Miniconda `base` (les mêmes que traitement_medias).

Service de l'hôte, donc UFW s'applique : joignable **par Tailscale seulement**, rien à ajouter au pare-feu,
et pas de mot de passe (tailnet privé). Tuile Homepage **sans `siteMonitor`**.

**`config/reglages.json`**, facultatif et jamais écrit par le site, surcharge deux réglages communs à toutes
les consoles :
```json
{
  "emulatorjs": "https://cdn.emulatorjs.org/stable/data/",
  "manette": { "modificateur": 8, "sauver": 4, "charger": 5, "menu": 9 }
}
```
— la source d'EmulatorJS (`/static/emulatorjs/data/` pour une copie locale, si le CDN venait à manquer) et la
combinaison manette de repli (Select + L1 / R1 / Start) employée tant qu'aucun bouton n'a été affecté aux
raccourcis d'une console.

Modifier le code : copie datée (`cp -p … .bak-AAAA-MM-JJ`), `diff`, `py_compile` pour le Python,
`sha256sum` comparé à l'empreinte donnée. Les fichiers statiques sont versionnés par `?v=<date>` — un simple
rafraîchissement suffit ; seul un changement d'`app.py` demande `sudo systemctl restart emulateurs-web`.
L'inventaire des ROM se rafraîchit seul (cache de 45 s) : déposer un jeu par Samba suffit.

---

## 7. Contrôles et diagnostic

```bash
systemctl is-active emulateurs-web; curl -s http://localhost:8097/sante; echo      # active / ok
cd /srv/data/server/emulateurs/web && /home/pc/miniconda3/bin/python app.py --info # dossiers et nb de jeux
curl -s -I http://localhost:8097/neogeo.zip | head -3            # 200 + content-length (BIOS arcade)
ls -l /srv/data/server/emulateurs/saves/*/*/slot*.state          # tailles plausibles (13 Ko NES, 823 Ko SNES)
```

`--info` signale aussi les sous-dossiers d'`Emulateurs` qu'aucune console n'a reconnus, avec la manière de les
associer.

Dans la console du navigateur, jeu lancé :
```js
await import('/static/js/diag.js?x=' + Date.now())
DIAG.aide()        // état, manettes vues, espion des entrées, test d'appui, focus
```

| Symptôme | Cause |
|---|---|
| Bloqué sur « Download Game Data » | HEAD refusé sur `/api/rom/…` |
| FBNeo : « romset is missing files » alors que l'archive est complète | BIOS décompressé, ou set non FBNeo |
| Manette reconnue au mappage, muette en jeu | mauvais périphérique affecté au joueur |
| Direction maintenue sans rien toucher | axe au repos non nul d'un autre périphérique : l'affecter ou désactiver le joueur |
| Clavier mort après ouverture du menu | focus resté sur le menu |
| Page modifiée mais inchangée | URL statiques versionnées ; sinon Ctrl+Maj+R |
| Un jeu déposé n'apparaît pas | extension hors du tableau de la section 1, ou moins de 45 s (cache) |
| Les sauvegardes d'un jeu ont « disparu » | ROM renommée ou déplacée : l'identifiant vient du chemin |
| Console absente de l'accueil | dossier non reconnu : `app.py --info`, puis `.env` ou `config/dossiers.json` |

---

## 8. Routes HTTP

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/`, et toute URL inconnue hors `/api` et `/static` | la page unique |
| `GET` | `/sante` | `ok` |
| `GET` | `/api/consoles` · `/api/consoles/{cid}/jeux` · `/api/jeux/{cid}/{jid}` | inventaire |
| `GET`/`HEAD` | `/api/rom/{cid}/{jid}[/{nom}]` | la ROM, servie sous son vrai nom |
| `GET`/`HEAD` | `/{nom}` | fichier système à la racine (`neogeo.zip`), déclarée en dernier |
| `GET`/`HEAD` · `PUT` · `DELETE` | `/api/etat/{cid}/{jid}/{slot}` | état d'un emplacement (`?core=` à l'écriture) |
| `GET`/`HEAD` · `PUT` | `/api/image/{cid}/{jid}/{slot}` | vignette PNG (mise en cache 7 jours ; les états, jamais) |
| `GET` · `PUT` · `DELETE` | `/api/config/{cid}` | réglages d'une console ; `DELETE` = retour à l'origine |
| `GET` | `/api/reglages` | réglages communs (lecture seule, voir section 6) |

---

## 9. Dépôt Git

**`git@github.com:claupierr/nas-emulateurs.git`**, dépôt **privé**, branche `main`, premier envoi le
05/10/2026. Le dépôt vit dans le dossier du projet : `.git` est donc dans le miroir du mardi, ce qui fait une
seconde copie de l'historique, indépendante de GitHub.

`.gitignore` exclut `.env`, `saves/`, `config/`, `emu-*` (copies de livraison), `*.bak-*`, `__pycache__/`,
`web/static/emulatorjs/` et toute ROM ou BIOS ; `*.md` sert à écarter les ROM Mega Drive, d'où les exceptions
`!README.md` et `!EMULATEURS.md`.

⚠️ **`notes git.txt` n'est pas exclu** : contrairement à `youtube-dl` et `traitement_medias`, où `notes.txt`
est ignoré, ce fichier part sur GitHub. Le vérifier avant un passage en public, ou ajouter la règle.

```bash
cd /srv/data/server/emulateurs
git status --short      # À RELIRE : rien sous saves/, config/, .env, ni de copie oubliée
git add -A && git commit -m "…" && git push
```
Contrôle des exclusions en cas de doute : `git check-ignore -v .env config/nes.json saves/…/slot1.state`
nomme pour chaque chemin la règle qui l'écarte ; un chemin sans réponse serait versionné.

Le passage en public se fait dans Settings → General → Danger Zone. Deux préalables : **tout l'historique
devient visible**, pas seulement l'état actuel ; et sans fichier `LICENSE`, un dépôt public reste « tous
droits réservés ». Prévoir aussi une note d'installation, ce fichier étant écrit pour cette machine.
