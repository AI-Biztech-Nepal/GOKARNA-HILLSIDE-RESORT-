/*
 * Helper functions shared by the stay estimator (index.html) and the
 * booking page (book.html). The data these operate on (window.RESORT_PRICING)
 * is generated server-side from data/site_data.json — see server.py's
 * /assets/pricing.js route, which appends this file's contents after the
 * data assignment so both pages keep loading a single <script src="assets/pricing.js">.
 */
window.formatPrice = function(amount){
  return window.RESORT_PRICING.currency + ' ' + Math.round(amount).toLocaleString('en-US');
};

window.addonRate = function(id){
  var addon = window.RESORT_PRICING.addons.filter(function(a){ return a.id === id; })[0];
  return addon ? addon.rate : 0;
};

// Builds the food & beverage quantity picker inside `container`, grouped by
// item.group (Food / Beverages). Shared by the estimator and the booking form.
window.renderMenuGroups = function(container){
  var groups = {};
  window.RESORT_PRICING.menu.forEach(function(item){
    (groups[item.group] = groups[item.group] || []).push(item);
  });
  Object.keys(groups).forEach(function(groupName){
    var col = document.createElement('div');
    col.className = 'menu-group';
    var heading = document.createElement('h5');
    heading.textContent = groupName;
    col.appendChild(heading);
    groups[groupName].forEach(function(item){
      var row = document.createElement('div');
      row.className = 'menu-item';
      row.setAttribute('data-id', item.id);
      row.setAttribute('data-price', item.price);
      row.innerHTML =
        '<span class="txt"><span class="name">' + item.name + '</span><span class="price">' + window.formatPrice(item.price) + ' each</span></span>' +
        '<div class="stepper sm"><button type="button" data-step="-1" aria-label="Decrease ' + item.name + ' quantity">&minus;</button>' +
        '<span class="qty">0</span><button type="button" data-step="1" aria-label="Increase ' + item.name + ' quantity">&plus;</button></div>';
      col.appendChild(row);
    });
    container.appendChild(col);
  });

  container.addEventListener('click', function(e){
    var btn = e.target.closest('[data-step]');
    if(!btn) return;
    var row = btn.closest('.menu-item');
    var qtyEl = row.querySelector('.qty');
    var step = parseInt(btn.getAttribute('data-step'), 10);
    qtyEl.textContent = Math.min(20, Math.max(0, parseInt(qtyEl.textContent, 10) + step));
    container.dispatchEvent(new CustomEvent('menuchange', { bubbles: true }));
  });
};

window.selectedMenuItems = function(container){
  return Array.prototype.slice.call(container.querySelectorAll('.menu-item')).map(function(row){
    return { id: row.getAttribute('data-id'), price: parseInt(row.getAttribute('data-price'), 10),
      name: row.querySelector('.name').textContent, qty: parseInt(row.querySelector('.qty').textContent, 10) };
  }).filter(function(item){ return item.qty > 0; });
};
