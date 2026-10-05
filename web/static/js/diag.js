/* ------------------------------------------------------------------------- *
 * Site émulateur « nas » — boîte à outils de diagnostic.
 * /srv/data/server/emulateurs/web/static/js/diag.js
 *
 * À charger depuis la console du navigateur, jeu lancé :
 *     await import('/static/js/diag.js?x=' + Date.now())
 * puis appeler DIAG.aide() pour la liste des commandes.
 *
 * Ce fichier ne sert qu'au diagnostic : il n'est chargé par aucune page.
 * ------------------------------------------------------------------------- */

const DIAG = (() => {
  "use strict";

  const emu = () => window.EJS_emulator;
  const gm = () => window.EJS_emulator && window.EJS_emulator.gameManager;
  const ui = () => (window.EJS_emulator ? (window.EJS_emulator.frontend || window.EJS_emulator) : null);
  const journal = [];
  let espionPose = false, brutInput = null, brutKey = null;

  const NOMS = {
    0: "B", 1: "Y", 2: "SELECT", 3: "START", 4: "HAUT", 5: "BAS", 6: "GAUCHE",
    7: "DROITE", 8: "A", 9: "X", 10: "L", 11: "R", 12: "L2", 13: "R2",
    14: "L3", 15: "R3", 16: "stick X+", 17: "stick X-", 18: "stick Y+", 19: "stick Y-",
    20: "C X+", 21: "C X-", 22: "C Y+", 23: "C Y-",
  };

  function origine(pile) {
    const lignes = (pile || "").split("\n").slice(1, 6).map((l) => l.trim());
    const utile = lignes.find((l) => /player\.js|app\.js|emulator|frontend|diag/.test(l));
    return (utile || lignes[0] || "?").replace(/^at\s+/, "").slice(0, 90);
  }

  return {
    aide() {
      console.log([
        "DIAG.etat()       — version des fichiers, état du cœur, mappage du joueur 1",
        "DIAG.pads()       — manettes vues : identifiant, boutons, axes, repos",
        "DIAG.espion()     — intercepte les entrées envoyées au jeu (laisser tourner)",
        "DIAG.journal()    — ce que l'espion a vu (les 40 dernières entrées)",
        "DIAG.stop()       — retire l'espion",
        "DIAG.appui(7)     — envoie DROITE au jeu pendant 600 ms (7 = droite, 6 = gauche)",
        "DIAG.ecoute(6)    — affiche pendant 6 s les boutons et axes qui bougent",
        "DIAG.pont(false)  — coupe mon pont manette ; DIAG.pont(true) le remet",
        "DIAG.focus()      — où est le focus du clavier",
      ].join("\n"));
    },

    etat() {
      const e = emu();
      const scripts = [...document.scripts].map((s) => s.src).filter((s) => /\/static\/js\//.test(s));
      return {
        fichiers: scripts,
        demarre: e ? e.started : null,
        enPause: e ? e.paused : null,
        fenetreOuverte: (() => { try { return ui().isPopupOpen(); } catch (x) { return "?"; } })(),
        manettesAttribuees: (() => { try { return ui().gamepadSelection; } catch (x) { return "?"; } })(),
        clavierJoueur1: (() => {
          const c = {}; try {
            for (const j in NOMS) if (e.controls[0][j]) c[NOMS[j]] = e.controls[0][j].value;
          } catch (x) { return "?"; } return c;
        })(),
        pontJoueur1: (() => {
          const c = {}; try {
            const m = window.PLAYER && PLAYER.controles ? PLAYER.controles[0] : null;
            if (!m) return "non exposé";
            for (const j in NOMS) if (m[j]) c[NOMS[j]] = m[j].value2;
          } catch (x) { return "?"; } return c;
        })(),
      };
    },

    pads() {
      return [...navigator.getGamepads()].filter(Boolean).map((p) => ({
        index: p.index, id: p.id, mapping: p.mapping,
        boutons: p.buttons.length, axes: p.axes.map((a) => a.toFixed(2)).join(" "),
        enfonces: p.buttons.map((b, i) => (b.pressed || b.value > 0.5 ? i : null)).filter((x) => x !== null),
      }));
    },

    espion() {
      if (espionPose) return "déjà posé";
      const g = gm();
      if (!g) return "cœur d'émulation absent";
      brutInput = g.simulateInput.bind(g);
      g.simulateInput = (joueur, bouton, valeur) => {
        if (valeur) {
          journal.push({ t: new Date().toLocaleTimeString(), joueur, bouton: NOMS[bouton] || bouton, valeur,
            origine: origine(new Error().stack) });
          if (journal.length > 200) journal.shift();
        }
        return brutInput(joueur, bouton, valeur);
      };
      const e = emu();
      brutKey = e.keyChange.bind(e);
      e.keyChange = (ev) => {
        journal.push({ t: new Date().toLocaleTimeString(), clavier: ev.type, code: ev.keyCode,
          origine: origine(new Error().stack) });
        return brutKey(ev);
      };
      espionPose = true;
      return "espion posé — laissez tourner, puis DIAG.journal()";
    },

    journal() { console.table(journal.slice(-40)); return journal.length + " entrées"; },

    stop() {
      try { if (brutInput) gm().simulateInput = brutInput; } catch (x) { /* */ }
      try { if (brutKey) emu().keyChange = brutKey; } catch (x) { /* */ }
      espionPose = false; journal.length = 0;
      return "espion retiré";
    },

    appui(bouton = 7, ms = 600) {
      const g = gm();
      if (!g) return "cœur d'émulation absent";
      g.simulateInput(0, bouton, 1);
      setTimeout(() => g.simulateInput(0, bouton, 0), ms);
      return `${NOMS[bouton] || bouton} envoyé au joueur 1 pendant ${ms} ms`;
    },

    ecoute(secondes = 6) {
      const depart = [...navigator.getGamepads()].filter(Boolean)
        .map((p) => ({ index: p.index, b: p.buttons.map((x) => x.pressed || x.value > 0.5), a: p.axes.slice() }));
      const vus = {};
      const fin = performance.now() + secondes * 1000;
      (function tour() {
        for (const p of [...navigator.getGamepads()].filter(Boolean)) {
          const ref = depart.find((r) => r.index === p.index);
          if (!ref) continue;
          p.buttons.forEach((b, i) => {
            if ((b.pressed || b.value > 0.5) && !ref.b[i]) vus["bouton " + i] = (vus["bouton " + i] || 0) + 1;
          });
          p.axes.forEach((v, i) => {
            const d = v - (ref.a[i] || 0);
            if (Math.abs(d) > 0.5) vus[`axe ${i} ${d > 0 ? "+" : "-"}`] = (vus[`axe ${i} ${d > 0 ? "+" : "-"}`] || 0) + 1;
          });
        }
        if (performance.now() < fin) requestAnimationFrame(tour);
        else console.log("Ce qui a bougé :", vus);
      })();
      return `appuyez sur les boutons pendant ${secondes} s…`;
    },

    pont(actif) {
      if (!window.PLAYER) return "lecteur absent";
      if (actif === false) { DIAG._surPad = EMU.etat.surPad; EMU.etat.surPad = null; return "pont manette coupé"; }
      if (DIAG._surPad) { EMU.etat.surPad = DIAG._surPad; return "pont manette rétabli"; }
      return "rien à rétablir";
    },

    focus() {
      let cadre = null;
      try { cadre = ui().elements.parent; } catch (x) { /* */ }
      return {
        actif: document.activeElement ? (document.activeElement.id || document.activeElement.className
          || document.activeElement.tagName) : null,
        dansLeJeu: cadre ? cadre.contains(document.activeElement) : "cadre introuvable",
        tabindex: cadre ? cadre.getAttribute("tabindex") : null,
      };
    },
  };
})();

window.DIAG = DIAG;
console.log("DIAG chargé — tapez DIAG.aide()");
