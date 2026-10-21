/* ------------------------------------------------------------------------- *
 * Site émulateur du serveur « nas » — interface des menus.
 * /srv/data/server/emulateurs/web/static/js/app.js
 *
 * Contient : appels à l'API, pages Accueil et Console, choix d'emplacement,
 * navigation à la souris, au clavier et à la manette, messages.
 * Le lancement des jeux est dans player.js.
 * ------------------------------------------------------------------------- */

const EMU = (() => {
  "use strict";

  const etat = {
    consoles: [],
    console: null,       // console affichée
    jeux: [],
    filtre: "",
    reglages: null,
    enJeu: false,        // player.js passe à true pendant une partie
    surPad: null,        // crochet posé par player.js : manettes et raccourcis
    manettes: [],        // manettes connues, établies à la demande seulement
    capture: null,       // écoute d'une touche ou d'un bouton, page de mappage
    controles: null,     // mappage de la console en cours de réglage
  };

  const $ = (sel) => document.querySelector(sel);

  // Tout ce qui vient du disque (noms de ROM, de dossiers) ou du navigateur
  // (identifiants de manette) traverse ceci avant d'entrer dans du HTML.
  const h = (t) => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const vue = $("#vue");

  /* ------------------------------------------------------------------ API */

  async function api(chemin, options = {}) {
    const r = await fetch(chemin, options);
    if (!r.ok) {
      let detail = r.statusText;
      try { detail = (await r.json()).detail || detail; } catch (e) { /* réponse non JSON */ }
      throw new Error(`${r.status} — ${detail}`);
    }
    const type = r.headers.get("content-type") || "";
    return type.includes("json") ? r.json() : r;
  }

  function message(texte, erreur = false) {
    const el = document.createElement("div");
    el.className = "message" + (erreur ? " erreur" : "");
    el.textContent = texte;
    $("#messages").appendChild(el);
    setTimeout(() => el.remove(), erreur ? 6000 : 2600);
  }

  const dateFr = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });
  const formatDate = (iso) => (iso ? dateFr.format(new Date(iso)) : "");

  /* ------------------------------------------------------- dessins consoles */

  function art(cid, couleur) {
    const f = "#15131a", t = "#efe9f5";
    const formes = {
      nes: `<rect x="86" y="72" width="148" height="68" rx="8" fill="${f}"/>
            <rect x="100" y="98" width="34" height="11" rx="3" fill="${t}"/>
            <rect x="111" y="87" width="12" height="33" rx="3" fill="${t}"/>
            <rect x="150" y="96" width="38" height="16" rx="8" fill="#2a2731"/>
            <circle cx="203" cy="104" r="10" fill="${couleur}"/>
            <circle cx="177" cy="104" r="10" fill="${couleur}"/>`,
      snes: `<rect x="70" y="76" width="180" height="62" rx="31" fill="${f}"/>
             <rect x="84" y="62" width="40" height="16" rx="8" fill="#2a2731"/>
             <rect x="196" y="62" width="40" height="16" rx="8" fill="#2a2731"/>
             <rect x="98" y="101" width="32" height="10" rx="3" fill="${t}"/>
             <rect x="109" y="90" width="10" height="32" rx="3" fill="${t}"/>
             <circle cx="207" cy="106" r="9" fill="${couleur}"/>
             <circle cx="187" cy="96" r="9" fill="${t}"/>
             <circle cx="187" cy="116" r="9" fill="${t}"/>
             <circle cx="167" cy="106" r="9" fill="${couleur}"/>`,
      gb: `<rect x="124" y="28" width="72" height="144" rx="12" fill="${f}"/>
           <rect x="136" y="42" width="48" height="42" rx="5" fill="${couleur}" opacity=".85"/>
           <rect x="140" y="106" width="22" height="7" rx="2" fill="${t}"/>
           <rect x="147" y="99" width="8" height="21" rx="2" fill="${t}"/>
           <circle cx="176" cy="104" r="7" fill="${couleur}"/>
           <circle cx="176" cy="120" r="7" fill="${couleur}"/>
           <rect x="146" y="146" width="28" height="6" rx="3" fill="#2a2731"/>`,
      megadrive: `<rect x="76" y="80" width="168" height="56" rx="27" fill="${f}"/>
                  <rect x="100" y="103" width="32" height="10" rx="3" fill="${t}"/>
                  <rect x="111" y="92" width="10" height="32" rx="3" fill="${t}"/>
                  <circle cx="172" cy="110" r="10" fill="${couleur}"/>
                  <circle cx="196" cy="108" r="10" fill="${couleur}"/>
                  <circle cx="220" cy="106" r="10" fill="${couleur}"/>`,
      n64: `<path d="M160 60h-16l-20 48-30 10v26h40l14-30h24l14 30h40v-26l-30-10-20-48z" fill="${f}"/>
            <circle cx="160" cy="112" r="15" fill="${t}"/>
            <circle cx="160" cy="112" r="7" fill="${couleur}"/>
            <rect x="96" y="78" width="26" height="9" rx="3" fill="${t}"/>
            <circle cx="213" cy="86" r="8" fill="${couleur}"/>`,
      neogeo: `<rect x="74" y="104" width="172" height="52" rx="10" fill="${f}"/>
               <rect x="108" y="70" width="8" height="38" rx="4" fill="#2a2731"/>
               <circle cx="112" cy="64" r="16" fill="${couleur}"/>
               <circle cx="168" cy="124" r="10" fill="${t}"/>
               <circle cx="194" cy="118" r="10" fill="${t}"/>
               <circle cx="220" cy="124" r="10" fill="${couleur}"/>
               <circle cx="194" cy="142" r="10" fill="${couleur}"/>`,
    };
    return `<svg class="art" viewBox="0 0 320 200" role="img" aria-hidden="true">
      <defs><linearGradient id="d-${cid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${couleur}" stop-opacity=".82"/>
        <stop offset="1" stop-color="#121014"/></linearGradient></defs>
      <rect width="320" height="200" fill="url(#d-${cid})"/>
      ${formes[cid] || ""}</svg>`;
  }

  const SVG_DISQUETTE = `<svg viewBox="0 0 24 24"><path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3-10H6V5h9v4z"/></svg>`;
  const SVG_POUBELLE = `<svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;

  /* --------------------------------------------------- touches et manettes */

  // Table des touches d'EmulatorJS (data/src/emulator.js) : les noms doivent
  // correspondre exactement, sinon la touche est ignorée par l'émulateur.
  const TOUCHES = {
    8: "backspace", 9: "tab", 13: "enter", 16: "shift", 17: "ctrl", 18: "alt",
    19: "pause/break", 20: "caps lock", 27: "escape", 32: "space", 33: "page up",
    34: "page down", 35: "end", 36: "home", 37: "left arrow", 38: "up arrow",
    39: "right arrow", 40: "down arrow", 45: "insert", 46: "delete",
    106: "multiply", 107: "add", 109: "subtract", 110: "decimal point", 111: "divide",
    144: "num lock", 145: "scroll lock", 186: "semi-colon", 187: "equal sign",
    188: "comma", 189: "dash", 190: "period", 191: "forward slash",
    192: "grave accent", 219: "open bracket", 220: "backslash",
    221: "close bracket", 222: "single quote",
  };
  for (let i = 48; i <= 57; i++) TOUCHES[i] = String(i - 48);
  for (let i = 65; i <= 90; i++) TOUCHES[i] = String.fromCharCode(i + 32);
  for (let i = 96; i <= 105; i++) TOUCHES[i] = "numpad " + (i - 96);
  for (let i = 112; i <= 123; i++) TOUCHES[i] = "f" + (i - 111);

  // Libellés de boutons de manette d'EmulatorJS (data/src/gamepad.js).
  const BOUTONS_PAD = ["BUTTON_1", "BUTTON_2", "BUTTON_3", "BUTTON_4",
    "LEFT_TOP_SHOULDER", "RIGHT_TOP_SHOULDER", "LEFT_BOTTOM_SHOULDER",
    "RIGHT_BOTTOM_SHOULDER", "SELECT", "START", "LEFT_STICK", "RIGHT_STICK",
    "DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT"];
  const AXES_PAD = ["LEFT_STICK_X", "LEFT_STICK_Y", "RIGHT_STICK_X", "RIGHT_STICK_Y"];

  // Ordre des entrées de contrôle d'EmulatorJS, et valeurs par défaut.
  const MANETTE = ["BUTTON_2", "BUTTON_4", "SELECT", "START", "DPAD_UP", "DPAD_DOWN",
    "DPAD_LEFT", "DPAD_RIGHT", "BUTTON_1", "BUTTON_3", "LEFT_TOP_SHOULDER",
    "RIGHT_TOP_SHOULDER", "LEFT_BOTTOM_SHOULDER", "RIGHT_BOTTOM_SHOULDER",
    "LEFT_STICK", "RIGHT_STICK", "LEFT_STICK_X:+1", "LEFT_STICK_X:-1",
    "LEFT_STICK_Y:+1", "LEFT_STICK_Y:-1", "RIGHT_STICK_X:+1", "RIGHT_STICK_X:-1",
    "RIGHT_STICK_Y:+1", "RIGHT_STICK_Y:-1"];
  const CLAVIER = ["x", "s", "v", "enter", "up arrow", "down arrow", "left arrow",
    "right arrow", "z", "a", "q", "e", "tab", "r", "", "", "h", "f", "g", "t",
    "l", "j", "k", "i"];

  function controlesParDefaut() {
    const jeu = {};
    for (let joueur = 0; joueur < 4; joueur++) {
      jeu[joueur] = {};
      for (let i = 0; i < MANETTE.length; i++) {
        jeu[joueur][i] = { value: joueur === 0 ? CLAVIER[i] : "", value2: MANETTE[i] };
      }
      for (let i = 24; i < 30; i++) jeu[joueur][i] = { value: "" };
    }
    return jeu;
  }

  // Rôles affichés, par console. Les noms des boutons sont ceux de la console
  // d'origine ; leur correspondance exacte dépend du cœur d'émulation.
  const CROIX = [[4, "Haut"], [5, "Bas"], [6, "Gauche"], [7, "Droite"]];
  const ROLES = {
    nes: [...CROIX, [0, "B"], [8, "A"], [2, "Select"], [3, "Start"]],
    gb: [...CROIX, [0, "B"], [8, "A"], [2, "Select"], [3, "Start"]],
    snes: [...CROIX, [0, "B"], [8, "A"], [1, "Y"], [9, "X"], [10, "L"], [11, "R"],
      [2, "Select"], [3, "Start"]],
    megadrive: [...CROIX, [1, "A"], [0, "B"], [8, "C"], [9, "X"], [10, "Y"], [11, "Z"],
      [2, "Mode"], [3, "Start"]],
    n64: [...CROIX, [8, "A"], [0, "B"], [12, "Z"], [10, "L"], [11, "R"], [3, "Start"],
      [19, "Stick haut"], [18, "Stick bas"], [17, "Stick gauche"], [16, "Stick droite"],
      [23, "C haut"], [22, "C bas"], [21, "C gauche"], [20, "C droite"]],
    neogeo: [...CROIX, [0, "A"], [8, "B"], [1, "C"], [9, "D"], [2, "Select / pièce"],
      [3, "Start"]],
  };

  // Deux entrées en bas du tableau, communes aux quatre joueurs (le menu reste
  // sur Échap, Select + Start, ou la souris au bord de l'écran).
  const RACCOURCIS = [["sauver", "Sauvegarde rapide"], ["charger", "Chargement rapide"]];

  // Illustrations des manettes, dans static/img/ (le nom de fichier ne suit pas
  // l'identifiant de console : la Game Boy est illustrée par une Game Boy Advance).
  const IMAGES = {
    nes: "NES.jpg", snes: "SNES.jpg", gb: "GBA.jpg",
    megadrive: "MegaDrive.jpg", n64: "N64.jpg", neogeo: "NEOGEO.jpg",
  };

  function celluleRaccourci(cle, colonne) {
    const v = ((etat.raccourcis || {})[cle] || {})[colonne];
    const texte = v === undefined || v === "" || v === null ? "—" : String(v);
    return `<button class="cellule nav ${texte === "—" ? "vide" : ""}"
      data-raccourci="${cle}" data-colonne="${colonne}">${h(texte)}</button>`;
  }

  async function pageMappage(cid) {
    const donnees = await api("/api/consoles");
    const c = donnees.consoles.find((x) => x.id === cid);
    if (!c) throw new Error("console inconnue");
    const config = await api(`/api/config/${cid}`);
    etat.console = c;
    etat.controles = config.controls || controlesParDefaut();
    etat.manettesJoueurs = config.manettes || ["", "", "", ""];
    etat.raccourcis = config.raccourcis || {};
    etat.modifie = false;
    document.documentElement.style.setProperty("--accent", c.couleur);
    majBarre({ titre: `Manettes — ${c.nom}`, retour: true, recherche: false });
    majAide([
      "Cliquez une case puis appuyez sur la touche ou le bouton voulu",
      "<b>Suppr</b> efface l'affectation · <b>Échap</b> annule",
      "Chaque console garde son propre réglage",
    ]);
    dessinerMappage(cid, 0);
  }

  function dessinerMappage(cid, joueur, cible) {
    const zone = cible || vue;
    etat.mapJoueur = joueur;
    const q = (sel) => zone.querySelector(sel);
    const roles = ROLES[cid] || ROLES.nes;
    zone.innerHTML = `
      <div class="entete-console">
        <label class="choix-pad">Manette du joueur ${joueur + 1} :
          <select id="pad-joueur" class="nav">${optionsManettes(joueur)}</select>
        </label>
        <button class="tonal nav" id="relire-manettes">Rafraîchir les manettes</button>
        <span id="temoin" class="temoin">appuyez sur un bouton pour identifier le périphérique</span>
      </div>
      <div class="joueurs" role="tablist">
        ${[0, 1, 2, 3].map((j) => `<button class="onglet nav" role="tab" data-onglet="${j}"
          aria-selected="${j === joueur}">Joueur ${j + 1}</button>`).join("")}
      </div>
      <div class="map-colonnes">
      <div class="map-gauche">
      <div class="mappage">
        <div class="ligne-map entetes"><span>Bouton</span><span>Clavier</span><span>Manette</span></div>
        ${roles.map(([i, nom]) => `
          <div class="ligne-map">
            <span class="role">${h(nom)}</span>
            ${celluleHtml(joueur, i, "value")}
            ${celluleHtml(joueur, i, "value2")}
          </div>`).join("")}
        ${RACCOURCIS.map(([cle, nom]) => `
          <div class="ligne-map raccourci">
            <span class="role">${h(nom)}</span>
            ${celluleRaccourci(cle, "value")}
            ${celluleRaccourci(cle, "value2")}
          </div>`).join("")}
      </div>
      </div>
      ${IMAGES[cid] ? `<div class="map-droite">
        <img src="/static/img/${IMAGES[cid]}" alt="Manette ${h(etat.console ? etat.console.nom : "")}"
             onerror="this.closest('.map-droite').remove()">
      </div>` : ""}
      </div>
      <div class="entete-console" style="margin-top:16px">
        <button class="rempli nav" id="enregistrer" ${etat.modifie ? "" : "disabled"}>${
          etat.modifie ? "Enregistrer les modifications" : "Aucune modification à enregistrer"}</button>
        <button class="tonal nav" id="copier">Copier ce réglage sur les 4 joueurs</button>
        <button class="texte nav" id="defaut">Rétablir les réglages d'origine</button>
      </div>`;

    // Attribut distinct des cases du tableau : sinon un clic sur une case
    // déclencherait aussi le changement d'onglet et redessinerait tout.
    zone.querySelectorAll("[data-onglet]").forEach((el) => {
      el.addEventListener("click", () => dessinerMappage(cid, Number(el.dataset.onglet), cible));
    });
    zone.querySelectorAll(".cellule").forEach((el) => {
      el.addEventListener("click", () => ecouter(cid, el));
    });
    q("#relire-manettes").addEventListener("click", () => rafraichirManettes(false));

    q("#pad-joueur").addEventListener("change", (ev) => {
      etat.manettesJoueurs[joueur] = ev.target.value;
      marquerModifie();
    });

    q("#enregistrer").addEventListener("click", async () => {
      try {
        await api(`/api/config/${cid}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ controls: etat.controles, manettes: etat.manettesJoueurs,
            raccourcis: etat.raccourcis }),
        });
        // Relecture : on affiche ce que le serveur a réellement conservé.
        const relu = await api(`/api/config/${cid}`);
        etat.controles = relu.controls || controlesParDefaut();
        etat.manettesJoueurs = relu.manettes || ["", "", "", ""];
        etat.raccourcis = relu.raccourcis || {};
        etat.modifie = false;
        dessinerMappage(cid, joueur, cible);
        message("Réglages enregistrés");
      } catch (e) { message(`Enregistrement impossible : ${e.message}`, true); }
    });

    q("#copier").addEventListener("click", async () => {
      const oui = await confirmer({
        titre: "Copier sur les quatre joueurs ?",
        texte: "Les boutons de manette du joueur affiché sont recopiés sur les joueurs 1 à 4. "
             + "Utile quand une manette n'est pas reconnue comme joueur 1. Le clavier n'est pas touché.",
        valider: "Copier",
      });
      if (!oui) { EMU.focusPremier(zone); return; }
      for (let j = 0; j < 4; j++) {
        if (j === joueur) continue;
        for (const i in etat.controles[joueur]) {
          if (!etat.controles[j][i]) etat.controles[j][i] = {};
          etat.controles[j][i].value2 = etat.controles[joueur][i].value2;
        }
      }
      marquerModifie();
      dessinerMappage(cid, joueur, cible);
      message("Réglage copié — pensez à enregistrer");
    });

    q("#defaut").addEventListener("click", async () => {
      const oui = await confirmer({
        titre: "Rétablir les réglages d'origine ?",
        texte: `Les touches, les boutons et les options d'image de ${etat.console.nom} reviennent à leur état initial.`,
        valider: "Rétablir",
      });
      if (!oui) return;
      const remis = await api(`/api/config/${cid}`, { method: "DELETE" });
      etat.controles = controlesParDefaut();
      etat.manettesJoueurs = (remis && remis.manettes) || ["", "", "", ""];
      etat.modifie = false;
      dessinerMappage(cid, joueur, cible);
      message("Réglages d'origine rétablis");
    });
    focusPremier(zone);
  }

  // Choix du périphérique pour ce joueur : indispensable quand plusieurs
  // périphériques de jeu sont branchés (pédales, joystick, manette…), car le
  // navigateur les présente dans un ordre qui n'a rien à voir avec les joueurs.
  function optionsManettes(joueur) {
    const pads = etat.manettes;
    const choisi = etat.manettesJoueurs[joueur] || "";
    const auto = `<option value=""${choisi ? "" : " selected"}>— automatique (ordre de branchement) —</option>`
      + `<option value="none"${choisi === "none" ? " selected" : ""}>— joueur désactivé —</option>`;
    if (!pads.length) return auto + `<option disabled>aucun périphérique connu : rafraîchir</option>`;
    return auto + pads.map((p) => {
      const cle = `${p.id}_${p.index}`;
      return `<option value="${cle.replace(/"/g, "&quot;")}"${cle === choisi ? " selected" : ""}>${h(p.id)}</option>`;
    }).join("");
  }

  function celluleHtml(joueur, index, colonne) {
    const v = (etat.controles[joueur] && etat.controles[joueur][index] || {})[colonne];
    const texte = v === undefined || v === "" || v === null ? "—" : String(v);
    return `<button class="cellule nav ${texte === "—" ? "vide" : ""}"
      data-joueur="${joueur}" data-index="${index}" data-colonne="${colonne}">${h(texte)}</button>`;
  }

  function ecouter(cid, el) {
    annulerEcoute();
    el.classList.add("ecoute");
    el.textContent = el.dataset.colonne === "value" ? "appuyez sur une touche…" : "appuyez sur un bouton…";
    etat.capture = {
      cid, el,
      raccourci: el.dataset.raccourci || null,
      joueur: Number(el.dataset.joueur),
      index: Number(el.dataset.index),
      colonne: el.dataset.colonne,
      base: null,
    };
  }

  function valeurCapturee(c) {
    if (c.raccourci) return ((etat.raccourcis || {})[c.raccourci] || {})[c.colonne];
    return (etat.controles[c.joueur][c.index] || {})[c.colonne];
  }

  function annulerEcoute(remettre = true) {
    const c = etat.capture;
    etat.capture = null;
    if (c && remettre) {
      c.el.classList.remove("ecoute");
      const v = valeurCapturee(c);
      c.el.textContent = v === undefined || v === "" ? "—" : String(v);
      c.el.classList.toggle("vide", !v);
    }
  }

  function affecter(valeur) {
    const c = etat.capture;
    if (!c) return;
    if (c.raccourci) {
      if (!etat.raccourcis[c.raccourci]) etat.raccourcis[c.raccourci] = {};
      etat.raccourcis[c.raccourci][c.colonne] = valeur;
    } else {
      if (!etat.controles[c.joueur][c.index]) etat.controles[c.joueur][c.index] = {};
      etat.controles[c.joueur][c.index][c.colonne] = valeur;
    }
    annulerEcoute();
    // Le bouton est encore enfoncé : on bloque brièvement la navigation à la
    // manette, sinon Start (bouton 9 = « valider ») relancerait aussitôt la capture.
    pad.verrou = performance.now() + 500;
    pad.boutons.clear();
    marquerModifie();
  }

  function marquerModifie() {
    etat.modifie = true;
    const zone = !$("#mappage").hidden ? $("#mappage-contenu") : vue;
    const b = zone.querySelector("#enregistrer");
    if (b) { b.disabled = false; b.textContent = "Enregistrer les modifications"; }
  }

  // Mappage ouvert par-dessus une partie mise en pause. Renvoie une promesse
  // résolue à la fermeture, pour que le lecteur recharge les réglages.
  async function ouvrirMappage(cid) {
    const config = await api(`/api/config/${cid}`);
    etat.controles = config.controls || controlesParDefaut();
    etat.manettesJoueurs = config.manettes || ["", "", "", ""];
    etat.raccourcis = config.raccourcis || {};
    etat.modifie = false;
    const boite = $("#mappage");
    dessinerMappage(cid, 0, $("#mappage-contenu"));
    boite.hidden = false;
    focusPremier(boite);
    return new Promise((resoudre) => {
      const fermer = () => {
        boite.hidden = true;
        document.removeEventListener("keydown", surTouche, true);
        etat.fermerMappage = null;
        resoudre();
      };
      const surTouche = (ev) => {
        if (ev.key === "Escape" && !etat.capture) {
          ev.stopPropagation(); ev.preventDefault(); fermer();
        }
      };
      document.addEventListener("keydown", surTouche, true);
      $("#mappage-fermer").onclick = fermer;
      etat.fermerMappage = fermer;
    });
  }

  /* --------------------------------------------------------- confirmation */

  function confirmer({ titre, texte, valider }) {
    return new Promise((resoudre) => {
      const boite = $("#confirmation");
      $("#confirmation-titre").textContent = titre;
      $("#confirmation-texte").textContent = texte || "";
      $("#confirmation-oui").textContent = valider || "Confirmer";
      boite.hidden = false;
      focusPremier(boite);
      const fermer = (v) => {
        boite.hidden = true;
        document.removeEventListener("keydown", surTouche, true);
        etat.fermerConfirmation = null;
        resoudre(v);
      };
      const surTouche = (ev) => {
        if (ev.key === "Escape") { ev.stopPropagation(); ev.preventDefault(); fermer(false); }
      };
      document.addEventListener("keydown", surTouche, true);
      $("#confirmation-oui").onclick = () => fermer(true);
      $("#confirmation-non").onclick = () => fermer(false);
      boite.onclick = (ev) => { if (ev.target === boite) fermer(false); };
      etat.fermerConfirmation = () => fermer(false);
    });
  }

  /* ------------------------------------------------------------- rendu vues */

  function majBarre({ titre, retour, recherche }) {
    $("#titre-barre").textContent = titre;
    $("#retour").hidden = !retour;
    $("#recherche").hidden = !recherche;
    if (!recherche) $("#recherche").value = "";
  }

  function majAide(parties) {
    $("#aide").innerHTML = parties.map((p) => `<span>${p}</span>`).join("");
  }

  async function pageAccueil() {
    document.documentElement.style.setProperty("--accent", "#d0bcff");
    majBarre({ titre: "Consoles", retour: false, recherche: false });
    majAide([
      "<b>Flèches</b> ou <b>croix de la manette</b> pour se déplacer",
      "<b>Entrée</b> ou <b>A</b> pour ouvrir",
      "<b>Échap</b> ou <b>B</b> pour revenir",
    ]);
    vue.innerHTML = `<p class="secondaire">Lecture de la bibliothèque…</p>`;

    const donnees = await api("/api/consoles");
    etat.consoles = donnees.consoles;

    const sansJeu = etat.consoles.every((c) => c.jeux === 0);
    vue.innerHTML = `
      <div class="entete-console">
        <p class="secondaire">${donnees.racine}</p>
      </div>
      <div class="consoles">
        ${etat.consoles.map((c) => `
          <button class="carte-console nav" data-console="${c.id}" data-vide="${c.jeux ? 0 : 1}">
            ${art(c.id, c.couleur)}
            <span class="legende">
              <h2>${h(c.nom)}</h2>
              <p class="secondaire">${c.jeux ? `${c.jeux} jeu${c.jeux > 1 ? "x" : ""}` : "aucun jeu trouvé"}
                 · ${c.dossier ? h(c.dossier) : "dossier non trouvé"}</p>
            </span>
          </button>`).join("")}
      </div>
      ${sansJeu ? `<p class="vide" style="margin-top:24px">Aucune ROM trouvée dans
        <code>${h(donnees.racine)}</code>. Vérifiez les dossiers avec
        <code>python app.py --info</code>.</p>` : ""}`;

    vue.querySelectorAll("[data-console]").forEach((el) => {
      el.addEventListener("click", () => { location.hash = `#/c/${el.dataset.console}`; });
    });
    focusPremier();
  }

  async function pageConsole(cid) {
    const donnees = await api(`/api/consoles/${cid}/jeux`);
    etat.console = donnees.console;
    etat.jeux = donnees.jeux;
    document.documentElement.style.setProperty("--accent", donnees.console.couleur);
    majBarre({ titre: donnees.console.nom, retour: true, recherche: true });
    majAide([
      "<b>Entrée</b> ou <b>A</b> : choisir un emplacement puis jouer",
      "<b>Échap</b> ou <b>B</b> : retour aux consoles",
      "Taper directement pour chercher",
    ]);
    dessinerJeux();
    focusPremier();
  }

  function dessinerJeux() {
    const f = etat.filtre.trim().toLowerCase();
    const liste = f ? etat.jeux.filter((j) => j.titre.toLowerCase().includes(f)) : etat.jeux;
    const mes = liste.filter((j) => j.sauvegardes);
    const autres = liste.filter((j) => !j.sauvegardes);
    const c = etat.console;

    vue.innerHTML = `
      <div class="entete-console">
        <button class="tonal nav" id="vers-mappage">Manettes et touches</button>
        <label class="choix-pad">Cœur :
          <select id="choix-coeur" class="nav">${optionsCoeurs(c)}</select>
        </label>
        <p class="secondaire">${etat.jeux.length} jeu${etat.jeux.length > 1 ? "x" : ""} · ${h(c.dossier || "?")}</p>
      </div>
      ${!liste.length ? `<p class="vide">${etat.jeux.length
          ? "Aucun jeu ne correspond à cette recherche."
          : `Aucune ROM dans le dossier <code>${h(c.dossier || "?")}</code>.`}</p>` : ""}
      ${mes.length ? `<h3 class="titre-section">Mes jeux</h3>
        <div class="jeux">${mes.map(carteJeu).join("")}</div>` : ""}
      ${autres.length ? `<h3 class="titre-section">Autres jeux</h3>
        <div class="liste-compacte">${autres.map((j) => `
          <button class="ligne-jeu nav" data-jeu="${j.id}">${h(j.titre)}</button>`).join("")}</div>` : ""}`;

    vue.querySelectorAll("[data-jeu]").forEach((el) => {
      el.addEventListener("click", () => demarrer(c.id, el.dataset.jeu));
    });
    $("#vers-mappage").addEventListener("click", () => { location.hash = `#/m/${c.id}`; });
    $("#choix-coeur").addEventListener("change", async (ev) => {
      try {
        await api(`/api/config/${c.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ core: ev.target.value }),
        });
        c.core = ev.target.value || c.core_origine;
        message(`Cœur ${c.core} : appliqué au prochain lancement`);
      } catch (e) { message(`Choix du cœur non enregistré : ${e.message}`, true); }
    });
  }

  // Les jeux déjà sauvegardés méritent leur vignette ; les autres tiennent en
  // une ligne, pour que la bibliothèque reste lisible même à plusieurs centaines.
  function carteJeu(j) {
    return `<button class="carte-jeu nav" data-jeu="${j.id}">
      <span class="miniature" ${j.vignette ? `style="background-image:url('${j.vignette}')"` : ""}>
        ${j.vignette ? "" : h(j.titre.slice(0, 1).toUpperCase())}
      </span>
      <span class="nom">${h(j.titre)}
        <span class="marque">${SVG_DISQUETTE}${j.sauvegardes} sauvegarde${j.sauvegardes > 1 ? "s" : ""}</span>
      </span>
    </button>`;
  }

  function optionsCoeurs(c) {
    const origine = c.core_origine || c.core;
    const liste = (c.coeurs && c.coeurs.length) ? c.coeurs : [origine];
    const choisi = c.core === origine ? "" : c.core;
    return `<option value=""${choisi ? "" : " selected"}>${h(origine)} (d'origine)</option>`
      + liste.filter((n) => n !== origine)
             .map((n) => `<option value="${h(n)}"${n === choisi ? " selected" : ""}>${h(n)}</option>`).join("");
  }

  /* -------------------------------------------- choix d'un emplacement */

  function ouvrirSlots({ titre, aide, slots, autoriserVide, effacable, coeur, bloquer }) {
    return new Promise((resoudre) => {
      const boite = $("#dialogue");
      $("#dialogue-titre").textContent = titre;
      $("#dialogue-aide").textContent = aide || "";
      dessinerSlots(slots, { autoriserVide, effacable, coeur, bloquer }, choisir, effacer);
      boite.hidden = false;
      focusPremier(boite);

      function fermer(valeur) {
        boite.hidden = true;
        document.removeEventListener("keydown", surEchap, true);
        resoudre(valeur);
      }
      function choisir(n) { fermer(n); }
      async function effacer(n) {
        try {
          const r = await api(`/api/etat/${slots.cid}/${slots.jid}/${n}`, { method: "DELETE" });
          slots.liste = r.slots;
          dessinerSlots(slots, { autoriserVide, effacable, coeur, bloquer }, choisir, effacer);
          focusPremier(boite);
          message(`Emplacement ${n} effacé`);
        } catch (e) { message(`Effacement impossible : ${e.message}`, true); }
      }
      function surEchap(ev) {
        if (ev.key === "Escape") { ev.stopPropagation(); ev.preventDefault(); fermer(null); }
      }
      document.addEventListener("keydown", surEchap, true);
      $("#dialogue-annuler").onclick = () => fermer(null);
      boite.onclick = (ev) => { if (ev.target === boite) fermer(null); };
      etat.fermerDialogue = () => fermer(null);
    });
  }

  function dessinerSlots(slots, options, choisir, effacer) {
    const { autoriserVide, effacable, coeur, bloquer } = options;
    const conteneur = $("#slots");
    conteneur.innerHTML = slots.liste.map((s) => {
      // Un état n'est relisible que par le cœur qui l'a écrit.
      // Un état n'est relisible que par le cœur qui l'a écrit. Au lancement d'un
      // jeu, on bascule sur ce cœur (cf. demarrer) ; en cours de partie, le cœur
      // est déjà compilé et ne peut plus changer : l'emplacement est alors refusé.
      const incompatible = !s.vide && coeur && s.core && s.core !== coeur;
      const actif = (autoriserVide || !s.vide) && !(incompatible && bloquer);
      const etat = s.vide ? "libre"
        : `${formatDate(s.date)}${s.core ? ` · ${s.core}` : " · cœur inconnu"}`;
      return `<button class="slot nav ${incompatible ? "incompatible" : ""}" data-slot="${s.slot}"
          ${actif ? "" : "disabled"}>
        <span class="apercu" ${s.image ? `style="background-image:url('${s.image}')"` : ""}>
          ${s.image ? "" : (s.vide ? "emplacement libre" : "sans aperçu")}
        </span>
        <span class="infos">
          <strong>Emplacement ${s.slot}</strong>
          <p class="secondaire">${etat}</p>
          ${incompatible ? (bloquer
              ? `<p class="alerte">illisible avec le cœur ${h(coeur)}</p>`
              : `<p class="avis">lancera le cœur ${h(s.core)}</p>`) : ""}
        </span>
        ${!s.vide && effacable ? `<span class="slot-effacer" data-effacer="${s.slot}"
            role="button" tabindex="-1" title="Effacer">${SVG_POUBELLE}</span>` : ""}
      </button>`;
    }).join("");

    conteneur.querySelectorAll("[data-slot]").forEach((el) => {
      el.addEventListener("click", (ev) => {
        const eff = ev.target.closest("[data-effacer]");
        if (eff) { ev.stopPropagation(); effacer(Number(eff.dataset.effacer)); return; }
        choisir(Number(el.dataset.slot));
      });
    });
  }

  /* ------------------------------------------------------- lancement d'un jeu */

  // Le nom de cœur d'une sauvegarde ne doit pouvoir désigner que l'un des cœurs
  // déclarés pour la console : il finit dans le chargeur d'EmulatorJS.
  function coeurAutorise(console, nom) {
    if (!nom) return null;
    const connus = [console.core_origine || console.core, ...(console.coeurs || [])];
    return connus.includes(nom) ? nom : null;
  }

  async function demarrer(cid, jid) {
    let donnees;
    try { donnees = await api(`/api/jeux/${cid}/${jid}`); }
    catch (e) { message(`Lecture impossible : ${e.message}`, true); return; }

    const slots = { cid, jid, liste: donnees.slots };
    const occupes = donnees.slots.filter((s) => !s.vide).length;
    const slot = await ouvrirSlots({
      titre: donnees.jeu.titre,
      aide: occupes
        ? `Cœur ${donnees.console.core}. Choisissez une sauvegarde à charger, ou un emplacement libre `
          + "pour commencer une partie."
        : "Aucune sauvegarde : choisissez l'emplacement où la partie sera sauvegardée.",
      slots, autoriserVide: true, effacable: true,
      coeur: donnees.console.core,
    });
    if (slot === null) return;
    const choisi = donnees.slots.find((s) => s.slot === slot);
    // Sauvegarde faite avec un autre cœur : on lance ce cœur-là pour cette partie,
    // sans modifier le réglage de la console.
    const autre = coeurAutorise(donnees.console, choisi.core);
    const coeur = (autre && autre !== donnees.console.core) ? autre : null;
    if (coeur) message(`Emplacement ${slot} : lancement avec le cœur ${coeur}`);
    PLAYER.lancer({ donnees, slot, charger: !choisi.vide, coeur });
  }

  /* ------------------------------------------- navigation clavier / manette */

  function elementsNav(racine) {
    const base = racine
      || (!$("#mappage").hidden ? $("#mappage")
      : (!$("#confirmation").hidden ? $("#confirmation")
      : (!$("#triche").hidden ? $("#triche")
      : (!$("#dialogue").hidden ? $("#dialogue")
      : (!$("#surimpression").hidden ? $("#surimpression") : document)))));
    return [...base.querySelectorAll(".nav")].filter((el) =>
      !el.hidden && !el.disabled && el.offsetParent !== null);
  }

  function focusPremier(racine) {
    const items = elementsNav(racine);
    if (items.length) items[0].focus({ preventScroll: true });
  }

  function deplacer(dx, dy) {
    const items = elementsNav();
    if (!items.length) return;
    const courant = document.activeElement;
    if (!items.includes(courant)) { items[0].focus(); return; }
    const r = courant.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let meilleur = null, meilleureDistance = Infinity;
    for (const el of items) {
      if (el === courant) continue;
      const b = el.getBoundingClientRect();
      const ox = b.left + b.width / 2 - cx, oy = b.top + b.height / 2 - cy;
      const principal = dx ? ox * dx : oy * dy;
      if (principal <= 4) continue;
      const travers = dx ? Math.abs(oy) : Math.abs(ox);
      const d = principal + travers * 2.5;
      if (d < meilleureDistance) { meilleureDistance = d; meilleur = el; }
    }
    if (meilleur) {
      meilleur.focus({ preventScroll: true });
      meilleur.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function retourArriere() {
    if (!$("#mappage").hidden) { etat.fermerMappage?.(); return; }
    if (!$("#confirmation").hidden) { etat.fermerConfirmation?.(); return; }
    if (!$("#triche").hidden) { etat.fermerTriche?.(); return; }
    if (!$("#dialogue").hidden) { etat.fermerDialogue?.(); return; }
    if (etat.enJeu) { PLAYER.basculerMenu(); return; }
    const mm = (location.hash || "").match(/^#\/m\/([a-z0-9]+)$/);
    if (mm) { location.hash = `#/c/${mm[1]}`; return; }
    if (location.hash && location.hash !== "#/") location.hash = "#/";
  }

  document.addEventListener("keydown", (ev) => {
    // Page de mappage : la frappe sert à affecter une touche, pas à naviguer.
    if (etat.capture) {
      ev.preventDefault(); ev.stopPropagation();
      if (ev.key === "Escape") { annulerEcoute(); return; }
      if (etat.capture.colonne !== "value") return;
      if (ev.key === "Delete") { affecter(""); return; }
      const nom = TOUCHES[ev.keyCode];
      if (nom !== undefined) affecter(nom);
      return;
    }
    // Saisie d'un code de triche : les touches vont au champ. Haut et bas
    // passent d'un élément à l'autre, Échap ferme la fenêtre (player.js).
    if (ev.target.matches && ev.target.matches("#triche input")) {
      if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
        ev.preventDefault(); deplacer(0, ev.key === "ArrowUp" ? -1 : 1);
      }
      return;
    }
    if (ev.target === $("#recherche")) {
      if (ev.key === "Escape") { $("#recherche").value = ""; etat.filtre = ""; dessinerJeux(); focusPremier(); }
      if (ev.key === "Enter" || ev.key === "ArrowDown") { ev.preventDefault(); focusPremier(vue); }
      return;
    }
    // Pendant une partie, le clavier appartient au jeu : la navigation ne reprend
    // que si la surimpression est ouverte avec mise en pause.
    if (etat.enJeu && $("#mappage").hidden && $("#surimpression").hidden) return;

    switch (ev.key) {
      case "ArrowLeft": ev.preventDefault(); deplacer(-1, 0); break;
      case "ArrowRight": ev.preventDefault(); deplacer(1, 0); break;
      case "ArrowUp": ev.preventDefault(); deplacer(0, -1); break;
      case "ArrowDown": ev.preventDefault(); deplacer(0, 1); break;
      case "Escape": ev.preventDefault(); retourArriere(); break;
      case "Backspace": ev.preventDefault(); retourArriere(); break;
      default:
        // frappe directe = recherche, sur la page d'une console
        if (!etat.enJeu && !$("#recherche").hidden && ev.key.length === 1 && !ev.ctrlKey && !ev.altKey) {
          $("#recherche").focus();
        }
    }
  });

  $("#retour").addEventListener("click", retourArriere);
  $("#recherche").addEventListener("input", (ev) => { etat.filtre = ev.target.value; dessinerJeux(); });

  /* --------------------------------------------------------------- manettes */

  const pad = {
    dernierMouvement: 0, repete: false, repetitions: 0, verrou: 0,
    boutons: new Set(), repos: new Map(), anim: null,
  };
  const ZONE_MORTE = 0.6;

  // Les manettes ne sont PLUS scrutées en permanence : la liste n'est établie
  // qu'à la demande (bouton de rafraîchissement), au chargement de la page, et
  // sur les événements du navigateur. Tant qu'aucune manette n'est connue, la
  // boucle de lecture ne tourne pas du tout.
  function rafraichirManettes(silencieux) {
    const pads = [...navigator.getGamepads()].filter(Boolean);
    etat.manettes = pads.map((p) => ({ index: p.index, id: p.id }));
    pad.repos.clear();
    majPastille();
    if (!etat.manettes.length && etat.surPad) etat.surPad([]);   // relâcher les entrées
    demarrerBoucle();
    if (!silencieux) {
      message(etat.manettes.length
        ? `${etat.manettes.length} manette${etat.manettes.length > 1 ? "s" : ""} détectée${etat.manettes.length > 1 ? "s" : ""}`
        : "Aucune manette détectée — appuyez sur un bouton puis réessayez");
    }
    if (!$("#mappage").hidden || (location.hash || "").startsWith("#/m/")) {
      dessinerMappage(etat.console.id, etat.mapJoueur || 0,
        !$("#mappage").hidden ? $("#mappage-contenu") : vue);
    }
  }

  // État courant des seules manettes connues (le navigateur renvoie un instantané
  // à chaque appel : c'est la lecture, pas la détection).
  function padsConnus() {
    const tous = navigator.getGamepads();
    return etat.manettes.map((m) => tous[m.index]).filter(Boolean);
  }

  function majPastille() {
    const n = etat.manettes.length;
    $("#manettes").textContent = n ? `⟳ ${n} manette${n > 1 ? "s" : ""}` : "⟳ manettes";
    $("#manettes").title = etat.manettes.map((m) => m.id).join("\n")
      || "aucune manette connue — cliquer pour chercher";
  }

  // Branchement et débranchement sont des événements, pas de la scrutation :
  // on en profite pour tenir la liste à jour sans rien coûter.
  window.addEventListener("gamepadconnected", () => { rafraichirManettes(true); message("Manette connectée"); });
  window.addEventListener("gamepaddisconnected", () => rafraichirManettes(true));

  // Beaucoup de manettes ne renvoient pas exactement 0 au repos, et certains
  // adaptateurs déclarent une croix sur les axes. On mémorise la position de
  // repos à la première lecture et on ne compte que l'écart par rapport à elle.
  function axes(p) {
    let repos = pad.repos.get(p.index);
    if (!repos) { repos = [p.axes[0] || 0, p.axes[1] || 0]; pad.repos.set(p.index, repos); }
    return [(p.axes[0] || 0) - repos[0], (p.axes[1] || 0) - repos[1]];
  }

  function demarrerBoucle() {
    if (pad.anim || !etat.manettes.length) return;
    pad.anim = requestAnimationFrame(boucle);
  }

  function boucle() {
    pad.anim = null;
    try { tourDeBoucle(); } catch (e) { console.warn("boucle manette", e); }
    if (etat.manettes.length) pad.anim = requestAnimationFrame(boucle);
  }

  function tourDeBoucle() {
    const pads = padsConnus();
    if (etat.surPad) etat.surPad(pads);
    if (!pads.length) return;
    if (!$("#mappage").hidden || (location.hash || "").startsWith("#/m/")) temoinManette(pads);
    if (etat.capture) { capturerPad(pads); return; }
    const menuVisible = !etat.enJeu || !$("#mappage").hidden || !$("#confirmation").hidden
      || !$("#dialogue").hidden || !$("#surimpression").hidden;
    if (menuVisible) naviguerAvecPad(pads);
  }

  function naviguerAvecPad(pads) {
    const maintenant = performance.now();
    let dx = 0, dy = 0, valider = false, retour = false;
    for (const p of pads) {
      const [ax, ay] = axes(p);
      if (p.buttons[14]?.pressed || ax < -ZONE_MORTE) dx = -1;
      if (p.buttons[15]?.pressed || ax > ZONE_MORTE) dx = 1;
      if (p.buttons[12]?.pressed || ay < -ZONE_MORTE) dy = -1;
      if (p.buttons[13]?.pressed || ay > ZONE_MORTE) dy = 1;
      if (p.buttons[0]?.pressed || p.buttons[9]?.pressed) valider = true;
      if (p.buttons[1]?.pressed) retour = true;
    }
    if (pad.verrou && performance.now() < pad.verrou) return;   // sortie de capture
    if (dx || dy) {
      // Garde-fou : une direction maintenue plus de 25 crans est tenue pour
      // bloquée (stick usé, adaptateur bavard) et ignorée jusqu'au retour au repos.
      if (pad.repetitions > 25) return;
      if (maintenant - pad.dernierMouvement > (pad.repete ? 140 : 340)) {
        pad.dernierMouvement = maintenant; pad.repete = true; pad.repetitions++;
        deplacer(dx, dy);
      }
    } else { pad.repete = false; pad.dernierMouvement = 0; pad.repetitions = 0; }

    appuiUnique("valider", valider, () => {
      const el = document.activeElement;
      if (el && el.classList.contains("nav")) el.click(); else focusPremier();
    });
    appuiUnique("retour", retour, retourArriere);
  }

  // Lecture d'un bouton ou d'une direction de manette pour la page de mappage.
  function capturerPad(pads) {
    const c = etat.capture;
    if (c.colonne !== "value2") return;
    if (!c.base) {
      c.base = pads.map((p) => ({
        index: p.index,
        boutons: p.buttons.map(appuye),
        axes: p.axes.map((a) => a),
      }));
      return;
    }
    for (const p of pads) {
      const ref = c.base.find((r) => r.index === p.index);
      if (!ref) continue;
      for (let i = 0; i < p.buttons.length; i++) {
        // Certaines manettes HID ne lèvent pas « pressed » : on lit aussi la valeur.
        if (appuye(p.buttons[i]) && !ref.boutons[i]) {
          affecter(BOUTONS_PAD[i] !== undefined ? BOUTONS_PAD[i] : `GAMEPAD_${i}`);
          return;
        }
      }
      for (let i = 0; i < p.axes.length; i++) {
        const ecart = p.axes[i] - (ref.axes[i] || 0);
        if (Math.abs(ecart) > ZONE_MORTE) {
          const nom = AXES_PAD[i] !== undefined ? AXES_PAD[i] : `EXTRA_STICK_${i}`;
          affecter(`${nom}:${ecart > 0 ? "+1" : "-1"}`);
          return;
        }
      }
    }
  }

  const appuye = (b) => (typeof b === "object" ? (b.pressed || b.value > 0.5) : b > 0.5);

  // Identification : le témoin s'allume quand le périphérique choisi pour le
  // joueur affiché envoie quelque chose. Indispensable quand deux manettes
  // portent le même nom.
  function temoinManette(pads) {
    const temoin = (!$("#mappage").hidden ? $("#mappage") : vue).querySelector("#temoin");
    if (!temoin) return;
    const choix = (etat.manettesJoueurs || [])[etat.mapJoueur] || "";
    let pad = null;
    if (choix === "none") pad = null;
    else if (choix) pad = pads.find((p) => `${p.id}_${p.index}` === choix) || null;
    else pad = pads[etat.mapJoueur] || null;

    let actif = false;
    if (pad) {
      actif = pad.buttons.some(appuye);
      if (!actif) {
        const [ax, ay] = axes(pad);
        actif = Math.abs(ax) > ZONE_MORTE || Math.abs(ay) > ZONE_MORTE;
      }
    }
    temoin.classList.toggle("allume", actif);
    temoin.textContent = !pad ? (choix === "none" ? "joueur désactivé" : "aucun périphérique pour ce joueur")
      : (actif ? "périphérique actif — c'est celui-là" : "appuyez sur un bouton pour identifier le périphérique");
  }

  function appuiUnique(nom, actif, action) {
    if (actif && !pad.boutons.has(nom)) { pad.boutons.add(nom); action(); }
    if (!actif) pad.boutons.delete(nom);
  }

  /* ------------------------------------------------------------- routage */

  async function router() {
    if (etat.enJeu) return;                    // le lecteur gère sa propre sortie
    const h = location.hash || "#/";
    try {
      const mc = h.match(/^#\/c\/([a-z0-9]+)$/);
      const mm = h.match(/^#\/m\/([a-z0-9]+)$/);
      if (mm) await pageMappage(mm[1]);
      else if (mc) await pageConsole(mc[1]);
      else await pageAccueil();
    } catch (e) {
      vue.innerHTML = `<p class="vide">Erreur : ${e.message}</p>`;
      message(e.message, true);
    }
  }

  // Relance d'une partie après un changement de cœur : la page a dû être
  // rechargée, mais l'utilisateur ne doit pas repasser par le menu.
  async function reprendrePartie() {
    let memo = null;
    try {
      memo = JSON.parse(sessionStorage.getItem("emu-relance") || "null");
      sessionStorage.removeItem("emu-relance");
    } catch (e) { return false; }
    if (!memo || !memo.cid || !memo.jid) return false;
    try {
      const donnees = await api(`/api/jeux/${memo.cid}/${memo.jid}`);
      PLAYER.lancer({
        donnees, slot: memo.slot || 1, charger: !!memo.charger,
        coeur: coeurAutorise(donnees.console, memo.coeur),
      });
      return true;
    } catch (e) {
      message(`Relance impossible : ${e.message}`, true);
      return false;
    }
  }

  window.addEventListener("hashchange", router);
  $("#manettes").addEventListener("click", () => rafraichirManettes(false));

  window.addEventListener("load", async () => {
    rafraichirManettes(true);
    if (!(await reprendrePartie())) router();
  });

  return { api, message, etat, ouvrirSlots, focusPremier, formatDate, router,
    majAide, majBarre, confirmer, controlesParDefaut, ouvrirMappage, coeurAutorise,
    nomTouche: (code) => TOUCHES[code] };
})();
