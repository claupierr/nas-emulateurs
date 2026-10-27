/* ------------------------------------------------------------------------- *
 * Site émulateur du serveur « nas » — lecteur de jeu (EmulatorJS).
 * /srv/data/server/emulateurs/web/static/js/player.js
 *
 * Une partie par chargement de page : quitter un jeu recharge la page sur le
 * menu de la console. C'est le moyen le plus sûr de libérer le cœur d'émulation.
 * ------------------------------------------------------------------------- */

const PLAYER = (() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const partie = {
    cid: null, jid: null, titre: "", slot: 1,
    demarre: false, menuOuvert: false,
    reglages: null, raccourcis: {}, controles: null, manettesJoueurs: [], core: "",
    sourisX: null, sourisY: null, course: 0,  // déplacement cumulé de la souris
    curseur: null, fondu: null,               // minuteries du curseur et du fondu
    boutons: new Set(),   // fronts montants des raccourcis manette
    envoye: {},           // dernière valeur transmise au cœur, par joueur et bouton
    repos: {},            // position de repos des axes, par manette
    surveillance: null,   // surveillance du démarrage du cœur
    etatPromis: null,     // état téléchargé pendant que le cœur se charge
    filet: null, volumeAvant: null,   // voile de restauration
    codes: [],            // codes de triche du jeu : { nom, code, actif }
    sortieVoulue: false,  // sortie du plein écran demandée par nos soins
  };

  /* ------------------------------------------------------------ lancement */

  async function lancer({ donnees, slot, charger, coeur }) {
    const c = donnees.console, jeu = donnees.jeu;
    // « coeur » : cœur imposé pour cette partie seulement (sauvegarde enregistrée
    // avec un autre cœur). Le réglage de la console n'est pas modifié.
    const core = EMU.coeurAutorise(c, coeur) || c.core;
    // Plein écran demandé tout de suite, avant toute attente : le navigateur
    // ne l'accorde que dans les secondes qui suivent un geste de l'utilisateur
    // (ici, le choix de l'emplacement). Refus silencieux sinon : relance après
    // un changement de cœur, ou validation à la manette, qui ne compte pas
    // comme un geste.
    entrerPleinEcran();
    partie.cid = c.id; partie.jid = jeu.id; partie.titre = jeu.titre; partie.slot = slot;
    partie.reglages = donnees.reglages;
    partie.core = core;
    partie.codes = Array.isArray(donnees.codes) ? donnees.codes : [];
    EMU.etat.enJeu = true;

    document.documentElement.style.setProperty("--accent", c.couleur);
    $("#appli").hidden = true;
    $("#scene").hidden = false;
    $("#chargement").hidden = false;
    $("#chargement-texte").textContent =
      `Préparation de ${c.nom} — cœur ${core} (téléchargé au premier lancement)`;
    $("#chargement-detail").textContent = "";
    $("#sur-console").textContent = c.nom;
    $("#sur-titre").textContent = jeu.titre;
    majSlot();
    majBoutonCodes();
    $("#sur-aide").innerHTML = texteAide();

    const config = donnees.config || {};
    const base = (donnees.reglages.emulatorjs || "https://cdn.emulatorjs.org/stable/data/")
      .replace(/\/?$/, "/");

    window.EJS_player = "#game";
    window.EJS_core = core;
    window.EJS_controlScheme = c.scheme;
    window.EJS_pathtodata = base;
    // L'URL se termine par le vrai nom de fichier : les cœurs arcade identifient
    // le jeu par ce nom, et EmulatorJS écrit le fichier sous le dernier segment.
    const nomRom = (jeu.fichier || "").split("/").pop() || "game";
    window.EJS_gameUrl = `/api/rom/${c.id}/${jeu.id}/${encodeURIComponent(nomRom)}`;
    window.EJS_gameName = jeu.titre;
    window.EJS_gameID = parseInt(jeu.id.slice(0, 8), 16) % 1000000000;
    window.EJS_color = c.couleur;
    window.EJS_startOnLoaded = true;
    // Mode diagnostic : ajouter « ?debug » à l'adresse de la page recopie les
    // messages du cœur d'émulation dans la console du navigateur. Indispensable
    // pour les cœurs arcade, qui n'affichent à l'écran qu'un message générique.
    window.EJS_DEBUG_XX = location.search.includes("debug");
    window.EJS_noAutoFocus = false;
    window.EJS_backgroundColor = "#000";
    window.EJS_disableLocalStorage = true;          // les réglages viennent du serveur
    window.EJS_volume = typeof config.volume === "number" ? config.volume : 0.5;
    partie.controles = config.controls || EMU.controlesParDefaut();
    partie.manettesJoueurs = config.manettes || ["", "", "", ""];
    partie.raccourcis = config.raccourcis || {};
    // EmulatorJS lit les axes sans tenir compte de leur position de repos, ce qui
    // bloque une direction sur les manettes HID. On ne lui laisse que le clavier
    // (value2 vidé) : les manettes passent par le pont plus bas, qui les calibre.
    const clavierSeul = JSON.parse(JSON.stringify(partie.controles));
    for (const j in clavierSeul) {
      for (const i in clavierSeul[j]) clavierSeul[j][i].value2 = "";
    }
    window.EJS_defaultControls = clavierSeul;
    // « menu-bar-button » est le bouton à trois barres d'EmulatorJS, en haut à
    // droite : il ouvre SA barre d'outils, que nous gardons cachée hors du menu.
    // On le masque donc, et le bouton #btn-menu-tactile ouvre la surimpression.
    window.EJS_defaultOptions = { ...(config.options || {}), "menu-bar-button": "hidden" };
    // Fichier système : EmulatorJS décompresse le BIOS par défaut, ce qui détruit
    // l'archive que les cœurs arcade exigent (FBNeo veut « neogeo.zip » entier).
    // On lui interdit de l'extraire, et comme il écrit alors le fichier sous le
    // chemin de l'URL, celle-ci se réduit au nom du fichier, servi à la racine.
    if (c.bios) {
      window.EJS_biosUrl = c.bios;
      window.EJS_dontExtractBIOS = true;
    }

    // La barre d'outils d'EmulatorJS est masquée : tout passe par la surimpression.
    // Noms des boutons tels que les attend EmulatorJS 4.2.3 : « play » et
    // « pause » (et non « playPause »), « contextMenu » pour le bouton à trois
    // barres près de la roue crantée. Seuls le volume, les réglages et le plein
    // écran restent : tout le reste passe par la surimpression.
    window.EJS_Buttons = {
      play: false, pause: false, restart: false, mute: true, unmute: true, volume: true,
      settings: true, enterFullscreen: true, exitFullscreen: true,
      saveState: false, loadState: false, saveSavFiles: false, loadSavFiles: false,
      quickSave: false, quickLoad: false, screenshot: false, screenRecord: false,
      gamepad: false, cheat: false, cacheManager: false, netplay: false,
      contextMenu: false, diskButton: false, exitEmulation: false,
    };

    // Les contrôles sont appliqués par EJS_defaultControls AVANT le démarrage :
    // EmulatorJS convertit alors les noms de touches en codes. Les réécrire après
    // coup (dans EJS_ready) remettrait des chaînes et le clavier ne répondrait plus.
    window.EJS_onGameStart = () => {
      partie.demarre = true;
      clearInterval(partie.surveillance);
      $("#chargement").hidden = true;
      $("#btn-menu-tactile").hidden = false;   // affiché sur écran tactile seulement (CSS)
      // Chaque étape est isolée : une erreur ici ne doit pas empêcher le
      // chargement de l'état, qui vient juste après.
      try {
        montrerCurseur();
        relacherTout();                    // aucune entrée maintenue au départ
        reprendrePleinEcran();
        majLissage();
        masquerBoutonsBarre();
        setTimeout(masquerBoutonsBarre, 1500);   // barre complétée après coup
      } catch (e) { console.warn("préparation du jeu", e); }
      // Codes de triche activés lors d'une partie précédente. EmulatorJS vient
      // de vider la liste du cœur (updateCheatUI) juste avant cet événement.
      if (partie.codes.some((c) => c.actif)) {
        appliquerCodes();
        const n = partie.codes.filter((c) => c.actif).length;
        EMU.message(`${n} code${n > 1 ? "s" : ""} de triche actif${n > 1 ? "s" : ""}`);
      }
      // L'état est chargé APRÈS le démarrage, et non pendant (EJS_loadStateURL) :
      // un état refusé par le cœur bloquait sinon le lancement, sans message.
      // Le voile est reposé ici : le filet de sécurité repart du démarrage réel,
      // et le son peut enfin être coupé (l'émulateur n'existait pas avant).
      if (charger) { voile(true); chargerAuDemarrage(slot); }
      else EMU.message("Bonne partie");
    };

    // L'état est demandé AU PLUS TÔT, en parallèle du téléchargement du cœur :
    // il est ainsi prêt à l'instant du démarrage, sans latence réseau visible.
    partie.etatPromis = charger ? lireEtat(slot) : null;
    if (charger) voile(true);

    surveillerDemarrage();

    const script = document.createElement("script");
    script.src = base + "loader.js";
    script.onerror = () => {
      clearInterval(partie.surveillance);
      $("#chargement-texte").textContent =
        `EmulatorJS n'a pas pu être chargé depuis ${base}. Vérifiez l'accès au réseau depuis ce poste.`;
      $("#chargement-detail").textContent = "";
    };
    document.body.appendChild(script);

    EMU.etat.surPad = surPad;
  }

  // Au lancement, l'état est appliqué puis RÉAPPLIQUÉ une seconde après : dans la
  // première seconde, le cœur termine son initialisation et peut écraser l'état
  // tout juste chargé — le jeu repart alors du début sans la moindre erreur.
  // Réappliquer le même état est sans effet visible si le premier essai a réussi.
  async function chargerAuDemarrage(slot) {
    const donnees = await (partie.etatPromis || lireEtat(slot));
    partie.etatPromis = null;
    if (!donnees) {
      voile(false);
      EMU.message(`L'emplacement ${slot} n'a pas pu être lu : la partie commence au début.`, true);
      return;
    }
    partie.slot = slot; majSlot();
    appliquerEtat(donnees, "1er essai");
    // Deuxième application : dans la première seconde, le cœur termine son
    // initialisation et peut écraser l'état tout juste chargé. Les deux sauts se
    // font derrière le voile, donc sans rien montrer à l'écran.
    setTimeout(() => {
      appliquerEtat(donnees, "2e essai");
      setTimeout(() => voile(false), 150);
    }, 900);
    EMU.message(`Emplacement ${slot} chargé`);
  }

  // Voile noir et son coupé pendant la restauration. Le filet de sécurité est
  // essentiel : quoi qu'il advienne, l'image revient au bout de 4 s.
  function voile(actif) {
    const el = $("#voile");
    if (!el) return;
    clearTimeout(partie.filet);
    el.hidden = !actif;
    try {
      const e = emu();
      if (actif) {
        partie.volumeAvant = (typeof e.volume === "number") ? e.volume : null;
        if (typeof e.setVolume === "function") e.setVolume(0);
      } else if (typeof e.setVolume === "function" && partie.volumeAvant !== null) {
        e.setVolume(partie.volumeAvant);
        partie.volumeAvant = null;
      }
    } catch (err) { /* émulateur pas encore prêt */ }
    if (actif) partie.filet = setTimeout(() => voile(false), 4000);
  }

  async function lireEtat(slot) {
    try {
      const r = await fetch(`/api/etat/${partie.cid}/${partie.jid}/${slot}`);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return new Uint8Array(await r.arrayBuffer());
    } catch (e) {
      console.warn("lecture de l'état", e);
      return null;
    }
  }

  function appliquerEtat(donnees, quand) {
    const gm = gestionnaire();
    if (!gm) return;
    try {
      if (emu().paused) reprendre();
      gm.loadState(donnees);
      relacherTout();
      console.log(`état appliqué (${quand}, ${donnees.length} octets)`);
    } catch (e) {
      console.warn(`état refusé (${quand})`, e);
    }
  }

  // EmulatorJS affiche sa progression et ses erreurs dans son propre élément de
  // texte, que mon bandeau recouvrait : on l'y recopie, sinon rien n'indique ce
  // qui bloque. Les commandes de secours restent accessibles à tout moment.
  function surveillerDemarrage() {
    const depart = Date.now();
    clearInterval(partie.surveillance);
    partie.surveillance = setInterval(() => {
      if (partie.demarre) { clearInterval(partie.surveillance); return; }
      let dit = "";
      try { dit = ((ui().textElem || {}).innerText || "").trim(); } catch (e) { /* pas encore prêt */ }
      const secondes = Math.round((Date.now() - depart) / 1000);
      $("#chargement-detail").textContent = dit ? `${dit} — ${secondes} s` : `${secondes} s écoulées`;
      if (secondes === 25) {
        $("#chargement-texte").textContent = "Le jeu ne démarre pas. Causes possibles : cœur "
          + "indisponible, ROM refusée par le cœur, mémoire insuffisante. Essayez un autre cœur, "
          + "forcez le démarrage, ou revenez au menu.";
      }
    }, 700);
  }

  $("#chargement-retour").addEventListener("click", () => {
    clearInterval(partie.surveillance);
    location.hash = `#/c/${partie.cid}`;
    location.reload();
  });

  function texteAide() {
    const r = partie.raccourcis || {};
    const dit = (a) => {
      const c = (r[a] || {}).value, g = (r[a] || {}).value2;
      return [c ? c.toUpperCase() : null, g || null].filter(Boolean).join(" ou ") || "non affecté";
    };
    return `Sauvegarde rapide : <b>${dit("sauver")}</b> · chargement rapide : <b>${dit("charger")}</b> ·
      menu : <b>${dit("menu")}</b>, ou la souris amenée sur un bord de l'écran.
      Touches et boutons se règlent par le bouton « Manettes et touches ».`;
  }


  function majSlot() {
    $("#sur-slot").textContent = `Emplacement courant : ${partie.slot}`;
  }

  // EmulatorJS écoute le clavier sur son propre cadre : dès qu'un bouton du menu
  // prend le focus, le jeu ne reçoit plus rien. On lui rend le focus, et surtout
  // on lui relaie les touches directement quand il ne les a pas reçues.
  function cadreJeu() {
    try { return ui().elements.parent; } catch (e) { return null; }
  }

  function rendreLeFocusAuJeu() {
    const el = cadreJeu();
    try {
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      if (el && typeof el.focus === "function") { el.setAttribute("tabindex", "-1"); el.focus(); }
    } catch (e) { console.warn("focus non rendu au jeu", e); }
  }

  function relaisClavier(ev) {
    if (!EMU.etat.enJeu || !partie.demarre) return;
    if (partie.menuOuvert) return;        // menu ouvert : le clavier navigue dans le menu
    const e = emu();
    if (!e || typeof e.keyChange !== "function") return;
    const cadre = cadreJeu();
    if (cadre && cadre.contains(document.activeElement)) return; // le jeu l'a déjà reçue
    try { e.keyChange(ev); } catch (err) { /* touche non reconnue */ }
  }
  document.addEventListener("keydown", relaisClavier);
  document.addEventListener("keyup", relaisClavier);

  /* -------------------------------------------------- pilotage de l'émulateur */

  const emu = () => window.EJS_emulator;
  const gestionnaire = () => window.EJS_emulator && window.EJS_emulator.gameManager;
  // EmulatorJS 4.2.3 (version « stable » du CDN) porte tout sur l'objet principal ;
  // les versions récentes déplacent l'interface dans .frontend. On accepte les deux.
  const ui = () => {
    const e = emu();
    if (!e) return null;
    return e.frontend || e;
  };

  function mettreEnPause() {
    try { if (!emu().paused) emu().pause(); return; } catch (e) { /* repli ci-dessous */ }
    try { gestionnaire().toggleMainLoop(0); } catch (e) { console.warn("pause impossible", e); }
  }
  function reprendre() {
    try { if (emu().paused) emu().play(); return; } catch (e) { /* repli ci-dessous */ }
    try { gestionnaire().toggleMainLoop(1); } catch (e) { console.warn("reprise impossible", e); }
  }

  async function sauver(slot) {
    const gm = gestionnaire();
    if (!gm || !partie.demarre) { EMU.message("La partie n'est pas encore lancée", true); return false; }
    try {
      let donnees = await gm.getState();
      if (donnees && donnees.state) donnees = donnees.state;
      if (!donnees || !donnees.length) throw new Error("état vide renvoyé par le cœur");
      await fetch(`/api/etat/${partie.cid}/${partie.jid}/${slot}?core=${encodeURIComponent(partie.core)}`, {
        method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: donnees,
      }).then(verifier);

      try {
        let image = await gm.screenshot();
        if (image && image.screenshot) image = image.screenshot;
        if (image) {
          await fetch(`/api/image/${partie.cid}/${partie.jid}/${slot}`, {
            method: "PUT", headers: { "Content-Type": "image/png" }, body: image,
          });
        }
      } catch (e) { console.warn("vignette non enregistrée", e); }

      partie.slot = slot; majSlot();
      EMU.message(`Sauvegardé dans l'emplacement ${slot}`);
      return true;
    } catch (e) {
      EMU.message(`Sauvegarde impossible : ${e.message}`, true);
      return false;
    }
  }

  async function charger(slot) {
    const gm = gestionnaire();
    if (!gm || !partie.demarre) return false;
    try {
      // Le cœur doit tourner pour accepter un état.
      if (emu().paused) reprendre();
      const r = await fetch(`/api/etat/${partie.cid}/${partie.jid}/${slot}`);
      if (r.status === 404) { EMU.message(`Emplacement ${slot} vide`, true); return false; }
      await verifier(r);
      const donnees = new Uint8Array(await r.arrayBuffer());
      appliquerEtat(donnees, "menu");
      partie.slot = slot; majSlot();
      voile(false);
      EMU.message(`Emplacement ${slot} chargé`);
      return true;
    } catch (e) {
      EMU.message(`Chargement impossible : ${e.message}`, true);
      return false;
    }
  }

  async function verifier(r) {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r;
  }

  async function slots() {
    const d = await EMU.api(`/api/jeux/${partie.cid}/${partie.jid}`);
    return { cid: partie.cid, jid: partie.jid, liste: d.slots };
  }

  /* ------------------------------------------------------------ surimpression */

  function ouvrirMenu() {
    if (partie.menuOuvert) return;
    partie.menuOuvert = true;
    partie.course = 0;
    clearTimeout(partie.fondu);
    mettreEnPause();
    relacherTout();
    majLissage();
    majPleinEcran();
    $("#surimpression").classList.remove("sortie");
    $("#surimpression").hidden = false;
    $("#scene").classList.add("menu");          // fait apparaître la barre EmulatorJS
    $("#scene").classList.remove("sans-curseur");
    EMU.focusPremier($("#surimpression"));
  }

  function fermerMenu() {
    if (!partie.menuOuvert) return;
    fermerPopups();
    partie.menuOuvert = false;
    partie.course = 0;
    // Fondu de sortie : la surimpression n'est retirée qu'une fois l'animation finie.
    $("#surimpression").classList.add("sortie");
    clearTimeout(partie.fondu);
    partie.fondu = setTimeout(() => {
      $("#surimpression").hidden = true;
      $("#surimpression").classList.remove("sortie");
    }, 300);
    $("#scene").classList.remove("menu");
    montrerCurseur();
    reprendre();
    rendreLeFocusAuJeu();
    enregistrerOptions();
  }

  function basculerMenu() {
    if (!$("#triche").hidden) return;     // la fenêtre des codes se ferme d'abord
    partie.menuOuvert ? fermerMenu() : ouvrirMenu();
  }

  // EmulatorJS ignore clavier et manette tant qu'une de ses fenêtres est ouverte
  // (isPopupOpen) : on s'assure qu'aucune ne reste ouverte en reprenant la partie.
  function fermerPopups() {
    try {
      const f = ui();
      if (f.controlMenu) f.controlMenu.style.display = "none";
      if (f.cheatMenu) f.cheatMenu.style.display = "none";
      if (f.currentPopup) f.closePopup();
    } catch (e) { /* aucune fenêtre ouverte */ }
  }

  // Un clic dans le vide de la surimpression revient au jeu.
  $("#surimpression").addEventListener("click", (ev) => {
    if (ev.target.closest("button, select, input, a")) return;
    fermerMenu();
  });

  // Écran tactile : ni Échap ni souris, d'où ce bouton à trois barres en haut à
  // droite. stopPropagation : le même toucher ne doit pas refermer le menu.
  $("#btn-menu-tactile").addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (partie.demarre) ouvrirMenu();
  });

  // La souris ouvre le menu après 300 px de déplacement cumulé, où qu'elle soit.
  // Elle redevient visible dès qu'elle bouge, et s'efface 3 s après son dernier
  // mouvement si le menu est fermé.
  const COURSE = 300;
  document.addEventListener("mousemove", (ev) => {
    if (!EMU.etat.enJeu || !partie.demarre) return;
    montrerCurseur();
    if (partie.menuOuvert) return;
    if (partie.sourisX !== null) {
      partie.course += Math.hypot(ev.clientX - partie.sourisX, ev.clientY - partie.sourisY);
    }
    partie.sourisX = ev.clientX;
    partie.sourisY = ev.clientY;
    if (partie.course >= COURSE) ouvrirMenu();
  });

  // Plein écran : EmulatorJS le demande sur son seul cadre de jeu, ce qui laisse
  // la surimpression hors de l'écran. « toggleFullscreen » étant une propriété
  // d'instance, on la remplace par la nôtre.
  // C'est la PAGE ENTIÈRE qui passe en plein écran, et non #scene : seuls
  // l'élément en plein écran et ses descendants sont affichés, or les fenêtres
  // de second niveau (confirmation, emplacements, mappage, codes) et les
  // messages sont des voisins de #scene. Avec #scene, elles restaient invisibles.
  function entrerPleinEcran() {
    const page = document.documentElement;
    if (document.fullscreenElement || typeof page.requestFullscreen !== "function") return;
    page.requestFullscreen({ navigationUI: "hide" })
      .catch((x) => console.warn("plein écran refusé :", x.message));
  }

  function reprendrePleinEcran() {
    const e = emu();
    if (!e) return;
    e.toggleFullscreen = () => {
      if (document.fullscreenElement) {
        partie.sortieVoulue = true;
        document.exitFullscreen().catch((x) => console.warn(x));
      } else entrerPleinEcran();
    };
  }

  // Bouton « Reprendre en plein écran » de la surimpression : affiché seulement
  // hors plein écran, et si le navigateur sait le faire (pas l'iPhone).
  function majPleinEcran() {
    const b = $("#btn-plein-ecran");
    if (b) b.hidden = !!document.fullscreenElement
      || typeof document.documentElement.requestFullscreen !== "function";
  }

  // Échap fait sortir du plein écran : le navigateur se réserve cette touche, et
  // la page ne reçoit pas toujours l'appui. Toute sortie que nous n'avons pas
  // demandée ouvre donc le menu, où « Reprendre en plein écran » y ramène.
  document.addEventListener("fullscreenchange", () => {
    majPleinEcran();
    if (document.fullscreenElement) return;
    const voulue = partie.sortieVoulue;
    partie.sortieVoulue = false;
    if (!voulue && EMU.etat.enJeu && partie.demarre) ouvrirMenu();
  });

  // Deux boutons de la barre d'EmulatorJS résistent à EJS_Buttons : « Context
  // Menu », que la version 4.2.3 refuse explicitement de masquer, et « Play »,
  // que la mise en pause réaffiche en forçant son style. On les neutralise donc
  // par une classe, dont la règle CSS porte !important et l'emporte sur le style
  // en ligne. Les libellés sont ceux d'EmulatorJS, non traduits.
  const BOUTONS_MASQUES = /^(play|pause|context menu)$/i;

  function masquerBoutonsBarre() {
    document.querySelectorAll("#scene .ejs_menu_button").forEach((b) => {
      if (BOUTONS_MASQUES.test((b.innerText || "").trim())) b.classList.add("bouton-masque");
    });
  }

  function montrerCurseur() {
    $("#scene").classList.remove("sans-curseur");
    clearTimeout(partie.curseur);
    partie.curseur = setTimeout(() => {
      if (!partie.menuOuvert) $("#scene").classList.add("sans-curseur");
    }, 3000);
  }

  /* ------------------------------------------------------------- raccourcis */

  document.addEventListener("keydown", (ev) => {
    if (!EMU.etat.enJeu || !$("#dialogue").hidden) return;
    if (!$("#mappage").hidden || !$("#confirmation").hidden) return;   // ces fenêtres gèrent Échap
    if (!$("#triche").hidden) return;     // saisie d'un code : P ou F2 ne sont pas des raccourcis
    const r = partie.raccourcis || {};
    const nom = EMU.nomTouche(ev.keyCode);
    if (ev.key === "Escape" || (r.menu && nom && nom === r.menu.value)) {
      ev.preventDefault();
      ev.stopPropagation();          // sinon app.js refermerait le menu aussitôt
      basculerMenu();
      return;
    }
    if (r.sauver && nom && nom === r.sauver.value) { ev.preventDefault(); sauver(partie.slot); return; }
    if (r.charger && nom && nom === r.charger.value) { ev.preventDefault(); charger(partie.slot); return; }
    if (r.pause && nom && nom === r.pause.value) {
      ev.preventDefault();
      try { emu().paused ? reprendre() : mettreEnPause(); } catch (e) { /* ignoré */ }
      EMU.message("Pause / reprise");
    }
  }, true);

  /* ------------------------------ manettes : envoi direct au cœur d'émulation */

  // EmulatorJS n'accepte une manette que s'il a réussi à l'attribuer à un joueur,
  // ce que ses manettes HID génériques ne déclenchent pas toujours. On lit donc
  // les manettes ici et on transmet les entrées nous-mêmes, d'après le mappage
  // de la console. Les joueurs suivent l'ordre où le navigateur voit les manettes.
  const ANALOGIQUES = [16, 17, 18, 19, 20, 21, 22, 23];
  const BOUTONS_PAD = ["BUTTON_1", "BUTTON_2", "BUTTON_3", "BUTTON_4",
    "LEFT_TOP_SHOULDER", "RIGHT_TOP_SHOULDER", "LEFT_BOTTOM_SHOULDER",
    "RIGHT_BOTTOM_SHOULDER", "SELECT", "START", "LEFT_STICK", "RIGHT_STICK",
    "DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT"];
  const AXES_PAD = ["LEFT_STICK_X", "LEFT_STICK_Y", "RIGHT_STICK_X", "RIGHT_STICK_Y"];

  // Position de repos de chaque manette, relevée à la première lecture.
  function repos(p) {
    let r = partie.repos[p.index];
    if (!r) { r = p.axes.map((a) => a); partie.repos[p.index] = r; }
    return r;
  }

  function valeurEntree(p, etiquette) {
    if (typeof etiquette !== "string" || !etiquette) return 0;
    if (etiquette.includes(":")) {
      const [nom, signe] = etiquette.split(":");
      let i = AXES_PAD.indexOf(nom);
      if (i < 0 && nom.startsWith("EXTRA_STICK_")) i = parseInt(nom.slice(12), 10);
      const axe = p.axes[i];
      if (i < 0 || axe === undefined) return 0;
      const ecart = (axe - (repos(p)[i] || 0)) * (signe === "-1" ? -1 : 1);
      return ecart > 0.35 ? Math.min(ecart, 1) : 0;
    }
    let i = BOUTONS_PAD.indexOf(etiquette);
    if (i < 0 && etiquette.startsWith("GAMEPAD_")) i = parseInt(etiquette.slice(8), 10);
    const b = p.buttons[i];
    if (i < 0 || !b) return 0;
    return (b.pressed || b.value > 0.5) ? 1 : 0;
  }

  // Remet toutes les entrées à zéro : au démarrage, à la mise en pause, et quand
  // une manette disparaît (sinon la dernière valeur envoyée reste maintenue).
  function relacherTout() {
    const gm = gestionnaire();
    if (!gm || typeof gm.simulateInput !== "function") return;
    for (let joueur = 0; joueur < 4; joueur++) {
      for (let j = 0; j <= 23; j++) {
        if (partie.envoye[`${joueur}:${j}`] === 0) continue;
        partie.envoye[`${joueur}:${j}`] = 0;
        try { gm.simulateInput(joueur, j, 0); } catch (e) { /* bouton absent du cœur */ }
      }
    }
  }

  function pontManettes(pads) {
    const gm = gestionnaire();
    if (!gm || typeof gm.simulateInput !== "function") return;
    if (!pads.length) { relacherTout(); partie.repos = {}; return; }
    const enPause = partie.menuOuvert;
    for (let joueur = 0; joueur < 4; joueur++) {
      const p = padDuJoueur(pads, joueur);
      if (!p) continue;
      const mappage = partie.controles[joueur] || {};
      for (const cle in mappage) {
        const j = Number(cle);
        if (j > 23) continue;
        const analogique = ANALOGIQUES.includes(j);
        const brut = enPause ? 0 : valeurEntree(p, mappage[cle].value2);
        const valeur = analogique ? Math.round(0x7fff * brut) : (brut ? 1 : 0);
        const memo = `${joueur}:${j}`;
        if (partie.envoye[memo] === valeur) continue;
        partie.envoye[memo] = valeur;
        try { gm.simulateInput(joueur, j, valeur); } catch (e) { /* bouton absent du cœur */ }
      }
    }
  }

  // Périphérique affecté à un joueur : celui choisi dans le menu de la console,
  // sinon l'ordre de branchement. Dès qu'une affectation existe, les périphériques
  // non affectés sont ignorés — pédales et joysticks ne parasitent plus le jeu.
  function padDuJoueur(pads, joueur) {
    const voulu = (partie.manettesJoueurs || [])[joueur];
    if (voulu === "none") return null;                       // joueur désactivé
    if (voulu) return pads.find((p) => `${p.id}_${p.index}` === voulu) || null;
    if ((partie.manettesJoueurs || []).some(Boolean)) return null;
    return pads[joueur] || null;
  }

  // Raccourcis manette : les boutons affectés dans le menu de la console (une
  // gâchette, par exemple). Tant qu'aucun n'est affecté, l'ancienne combinaison
  // Select + L1 / R1 / Start reste disponible.
  function surPad(pads) {
    if (!EMU.etat.enJeu || !partie.demarre) return;
    pontManettes(pads);
    if (!pads.length) return;
    const r = partie.raccourcis || {};
    const actions = { sauver: () => sauver(partie.slot), charger: () => charger(partie.slot), menu: basculerMenu };
    let affecte = false;

    for (let joueur = 0; joueur < 4; joueur++) {
      const p = padDuJoueur(pads, joueur);
      if (!p) continue;
      for (const nom in actions) {
        const etiquette = (r[nom] || {}).value2;
        if (!etiquette) continue;
        affecte = true;
        edge(`${p.index}-${nom}`, valeurEntree(p, etiquette) > 0, actions[nom]);
      }
    }
    if (affecte) return;

    const m = partie.reglages.manette;
    for (const p of pads) {
      if (!p.buttons[m.modificateur]?.pressed) continue;
      edge(`${p.index}-sauver`, p.buttons[m.sauver]?.pressed, actions.sauver);
      edge(`${p.index}-charger`, p.buttons[m.charger]?.pressed, actions.charger);
      edge(`${p.index}-menu`, p.buttons[m.menu]?.pressed, actions.menu);
      return;
    }
    partie.boutons.clear();
  }

  function edge(cle, actif, action) {
    if (actif && !partie.boutons.has(cle)) { partie.boutons.add(cle); action(); }
    if (!actif) partie.boutons.delete(cle);
  }

  /* --------------------------------------------- boutons de la surimpression */

  $("#btn-reprendre").addEventListener("click", fermerMenu);

  // Le clic (ou Entrée) est un geste de l'utilisateur : le navigateur accepte
  // alors la demande. La partie reprend même s'il la refuse.
  $("#btn-plein-ecran").addEventListener("click", () => {
    entrerPleinEcran();
    fermerMenu();
  });

  $("#btn-sauver").addEventListener("click", async () => {
    const n = await EMU.ouvrirSlots({
      titre: "Sauvegarder",
      aide: `Cœur ${partie.core}. La partie est enregistrée sur le serveur, dans la sauvegarde du mardi.`,
      slots: await slots(), autoriserVide: true, effacable: true, coeur: partie.core,
    });
    if (n !== null) { await sauver(n); fermerMenu(); }
    else { EMU.focusPremier($("#surimpression")); }
  });

  $("#btn-charger").addEventListener("click", async () => {
    const n = await EMU.ouvrirSlots({
      titre: "Charger",
      aide: `Cœur ${partie.core}. Un emplacement enregistré avec un autre cœur n'est pas lisible ici : `
          + "il faut quitter le jeu et le relancer depuis la bibliothèque.",
      slots: await slots(), autoriserVide: false, effacable: true,
      coeur: partie.core, bloquer: true,
    });
    if (n === null) { EMU.focusPremier($("#surimpression")); return; }
    // On rend la main au cœur AVANT de charger : un état chargé alors que la
    // boucle d'émulation est en pause peut repartir à zéro.
    fermerMenu();
    setTimeout(() => charger(n), 200);
  });

  // Lissage : bascule entre le shader SABR et aucun shader. Le réglage est
  // enregistré avec les autres options de la console en reprenant la partie.
  function lissageActif() {
    try { return emu().getSettingValue("shader") === "sabr"; } catch (e) { return false; }
  }

  function majLissage() {
    const bouton = $("#btn-lissage");
    if (bouton) bouton.textContent = lissageActif() ? "Désactiver le lissage" : "Activer le lissage";
  }

  $("#btn-lissage").addEventListener("click", () => {
    const e = emu();
    if (!e || typeof e.changeSettingOption !== "function") {
      EMU.message("Réglage d'image indisponible", true);
      return;
    }
    const vise = lissageActif() ? "disabled" : "sabr";
    try {
      e.changeSettingOption("shader", vise);
      majLissage();
      EMU.message(vise === "sabr" ? "Lissage activé (SABR)" : "Lissage désactivé");
    } catch (err) { EMU.message(`Lissage impossible : ${err.message}`, true); }
  });

  /* -------------------------------------------------------- codes de triche */

  // Le cœur ne sait pas désactiver un code : fceumm, par exemple, ignore
  // l'argument « enabled » de retro_cheat_set. On vide donc toute la liste du
  // cœur, puis on y remet les seuls codes actifs, avec des index consécutifs.
  // C'est aussi ce que fait RetroArch.
  function appliquerCodes() {
    const gm = gestionnaire();
    if (!gm || typeof gm.resetCheat !== "function" || typeof gm.setCheat !== "function") {
      EMU.message("Codes de triche indisponibles avec ce cœur", true);
      return false;
    }
    try {
      gm.resetCheat();
      let n = 0;
      for (const c of partie.codes) if (c.actif && c.code) gm.setCheat(n++, 1, c.code);
      return true;
    } catch (e) {
      console.warn("codes non appliqués", e);
      EMU.message(`Codes non appliqués : ${e.message}`, true);
      return false;
    }
  }

  function majBoutonCodes() {
    const n = partie.codes.filter((c) => c.actif).length;
    $("#btn-codes").textContent = n ? `Codes de triche (${n} actif${n > 1 ? "s" : ""})` : "Codes de triche";
  }

  async function enregistrerCodes() {
    try {
      const r = await fetch(`/api/codes/${partie.cid}/${partie.jid}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: partie.codes }),
      }).then(verifier);
      partie.codes = (await r.json()).codes || [];
      return true;
    } catch (e) {
      EMU.message(`Codes non enregistrés : ${e.message}`, true);
      return false;
    }
  }

  // Formats acceptés, selon la console (le cœur refuse sans message un code
  // qu'il ne sait pas lire).
  const FORMATS_CODES = {
    nes: "Game Genie (SXIOPO, 6 ou 8 lettres) ou adresse brute (0079:05)",
    snes: "Game Genie (DD62-6DAD) ou Pro Action Replay (7E0DBF09)",
    gb: "Game Genie (00A-17B-C49) ou GameShark (01FFC6C2)",
    megadrive: "Game Genie (ATDT-EA6J) ou Pro Action Replay",
    n64: "GameShark (8033B174 0005)",
    neogeo: "les cœurs arcade gèrent mal les codes saisis à la main",
  };

  const SVG_EFFACER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 '
    + '0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
  const h = (t) => String(t).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function dessinerCodes(focusSur) {
    const liste = $("#codes-liste");
    liste.innerHTML = partie.codes.length ? partie.codes.map((c, i) => `
      <div class="code-ligne">
        <button class="code-bascule nav" data-basculer="${i}" aria-pressed="${c.actif ? "true" : "false"}">
          <span class="interrupteur" aria-hidden="true"></span>
          <span class="code-texte"><span class="code-nom">${h(c.nom)}</span>
            <span class="code-valeur">${h(c.code)}</span></span>
        </button>
        <button class="icone code-effacer nav" data-effacer="${i}" aria-label="Supprimer ${h(c.nom)}"
                title="Supprimer">${SVG_EFFACER}</button>
      </div>`).join("")
      : `<p class="vide">Aucun code pour ce jeu. Ajoutez-en un ci-dessous.</p>`;

    liste.querySelectorAll("[data-basculer]").forEach((el) => {
      el.addEventListener("click", async () => {
        const i = Number(el.dataset.basculer);
        partie.codes[i].actif = !partie.codes[i].actif;
        appliquerCodes();
        majBoutonCodes();
        dessinerCodes(`[data-basculer="${i}"]`);
        EMU.message(`${partie.codes[i].nom} : ${partie.codes[i].actif ? "activé" : "désactivé"}`);
        await enregistrerCodes();
      });
    });
    liste.querySelectorAll("[data-effacer]").forEach((el) => {
      el.addEventListener("click", async () => {
        const i = Number(el.dataset.effacer);
        const oui = await EMU.confirmer({
          titre: "Supprimer ce code ?",
          texte: `« ${partie.codes[i].nom} » (${partie.codes[i].code}) sera retiré de ce jeu.`,
          valider: "Supprimer",
        });
        if (oui) {
          partie.codes.splice(i, 1);
          appliquerCodes();
          majBoutonCodes();
          await enregistrerCodes();
        }
        dessinerCodes();
      });
    });
    const cible = focusSur && liste.querySelector(focusSur);
    if (cible) cible.focus({ preventScroll: true });
    else EMU.focusPremier($("#triche"));
  }

  async function ajouterCode() {
    const nom = $("#code-nom").value.trim();
    // Majuscules : Game Genie et codes hexadécimaux s'écrivent ainsi. Une ligne
    // par code, ou des « + », pour plusieurs codes formant un même effet.
    const code = $("#code-code").value.trim().toUpperCase().replace(/\s*[\r\n]+\s*/g, "+");
    if (!code) { EMU.message("Saisissez un code", true); $("#code-code").focus(); return; }
    if (partie.codes.length >= 100) { EMU.message("100 codes au plus par jeu", true); return; }
    partie.codes.push({ nom: nom || code, code, actif: true });
    appliquerCodes();
    majBoutonCodes();
    if (await enregistrerCodes()) {
      $("#code-nom").value = ""; $("#code-code").value = "";
      EMU.message(`Code ajouté et activé : ${nom || code}`);
    }
    dessinerCodes(`[data-basculer="${partie.codes.length - 1}"]`);
  }

  function ouvrirCodes() {
    const boite = $("#triche");
    const format = FORMATS_CODES[partie.cid];
    $("#triche-aide").textContent = `Propres à ce jeu et conservés sur le serveur. `
      + (format ? `Formats : ${format}. ` : "")
      + "Plusieurs codes pour un même effet : les séparer par +. Un code désactivé cesse "
      + "d'agir, mais une valeur qu'il a déjà écrite en mémoire peut subsister.";
    boite.hidden = false;
    dessinerCodes();
    return new Promise((resoudre) => {
      const fermer = () => {
        boite.hidden = true;
        document.removeEventListener("keydown", surTouche, true);
        EMU.etat.fermerTriche = null;
        resoudre();
      };
      const surTouche = (ev) => {
        if (ev.key !== "Escape" || !$("#confirmation").hidden) return;
        ev.stopPropagation(); ev.preventDefault(); fermer();
      };
      document.addEventListener("keydown", surTouche, true);
      $("#triche-fermer").onclick = fermer;
      boite.onclick = (ev) => { if (ev.target === boite) fermer(); };
      EMU.etat.fermerTriche = fermer;
    });
  }

  $("#code-ajouter").addEventListener("click", ajouterCode);
  ["#code-nom", "#code-code"].forEach((s) => $(s).addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); ajouterCode(); }
  }));

  $("#btn-codes").addEventListener("click", async () => {
    await ouvrirCodes();
    EMU.focusPremier($("#surimpression"));
  });

  $("#btn-mappage").addEventListener("click", async () => {
    await EMU.ouvrirMappage(partie.cid);
    await rechargerReglages();
    EMU.focusPremier($("#surimpression"));
  });

  // Après un passage par le mappage : nouveau réglage pour le pont manette, et
  // nouveau clavier pour EmulatorJS (qui attend des codes de touches, pas des noms).
  async function rechargerReglages() {
    try {
      const config = await EMU.api(`/api/config/${partie.cid}`);
      partie.controles = config.controls || EMU.controlesParDefaut();
      partie.manettesJoueurs = config.manettes || ["", "", "", ""];
      partie.raccourcis = config.raccourcis || {};
      const clavierSeul = JSON.parse(JSON.stringify(partie.controles));
      for (const j in clavierSeul) {
        for (const i in clavierSeul[j]) clavierSeul[j][i].value2 = "";
      }
      const e = emu();
      e.controls = clavierSeul;
      if (typeof e.setupKeys === "function") e.setupKeys();
      partie.repos = {};
      relacherTout();
      EMU.message("Réglages appliqués");
    } catch (err) { EMU.message(`Réglages non appliqués : ${err.message}`, true); }
  }

  $("#btn-quitter").addEventListener("click", async () => {
    const oui = await EMU.confirmer({
      titre: "Quitter le jeu ?",
      texte: "La partie en cours est perdue si elle n'a pas été sauvegardée dans un emplacement.",
      valider: "Quitter",
    });
    if (oui) quitter(); else EMU.focusPremier($("#surimpression"));
  });

  // Les réglages du menu contextuel d'EmulatorJS (image, shader, volume…) sont
  // conservés par console, côté serveur.
  function enregistrerOptions() {
    try {
      const e = emu();
      const options = ui() && ui().settings;
      if (!options) return;
      const corps = { options: { ...options } };
      if (typeof e.volume === "number") corps.volume = e.volume;
      fetch(`/api/config/${partie.cid}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps), keepalive: true,   // « Quitter » recharge la page
      });
    } catch (err) { console.warn("réglages non enregistrés", err); }
  }

  function quitter() {
    enregistrerOptions();
    const cid = partie.cid;
    setTimeout(() => {
      location.hash = `#/c/${cid}`;
      location.reload();
    }, 150);
  }

  window.addEventListener("beforeunload", enregistrerOptions);

  return {
    lancer, basculerMenu, sauver, charger, quitter,
    // lecture seule, pour la boîte à outils de diagnostic (diag.js)
    get controles() { return partie.controles; },
    get partie() { return partie; },
  };
})();
