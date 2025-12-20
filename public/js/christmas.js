/**
 * Christmas Theme - Always Active
 * Weihnachts-Theme für das Panel
 */

(function() {
  // Sofort Weihnachts-Theme aktivieren
  document.documentElement.setAttribute('data-christmas', 'true');

  // Dekorationen hinzufügen wenn DOM bereit
  function addDecorations() {
    // Prüfen ob bereits vorhanden
    if (document.getElementById('christmas-decorations')) return;

    const container = document.createElement('div');
    container.id = 'christmas-decorations';

    // Schneeflocken Container
    const snowContainer = document.createElement('div');
    snowContainer.className = 'snowfall-container';

    // 30 Schneeflocken erstellen
    for (let i = 0; i < 30; i++) {
      const snowflake = document.createElement('div');
      snowflake.className = 'snowflake';
      snowflake.innerHTML = Math.random() > 0.5 ? '❄' : '❅';
      snowContainer.appendChild(snowflake);
    }
    container.appendChild(snowContainer);

    // Weihnachtslichter oben
    const lights = document.createElement('div');
    lights.className = 'christmas-lights';
    container.appendChild(lights);

    // Weihnachtsbäume
    const treeLeft = document.createElement('div');
    treeLeft.className = 'christmas-tree left';
    treeLeft.textContent = '🎄';
    container.appendChild(treeLeft);

    const treeRight = document.createElement('div');
    treeRight.className = 'christmas-tree right';
    treeRight.textContent = '🎄';
    container.appendChild(treeRight);

    document.body.appendChild(container);
  }

  // Beim Laden der Seite Dekorationen hinzufügen
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addDecorations);
  } else {
    addDecorations();
  }
})();
