/*
 * Interactive page-turning restaurant menu. Builds a small CSS 3D flip-book
 * from the admin-managed menu data (grouped by category) and plays a
 * synthesized "paper turn" sound on each flip — no external assets needed.
 * No-op if the page has no #menuBookPages container.
 *
 * Rendering approach: only two layers ever exist — a static "base" page
 * (always showing the current page's content) and a single reusable
 * "flip" overlay that animates over it. This avoids stacking/z-index bugs
 * that come with animating many absolutely-positioned pages at once.
 */
(function(){
  var container = document.getElementById('menuBookPages');
  if(!container) return;

  var prevBtn = document.getElementById('menuPrev');
  var nextBtn = document.getElementById('menuNext');
  var progressEl = document.getElementById('menuProgress');

  var BOOK_MOTIF_SVG = '<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<g stroke="currentColor" stroke-width="1.4"><path d="M30 20v26c0 5 3 8 7 8"/><path d="M30 20v14M36 20v14M42 20v14M30 34h12"/>' +
    '<path d="M42 20v34"/><path d="M66 20c-6 0-10 6-10 14s4 12 10 12V70"/></g></svg>';

  var CATEGORY_PALETTE = ['#8B2E2E', '#1F4D36', '#a9772f', '#5c1f1f', '#2c5b3f', '#3c6a4a'];
  function colorForCategory(name){
    var hash = 0;
    for(var i = 0; i < name.length; i++){ hash = (hash * 31 + name.charCodeAt(i)) >>> 0; }
    return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
  }

  // ---- Synthesized page-turn sound (Web Audio API, no audio file needed) ----
  var audioCtx = null;
  function playPageTurnSound(){
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if(audioCtx.state === 'suspended') audioCtx.resume();

      var duration = 0.32;
      var bufferSize = Math.floor(audioCtx.sampleRate * duration);
      var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      var data = buffer.getChannelData(0);
      for(var i = 0; i < bufferSize; i++){
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.6);
      }

      var noise = audioCtx.createBufferSource();
      noise.buffer = buffer;

      var filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2400, audioCtx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(500, audioCtx.currentTime + duration);
      filter.Q.value = 0.8;

      var gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.4, audioCtx.currentTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      noise.start();
      noise.stop(audioCtx.currentTime + duration);
    } catch(e){ /* Web Audio unavailable — flip still works, just silent */ }
  }

  function buildPages(menu, currency){
    var groups = {};
    var order = [];
    (menu || []).forEach(function(item){
      if(!groups[item.group]){ groups[item.group] = []; order.push(item.group); }
      groups[item.group].push(item);
    });

    var pagesData = [{ type: 'cover' }];
    order.forEach(function(groupName){
      pagesData.push({ type: 'category', name: groupName, items: groups[groupName] });
    });
    pagesData.push({ type: 'back' });
    return pagesData;
  }

  function pageHtml(pd, currency, formatPrice){
    if(pd.type === 'cover'){
      return '<div class="page-inner cover-face">' +
        '<div class="cover-motif">' + BOOK_MOTIF_SVG + '</div>' +
        '<p class="cover-eyebrow">Gokarna Hillside Resort</p>' +
        '<h3 class="cover-title">The Chautari<br>Menu</h3>' +
        '<p class="cover-hint">Tap or use the arrows to open</p>' +
        '</div>';
    }
    if(pd.type === 'back'){
      return '<div class="page-inner cover-face">' +
        '<div class="cover-motif">' + BOOK_MOTIF_SVG + '</div>' +
        '<p class="cover-hint">Prices are in ' + currency + ' and may attract applicable taxes.</p>' +
        '<p class="cover-hint">Ask your server about seasonal specials and dietary options.</p>' +
        '</div>';
    }
    var color = colorForCategory(pd.name);
    var itemsHtml = pd.items.map(function(item){
      var thumb = item.image
        ? '<span class="item-thumb" style="background-image:url(' + item.image + ')"></span>'
        : '';
      return '<li class="menu-page-item">' + thumb +
        '<span class="name">' + item.name + '</span>' +
        '<span class="dots"></span><span class="price">' + formatPrice(item.price) + '</span></li>';
    }).join('');
    return '<div class="page-inner" style="--cat-color:' + color + '">' +
      '<div class="page-head"><span class="cat-badge">' + pd.name.charAt(0).toUpperCase() + '</span><h4>' + pd.name + '</h4></div>' +
      '<ul class="menu-page-list">' + itemsHtml + '</ul>' +
      '<p class="page-foot">Gokarna Hillside Resort &middot; The Chautari Restaurant</p>' +
      '</div>';
  }

  function render(data){
    var pagesData = buildPages(data.menu, data.currency);
    var currency = data.currency || '';
    var formatPrice = window.formatPrice || function(n){ return currency + ' ' + Math.round(n).toLocaleString('en-US'); };

    container.innerHTML =
      '<div class="page-base" id="menuPageBase"></div>' +
      '<div class="page-flip" id="menuPageFlip"></div>' +
      '<button type="button" class="turn-zone left" id="menuZoneLeft" aria-label="Previous page"></button>' +
      '<button type="button" class="turn-zone right" id="menuZoneRight" aria-label="Next page"></button>';

    var base = document.getElementById('menuPageBase');
    var flip = document.getElementById('menuPageFlip');
    var zoneLeft = document.getElementById('menuZoneLeft');
    var zoneRight = document.getElementById('menuZoneRight');

    var current = 0;
    var animating = false;
    var TRANSITION_MS = 850;

    function setBase(index){ base.innerHTML = pageHtml(pagesData[index], currency, formatPrice); }

    function updateControls(){
      if(progressEl) progressEl.textContent = (current + 1) + ' / ' + pagesData.length;
      if(prevBtn) prevBtn.disabled = animating || current === 0;
      if(nextBtn) nextBtn.disabled = animating || current === pagesData.length - 1;
      zoneLeft.style.visibility = (current === 0) ? 'hidden' : 'visible';
      zoneRight.style.visibility = (current === pagesData.length - 1) ? 'hidden' : 'visible';
    }

    function afterTransition(el, cb){
      var done = false;
      function finish(){
        if(done) return;
        done = true;
        el.removeEventListener('transitionend', finish);
        cb();
      }
      el.addEventListener('transitionend', finish);
      setTimeout(finish, TRANSITION_MS + 150);
    }

    function goNext(){
      if(animating || current >= pagesData.length - 1) return;
      animating = true;
      updateControls();

      flip.innerHTML = pageHtml(pagesData[current], currency, formatPrice); // page turning away
      flip.style.transition = 'none';
      flip.style.transform = 'rotateY(0deg)';
      flip.style.visibility = 'visible';
      void flip.offsetWidth; // force layout so the reset above is applied before animating

      setBase(current + 1); // safe: hidden beneath the flip layer until it passes ~90deg
      current++;
      playPageTurnSound();

      requestAnimationFrame(function(){
        flip.style.transition = '';
        flip.style.transform = 'rotateY(-178deg)';
      });

      afterTransition(flip, function(){
        flip.style.visibility = 'hidden';
        animating = false;
        updateControls();
      });
    }

    function goPrev(){
      if(animating || current <= 0) return;
      animating = true;
      updateControls();

      current--;
      flip.innerHTML = pageHtml(pagesData[current], currency, formatPrice); // page being revealed
      flip.style.transition = 'none';
      flip.style.transform = 'rotateY(-178deg)';
      flip.style.visibility = 'visible';
      void flip.offsetWidth;

      playPageTurnSound();

      requestAnimationFrame(function(){
        flip.style.transition = '';
        flip.style.transform = 'rotateY(0deg)';
      });

      afterTransition(flip, function(){
        setBase(current); // swap once the flip layer is fully covering it again
        flip.style.visibility = 'hidden';
        animating = false;
        updateControls();
      });
    }

    setBase(0);
    updateControls();

    if(nextBtn) nextBtn.addEventListener('click', goNext);
    if(prevBtn) prevBtn.addEventListener('click', goPrev);
    zoneRight.addEventListener('click', goNext);
    zoneLeft.addEventListener('click', goPrev);

    var bookWrap = container.closest('.menu-book');
    if(bookWrap){
      bookWrap.setAttribute('tabindex', '0');
      bookWrap.addEventListener('keydown', function(e){
        if(e.key === 'ArrowRight') goNext();
        if(e.key === 'ArrowLeft') goPrev();
      });
    }
  }

  function renderError(){
    container.innerHTML =
      '<div class="page-inner cover-face">' +
      '<div class="cover-motif">' + BOOK_MOTIF_SVG + '</div>' +
      '<p class="cover-eyebrow">The Chautari Menu</p>' +
      '<p class="cover-hint">The menu couldn\'t load right now.</p>' +
      '<button type="button" class="book-arrow" id="menuRetryBtn" style="width:auto;height:auto;padding:.6rem 1.2rem;border-radius:999px;font-size:.8rem;">Retry</button>' +
      '</div>';
    if(prevBtn) prevBtn.disabled = true;
    if(nextBtn) nextBtn.disabled = true;
    if(progressEl) progressEl.textContent = '';
    var retryBtn = document.getElementById('menuRetryBtn');
    if(retryBtn) retryBtn.addEventListener('click', function(){
      fetch('/api/content').then(function(res){
        if(!res.ok) throw new Error('unavailable');
        return res.json();
      }).then(function(data){
        document.dispatchEvent(new CustomEvent('sitecontent:loaded', { detail: data }));
      }).catch(renderError);
    });
  }

  document.addEventListener('sitecontent:loaded', function(e){ render(e.detail || {}); });
  document.addEventListener('sitecontent:error', renderError);
})();
