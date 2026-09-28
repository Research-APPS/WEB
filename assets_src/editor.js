/* Editor estático. Solo serve_local.py puede escribir en el repositorio. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const SITE = 'https://www.radiomicelio.es';
  const PARENT = 'rm:parentConcept';
  const GROUPS = {integrantes:'Integrantes', 'antiguos-integrantes':'Antiguos integrantes', personajes:'Personajes del cómic'};
  const PREFIXES = {rm:SITE+'/vocab/', schema:'https://schema.org/', rdf:'http://www.w3.org/1999/02/22-rdf-syntax-ns#', rdfs:'http://www.w3.org/2000/01/rdf-schema#', skos:'http://www.w3.org/2004/02/skos/core#', xsd:'http://www.w3.org/2001/XMLSchema#'};
  const slug = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const absolute = url => url.startsWith('/') ? SITE + url : url;
  const expand = value => { const [prefix, term] = value.split(':'); return PREFIXES[prefix] ? PREFIXES[prefix] + term : value; };
  const safeURL = value => typeof value === 'string' && (/^https?:\/\/[^\s]+$/i.test(value) || /^\/(?!\/)[^\s\\]*$/.test(value));
  let state, saved, profileId, focusId, local = false, busy = false, revision, token;
  let history = [], lastHistory = 0, visits = [], visitIndex = -1, dialogMode = 'node';
  const form = $('profile-form');
  const snapshot = () => ({format:1, profiles:clone(state.profiles), ontology:clone(state.ontology), images:clone(state.images || [])});
  const profile = () => state.profiles.find(p => p.id === profileId);
  const dirty = () => state && JSON.stringify(snapshot()) !== saved;
  function feedback(message='', error=false) { $('editor-feedback').textContent = message; $('editor-feedback').classList.toggle('error', error); }
  function status() {
    $('dirty-status').textContent = dirty() ? 'Cambios sin guardar' : 'Sin cambios';
    $('save').disabled = !local || busy || !dirty();
    $('save').textContent = busy ? 'Validando y guardando…' : 'Guardar en el repositorio';
    $('undo').disabled = !history.length || busy;
  }
  function checkpoint(force=false) {
    if (force || Date.now() - lastHistory > 700) { history.push(snapshot()); if (history.length > 40) history.shift(); }
    lastHistory = Date.now();
  }
  function mutate(action, render=true) {
    checkpoint(true); action(); feedback(); status();
    if (render) { renderProfile(); renderOntology(); }
  }
  function setTab(tab) {
    for (const name of ['profile','ontology']) {
      $('panel-'+name).hidden = name !== tab;
      $('tab-'+name).setAttribute('aria-selected', String(name === tab));
      $('tab-'+name).tabIndex = name === tab ? 0 : -1;
    }
    if (tab === 'ontology') renderOntology();
  }
  function selectProfile(id) {
    profileId = id; renderProfile(); selectNode(SITE+'/id/'+id);
    const params = new URLSearchParams(location.search); params.set('personaje', id);
    window.history.replaceState(null,'',location.pathname+'?'+params);
  }
  function renderProfile() {
    const p = profile();
    if (!p) return;
    $('profile-select').innerHTML = state.profiles.map(x => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join('');
    $('profile-select').value = p.id;
    $('view-profile').href = '/personajes/'+p.id+'/';
    for (const input of form.querySelectorAll('[name]')) {
      const [key, subkey] = input.name.split('.');
      if (input.type === 'checkbox') { input.checked = (p[key] || []).includes(input.value); continue; }
      input.value = key === 'rutas_anteriores' ? (p[key] || []).join('\n') : (subkey ? p[key]?.[subkey] : p[key]) ?? '';
    }
    $('domains-list').innerHTML = '<span>Campos de conocimiento</span>' + state.domains.map(d => `<label><input type="checkbox" name="dominios" value="${esc(d.id)}" ${(p.dominios||[]).includes(d.id)?'checked':''}> ${esc(d.label)}</label>`).join('');
    renderLinks('enlaces', 'links-list'); renderLinks('apariciones', 'appearances-list');
    renderImage(); renderMap();
  }
  function readProfile() {
    const p = profile();
    const value = name => form.elements.namedItem(name)?.value.trim() || '';
    for (const key of ['nombre','descripcion']) p[key] = value(key);
    for (const key of ['imagen','ontologia_url']) p[key] = value(key) || null;
    for (const key of ['grupos','tipos','dominios']) p[key] = [...form.querySelectorAll(`input[name="${key}"]:checked`)].map(x => x.value);
    p.rutas_anteriores = value('rutas_anteriores').split('\n').map(x=>x.trim()).filter(Boolean);
    for (const key of ['cancion','juego','tutorial']) {
      const names = key === 'juego' ? ['nombre','titulo','url','id'] : key === 'cancion' ? ['titulo','url','id'] : ['titulo','url'];
      const item = Object.fromEntries(names.map(n=>[n,value(key+'.'+n)]));
      if (key !== 'tutorial' && !item.id && item.titulo) item.id = slug(item.nombre || item.titulo);
      p[key] = Object.values(item).some(Boolean) ? item : null;
    }
    const label = value('ubicacion.nombre'), lat = value('ubicacion.lat'), lon = value('ubicacion.lon');
    p.ubicacion = label || lat || lon ? {nombre:label, lat:lat === '' ? null : Number(lat), lon:lon === '' ? null : Number(lon)} : null;
  }
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', e => {
    if (!e.target.name) return;
    checkpoint(); readProfile(); status();
    if (e.target.name === 'imagen') renderImage();
  });
  form.addEventListener('change', e => {
    if (!e.target.name) return;
    readProfile(); status();
    if (e.target.name.startsWith('ubicacion')) renderMap();
  });
  function renderLinks(key, id) {
    const container = $(id); container.replaceChildren();
    profile()[key].forEach((item, index) => {
      const row = document.createElement('div'); row.className = 'link-row';
      row.innerHTML = `<label>Título <input value="${esc(item.titulo)}" data-link="titulo"></label><label>URL <input value="${esc(item.url)}" data-link="url"></label><button type="button" aria-label="Quitar ${key==='enlaces'?'enlace':'aparición'} ${index+1}">×</button>`;
      row.addEventListener('input', e => { if (!e.target.dataset.link) return; checkpoint(); item[e.target.dataset.link] = e.target.value; status(); });
      row.querySelector('button').onclick = () => mutate(()=>profile()[key].splice(index,1));
      container.append(row);
    });
  }
  document.querySelectorAll('[data-add-list]').forEach(button => { button.onclick = () => mutate(()=>profile()[button.dataset.addList].push({titulo:'',url:''})); });
  function imageSrc(path) {
    const pending = state.images.find(x => '/assets/img/uploads/'+x.name === path);
    return pending ? `data:image/${pending.name.endsWith('.jpg')?'jpeg':pending.name.split('.').pop()};base64,${pending.data}` : path;
  }
  function renderImage() {
    const path = profile().imagen;
    $('image-preview').hidden = !path || !safeURL(path);
    if (path && safeURL(path)) $('image-preview').src = imageSrc(path);
  }
  $('image-upload').onchange = async e => {
    const targetProfile = profile();
    const file = e.target.files[0]; if (!file) return;
    const extension = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[file.type];
    if (!extension || file.size > 5*1024*1024) return feedback('Usa PNG, JPG, WebP o GIF de hasta 5 MB.',true);
    const data = await new Promise((resolve,reject)=>{ const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file); });
    const name = crypto.randomUUID()+'.'+extension;
    mutate(()=>{state.images.push({name,data});targetProfile.imagen='/assets/img/uploads/'+name;});
    e.target.value='';
  };
  function renderMap() {
    const loc=profile().ubicacion, container=$('map-preview'); container.replaceChildren();
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon) || Math.abs(loc.lat)>90 || Math.abs(loc.lon)>180) { container.textContent='Ubicación pendiente. Añade las coordenadas para ver el mapa.'; return; }
    const q=new URLSearchParams({bbox:[Math.max(-180,loc.lon-.025),Math.max(-90,loc.lat-.018),Math.min(180,loc.lon+.025),Math.min(90,loc.lat+.018)].join(','),layer:'mapnik',marker:loc.lat+','+loc.lon});
    const iframe=document.createElement('iframe');iframe.title='Vista previa de la ubicación en OpenStreetMap';iframe.loading='lazy';iframe.src='https://www.openstreetmap.org/export/embed.html?'+q;container.append(iframe);
    const credit=document.createElement('a');credit.href='https://www.openstreetmap.org/copyright';credit.textContent='© OpenStreetMap contributors';container.append(credit);
  }
  $('read-osm').onclick=()=>{
    try {
      const url=new URL($('osm-url').value); if (!['www.openstreetmap.org','openstreetmap.org'].includes(url.hostname)) throw Error('Usa un enlace de OpenStreetMap.');
      const hash=url.hash.match(/map=[\d.]+\/(-?[\d.]+)\/(-?[\d.]+)/);
      const lat=Number(url.searchParams.get('mlat') ?? hash?.[1] ?? NaN), lon=Number(url.searchParams.get('mlon') ?? hash?.[2] ?? NaN);
      if (!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180) throw Error('El enlace debe incluir #map=zoom/latitud/longitud o mlat y mlon.');
      mutate(()=>{profile().ubicacion={nombre:profile().ubicacion?.nombre || 'Ubicación actual',lat,lon};});
    } catch(e) {feedback(e.message,true);}
  };
  $('clear-location').onclick=()=>mutate(()=>{profile().ubicacion=null;});

  function catalog() {
    const byId=new Map(state.catalog.filter(n=>!n['@id'].includes('/id/game/')&&!n['@id'].includes('/id/song/')&&!n['@id'].endsWith('#game')).map(n=>[n['@id'],clone(n)]));
    const ref=id=>({'@id':absolute(id)}), groupPath=g=>g==='personajes'?'/comic/personajes/':'/banda/'+g+'/';
    for(const p of state.profiles) {
      const id=SITE+'/id/'+p.id, node=byId.get(id)||{'@id':id};
      const types=p.tipos.includes('personaje')?['rm:Character']:[];
      if(p.tipos.includes('persona')||p.grupos.some(g=>g!=='personajes'))types.push('Person');
      Object.assign(node,{name:p.nombre,description:p.descripcion,'@type':types,url:SITE+'/personajes/'+p.id+'/',mainEntityOfPage:ref('/personajes/'+p.id+'/'),subjectOf:ref('/personajes/'+p.id+'/ontologia/')});
      for(const key of ['image','memberOf','rm:formerMemberOf','knowsAbout','rm:game','rm:themeSong','rm:inBranch','rm:inGroup','rm:appearsIn','rm:tutorial','rm:currentLocation','rm:relatedLink','rm:externalOntology']) delete node[key];
      if(p.imagen)node.image=absolute(p.imagen);
      node['rm:inBranch']=[...new Set(p.grupos.map(g=>g==='personajes'?'comic':'banda'))].map(b=>ref('/id/'+b));
      node['rm:inGroup']=p.grupos.map(g=>ref(groupPath(g)));
      if(p.grupos.includes('integrantes')) node.memberOf={'@id':SITE+'/id/banda'};
      if(p.grupos.includes('antiguos-integrantes')) node['rm:formerMemberOf']={'@id':SITE+'/id/banda'};
      const appearances=p.grupos.includes('personajes')?[ref('/id/comic')]:[];
      appearances.push(...p.apariciones.map(x=>({...ref(x.url),'@type':'CreativeWork',name:x.titulo,url:absolute(x.url)})));
      if(appearances.length)node['rm:appearsIn']=appearances;
      if(p.dominios.length)node.knowsAbout=p.dominios.map(id=>ref('/id/'+id));
      if(p.tutorial)node['rm:tutorial']={...ref(p.tutorial.url),'@type':'LearningResource',name:p.tutorial.titulo,url:absolute(p.tutorial.url)};
      if(p.ubicacion){const l=p.ubicacion;node['rm:currentLocation']={'@type':'Place',name:l.nombre,hasMap:`https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lon}#map=14/${l.lat}/${l.lon}`,geo:{'@type':'GeoCoordinates',latitude:l.lat,longitude:l.lon}};}
      if(p.enlaces.length)node['rm:relatedLink']=p.enlaces.map(x=>({'@type':'WebPage',name:x.titulo,url:absolute(x.url)}));
      if(p.ontologia_url)node['rm:externalOntology']=ref(p.ontologia_url);
      for(const [key,kind,pred] of [['juego','game','rm:game'],['cancion','song','rm:themeSong']]) if(p[key]) {
        const item=p[key],uri=SITE+'/id/'+kind+'/'+item.id;node[pred]={'@id':uri};
        const resource={'@id':uri,name:item.nombre||item.titulo,'@type':key==='juego'?'Game':'MusicRecording'};
        if(key==='juego'){const implementation=absolute(item.url)+'#game';resource.workExample=ref(implementation);byId.set(implementation,{...ref(implementation),'@type':['VideoGame','WebApplication'],name:item.titulo,url:absolute(item.url),exampleOfWork:ref(uri)});}
        else resource.url=absolute(item.url);
        byId.set(uri,resource);
      }
      byId.set(id,node);
      const pageId=SITE+'/personajes/'+p.id+'/';byId.set(pageId,{'@id':pageId,'@type':'ProfilePage',name:p.nombre,url:pageId,mainEntity:ref(id),isPartOf:p.grupos.map(g=>ref(groupPath(g)))});
    }
    for(const group of Object.keys(GROUPS)){const node=byId.get(SITE+groupPath(group));if(node)node.hasPart=state.profiles.filter(p=>p.grupos.includes(group)).map(p=>ref('/personajes/'+p.id+'/'));}
    const band=byId.get(SITE+'/id/banda'),comic=byId.get(SITE+'/id/comic');
    if(band){band.member=state.profiles.filter(p=>p.grupos.includes('integrantes')).map(p=>ref('/id/'+p.id));band['rm:formerMember']=state.profiles.filter(p=>p.grupos.includes('antiguos-integrantes')).map(p=>ref('/id/'+p.id));}
    if(comic)comic.character=state.profiles.filter(p=>p.grupos.includes('personajes')).map(p=>ref('/id/'+p.id));
    for(const n of state.ontology.nodes) byId.set(n.id,{'@id':n.id,name:n.label,description:n.description,'@type':n.type,custom:true});
    return byId;
  }
  function visibleNodes() {return [...catalog().values()].filter(n=>n['@id'].includes('/id/')).sort((a,b)=>String(a.name).localeCompare(String(b.name),'es'));}
  function nodeLabel(id) {return catalog().get(id)?.name || id.split('/').pop();}
  function allConnections() {
    const nodes=catalog(), out=[];
    for(const node of nodes.values()) for(const [predicate,value] of Object.entries(node)) {
      if(predicate==='@id'||!node['@id'].includes('/id/')) continue;
      for(const v of Array.isArray(value)?value:[value]) if(v && typeof v==='object' && nodes.has(v['@id']) && v['@id'].includes('/id/'))
        out.push({source:node['@id'],target:v['@id'],predicate,managed:true});
    }
    return out.concat(state.ontology.relations.map((r,index)=>({...r,index,managed:false})));
  }
  function selectNode(id, record=true) {
    if(!catalog().has(id)) return;
    focusId=id;
    if(record && visits[visitIndex]!==id) {visits=visits.slice(0,visitIndex+1);visits.push(id);visitIndex=visits.length-1;}
    renderOntology();
  }
  function renderOntology() {
    if(!state) return;
    const nodes=catalog(); if(!nodes.has(focusId)) focusId=SITE+'/id/'+profileId;
    const node=nodes.get(focusId), query=$('node-search').value.toLowerCase();
    $('node-list').innerHTML=visibleNodes().filter(n=>(n.name+' '+n['@id']).toLowerCase().includes(query)).map(n=>`<button type="button" data-node="${esc(n['@id'])}" aria-pressed="${n['@id']===focusId}">${esc(n.name)}<small>${esc(Array.isArray(n['@type'])?n['@type'].join(' · '):n['@type'])}</small></button>`).join('');
    $('node-title').textContent=node.name;$('node-id').textContent=focusId;
    $('node-back').disabled=visitIndex<=0;$('node-forward').disabled=visitIndex>=visits.length-1;
    const custom=state.ontology.nodes.find(n=>n.id===focusId), p=state.profiles.find(p=>SITE+'/id/'+p.id===focusId);
    $('edit-node').hidden=!custom;$('delete-node').hidden=!custom;
    $('base-node').textContent=JSON.stringify(node,null,2);
    $('inspector-fields').innerHTML=(p?.imagen && safeURL(p.imagen)?`<img class="inspector-image" src="${esc(imageSrc(p.imagen))}" alt="">`:'')+
      (custom||p?`<label>Nombre <input data-focus-field="name" value="${esc(node.name)}"></label><label>Descripción <textarea data-focus-field="description" rows="3">${esc(node.description||'')}</textarea></label>`:`<p class="editor-hint">${esc(node.description||'Entidad del proyecto')}</p>`)+
      (p?`<button type="button" data-edit-profile="${esc(p.id)}">Editar todos los campos de la ficha →</button>`:'');
    $('relation-target').innerHTML=visibleNodes().filter(n=>n['@id']!==focusId).map(n=>`<option value="${esc(n['@id'])}">${esc(n.name)}</option>`).join('');
    const connected=allConnections().filter(r=>r.source===focusId||r.target===focusId);
    renderGraph(node,connected);renderConnections(connected);renderProperties();
  }
  function renderGraph(node, relations) {
    const adjacent=[...new Set(relations.map(r=>r.source===focusId?r.target:r.source))].filter(id=>id!==focusId);
    const shown=adjacent.slice(0,14), positions=new Map([[focusId,[250,260]]]);
    shown.forEach((id,i)=>{const a=2*Math.PI*i/Math.max(1,shown.length)-Math.PI/2;positions.set(id,[250+170*Math.cos(a),260+200*Math.sin(a)]);});
    const lines=relations.filter(r=>positions.has(r.source)&&positions.has(r.target)).map(r=>{const a=positions.get(r.source),b=positions.get(r.target);return `<path d="M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}" stroke="${r.managed?'#555360':'#b85d73'}" stroke-width="1.5"><title>${esc(r.predicate)}</title></path>`;}).join('');
    const boxes=[...positions].map(([id,[x,y]])=>{const center=id===focusId,label=String(nodeLabel(id));return `<g role="button" tabindex="0" aria-label="Explorar ${esc(label)}" data-node="${esc(id)}"><rect x="${x-74}" y="${y-23}" width="148" height="46" rx="8" fill="${center?'#562c3b':'#22212a'}" stroke="${center?'#e6819d':'#5c5869'}"/><text x="${x}" y="${y+5}" text-anchor="middle" fill="#f3edf4" font-family="sans-serif" font-size="15">${esc(label.length>17?label.slice(0,16)+'…':label)}</text><title>${esc(label)}</title></g>`;}).join('');
    $('node-graph').innerHTML=`<svg viewBox="0 0 500 520" role="group" aria-label="Grafo alrededor de ${esc(node.name)}">${lines}${boxes}</svg>`;
    $('graph-stats').textContent=`${relations.length} conexiones · ${shown.length+1} nodos visibles`+(adjacent.length>14?' · resto en el panel':'');
  }
  const relLabel=pred=>({[PARENT]:'Padre conceptual','rm:relatedTo':'Relacionado con',memberOf:'Miembro de','rm:formerMemberOf':'Antiguo integrante de',knowsAbout:'Conoce','rm:game':'Juego','rm:themeSong':'Canción','rm:appearsIn':'Aparece en',member:'Integrantes',character:'Personajes'}[pred]||pred);
  function renderConnections(rows) {
    const sections=new Map();
    for(const r of rows) {const outgoing=r.source===focusId;const label=r.predicate===PARENT?(outgoing?'Padres conceptuales':'Hijos conceptuales'):(outgoing?'Salientes · ':'Entrantes · ')+relLabel(r.predicate);if(!sections.has(label))sections.set(label,[]);sections.get(label).push({...r,other:outgoing?r.target:r.source});}
    $('node-connections').innerHTML=[...sections].sort((a,b)=>Number(a[1].every(r=>r.managed))-Number(b[1].every(r=>r.managed))).map(([label,items])=>`<details ${items.some(r=>!r.managed)?'open':''}><summary>${esc(label)} (${items.length})</summary>${items.map(r=>`<div class="connection-row"><button type="button" class="explore-node" data-node="${esc(r.other)}">${esc(nodeLabel(r.other))} ↗</button>${r.managed?'<small class="editor-hint">Ficha</small>':`<button type="button" data-delete-relation="${r.index}" aria-label="Quitar relación con ${esc(nodeLabel(r.other))}">×</button>`}</div>`).join('')}</details>`).join('') || '<p class="editor-hint">Sin conexiones. Añade un padre, un hijo o una relación.</p>';
  }
  function renderProperties() {
    $('node-properties').innerHTML=state.ontology.properties.map((p,index)=>p.node!==focusId?'':`<div class="property-row"><strong>${esc(p.predicate)}</strong><small>${esc(p.type)}</small><input aria-label="Valor de ${esc(p.predicate)}" data-property-index="${index}" value="${esc(p.value)}"><button type="button" data-delete-property="${index}" aria-label="Quitar propiedad ${esc(p.predicate)}">×</button></div>`).join('');
  }
  function valueFor(type, raw) {
    if(type==='number') {if(raw.trim()===''||!Number.isFinite(Number(raw)))throw Error('Introduce un número válido.');return Number(raw);}
    if(type==='boolean') {if(['sí','si','true','1'].includes(raw.toLowerCase()))return true;if(['no','false','0'].includes(raw.toLowerCase()))return false;throw Error('Escribe sí o no para una propiedad booleana.');}
    if(type==='url'&&!/^https?:\/\/[^\s]+$/i.test(raw))throw Error('Introduce una URL http:// o https://.');return raw;
  }
  function validTerm(term) {return /^(rm|schema|rdf|rdfs|skos|xsd):[A-Za-z_][A-Za-z0-9_-]*$/.test(term)||/^https?:\/\/[^\s]+$/.test(term);}
  function addRelation(source,predicate,target) {
    if(!validTerm(predicate))throw Error('Usa un predicado como rm:inspiradoPor o una URI completa.');
    if(state.ontology.relations.some(r=>r.source===source&&expand(r.predicate)===expand(predicate)&&r.target===target))throw Error('Esta relación ya existe.');
    if(expand(predicate)===expand(PARENT)) {
      const seen=new Set(), stack=[target];
      while(stack.length) {const id=stack.pop();if(id===source)throw Error('Ese padre crearía un ciclo en la jerarquía.');if(seen.has(id))continue;seen.add(id);for(const r of state.ontology.relations)if(r.source===id&&expand(r.predicate)===expand(PARENT))stack.push(r.target);}
    }
    state.ontology.relations.push({source,predicate,target});
  }
  function openNodeDialog(mode) {
    dialogMode=mode;const node=state.ontology.nodes.find(n=>n.id===focusId);
    $('node-dialog-title').textContent={parent:'Añadir padre conceptual',child:'Añadir hijo conceptual',node:'Nuevo nodo',edit:'Editar nodo'}[mode];
    $('new-node-label').value=mode==='edit'?node.label:'';$('new-node-description').value=mode==='edit'?node.description:'';$('new-node-type').value=mode==='edit'?node.type:'skos:Concept';
    $('new-node-id').textContent=mode==='edit'?node.id:'Su identidad se conservará aunque cambies el nombre.';
    $('node-dialog').showModal();$('new-node-label').focus();
  }
  $('node-form').onsubmit=e=>{
    e.preventDefault();const label=$('new-node-label').value.trim();if(!label)return;
    const type=$('new-node-type').value,description=$('new-node-description').value;
    if(dialogMode==='edit') mutate(()=>Object.assign(state.ontology.nodes.find(n=>n.id===focusId),{label,type,description}));
    else {
      const base=SITE+'/id/concepto/'+(slug(label)||'concepto');let id=base,index=2;while(catalog().has(id))id=base+'-'+index++;
      mutate(()=>{state.ontology.nodes.push({id,label,type,description});if(dialogMode==='parent')addRelation(focusId,PARENT,id);if(dialogMode==='child')addRelation(id,PARENT,focusId);});
      if(dialogMode==='node')selectNode(id);
    }
    $('node-dialog').close();
  };
  $('cancel-node').onclick=()=>$('node-dialog').close();
  $('new-node').onclick=()=>openNodeDialog('node');$('add-parent').onclick=()=>openNodeDialog('parent');$('add-child').onclick=()=>openNodeDialog('child');$('edit-node').onclick=()=>openNodeDialog('edit');
  $('delete-node').onclick=()=>{
    if(!confirm('¿Eliminar este nodo y sus conexiones del borrador? Puedes deshacer antes de guardar.'))return;
    mutate(()=>{state.ontology.nodes=state.ontology.nodes.filter(n=>n.id!==focusId);state.ontology.relations=state.ontology.relations.filter(r=>r.source!==focusId&&r.target!==focusId);state.ontology.properties=state.ontology.properties.filter(p=>p.node!==focusId);focusId=SITE+'/id/'+profileId;});
  };
  $('relation-form').onsubmit=e=>{e.preventDefault();try{checkpoint(true);addRelation(focusId,$('relation-predicate').value.trim(),$('relation-target').value);status();renderOntology();feedback();}catch(error){feedback(error.message,true);}};
  $('property-form').onsubmit=e=>{e.preventDefault();try{const predicate=$('property-predicate').value.trim();if(!validTerm(predicate))throw Error('Usa una propiedad como rm:color.');const type=$('property-type').value,value=valueFor(type,$('property-value').value);mutate(()=>state.ontology.properties.push({node:focusId,predicate,type,value}));$('property-form').reset();}catch(error){feedback(error.message,true);}};
  $('panel-ontology').addEventListener('click',e=>{
    const node=e.target.closest('[data-node]');if(node)return selectNode(node.dataset.node);
    const relation=e.target.closest('[data-delete-relation]');if(relation)return mutate(()=>state.ontology.relations.splice(Number(relation.dataset.deleteRelation),1));
    const prop=e.target.closest('[data-delete-property]');if(prop)return mutate(()=>state.ontology.properties.splice(Number(prop.dataset.deleteProperty),1));
    const p=e.target.closest('[data-edit-profile]');if(p){selectProfile(p.dataset.editProfile);setTab('profile');}
  });
  $('node-graph').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){const n=e.target.closest('[data-node]');if(n){e.preventDefault();selectNode(n.dataset.node);}}});
  $('inspector-fields').addEventListener('input',e=>{
    const field=e.target.dataset.focusField;if(!field)return;checkpoint();
    const custom=state.ontology.nodes.find(n=>n.id===focusId),p=state.profiles.find(p=>SITE+'/id/'+p.id===focusId);
    if(custom)custom[field==='name'?'label':'description']=e.target.value;
    else if(p)p[field==='name'?'nombre':'descripcion']=e.target.value;
    status();$('node-title').textContent=nodeLabel(focusId);renderGraph(catalog().get(focusId),allConnections().filter(r=>r.source===focusId||r.target===focusId));
  });
  $('node-properties').addEventListener('change',e=>{if(e.target.dataset.propertyIndex===undefined)return;try{const p=state.ontology.properties[Number(e.target.dataset.propertyIndex)],value=valueFor(p.type,e.target.value);mutate(()=>{p.value=value;});}catch(error){feedback(error.message,true);}});
  $('node-search').oninput=()=>renderOntology();$('focus-profile').onclick=()=>selectNode(SITE+'/id/'+profileId);
  $('node-back').onclick=()=>{if(visitIndex>0)selectNode(visits[--visitIndex],false);};$('node-forward').onclick=()=>{if(visitIndex<visits.length-1)selectNode(visits[++visitIndex],false);};
  $('tab-profile').onclick=()=>{renderProfile();setTab('profile');};$('tab-ontology').onclick=()=>setTab('ontology');
  document.querySelector('.editor-tabs').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const name=$('panel-profile').hidden?'profile':'ontology';setTab(name);$('tab-'+name).focus();}});
  $('profile-select').onchange=e=>selectProfile(e.target.value);
  $('new-profile').onclick=()=>{
    const name=prompt('Nombre de la nueva ficha:');if(!name?.trim())return;
    let id=slug(name);if(!id)return feedback('El nombre necesita al menos una letra o un número.',true);
    if(state.profiles.some(p=>p.id===id))return feedback('Ya existe una ficha con ese identificador.',true);
    mutate(()=>state.profiles.push({id,nombre:name.trim(),descripcion:'Descripción en preparación.',imagen:null,grupos:['personajes'],tipos:['personaje'],cancion:null,juego:null,tutorial:null,ubicacion:null,enlaces:[],apariciones:[],dominios:[],ontologia_url:null,rutas_anteriores:[]}));selectProfile(id);setTab('profile');
  };
  function download(name,data) {const blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
  $('export-data').onclick=()=>download('radiomicelio-borrador.json',snapshot());
  $('export-ontology').onclick=()=>{
    const nodes=catalog();const append=(id,predicate,value)=>{const n=nodes.get(id);const key=predicate.startsWith('schema:')?predicate.slice(7):predicate;const old=n[key];if(old===undefined)n[key]=value;else {const values=Array.isArray(old)?old:[old];if(!values.some(x=>JSON.stringify(x)===JSON.stringify(value)))n[key]=[...values,value];}};
    for(const r of state.ontology.relations){append(r.source,r.predicate,{'@id':r.target});if(expand(r.predicate)===expand(PARENT))append(r.target,'rm:childConcept',{'@id':r.source});}
    for(const p of state.ontology.properties)append(p.node,p.predicate,p.value);
    for(const pred of [PARENT,'rm:childConcept',...state.ontology.relations.map(r=>r.predicate),...state.ontology.properties.map(p=>p.predicate)]){const id=expand(pred);if(id.startsWith(PREFIXES.rm)&&!nodes.has(id))nodes.set(id,{'@id':id,'@type':'rdf:Property','rdfs:label':id.slice(PREFIXES.rm.length)});}
    const graph=[...nodes.values()].map(n=>{delete n.custom;return n;});
    download('radiomicelio-ontologia.jsonld',{'@context':{'@vocab':'https://schema.org/',...PREFIXES},'@graph':graph});
  };
  $('import-data').onchange=async e=>{
    try {const file=e.target.files[0];if(!file)return;const data=JSON.parse(await file.text());if(data.format!==1||!Array.isArray(data.profiles)||!data.ontology||!['nodes','relations','properties'].every(k=>Array.isArray(data.ontology[k])))throw Error('Selecciona un borrador exportado por este editor.');if(!data.profiles.length)throw Error('El borrador no contiene fichas.');if(dirty()&&!confirm('¿Sustituir el borrador actual por el archivo?'))return;mutate(()=>{state.profiles=data.profiles;state.ontology=data.ontology;state.images=data.images||[];profileId=state.profiles[0].id;focusId=SITE+'/id/'+profileId;});feedback('Borrador importado. Revisa los cambios y guarda en el repositorio.');}
    catch(error){feedback('No se pudo importar: '+error.message,true);}finally{e.target.value='';}
  };
  $('undo').onclick=()=>{const last=history.pop();if(!last)return;Object.assign(state,last);if(!profile())profileId=state.profiles[0].id;renderProfile();renderOntology();status();feedback('Último cambio deshecho en el borrador.');};
  $('discard').onclick=()=>{if(!dirty()||!confirm('¿Descartar todos los cambios sin guardar?'))return;Object.assign(state,JSON.parse(saved));history=[];if(!profile())profileId=state.profiles[0].id;renderProfile();renderOntology();status();feedback();};
  async function save() {
    if(!local||busy||!dirty())return;
    // Browser form constraints help before the server validates the complete graph.
    if(!$('panel-profile').hidden&&!form.reportValidity())return;
    busy=true;status();for(const id of ['panel-profile','panel-ontology'])$(id).inert=true;document.querySelector('.editor-file-actions').inert=true;document.querySelectorAll('#profile-select,#new-profile').forEach(x=>x.disabled=true);
    try {const response=await fetch('/api/editor/save',{method:'POST',headers:{'Content-Type':'application/json','X-Editor-Token':token},body:JSON.stringify({...snapshot(),revision})});const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo guardar.');state={...data,images:[]};revision=data.revision;token=data.token;saved=JSON.stringify(snapshot());history=[];feedback('Guardado en el repositorio. Fichas, ontología, imágenes y docs/ actualizados. Ya puedes revisar los cambios en GitHub Desktop.');}
    catch(error){feedback(error.message+' Tu borrador sigue aquí.',true);}
    finally{busy=false;for(const id of ['panel-profile','panel-ontology'])$(id).inert=false;document.querySelector('.editor-file-actions').inert=false;document.querySelectorAll('#profile-select,#new-profile').forEach(x=>x.disabled=false);renderProfile();renderOntology();status();}
  }
  $('save').onclick=save;
  window.addEventListener('beforeunload',e=>{if(dirty()){e.preventDefault();e.returnValue='';}});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(local)save();else feedback('En la web publicada no hay guardado. Exporta el borrador para llevarlo al editor local.');}});
  async function init() {
    try {
      if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)) {try{const response=await fetch('/api/editor/state',{cache:'no-store'});if(response.ok){const data=await response.json();if(data.mode==='local'){state=data;local=true;revision=data.revision;token=data.token;}}}catch{}}
      if(!state){const response=await fetch('/editor/data.json',{cache:'no-store'});if(!response.ok)throw Error('No se pudo cargar la instantánea del editor.');state=await response.json();}
      state.images=[];const params=new URLSearchParams(location.search);profileId=state.profiles.some(p=>p.id===params.get('personaje'))?params.get('personaje'):'sismico';saved=JSON.stringify(snapshot());
      $('editor-mode').textContent=local?'Edición local · Guardar escribe en los archivos del repositorio y regenera la web. El push lo haces tú.':'Modo de prueba · En esta web no se guardan los cambios. Se perderán al recargar; puedes exportar el borrador y abrirlo en tu editor local.';
      $('editor-mode').classList.toggle('local',local);renderProfile();selectNode(SITE+'/id/'+profileId);setTab(params.get('vista')==='ontologia'?'ontology':'profile');status();
    }catch(error){feedback(error.message,true);$('editor-mode').textContent='No se pudo abrir el editor.';}
  }
  init();
})();
