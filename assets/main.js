(function(){
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');
  var navScrim = document.getElementById('navScrim');
  var nav = document.getElementById('siteNav');

  function closeMenu(){
    navLinks.classList.remove('open');
    navScrim.classList.remove('open');
    navToggle.setAttribute('aria-expanded','false');
  }
  navToggle.addEventListener('click', function(){
    var isOpen = navLinks.classList.toggle('open');
    navScrim.classList.toggle('open', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
  navScrim.addEventListener('click', closeMenu);
  navLinks.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', closeMenu); });

  var onScroll = function(){
    nav.classList.toggle('scrolled', window.scrollY > 40);
  };
  document.addEventListener('scroll', onScroll, {passive:true});
  onScroll();

  var yearEl = document.getElementById('year');
  if(yearEl){ yearEl.textContent = new Date().getFullYear(); }

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if('IntersectionObserver' in window && !prefersReduced){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){ entry.target.classList.add('in'); io.unobserve(entry.target); }
      });
    }, {threshold:0.14, rootMargin:'0px 0px -60px 0px'});
    document.querySelectorAll('.reveal, .reveal-stagger').forEach(function(el){ io.observe(el); });
  } else {
    document.querySelectorAll('.reveal, .reveal-stagger').forEach(function(el){ el.classList.add('in'); });
  }
})();
