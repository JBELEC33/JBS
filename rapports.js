// =====================================================================
// Bouton « Ça ne va pas » : rapports de problème gardés sur le téléphone
// =====================================================================
// Au toucher du bouton, l'appli note tout de suite l'endroit, l'heure,
// l'état de l'appli et une petite image de la carte. Le commentaire est
// facultatif. Les rapports restent sur l'iPhone (stockage du navigateur)
// jusqu'à ce qu'on les exporte et les efface.

const Rapports = (() => {
  const CLE = 'gps-bordeaux-rapports';
  let rapportEnCours = null;

  function lire() {
    try { return JSON.parse(localStorage.getItem(CLE)) || []; }
    catch (e) { return []; }
  }

  function ecrire(liste) {
    try {
      localStorage.setItem(CLE, JSON.stringify(liste));
      return true;
    } catch (e) {
      // Mémoire pleine : on retire les images des anciens rapports et on réessaie
      liste.forEach((r) => { delete r.image; });
      try { localStorage.setItem(CLE, JSON.stringify(liste)); return true; }
      catch (e2) { return false; }
    }
  }

  // Petite image de la carte (360 px de large, en JPEG) pour voir l'écran au moment du problème.
  // L'image doit être copiée juste après que la carte s'est dessinée.
  function photographierCarte(carte) {
    return new Promise((resolve) => {
      const abandon = setTimeout(() => resolve(null), 1500);
      carte.once('render', () => {
        clearTimeout(abandon);
        try {
          const source = carte.getCanvas();
          const largeur = 360;
          const hauteur = Math.round(source.height * largeur / source.width);
          const toile = document.createElement('canvas');
          toile.width = largeur;
          toile.height = hauteur;
          toile.getContext('2d').drawImage(source, 0, 0, largeur, hauteur);
          resolve(toile.toDataURL('image/jpeg', 0.6));
        } catch (e) {
          resolve(null);
        }
      });
      carte.triggerRepaint();
    });
  }

  function formaterHeure(iso) {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  }

  function afficherListe() {
    const liste = lire();
    document.getElementById('rapport-nombre').textContent = liste.length;
    const ul = document.getElementById('rapport-liste');
    ul.innerHTML = '';
    liste.slice().reverse().forEach((r) => {
      const li = document.createElement('li');
      li.textContent = formaterHeure(r.heure) + ' — ' + (r.commentaire || '(sans commentaire)');
      ul.appendChild(li);
    });
  }

  // Exporte tous les rapports dans un fichier, via le menu « Partager » de l'iPhone
  // (Enregistrer dans Fichiers, Mail, AirDrop…). Ce fichier peut ensuite être
  // donné tel quel à Claude Code.
  async function exporter() {
    const liste = lire();
    if (liste.length === 0) { alert('Aucun rapport à exporter.'); return; }
    const contenu = JSON.stringify({ application: 'GPS Bordeaux', exporteLe: new Date().toISOString(), rapports: liste }, null, 2);
    const nom = 'rapports-gps-' + new Date().toISOString().slice(0, 10) + '.json';
    const fichier = new File([contenu], nom, { type: 'application/json' });

    if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier], title: 'Rapports GPS Bordeaux' });
      } catch (e) { /* partage annulé : rien à faire */ }
      return;
    }
    // Sinon (ordinateur…) : téléchargement classique
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(fichier);
    lien.download = nom;
    lien.click();
    setTimeout(() => URL.revokeObjectURL(lien.href), 5000);
  }

  function installer(carte, etat, etatPourRapport) {
    const panneau = document.getElementById('panneau-rapport');
    const commentaire = document.getElementById('rapport-commentaire');

    function fermer() {
      panneau.classList.add('cache');
      etat.ecran = 'carte';
      rapportEnCours = null;
    }

    document.getElementById('bouton-probleme').addEventListener('click', async () => {
      // On note l'état AVANT d'ouvrir la fenêtre, pour avoir l'écran tel qu'il était
      rapportEnCours = { heure: new Date().toISOString(), etat: etatPourRapport() };
      etat.ecran = 'rapport';
      commentaire.value = '';
      afficherListe();
      panneau.classList.remove('cache');
      const image = await photographierCarte(carte);
      if (rapportEnCours && image) rapportEnCours.image = image;
    });

    document.getElementById('rapport-annuler').addEventListener('click', fermer);

    document.getElementById('rapport-enregistrer').addEventListener('click', () => {
      if (!rapportEnCours) return;
      rapportEnCours.commentaire = commentaire.value.trim();
      const liste = lire();
      liste.push(rapportEnCours);
      if (!ecrire(liste)) {
        alert("Mémoire pleine : exportez puis effacez les anciens rapports.");
        return;
      }
      commentaire.blur();
      fermer();
    });

    document.getElementById('rapport-exporter').addEventListener('click', exporter);

    document.getElementById('rapport-effacer').addEventListener('click', () => {
      if (lire().length === 0) return;
      if (confirm('Effacer tous les rapports ? Pensez à les exporter avant.')) {
        localStorage.removeItem(CLE);
        afficherListe();
      }
    });
  }

  return { installer };
})();
