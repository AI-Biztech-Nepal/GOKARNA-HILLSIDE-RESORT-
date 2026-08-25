(function(){
  var state = { content: null, csrf: window.ADMIN_CSRF_TOKEN };

  function api(path, opts){
    opts = opts || {};
    var method = opts.method || 'GET';
    var headers = {};
    var body;
    if(opts.isForm){
      body = opts.body;
    } else if(opts.body !== undefined){
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    if(method !== 'GET') headers['X-CSRF-Token'] = state.csrf;
    return fetch(path, { method: method, headers: headers, body: body }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(data){
        if(!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
        return data;
      });
    });
  }

  var statusBanner = document.getElementById('statusBanner');
  var statusTimer = null;
  function showStatus(message, ok){
    statusBanner.textContent = message;
    statusBanner.className = 'status-banner ' + (ok ? 'ok' : 'error');
    statusBanner.hidden = false;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function(){ statusBanner.hidden = true; }, 4000);
  }

  function genId(prefix){
    return prefix + '-' + Math.random().toString(36).slice(2, 8);
  }

  // ---- Tabs ----
  document.querySelectorAll('.tab-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
      btn.classList.add('active');
      document.querySelector('.tab-panel[data-panel="' + btn.getAttribute('data-tab') + '"]').classList.add('active');
    });
  });

  // ---- Image picker (generic) ----
  function wireImagePicker(root, obj, field){
    var preview = root.querySelector('.image-preview');
    var input = root.querySelector('input[type=file]');
    var clearBtn = root.querySelector('[data-clear-image]');
    if(!preview || !input || !clearBtn){
      console.error('wireImagePicker: expected markup missing on', root);
      return;
    }

    function refresh(){
      if(obj[field]){
        preview.innerHTML = '';
        var img = document.createElement('img');
        img.src = obj[field];
        preview.appendChild(img);
      } else {
        preview.textContent = 'No photo';
      }
    }
    refresh();

    input.addEventListener('change', function(){
      var file = input.files[0];
      if(!file) return;
      var fd = new FormData();
      fd.append('image', file);
      preview.textContent = 'Uploading…';
      api('/api/admin/upload', { method: 'POST', body: fd, isForm: true }).then(function(res){
        obj[field] = res.url;
        refresh();
      }).catch(function(err){
        showStatus(err.message, false);
        refresh();
      });
    });

    clearBtn.addEventListener('click', function(){
      obj[field] = null;
      input.value = '';
      refresh();
    });
  }

  function bindField(root, selector, obj, field, opts){
    opts = opts || {};
    var el = root.querySelector(selector);
    if(!el) return;
    if(opts.list){
      el.value = (obj[field] || []).join(', ');
      el.addEventListener('input', function(){
        obj[field] = el.value.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
      });
    } else if(opts.number){
      el.value = obj[field] !== undefined && obj[field] !== null ? obj[field] : '';
      el.addEventListener('input', function(){
        obj[field] = parseFloat(el.value) || 0;
      });
    } else {
      el.value = obj[field] || '';
      el.addEventListener('input', function(){
        obj[field] = el.value;
      });
    }
  }

  // ---- Hero & Contact ----
  var heroImagesList = document.getElementById('heroImagesList');
  var heroImageTemplate = document.getElementById('heroImageRowTemplate');

  function syncHeroImagesFromDOM(){
    state.content.hero.images = Array.prototype.map.call(
      heroImagesList.querySelectorAll('[data-hero-image-row]'),
      function(row){ return row.getAttribute('data-url'); }
    );
  }

  function appendHeroImageRow(url){
    var row = heroImageTemplate.content.firstElementChild.cloneNode(true);
    row.setAttribute('data-url', url);
    var img = document.createElement('img');
    img.src = url;
    row.querySelector('.image-preview').appendChild(img);

    row.querySelector('[data-move="-1"]').addEventListener('click', function(){
      var prev = row.previousElementSibling;
      if(prev) heroImagesList.insertBefore(row, prev);
      syncHeroImagesFromDOM();
    });
    row.querySelector('[data-move="1"]').addEventListener('click', function(){
      var next = row.nextElementSibling;
      if(next) heroImagesList.insertBefore(next, row);
      syncHeroImagesFromDOM();
    });
    row.querySelector('[data-remove-row]').addEventListener('click', function(){
      row.remove();
      syncHeroImagesFromDOM();
    });

    heroImagesList.appendChild(row);
  }

  function renderHeroImages(){
    heroImagesList.innerHTML = '';
    (state.content.hero.images || []).forEach(appendHeroImageRow);
  }

  document.getElementById('heroImageAddInput').addEventListener('change', function(e){
    var file = e.target.files[0];
    if(!file) return;
    api('/api/admin/upload', { method: 'POST', body: (function(){ var fd = new FormData(); fd.append('image', file); return fd; })(), isForm: true })
      .then(function(res){
        appendHeroImageRow(res.url);
        syncHeroImagesFromDOM();
        e.target.value = '';
      }).catch(function(err){ showStatus(err.message, false); });
  });

  function renderHero(){
    var c = state.content;
    bindField(document, '#heroEyebrow', c.hero, 'eyebrow');
    bindField(document, '#heroTitleLine1', c.hero, 'title_line1');
    bindField(document, '#heroTitleEmphasis', c.hero, 'title_emphasis');
    bindField(document, '#heroSubtitle', c.hero, 'subtitle');
    bindField(document, '#contactAddress', c.contact, 'address');
    bindField(document, '#contactEmail', c.contact, 'email');
    bindField(document, '#contactPhone', c.contact, 'phone');
    if(!c.hero.images) c.hero.images = [];
    renderHeroImages();
  }

  // ---- Rooms ----
  var roomsList = document.getElementById('roomsList');
  var roomTemplate = document.getElementById('roomRowTemplate');

  function appendRoomRow(room){
    var row = roomTemplate.content.firstElementChild.cloneNode(true);
    bindField(row, '[data-field="name"]', room, 'name');
    bindField(row, '[data-field="tag"]', room, 'tag');
    bindField(row, '[data-field="rate"]', room, 'rate', { number: true });
    bindField(row, '[data-field="description"]', room, 'description');
    bindField(row, '[data-field="amenities"]', room, 'amenities', { list: true });
    wireImagePicker(row, room, 'image');
    row.querySelector('[data-remove-row]').addEventListener('click', function(){
      var idx = state.content.rooms.indexOf(room);
      if(idx > -1) state.content.rooms.splice(idx, 1);
      row.remove();
    });
    roomsList.appendChild(row);
  }

  function renderRooms(){
    roomsList.innerHTML = '';
    state.content.rooms.forEach(appendRoomRow);
    document.getElementById('taxRate').value = (state.content.tax_rate * 100).toFixed(2);
  }

  document.getElementById('addRoomBtn').addEventListener('click', function(){
    var room = { id: genId('room'), name: 'New Room', tag: '', rate: 0, description: '', amenities: [], image: null };
    state.content.rooms.push(room);
    appendRoomRow(room);
  });

  document.getElementById('taxRate').addEventListener('input', function(e){
    var pct = parseFloat(e.target.value);
    state.content.tax_rate = isNaN(pct) ? 0 : Math.min(100, Math.max(0, pct)) / 100;
  });

  // ---- Add-ons ----
  var addonsList = document.getElementById('addonsList');
  var addonTemplate = document.getElementById('addonRowTemplate');

  function appendAddonRow(addon){
    var row = addonTemplate.content.firstElementChild.cloneNode(true);
    bindField(row, '[data-field="name"]', addon, 'name');
    bindField(row, '[data-field="rate"]', addon, 'rate', { number: true });
    bindField(row, '[data-field="unit"]', addon, 'unit');
    row.querySelector('[data-remove-row]').addEventListener('click', function(){
      var idx = state.content.addons.indexOf(addon);
      if(idx > -1) state.content.addons.splice(idx, 1);
      row.remove();
    });
    addonsList.appendChild(row);
  }

  function renderAddons(){
    addonsList.innerHTML = '';
    state.content.addons.forEach(appendAddonRow);
  }

  document.getElementById('addAddonBtn').addEventListener('click', function(){
    var addon = { id: genId('addon'), name: 'New Add-on', rate: 0, unit: 'one-time' };
    state.content.addons.push(addon);
    appendAddonRow(addon);
  });

  // ---- Menu ----
  var menuList = document.getElementById('menuList');
  var menuTemplate = document.getElementById('menuRowTemplate');

  function appendMenuRow(item){
    var row = menuTemplate.content.firstElementChild.cloneNode(true);
    bindField(row, '[data-field="name"]', item, 'name');
    bindField(row, '[data-field="price"]', item, 'price', { number: true });
    bindField(row, '[data-field="group"]', item, 'group');
    wireImagePicker(row, item, 'image');
    row.querySelector('[data-remove-row]').addEventListener('click', function(){
      var idx = state.content.menu.indexOf(item);
      if(idx > -1) state.content.menu.splice(idx, 1);
      row.remove();
    });
    menuList.appendChild(row);
  }

  function renderMenu(){
    menuList.innerHTML = '';
    state.content.menu.forEach(appendMenuRow);
  }

  document.getElementById('addMenuBtn').addEventListener('click', function(){
    var item = { id: genId('item'), name: 'New Item', price: 0, group: 'Food', image: null };
    state.content.menu.push(item);
    appendMenuRow(item);
  });

  // ---- Gallery ----
  var galleryList = document.getElementById('galleryList');
  var galleryTemplate = document.getElementById('galleryRowTemplate');

  function renderGallery(){
    galleryList.innerHTML = '';
    state.content.gallery.forEach(function(slot){
      var row = galleryTemplate.content.firstElementChild.cloneNode(true);
      bindField(row, '[data-field="tag"]', slot, 'tag');
      wireImagePicker(row, slot, 'image');
      galleryList.appendChild(row);
    });
  }

  // ---- About & Experiences ----
  var experiencesList = document.getElementById('experiencesList');
  var experienceTemplate = document.getElementById('experienceRowTemplate');
  var EXPERIENCE_LABELS = {
    'nature-walks': 'Guided Nature Walks',
    'wellness': 'Relaxation & Wellness',
    'viewpoints': 'Scenic Viewpoints',
    'outdoor-dining': 'Outdoor Dining',
    'family-time': 'Family Time',
    'local-experiences': 'Local Experiences'
  };

  function renderAbout(){
    if(!state.content.about) state.content.about = { image: null };
    wireImagePicker(document.getElementById('aboutImagePicker'), state.content.about, 'image');

    if(!Array.isArray(state.content.experiences)) state.content.experiences = [];
    experiencesList.innerHTML = '';
    state.content.experiences.forEach(function(exp){
      var row = experienceTemplate.content.firstElementChild.cloneNode(true);
      wireImagePicker(row, exp, 'image');
      var label = row.querySelector('.exp-label');
      if(label) label.textContent = EXPERIENCE_LABELS[exp.id] || exp.id;
      experiencesList.appendChild(row);
    });
  }

  // ---- Save ----
  document.querySelectorAll('[data-save]').forEach(function(btn){
    btn.addEventListener('click', function(){
      btn.disabled = true;
      api('/api/admin/content', { method: 'PUT', body: state.content }).then(function(){
        showStatus('Saved.', true);
      }).catch(function(err){
        showStatus(err.message, false);
      }).finally(function(){ btn.disabled = false; });
    });
  });

  // ---- Account ----
  document.getElementById('changePasswordBtn').addEventListener('click', function(){
    var current = document.getElementById('currentPassword').value;
    var next = document.getElementById('newPassword').value;
    api('/api/admin/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } })
      .then(function(){
        showStatus('Password changed.', true);
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
      }).catch(function(err){ showStatus(err.message, false); });
  });

  // ---- Logout ----
  document.getElementById('logoutBtn').addEventListener('click', function(){
    api('/api/admin/logout', { method: 'POST' }).finally(function(){
      window.location.href = '/admin/login';
    });
  });

  // ---- Init ----
  function showLoadError(message){
    clearTimeout(statusTimer);
    statusBanner.innerHTML = message + ' &nbsp; <button type="button" id="retryLoadBtn" class="btn-ghost btn-xs">Retry</button>';
    statusBanner.className = 'status-banner error';
    statusBanner.hidden = false;
    document.getElementById('retryLoadBtn').addEventListener('click', loadContent);
  }

  function loadContent(){
    api('/api/admin/content').then(function(data){
      state.content = data;
      renderHero();
      renderRooms();
      renderAddons();
      renderMenu();
      renderGallery();
      renderAbout();
      statusBanner.hidden = true;
    }).catch(function(err){
      showLoadError('Could not load site content: ' + err.message + '.');
    });
  }

  loadContent();
})();
