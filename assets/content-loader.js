/*
 * Pulls admin-managed content (hero copy, room details, gallery photos,
 * contact info) from /api/content and drops it into the page. Runs on every
 * page; each block below is a no-op if its elements aren't present.
 * If the API is unreachable (e.g. the site is opened as a plain static
 * file), the page simply keeps the hand-written defaults already in the HTML.
 */
(function(){
  function get(obj, path){
    return path.split('.').reduce(function(o, k){ return (o || {})[k]; }, obj);
  }

  fetch('/api/content').then(function(res){
    if(!res.ok) throw new Error('content unavailable');
    return res.json();
  }).then(function(data){
    document.querySelectorAll('[data-content]').forEach(function(el){
      var val = get(data, el.getAttribute('data-content'));
      if(val === undefined || val === null || val === '') return;
      el.textContent = val;
    });

    // Keep tel:/mailto: links pointing at whatever phone/email the admin has set.
    document.querySelectorAll('[data-content-href]').forEach(function(el){
      var path = el.getAttribute('data-content-href');
      var val = get(data, path);
      if(val === undefined || val === null || val === '') return;
      if(path === 'contact.email') el.setAttribute('href', 'mailto:' + val);
      if(path === 'contact.phone') el.setAttribute('href', 'tel:' + val.replace(/[^\d+]/g, ''));
    });

    var heroMedia = document.getElementById('heroMedia');
    var heroImages = (data.hero && Array.isArray(data.hero.images)) ? data.hero.images.filter(Boolean) : [];
    if(heroMedia && heroImages.length){
      var slides = heroImages.map(function(url){
        var img = document.createElement('img');
        img.className = 'hero-slide';
        img.alt = 'Gokarna Hillside Resort';
        img.src = url;
        heroMedia.appendChild(img);
        return img;
      });
      slides[0].onload = function(){ slides[0].classList.add('is-active'); };
      if(slides[0].complete && slides[0].naturalWidth) slides[0].classList.add('is-active');

      if(slides.length > 1){
        var activeIndex = 0;
        setInterval(function(){
          slides[activeIndex].classList.remove('is-active');
          activeIndex = (activeIndex + 1) % slides.length;
          slides[activeIndex].classList.add('is-active');
        }, 6000);
      }
    }

    (data.rooms || []).forEach(function(room){
      var card = document.querySelector('.room-card[data-room-id="' + room.id + '"]');
      if(!card) return;
      var name = card.querySelector('h3');
      if(name && room.name) name.textContent = room.name;
      var amt = card.querySelector('.room-price .amt');
      if(amt && data.currency && room.rate !== undefined){
        amt.textContent = data.currency + ' ' + Number(room.rate).toLocaleString('en-US');
      }
      var desc = card.querySelector('.desc');
      if(desc && room.description) desc.textContent = room.description;
      var tag = card.querySelector('.plate-tag');
      if(tag && room.tag) tag.textContent = room.tag;
      var amenitiesWrap = card.querySelector('.amenities');
      if(amenitiesWrap && Array.isArray(room.amenities) && room.amenities.length){
        amenitiesWrap.innerHTML = '';
        room.amenities.forEach(function(a){
          var span = document.createElement('span');
          span.textContent = a;
          amenitiesWrap.appendChild(span);
        });
      }
      var link = card.querySelector('a.btn-text');
      if(link) link.setAttribute('href', 'book.html?room=' + encodeURIComponent(room.id));
      if(room.image){
        var plate = card.querySelector('.plate');
        if(plate){
          plate.style.backgroundImage = 'url(' + room.image + ')';
          plate.classList.add('has-photo');
        }
      }
    });

    (data.gallery || []).forEach(function(slot, i){
      var plate = document.querySelector('.gallery [data-gallery-index="' + i + '"]');
      if(!plate) return;
      var tag = plate.querySelector('.plate-tag');
      if(tag && slot.tag) tag.textContent = slot.tag;
      if(slot.image){
        plate.style.backgroundImage = 'url(' + slot.image + ')';
        plate.classList.add('has-photo');
      }
    });

    if(data.about && data.about.image){
      var welcomeArt = document.querySelector('.welcome-art');
      if(welcomeArt){
        welcomeArt.style.backgroundImage = 'url(' + data.about.image + ')';
        welcomeArt.classList.add('has-photo');
      }
    }

    (data.experiences || []).forEach(function(exp){
      if(!exp.image) return;
      var card = document.querySelector('.exp-card[data-exp-id="' + exp.id + '"]');
      if(card){
        card.style.backgroundImage = 'url(' + exp.image + ')';
        card.classList.add('has-photo');
      }
    });

    // Let other scripts (e.g. the menu flip-book) react to the same data
    // without each having to fetch /api/content separately.
    document.dispatchEvent(new CustomEvent('sitecontent:loaded', { detail: data }));
  }).catch(function(){
    // API unavailable: text/images already in the page keep showing, but let
    // scripts that render entirely from this data (e.g. the menu flip-book)
    // know so they can show something instead of staying blank.
    document.dispatchEvent(new CustomEvent('sitecontent:error'));
  });
})();
