(() => {
  const note = document.getElementById('persistence-note');
  if (!note || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
  note.textContent = 'Vista local. Para guardar en el repositorio, abre el servidor del editor.';
  fetch('/api/editor/state', {cache: 'no-store'}).then(r => r.ok ? r.json() : null).then(data => {
    if (data?.mode === 'local') note.textContent = 'Edición local activa · guarda en el repositorio desde el editor.';
  }).catch(() => {});
})();
