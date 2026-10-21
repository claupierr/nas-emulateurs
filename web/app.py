#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Site émulateur du serveur « nas » — moteur (backend).

Emplacement prévu : /srv/data/server/emulateurs/web/app.py
Lancé par /etc/systemd/system/emulateurs-web.service (uvicorn, port 8097).

Rôles :
  - inventorier les ROM par console dans /srv/data/Documents/Emulateurs ;
  - servir les ROM au lecteur EmulatorJS (navigateur) ;
  - stocker les sauvegardes d'état (slots) et leurs vignettes côté serveur,
    donc dans le miroir du mardi ;
  - garder un réglage de manettes et d'options DIFFÉRENT pour chaque console.

Rien n'est écrit dans /srv/data/Documents : les ROM sont ouvertes en lecture seule.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

# --------------------------------------------------------------------------- #
# Chemins et constantes
# --------------------------------------------------------------------------- #

BASE = Path(__file__).resolve().parent          # .../emulateurs/web
RACINE = BASE.parent                            # .../emulateurs
ROMS = Path(os.environ.get("EMU_ROMS", "/srv/data/Documents/Emulateurs"))


def racine_console(cid: str):
    """Dossier imposé pour une console, par l'environnement (fichier .env, lu au
    démarrage du service) : EMU_ROMS_NES, EMU_ROMS_SNES, EMU_ROMS_GB,
    EMU_ROMS_MEGADRIVE, EMU_ROMS_N64, EMU_ROMS_NEOGEO. Chemin absolu, ou nom d'un
    sous-dossier de EMU_ROMS. Vide ou absent : reconnaissance automatique."""
    valeur = (os.environ.get(f"EMU_ROMS_{cid.upper()}") or "").strip().strip('"')
    if not valeur:
        return None
    p = Path(valeur)
    if not p.is_absolute():
        p = ROMS / valeur
    return p if p.is_dir() else None
SAVES = Path(os.environ.get("EMU_SAVES", str(RACINE / "saves")))
CONFIG = Path(os.environ.get("EMU_CONFIG", str(RACINE / "config")))
NB_SLOTS = int(os.environ.get("EMU_SLOTS", "6"))
MAX_ETAT = 96 * 1024 * 1024        # garde-fou : un état n64 dépasse rarement 20 Mo
MAX_IMAGE = 4 * 1024 * 1024
MAX_CODES = 100                    # codes de triche par jeu
MAX_CODES_OCTETS = 64 * 1024
CDN_DEFAUT = "https://cdn.emulatorjs.org/stable/data/"

RE_ID = re.compile(r"^[0-9a-f]{16}$")

# Raccourcis d'une console : nom de touche (table d'EmulatorJS) et étiquette de
# bouton de manette. Vides côté manette tant que l'utilisateur n'a rien affecté.
RACCOURCIS_DEFAUT = {
    "sauver": {"value": "f2", "value2": ""},
    "charger": {"value": "f4", "value2": ""},
    "menu": {"value": "escape", "value2": ""},
    "pause": {"value": "p", "value2": ""},
}

# Une entrée par console. « jetons » = mots entiers du nom de dossier (NES ≠ SNES),
# « motifs » = sous-chaînes cherchées dans le nom réduit aux lettres et chiffres.
CONSOLES = [
    {
        "id": "nes", "nom": "NES", "constructeur": "Nintendo, 1983",
        "core": "nes", "coeurs": ["fceumm", "nestopia"], "scheme": "nes", "couleur": "#E53935",
        "jetons": {"NES", "FAMICOM", "FC"},
        "motifs": ["NINTENDOENTERTAINMENT"],
        "ext": [".nes", ".fds", ".unf", ".unif", ".zip", ".7z"],
        "options": {"shader": "disabled"},
    },
    {
        "id": "snes", "nom": "Super NES", "constructeur": "Nintendo, 1990",
        "core": "snes", "coeurs": ["snes9x", "snes9x2010", "snes9x2005"], "scheme": "snes", "couleur": "#7E57C2",
        "jetons": {"SNES", "SFC"},
        "motifs": ["SUPERNINTENDO", "SUPERFAMICOM", "SUPERNES"],
        "ext": [".sfc", ".smc", ".fig", ".swc", ".zip", ".7z"],
        "options": {"shader": "disabled"},
    },
    {
        "id": "gb", "nom": "Game Boy", "constructeur": "Nintendo, 1989",
        "core": "gb", "coeurs": ["gambatte", "mgba"], "scheme": "gb", "couleur": "#43A047",
        "jetons": {"GB", "GBC", "GAMEBOY"},
        "motifs": ["GAMEBOY"],
        "ext": [".gb", ".gbc", ".dmg", ".zip", ".7z"],
        "options": {"shader": "disabled"},
    },
    {
        "id": "megadrive", "nom": "Mega Drive", "constructeur": "Sega, 1988",
        "core": "segaMD", "coeurs": ["genesis_plus_gx", "picodrive"], "scheme": "segaMD", "couleur": "#1E88E5",
        "jetons": {"MD", "SMD", "GENESIS", "MEGADRIVE"},
        "motifs": ["MEGADRIVE", "SEGAGENESIS"],
        "ext": [".md", ".gen", ".smd", ".bin", ".zip", ".7z"],
        "options": {"shader": "disabled"},
    },
    {
        "id": "n64", "nom": "Nintendo 64", "constructeur": "Nintendo, 1996",
        "core": "n64", "coeurs": ["mupen64plus_next", "parallel_n64"], "scheme": "n64", "couleur": "#00ACC1",
        "jetons": {"N64"},
        "motifs": ["NINTENDO64"],
        "ext": [".n64", ".z64", ".v64", ".zip", ".7z"],
        "options": {"shader": "disabled"},
    },
    {
        "id": "neogeo", "nom": "Neo Geo", "constructeur": "SNK, 1990",
        "core": "arcade", "coeurs": ["fbneo", "mame2003_plus", "mame2003"], "scheme": "arcade", "couleur": "#FB8C00",
        "jetons": {"NEOGEO", "NEO", "NG", "MVS", "AES"},
        "motifs": ["NEOGEO"],
        "ext": [".zip", ".7z", ".neo"],
        "options": {"shader": "disabled"},
        # fichiers système du core arcade : jamais proposés comme jeu
        "exclus": {"neogeo.zip", "neogeo.7z", "pgm.zip", "decrypted.zip"},
    },
]

PAR_ID = {c["id"]: c for c in CONSOLES}

app = FastAPI(title="Émulateur nas", docs_url=None, redoc_url=None)


# --------------------------------------------------------------------------- #
# Petits utilitaires
# --------------------------------------------------------------------------- #

def lire_json(chemin: Path, defaut):
    try:
        return json.loads(chemin.read_text(encoding="utf-8"))
    except Exception:
        return defaut


def ecrire_json(chemin: Path, contenu) -> None:
    """Écriture atomique : fichier temporaire puis renommage."""
    chemin.parent.mkdir(parents=True, exist_ok=True)
    tmp = chemin.with_suffix(chemin.suffix + ".tmp")
    tmp.write_text(json.dumps(contenu, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, chemin)


def ecrire_binaire(chemin: Path, donnees: bytes) -> None:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    tmp = chemin.with_suffix(chemin.suffix + ".tmp")
    tmp.write_bytes(donnees)
    os.replace(tmp, chemin)


def iso(horodatage: float) -> str:
    return datetime.fromtimestamp(horodatage, tz=timezone.utc).astimezone().isoformat(timespec="seconds")


def normaliser(nom: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", nom.upper())


def jetons(nom: str) -> set:
    return {m for m in re.split(r"[^A-Za-z0-9]+", nom.upper()) if m}


def titre_lisible(nom_fichier: str) -> str:
    """« Super_Mario_World (Europe) [!].sfc » → « Super Mario World (Europe) »."""
    t = Path(nom_fichier).stem
    t = re.sub(r"\[[^\]]*\]", " ", t)
    t = t.replace("_", " ").replace(".", " ")
    return re.sub(r"\s+", " ", t).strip()


def cle_tri(titre: str) -> str:
    t = titre.lower()
    for article in ("the ", "le ", "la ", "les ", "a ", "an "):
        if t.startswith(article):
            t = t[len(article):]
    return t


def console_ou_404(cid: str) -> dict:
    c = PAR_ID.get(cid)
    if not c:
        raise HTTPException(404, "console inconnue")
    return c


def slot_ou_400(slot: int) -> int:
    if not 1 <= slot <= NB_SLOTS:
        raise HTTPException(400, "numéro d'emplacement hors bornes")
    return slot


def id_ou_400(jid: str) -> str:
    if not RE_ID.match(jid):
        raise HTTPException(400, "identifiant de jeu invalide")
    return jid


# --------------------------------------------------------------------------- #
# Inventaire des ROM
# --------------------------------------------------------------------------- #

def dossiers_roms() -> dict:
    """Associe chaque console à son sous-dossier de /srv/data/Documents/Emulateurs.

    La reconnaissance est automatique (A-NES, D-SNES, Mega Drive…). Elle peut être
    forcée par config/dossiers.json, par exemple : {"neogeo": "F-NEOGEO"}.
    """
    forces = lire_json(CONFIG / "dossiers.json", {})
    trouves: dict = {}
    sous = (sorted((d for d in ROMS.iterdir() if d.is_dir()), key=lambda d: d.name)
            if ROMS.is_dir() else [])
    for c in CONSOLES:
        cid = c["id"]
        # priorité : variable d'environnement, puis config/dossiers.json, puis le nom
        impose = racine_console(cid)
        if impose:
            trouves[cid] = impose
            continue
        if cid in forces:
            p = (ROMS / str(forces[cid])).resolve()
            # un « .. » glissé dans le fichier ne doit pas faire sortir de la racine
            if p.is_dir() and str(p).startswith(str(ROMS.resolve())):
                trouves[cid] = p
            continue
        for d in sous:
            if d in trouves.values():
                continue
            if (jetons(d.name) & c["jetons"]) or any(m in normaliser(d.name) for m in c["motifs"]):
                trouves[cid] = d
                break
    return trouves


_cache_jeux: dict = {}


def lister_jeux(cid: str) -> list:
    """Liste triée des ROM d'une console.

    Cache de 45 s : le disque est relu tout seul peu après l'ajout d'un fichier
    par Samba, sans que l'utilisateur ait à demander quoi que ce soit."""
    c = console_ou_404(cid)
    dossier = dossiers_roms().get(cid)
    cle = (cid, str(dossier))
    vieux = _cache_jeux.get(cle)
    if vieux and time.time() - vieux[0] < 45:
        return vieux[1]

    jeux = []
    if dossier and dossier.is_dir():
        exclus = {n.lower() for n in c.get("exclus", set())}
        for f in sorted(dossier.rglob("*")):
            if not f.is_file() or f.name.startswith("."):
                continue
            if f.suffix.lower() not in c["ext"] or f.name.lower() in exclus:
                continue
            rel = f.relative_to(dossier).as_posix()
            titre = titre_lisible(f.name)
            jeux.append({
                "id": hashlib.sha1(rel.encode("utf-8")).hexdigest()[:16],
                "fichier": rel,
                "titre": titre,
                "taille": f.stat().st_size,
            })
    jeux.sort(key=lambda j: cle_tri(j["titre"]))
    _cache_jeux[cle] = (time.time(), jeux)
    return jeux


def jeu_ou_404(cid: str, jid: str) -> dict:
    id_ou_400(jid)
    for j in lister_jeux(cid):
        if j["id"] == jid:
            return j
    raise HTTPException(404, "jeu introuvable")


def chemin_rom(cid: str, jeu: dict) -> Path:
    dossier = dossiers_roms().get(cid)
    if not dossier:
        raise HTTPException(404, "dossier de ROM introuvable")
    p = (dossier / jeu["fichier"]).resolve()
    if not str(p).startswith(str(dossier.resolve())) or not p.is_file():
        raise HTTPException(404, "fichier introuvable")
    return p


# --------------------------------------------------------------------------- #
# Sauvegardes (emplacements)
# --------------------------------------------------------------------------- #

def dossier_sauvegarde(cid: str, jid: str) -> Path:
    return SAVES / cid / jid


def etat_des_slots(cid: str, jid: str) -> list:
    d = dossier_sauvegarde(cid, jid)
    slots = []
    for n in range(1, NB_SLOTS + 1):
        etat = d / f"slot{n}.state"
        image = d / f"slot{n}.png"
        try:
            st = etat.stat()
            vignette = (f"/api/image/{cid}/{jid}/{n}?v={int(image.stat().st_mtime)}"
                        if image.is_file() else None)
            meta = lire_json(d / f"slot{n}.json", {})
            slots.append({"slot": n, "vide": False, "date": iso(st.st_mtime),
                          "taille": st.st_size, "image": vignette,
                          "core": meta.get("core") or ""})
        except OSError:
            slots.append({"slot": n, "vide": True, "date": None, "taille": 0,
                          "image": None, "core": ""})
    return slots


def resume_sauvegardes(cid: str) -> dict:
    """Nombre d'états et vignette la plus récente de chaque jeu d'une console.

    Un seul parcours du dossier, au lieu de douze appels à stat() par jeu : sur
    une bibliothèque de plusieurs centaines de titres, la différence est nette."""
    resume: dict = {}
    racine = SAVES / cid
    if not racine.is_dir():
        return resume
    for d in racine.iterdir():
        if not d.is_dir():
            continue
        etats, image, recent = 0, None, -1.0
        try:
            for f in d.iterdir():
                if f.suffix == ".state":
                    etats += 1
                elif f.suffix == ".png":
                    m = f.stat().st_mtime
                    if m > recent:
                        recent, image = m, f
        except OSError:
            continue
        if etats:
            resume[d.name] = {
                "sauvegardes": etats,
                "vignette": (f"/api/image/{cid}/{d.name}/{image.stem.replace('slot', '')}"
                             f"?v={int(recent)}") if image else None,
            }
    return resume


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #

@app.get("/sante")
def sante():
    return Response("ok", media_type="text/plain")


@app.get("/api/consoles")
def api_consoles():
    dossiers = dossiers_roms()
    sortie = []
    for c in CONSOLES:
        d = dossiers.get(c["id"])
        sortie.append({
            "id": c["id"], "nom": c["nom"], "constructeur": c["constructeur"],
            "couleur": c["couleur"], "core": c["core"],
            "dossier": d.name if d else None,
            "jeux": len(lister_jeux(c["id"])) if d else 0,
        })
    return {"consoles": sortie, "racine": str(ROMS), "slots": NB_SLOTS}


@app.get("/api/consoles/{cid}/jeux")
def api_jeux(cid: str):
    c = console_ou_404(cid)
    config = lire_config(cid)
    resume = resume_sauvegardes(cid)
    jeux = []
    for j in lister_jeux(cid):
        r = resume.get(j["id"], {})
        jeux.append({**j, "sauvegardes": r.get("sauvegardes", 0), "vignette": r.get("vignette")})
    d = dossiers_roms().get(cid)
    return {
        "console": {"id": c["id"], "nom": c["nom"], "constructeur": c["constructeur"],
                    "couleur": c["couleur"], "dossier": d.name if d else None,
                    "core": config["core"] or c["core"], "core_origine": c["core"],
                    "coeurs": c.get("coeurs", [])},
        "jeux": jeux,
    }


@app.get("/api/jeux/{cid}/{jid}")
def api_jeu(cid: str, jid: str):
    c = console_ou_404(cid)
    jeu = jeu_ou_404(cid, jid)
    bios = dossier_bios(cid)
    config = lire_config(cid)
    return {
        "jeu": jeu,
        "slots": etat_des_slots(cid, jid),
        "console": {"id": c["id"], "nom": c["nom"], "couleur": c["couleur"],
                    "core": config["core"] or c["core"], "core_origine": c["core"],
                    "coeurs": c.get("coeurs", []), "scheme": c["scheme"],
                    "bios": bios.name if bios else ""},
        "config": config,
        "codes": lire_codes(cid, jid),
        "reglages": lire_reglages(),
    }


@app.api_route("/api/rom/{cid}/{jid}", methods=["GET", "HEAD"])
@app.api_route("/api/rom/{cid}/{jid}/{nom}", methods=["GET", "HEAD"])
def api_rom(cid: str, jid: str, nom: str = ""):
    """Sert la ROM au lecteur.

    HEAD est indispensable : EmulatorJS interroge d'abord la taille du fichier,
    et un 405 fait échouer tout le chargement. Le segment « nom » ne sert qu'à
    terminer l'URL par le vrai nom de fichier : les cœurs arcade (FBNeo, MAME)
    identifient le jeu par ce nom — « mslug.zip » et rien d'autre."""
    console_ou_404(cid)
    jeu = jeu_ou_404(cid, jid)
    p = chemin_rom(cid, jeu)
    return FileResponse(p, media_type="application/octet-stream", filename=p.name,
                        headers={"Cache-Control": "public, max-age=86400"})


def dossier_bios(cid: str):
    """Fichier système éventuel (neogeo.zip pour le core arcade)."""
    c = PAR_ID.get(cid)
    d = dossiers_roms().get(cid)
    if not c or not d:
        return None
    for nom in sorted(c.get("exclus", [])):
        p = d / nom
        if p.is_file():
            return p
    return None


@app.api_route("/api/etat/{cid}/{jid}/{slot}", methods=["GET", "HEAD"])
def api_etat_lire(cid: str, jid: str, slot: int):
    console_ou_404(cid); id_ou_400(jid); slot_ou_400(slot)
    p = dossier_sauvegarde(cid, jid) / f"slot{slot}.state"
    if not p.is_file():
        raise HTTPException(404, "emplacement vide")
    return FileResponse(p, media_type="application/octet-stream",
                        headers={"Cache-Control": "no-store"})


@app.put("/api/etat/{cid}/{jid}/{slot}")
async def api_etat_ecrire(cid: str, jid: str, slot: int, request: Request, core: str = ""):
    """Un état n'est relisible que par le cœur qui l'a produit : on note lequel,
    pour pouvoir refuser un chargement incompatible plutôt que de planter."""
    console_ou_404(cid); slot_ou_400(slot)
    jeu = jeu_ou_404(cid, jid)
    donnees = await request.body()
    if not donnees:
        raise HTTPException(400, "contenu vide")
    if len(donnees) > MAX_ETAT:
        raise HTTPException(413, "état trop volumineux")
    c = PAR_ID[cid]
    connus = {c["core"], *c.get("coeurs", [])}
    d = dossier_sauvegarde(cid, jid)
    ecrire_binaire(d / f"slot{slot}.state", donnees)
    ecrire_json(d / f"slot{slot}.json",
                {"core": core if core in connus else "", "date": iso(time.time())})
    # mémo lisible dans la sauvegarde hebdomadaire
    (d / "jeu.txt").write_text(f"{cid}\n{jeu['fichier']}\n{jeu['titre']}\n", encoding="utf-8")
    return {"ok": True, "slots": etat_des_slots(cid, jid)}


@app.delete("/api/etat/{cid}/{jid}/{slot}")
def api_etat_supprimer(cid: str, jid: str, slot: int):
    console_ou_404(cid); id_ou_400(jid); slot_ou_400(slot)
    d = dossier_sauvegarde(cid, jid)
    for suffixe in (".state", ".png", ".json"):
        p = d / f"slot{slot}{suffixe}"
        if p.is_file():
            p.unlink()
    return {"ok": True, "slots": etat_des_slots(cid, jid)}


@app.api_route("/api/image/{cid}/{jid}/{slot}", methods=["GET", "HEAD"])
def api_image_lire(cid: str, jid: str, slot: int):
    console_ou_404(cid); id_ou_400(jid); slot_ou_400(slot)
    p = dossier_sauvegarde(cid, jid) / f"slot{slot}.png"
    if not p.is_file():
        raise HTTPException(404, "pas de vignette")
    return FileResponse(p, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=604800"})


@app.put("/api/image/{cid}/{jid}/{slot}")
async def api_image_ecrire(cid: str, jid: str, slot: int, request: Request):
    console_ou_404(cid); id_ou_400(jid); slot_ou_400(slot)
    donnees = await request.body()
    if not donnees or len(donnees) > MAX_IMAGE:
        raise HTTPException(400, "vignette absente ou trop volumineuse")
    ecrire_binaire(dossier_sauvegarde(cid, jid) / f"slot{slot}.png", donnees)
    return {"ok": True}


# --- codes de triche, propres à chaque jeu ---------------------------------- #
#
# Rangés avec les sauvegardes du jeu (saves/<console>/<id>/codes.json), donc
# dans le miroir du mardi. Chaque code garde son état activé ou désactivé, qui
# est réappliqué au lancement suivant.

def lire_codes(cid: str, jid: str) -> list:
    brut = lire_json(dossier_sauvegarde(cid, jid) / "codes.json", {})
    codes = brut.get("codes") if isinstance(brut, dict) else None
    return codes if isinstance(codes, list) else []


def nettoyer_code(entree) -> dict | None:
    """Un code reçu du navigateur : nom libre, code sans caractère de contrôle.
    Les espaces sont gardés (les codes GameShark N64 en contiennent)."""
    if not isinstance(entree, dict):
        return None
    nom = re.sub(r"[\x00-\x1f]", " ", str(entree.get("nom") or "")).strip()[:120]
    code = re.sub(r"[\x00-\x1f]+", "+", str(entree.get("code") or "")).strip(" +")[:1000]
    if not code:
        return None
    return {"nom": nom or code[:40], "code": code, "actif": bool(entree.get("actif"))}


@app.get("/api/codes/{cid}/{jid}")
def api_codes_lire(cid: str, jid: str):
    console_ou_404(cid); id_ou_400(jid)
    return {"codes": lire_codes(cid, jid)}


@app.put("/api/codes/{cid}/{jid}")
async def api_codes_ecrire(cid: str, jid: str, request: Request):
    """Remplace la liste complète des codes du jeu (liste vide = tout effacer)."""
    console_ou_404(cid)
    jeu = jeu_ou_404(cid, jid)
    brut = await request.body()
    if len(brut) > MAX_CODES_OCTETS:
        raise HTTPException(413, "liste de codes trop volumineuse")
    try:
        recu = json.loads(brut)
    except ValueError:
        raise HTTPException(400, "JSON invalide")
    liste = recu.get("codes") if isinstance(recu, dict) else None
    if not isinstance(liste, list) or len(liste) > MAX_CODES:
        raise HTTPException(400, f"liste de {MAX_CODES} codes au plus attendue")
    codes = [c for c in (nettoyer_code(e) for e in liste) if c]
    d = dossier_sauvegarde(cid, jid)
    p = d / "codes.json"
    if codes:
        ecrire_json(p, {"codes": codes, "date": iso(time.time())})
        (d / "jeu.txt").write_text(f"{cid}\n{jeu['fichier']}\n{jeu['titre']}\n", encoding="utf-8")
    elif p.is_file():
        p.unlink()
    return {"ok": True, "codes": codes}


# --- réglages par console (manettes + options de l'émulateur) --------------- #

def lire_config(cid: str) -> dict:
    """Réglages d'une console : d'origine, puis ce que l'utilisateur a enregistré."""
    c = PAR_ID[cid]
    enregistre = lire_json(CONFIG / f"{cid}.json", {})
    options = dict(c.get("options", {}))
    options.update(enregistre.get("options") or {})
    raccourcis = {k: dict(v) for k, v in RACCOURCIS_DEFAUT.items()}
    for k, v in (enregistre.get("raccourcis") or {}).items():
        if k in raccourcis and isinstance(v, dict):
            raccourcis[k].update(v)
    return {
        "controls": enregistre.get("controls"),
        "options": options,
        "volume": enregistre.get("volume", 0.5),
        # quel périphérique pilote quel joueur : "<id>_<index>" ou "" (ordre par défaut)
        "manettes": enregistre.get("manettes") or ["", "", "", ""],
        # cœur d'émulation : vide = celui d'origine de la console
        "core": enregistre.get("core") or "",
        "raccourcis": raccourcis,
        "personnalise": bool(enregistre),
    }


@app.get("/api/config/{cid}")
def api_config_lire(cid: str):
    console_ou_404(cid)
    return lire_config(cid)


@app.put("/api/config/{cid}")
async def api_config_ecrire(cid: str, request: Request):
    console_ou_404(cid)
    brut = await request.body()
    if len(brut) > 512 * 1024:
        raise HTTPException(413, "réglages trop volumineux")
    try:
        recu = json.loads(brut)
    except ValueError:
        raise HTTPException(400, "JSON invalide")
    if not isinstance(recu, dict):
        raise HTTPException(400, "objet attendu")
    config = lire_config(cid)
    for cle in ("controls", "options", "volume", "manettes", "raccourcis", "core"):
        if cle in recu:
            config[cle] = recu[cle]
    ecrire_json(CONFIG / f"{cid}.json",
                {k: config[k] for k in ("controls", "options", "volume", "manettes",
                                        "raccourcis", "core")})
    return {"ok": True}


@app.delete("/api/config/{cid}")
def api_config_effacer(cid: str):
    """Retour aux réglages d'origine de la console (manettes et options)."""
    console_ou_404(cid)
    p = CONFIG / f"{cid}.json"
    if p.is_file():
        p.unlink()
    return lire_config(cid)


def lire_reglages() -> dict:
    """Réglages communs à toutes les consoles."""
    base = {
        # source des fichiers d'EmulatorJS (CDN ou copie locale)
        "emulatorjs": CDN_DEFAUT,
        # combinaison de repli, utilisée tant qu'aucun bouton n'est affecté aux
        # raccourcis dans le menu d'une console : Select + L1 / R1 / Start
        "manette": {"modificateur": 8, "sauver": 4, "charger": 5, "menu": 9},
    }
    base.update(lire_json(CONFIG / "reglages.json", {}))
    return base


@app.get("/api/reglages")
def api_reglages_lire():
    return lire_reglages()


# --------------------------------------------------------------------------- #
# Page et fichiers statiques
# --------------------------------------------------------------------------- #

app.mount("/static", StaticFiles(directory=str(BASE / "static")), name="static")


_version: list = [0.0, ""]


def version_statique() -> str:
    """Horodatage du fichier statique le plus récent : les URL changent, le
    navigateur recharge seul (même principe que traitement_medias)."""
    if _version[1] and time.time() - _version[0] < 10:
        return _version[1]
    recent = 0.0
    for p in (BASE / "static").rglob("*"):
        if p.is_file() and "emulatorjs" not in p.parts:
            recent = max(recent, p.stat().st_mtime)
    recent = max(recent, (BASE / "index.html").stat().st_mtime)
    _version[0], _version[1] = time.time(), str(int(recent))
    return _version[1]


@app.get("/", response_class=HTMLResponse)
def page_accueil():
    html = (BASE / "index.html").read_text(encoding="utf-8")
    html = html.replace("{{V}}", version_statique())
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


@app.api_route("/{nom}", methods=["GET", "HEAD"])
def api_bios_racine(nom: str):
    """Sert un fichier système à la racine, sous son vrai nom.

    EmulatorJS, quand on lui interdit de décompresser le BIOS, l'écrit dans son
    système de fichiers sous le chemin de l'URL : seule une URL réduite à
    « neogeo.zip » produit le fichier que FBNeo cherche. Déclarée en dernier,
    cette route ne masque ni la page ni /api ni /static."""
    for c in CONSOLES:
        p = dossier_bios(c["id"])
        if p and p.name == nom:
            return FileResponse(p, media_type="application/octet-stream", filename=p.name)
    raise HTTPException(404, "introuvable")


@app.exception_handler(404)
def page_404(request: Request, exc):
    if request.url.path.startswith(("/api/", "/static/")):
        return JSONResponse({"erreur": "introuvable"}, status_code=404)
    return page_accueil()


# --------------------------------------------------------------------------- #
# Lancement direct : « --info » pour contrôler l'inventaire sans navigateur
# --------------------------------------------------------------------------- #

def main() -> None:
    import sys
    if "--info" in sys.argv:
        print(f"ROM        : {ROMS}  ({'présent' if ROMS.is_dir() else 'ABSENT'})")
        print(f"Sauvegardes: {SAVES}")
        print(f"Config     : {CONFIG}")
        dossiers = dossiers_roms()
        for c in CONSOLES:
            d = dossiers.get(c["id"])
            n = len(lister_jeux(c["id"])) if d else 0
            print(f"  {c['nom']:<14} core {c['core']:<8} dossier {d.name if d else '— non trouvé —':<20} {n:>5} jeu(x)")
        inconnus = [d.name for d in sorted(ROMS.iterdir()) if d.is_dir() and d not in dossiers.values()] \
            if ROMS.is_dir() else []
        if inconnus:
            print("  Dossiers non reconnus :", ", ".join(inconnus))
            print("  (les associer dans config/dossiers.json, ex. {\"neogeo\": \"F-NEOGEO\"})")
        return
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("EMU_PORT", "8097")))


if __name__ == "__main__":
    main()
