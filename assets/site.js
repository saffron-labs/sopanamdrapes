// Sopanam Drapes — Core Interactive Script
// Handles Search, Account, Checkout, Bag, Look Builder, Occasion Pages, and Theme Synchronization.

(function () {
  'use strict';

  // --- Utility Selectors & Helpers ---
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const inr = window.inr || (n => '₹' + Math.round(n).toLocaleString('en-IN'));
  const saree = window.saree || (id => (window.SAREES || []).find(s => s.id === id));
  const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;

  function photo(id, alt, cls) {
    return `<img class="${cls || ''}" src="img/${id}.jpg" alt="${alt || ''}" width="1600" height="2000" loading="lazy">`;
  }

  // --- Wishlist Persistence ---
  let wish = new Set();
  try {
    wish = new Set(JSON.parse(localStorage.getItem('sd-wish') || '[]'));
  } catch (e) {
    wish = new Set();
  }
  function saveWish() {
    try { localStorage.setItem('sd-wish', JSON.stringify([...wish])); } catch (e) { }
  }
  const wishHeartSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.4l-1.35-1.23C5.4 14.42 2 11.34 2 7.55 2 4.46 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09C13.09 2.81 14.76 2 16.5 2 19.58 2 22 4.46 22 7.55c0 3.79-3.4 6.87-8.65 11.63z"/></svg>';

  function ornCard(id) {
    const o = ORN[id];
    if (!o) return '';
    const typeLabel = TYPE[o[0]] || o[0];
    const wished = wish.has(id);
    return `
      <article class="card catalog-card">
        <div class="art wide orn-frame">
          <img src="img/orn/${id}-s.jpg" alt="${o[1]}" width="640" height="360" loading="lazy">
          <button class="wish-btn" data-wish="${id}" aria-pressed="${wished}" aria-label="Save ${o[1]} to wishlist" type="button">${wishHeartSvg}</button>
        </div>
        <div class="card-copy">
          <h3>${o[1]}</h3>
          <div class="meta">${typeLabel}</div>
          <div class="price">
            <b>${inr(o[3])}</b>${o[2] > o[3] ? `<s>${inr(o[2])}</s>` : ''}
          </div>
        </div>
        <div class="actions">
          <button class="btn catalog-add-btn" data-orn="${id}" type="button">Add to cart <span aria-hidden="true">→</span></button>
        </div>
      </article>`;
  }

  function card(s) {
    if (!s) return '';
    const hasD = (HAS_DETAIL || []).includes(s.id);
    const wished = wish.has(s.id);
    return `
      <article class="card catalog-card">
        <div class="art">
          <a class="art-link" href="index.html?style=${s.id}#builder" aria-label="Style ${s.name} in the atelier">
            ${photo(s.id, `${s.name}, ${s.tone}, worn by a model`)}
            ${hasD ? photo(s.id + '-detail', `Weave detail of the ${s.name}`, 'alt') : ''}
          </a>
          <button class="wish-btn" data-wish="${s.id}" aria-pressed="${wished}" aria-label="Save ${s.name} to wishlist" type="button">${wishHeartSvg}</button>
        </div>
        <div class="card-copy">
          <h3><a href="index.html?style=${s.id}#builder">${s.name},</a></h3>
          <div class="meta">${s.tone}</div>
          <div class="price">
            <b>${inr(s.eff)}</b>${s.disc ? `<s>${inr(s.mrp)}</s>` : ''}
          </div>
        </div>
        <div class="actions">
          <button class="btn catalog-add-btn" data-quick="${s.id}" type="button">Add to cart <span aria-hidden="true">→</span></button>
        </div>
      </article>`;
  }

  function lookTotals(s, sel) {
    const ids = Object.values(sel || {}).filter(Boolean);
    const sum = ids.reduce((a, id) => a + (ORN[id] ? ORN[id][3] : 0), 0);
    const save = ids.length >= 2 ? Math.round(sum * 0.10) : 0;
    return { ids, sum, save, total: (s ? s.eff : 0) + sum - save };
  }

  // --- Toast Notifications ---
  function toast(msg) {
    let t = $('#toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2800);
  }

  // --- Smooth Scroll Navigation ---
  function go(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  // --- Theme Management ---
  function saveTheme(v) {
    try { localStorage.setItem('sd-theme', v); } catch (e) { }
    try { window.name = window.name.replace(/(^|;)sd-theme=\w+/, '') + ';sd-theme=' + v; } catch (e) { }
  }

  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const h = a.getAttribute('href');
    const th = document.documentElement.dataset.theme;
    if (!th || !h || !/^[\w-]+\.html/.test(h)) return;
    try {
      const u = new URL(h, location.href);
      u.searchParams.set('theme', th);
      a.href = u.href;
    } catch (err) { }
  });

  // --- Bag State Management ---
  let bag = [];
  try {
    bag = JSON.parse(localStorage.getItem('sd-bag') || '[]');
  } catch (e) {
    bag = [];
  }

  function saveBag() {
    try { localStorage.setItem('sd-bag', JSON.stringify(bag)); } catch (e) { }
  }

  function renderBag() {
    const n = bag.length;
    const countEl = $('#bagCount');
    const subEl = $('#bagSub');
    const itemsEl = $('#bagItems');
    const footEl = $('#bagFoot');

    if (countEl) {
      countEl.textContent = n;
      countEl.hidden = !n;
    }
    if (subEl) {
      subEl.textContent = n ? n + (n === 1 ? ' item' : ' items') : '';
    }
    if (!itemsEl) return;

    if (!n) {
      itemsEl.innerHTML = '<div class="empty">Your bag is empty. Explore our collection and build your look.</div>';
      if (footEl) footEl.innerHTML = '';
      return;
    }

    itemsEl.innerHTML = bag.map((b, i) => {
      if (b.kind === 'orn') {
        const o = ORN[b.oid] || ['', 'Ornament', 0, b.total];
        const slotName = (SLOTS.find(x => x[0] === o[0]) || ['', 'Ornament'])[1];
        return `
          <div class="bi">
            <div><img src="img/orn/${b.oid}-s.jpg" alt="${o[1]}"></div>
            <div>
              <div class="t">${o[1]}</div>
              <div class="d">${slotName}</div>
              <div class="f">
                <span>${inr(b.total)}</span>
                <button data-remove="${i}">Remove</button>
              </div>
            </div>
          </div>`;
      }
      const s = saree(b.sid) || { id: b.sid, name: 'Handloom Saree', tone: '' };
      return `
        <div class="bi">
          <div><img src="img/${s.id}.jpg" alt="${s.name}"></div>
          <div>
            <div class="t">${s.name}${s.tone ? ', ' + s.tone : ''}</div>
            <div class="d">${b.names && b.names.length ? b.names.join(' · ') : 'Saree only'}</div>
            <div class="f">
              <span>${inr(b.total)}</span>
              <button data-remove="${i}">Remove</button>
            </div>
          </div>
        </div>`;
    }).join('');

    const subtotal = bag.reduce((a, b) => a + b.total, 0);
    if (footEl) {
      footEl.innerHTML = `
        <div class="row total"><span>Subtotal</span><span>${inr(subtotal)}</span></div>
        <button class="btn" style="width:100%;justify-content:center;margin-top:14px" data-checkout>Continue to checkout</button>`;
    }
  }

  function openBag(open) {
    const bagEl = $('#bag');
    const scrimEl = $('#scrim');
    if (!bagEl) return;
    if (open) {
      closeAllModalsExcept('bag');
      bagEl.hidden = false;
      if (scrimEl) scrimEl.hidden = false;
      const closeBtn = $('#bagClose');
      if (closeBtn) closeBtn.focus();
    } else {
      bagEl.hidden = true;
      checkScrimState();
    }
  }

  // --- Modal Resilience (Ensure Required Modals Exist in DOM) ---
  function ensureModalsMounted() {
    let scrim = $('#scrim');
    if (!scrim) {
      scrim = document.createElement('div');
      scrim.id = 'scrim';
      scrim.className = 'scrim';
      scrim.hidden = true;
      document.body.appendChild(scrim);
    }

    // Search Modal
    let searchModal = $('#searchModal');
    if (!searchModal) {
      searchModal = document.createElement('div');
      searchModal.id = 'searchModal';
      searchModal.className = 'modal search-modal';
      searchModal.hidden = true;
      searchModal.setAttribute('role', 'dialog');
      searchModal.setAttribute('aria-modal', 'true');
      searchModal.setAttribute('aria-labelledby', 'searchModalTitle');
      document.body.appendChild(searchModal);
    }
    if (!searchModal.querySelector('#searchInput')) {
      searchModal.innerHTML = `
        <div class="modal-box search-box">
          <div class="modal-head">
            <h3 id="searchModalTitle">Search Collection</h3>
            <button class="ibtn modal-close" id="searchClose" aria-label="Close search">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="search-input-wrap">
            <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>
            <input type="search" id="searchInput" class="search-input" placeholder="Search by saree name, fabric, tone, or ornaments..." autocomplete="off">
          </div>
          <div class="search-chips">
            <button class="chip is-active" data-search-filter="all" aria-pressed="true">All</button>
            <button class="chip" data-search-filter="sarees">Sarees</button>
            <button class="chip" data-search-filter="silk">Pure Silk</button>
            <button class="chip" data-search-filter="bridal">Bridal</button>
            <button class="chip" data-search-filter="festive">Festive</button>
            <button class="chip" data-search-filter="ornaments">Jewellery</button>
          </div>
          <div class="search-results" id="searchResults"></div>
        </div>`;
    }

    // Account Modal
    let acctModal = $('#accountModal');
    if (!acctModal) {
      acctModal = document.createElement('div');
      acctModal.id = 'accountModal';
      acctModal.className = 'modal account-modal';
      acctModal.hidden = true;
      acctModal.setAttribute('role', 'dialog');
      acctModal.setAttribute('aria-modal', 'true');
      acctModal.setAttribute('aria-labelledby', 'accountModalTitle');
      document.body.appendChild(acctModal);
    }
    if (!acctModal.querySelector('#ordersList')) {
      acctModal.innerHTML = `
        <div class="modal-box modal-drawer account-box">
          <div class="modal-head">
            <h3 id="accountModalTitle">My Account</h3>
            <button class="ibtn modal-close" id="accountClose" aria-label="Close account">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="profile-card">
            <div class="profile-avatar">PN</div>
            <div class="profile-info">
              <h4 class="profile-name">Priya Nair</h4>
              <span class="profile-phone">+91 98470 12345</span>
              <span class="profile-location">Kochi, Kerala</span>
              <span class="profile-tier">Privilege Member · Silk Mark Verified</span>
            </div>
          </div>
          <div class="account-body">
            <div class="orders-section-head">
              <h4 class="orders-title" style="margin:0;font-size:20px;">My Orders</h4>
              <span id="accountOrdersCount"></span>
            </div>
            <div class="orders-list" id="ordersList" style="margin-top:12px;"></div>
          </div>
        </div>`;
    }

    // Checkout Modal
    let checkoutModal = $('#checkoutModal');
    if (!checkoutModal) {
      checkoutModal = document.createElement('div');
      checkoutModal.id = 'checkoutModal';
      checkoutModal.className = 'modal checkout-modal';
      checkoutModal.hidden = true;
      checkoutModal.setAttribute('role', 'dialog');
      checkoutModal.setAttribute('aria-modal', 'true');
      checkoutModal.setAttribute('aria-labelledby', 'checkoutModalTitle');
      document.body.appendChild(checkoutModal);
    }
    if (!checkoutModal.querySelector('#checkoutForm')) {
      checkoutModal.innerHTML = `
        <div class="modal-box checkout-box">
          <div class="modal-head">
            <h3 id="checkoutModalTitle">Luxury Checkout</h3>
            <button class="ibtn modal-close" id="checkoutClose" aria-label="Close checkout">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="checkout-body" id="checkoutBody">
            <form id="checkoutForm" class="checkout-form" onsubmit="return false;">
              <div class="checkout-step">
                <h4>1. Delivery Address</h4>
                <div class="form-grid">
                  <div class="form-group full">
                    <label for="shipName">Full Name</label>
                    <input type="text" id="shipName" required placeholder="Full Name" value="Priya Nair">
                  </div>
                  <div class="form-group">
                    <label for="shipPhone">Phone (10 digits)</label>
                    <input type="tel" id="shipPhone" maxlength="10" required placeholder="10-digit mobile number" value="9847012345">
                  </div>
                  <div class="form-group">
                    <label for="shipPin">PIN Code (6 digits)</label>
                    <input type="text" id="shipPin" maxlength="6" required placeholder="6-digit PIN code" value="682001">
                    <small id="pinFeedback" style="display:block;margin-top:4px;font-size:11px;color:var(--good,#2f6b4b);">✓ Kerala Express Delivery (4-6 business days)</small>
                  </div>
                  <div class="form-group full">
                    <label for="shipAddress">Delivery Address</label>
                    <textarea id="shipAddress" required rows="2" placeholder="House/Flat number, Street name, Locality">Hill Palace Road, Tripunithura, Kochi</textarea>
                  </div>
                </div>
              </div>
              <div class="checkout-step">
                <h4>2. Payment Method</h4>
                <div class="payment-methods">
                  <label class="payment-opt active">
                    <input type="radio" name="payMethod" value="upi" checked>
                    <span class="pay-title">UPI (Google Pay, PhonePe, Paytm)</span>
                    <span class="pay-desc">Instant &amp; secure</span>
                  </label>
                  <label class="payment-opt">
                    <input type="radio" name="payMethod" value="card">
                    <span class="pay-title">Credit / Debit Card</span>
                    <span class="pay-desc">Visa, Mastercard, RuPay</span>
                  </label>
                  <label class="payment-opt">
                    <input type="radio" name="payMethod" value="cod">
                    <span class="pay-title">Cash on Delivery (COD)</span>
                    <span class="pay-desc">Zero extra fee</span>
                  </label>
                </div>
              </div>
              <div class="checkout-summary" id="checkoutSummary"></div>
              <div class="checkout-actions">
                <button type="submit" class="btn" id="placeOrderBtn" style="width:100%;justify-content:center">Place Order</button>
              </div>
            </form>
            <div class="order-confirmed" id="orderConfirmed" hidden></div>
          </div>
        </div>`;
    }
  }

  function checkScrimState() {
    const scrim = $('#scrim');
    if (!scrim) return;
    const isBagOpen = $('#bag') && !$('#bag').hidden;
    const isSearchOpen = $('#searchModal') && !$('#searchModal').hidden;
    const isAcctOpen = $('#accountModal') && !$('#accountModal').hidden;
    const isCheckoutOpen = $('#checkoutModal') && !$('#checkoutModal').hidden;
    scrim.hidden = !(isBagOpen || isSearchOpen || isAcctOpen || isCheckoutOpen);
  }

  function closeAllModalsExcept(except) {
    if (except !== 'bag' && $('#bag')) $('#bag').hidden = true;
    if (except !== 'search' && $('#searchModal')) $('#searchModal').hidden = true;
    if (except !== 'account' && $('#accountModal')) $('#accountModal').hidden = true;
    if (except !== 'checkout' && $('#checkoutModal')) $('#checkoutModal').hidden = true;
  }

  function closeAllModals() {
    closeAllModalsExcept(null);
    checkScrimState();
  }

  // --- 1. Search Functionality ---
  let searchFilter = 'all';

  function openSearch(open) {
    ensureModalsMounted();
    const modal = $('#searchModal');
    if (!modal) return;
    if (open) {
      closeAllModalsExcept('search');
      modal.hidden = false;
      checkScrimState();
      const input = $('#searchInput');
      if (input) {
        input.focus();
        renderSearchResults(input.value);
      }
    } else {
      modal.hidden = true;
      checkScrimState();
    }
  }

  function renderSearchResults(query = '') {
    const resultsEl = $('#searchResults');
    if (!resultsEl) return;

    const q = (query || '').toLowerCase().trim();
    const tokens = q.split(/\s+/).filter(Boolean);
    const filter = searchFilter;

    // Filter Sarees
    let matchingSarees = [];
    if (filter !== 'ornaments') {
      matchingSarees = (window.SAREES || []).filter(s => {
        if (filter === 'bridal' && !s.worlds.includes('bridal')) return false;
        if (filter === 'festive' && !s.worlds.includes('festive')) return false;
        if (filter === 'silk' && !s.fabric.toLowerCase().includes('silk')) return false;
        if (filter === 'cotton' && !s.fabric.toLowerCase().includes('cotton')) return false;
        if (!tokens.length) return true;
        const haystack = `${s.name} ${s.fabric} ${s.tone} ${s.blouse} ${s.weave} ${s.worlds.join(' ')}`.toLowerCase();
        return tokens.every(tok => haystack.includes(tok));
      });
    }

    // Filter Ornaments
    let matchingOrn = [];
    if (filter !== 'sarees' && filter !== 'silk' && filter !== 'cotton') {
      matchingOrn = Object.keys(window.ORN || {}).filter(id => {
        const o = ORN[id];
        if (filter === 'bridal' && !Object.values(BRIDAL_FULL).includes(id)) return false;
        if (!tokens.length) return true;
        const typeStr = TYPE[o[0]] || o[0];
        const haystack = `${o[1]} ${o[0]} ${typeStr}`.toLowerCase();
        return tokens.every(tok => haystack.includes(tok));
      });
    }

    const total = matchingSarees.length + matchingOrn.length;

    if (total === 0) {
      resultsEl.innerHTML = `
        <div class="search-empty">
          <p style="font-size:18px;font-family:var(--display);font-weight:600;margin-bottom:6px;">No matching sarees or jewellery found</p>
          <p style="color:var(--muted);font-size:13.5px;">Try searching for "Kanjivaram", "Banarasi", "Kundan", "Gold", or "Emerald".</p>
        </div>`;
      return;
    }

    let html = '';
    // Sarees
    matchingSarees.forEach(s => {
      html += `
        <article class="card">
          <div class="art">
            <img src="img/${s.id}.jpg" alt="${s.name}" loading="lazy">
            ${s.disc ? `<span class="flag">${s.disc}% off</span>` : s.stock <= 14 ? `<span class="flag">${s.stock} left</span>` : ''}
          </div>
          <div>
            <h3>${s.name}</h3>
            <div class="meta">${s.tone} · ${s.fabric}</div>
          </div>
          <div class="price">
            <b>${inr(s.eff)}</b>
            ${s.disc ? `<s>${inr(s.mrp)}</s>` : ''}
          </div>
          <div class="actions">
            <a class="btn small ghost" href="index.html?style=${s.id}#builder">Style the look</a>
            <button class="btn small" data-quick="${s.id}">Quick add saree</button>
          </div>
        </article>`;
    });

    // Ornaments
    matchingOrn.forEach(id => {
      html += ornCard(id);
    });

    resultsEl.innerHTML = html;
  }

  // --- 2. Account Functionality ---
  function getOrders() {
    try {
      return JSON.parse(localStorage.getItem('sd-orders') || '[]');
    } catch (e) {
      return [];
    }
  }

  function openAccount(open) {
    ensureModalsMounted();
    const modal = $('#accountModal');
    if (!modal) return;
    if (open) {
      closeAllModalsExcept('account');
      modal.hidden = false;
      checkScrimState();
      renderAccountOrders();
    } else {
      modal.hidden = true;
      checkScrimState();
    }
  }

  function renderAccountOrders() {
    const orders = getOrders();
    const listEl = $('#ordersList');
    const countEl = $('#accountOrdersCount');
    if (countEl) countEl.textContent = `${orders.length} ${orders.length === 1 ? 'order' : 'orders'}`;
    if (!listEl) return;

    if (orders.length === 0) {
      listEl.innerHTML = `
        <div class="orders-empty">
          <p>You have not placed any orders yet.</p>
          <a class="btn small" href="index.html#collection" id="accountBrowseBtn">Browse Sarees</a>
        </div>`;
      return;
    }

    listEl.innerHTML = orders.map(ord => `
      <article class="order-card">
        <div class="order-header">
          <div>
            <div class="order-id">${ord.id}</div>
            <div class="order-date">${ord.date}</div>
          </div>
          <span class="badge-confirmed">${ord.status || 'Confirmed'}</span>
        </div>
        <div style="font-size:12.5px;color:var(--muted);padding-bottom:10px;border-bottom:1px solid var(--line);margin-bottom:10px;">
          <div>Delivery: <strong style="color:var(--ink);">${ord.estDelivery || '4-6 business days'}</strong></div>
          <div>To: ${ord.customer ? `${ord.customer.name}, ${ord.customer.address} (${ord.customer.pincode})` : 'Kochi, Kerala'}</div>
        </div>
        <div class="order-items-preview">
          ${(ord.items || []).map(item => {
      if (item.kind === 'orn') {
        const o = ORN[item.oid] || ['', 'Ornament', 0, item.total];
        return `
                <div style="display:flex;align-items:center;gap:10px;">
                  <img src="img/orn/${item.oid}-s.jpg" alt="" style="width:38px;height:26px;object-fit:cover;border:1px solid var(--line);border-radius:2px;">
                  <span style="flex:1;">${item.names && item.names[0] ? item.names[0] : o[1]}</span>
                  <span style="font-weight:600;">${inr(item.total)}</span>
                </div>`;
      }
      const s = saree(item.sid) || { name: 'Handloom Saree', tone: '' };
      return `
              <div style="display:flex;align-items:center;gap:10px;">
                <img src="img/${item.sid}.jpg" alt="" style="width:38px;height:48px;object-fit:cover;border:1px solid var(--line);border-radius:2px;">
                <div style="flex:1;">
                  <div style="font-weight:600;font-size:13px;">${s.name}${s.tone ? ', ' + s.tone : ''}</div>
                  <div style="font-size:11px;color:var(--muted);">${item.names && item.names.length ? item.names.join(' · ') : 'Saree only'}</div>
                </div>
                <span style="font-weight:600;">${inr(item.total)}</span>
              </div>`;
    }).join('')}
        </div>
        <div class="order-total-bar">
          <span style="color:var(--muted);font-size:12px;">${ord.paymentMethod || 'UPI Payment'}</span>
          <span>Total: <b>${inr(ord.total)}</b></span>
        </div>
      </article>
    `).join('');
  }

  // --- 3. End-to-End Checkout Flow ---
  function openCheckout(open) {
    ensureModalsMounted();
    const modal = $('#checkoutModal');
    if (!modal) return;
    if (open) {
      if (!bag.length) {
        toast('Your bag is empty');
        return;
      }
      closeAllModalsExcept('checkout');
      modal.hidden = false;
      checkScrimState();

      // Ensure form view is visible and confirmation view is hidden
      const form = $('#checkoutForm');
      const confirmed = $('#orderConfirmed');
      if (form) form.hidden = false;
      if (confirmed) confirmed.hidden = true;

      renderCheckoutSummary();
    } else {
      modal.hidden = true;
      checkScrimState();
    }
  }

  function renderCheckoutSummary() {
    const sumEl = $('#checkoutSummary');
    if (!sumEl) return;
    const subtotal = bag.reduce((a, b) => a + b.total, 0);

    sumEl.innerHTML = `
      <h4 style="margin-top:0;margin-bottom:12px;font-size:17px;">3. Order Summary (${bag.length} ${bag.length === 1 ? 'item' : 'items'})</h4>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:140px;overflow-y:auto;margin-bottom:14px;padding-right:4px;">
        ${bag.map(b => {
      if (b.kind === 'orn') {
        const o = ORN[b.oid];
        return `
              <div style="display:flex;align-items:center;gap:10px;font-size:13px;">
                <img src="img/orn/${b.oid}-s.jpg" style="width:34px;height:24px;object-fit:cover;border:1px solid var(--line);border-radius:2px;">
                <span style="flex:1;">${o[1]}</span>
                <b style="font-variant-numeric:tabular-nums;">${inr(b.total)}</b>
              </div>`;
      }
      const s = saree(b.sid);
      return `
            <div style="display:flex;align-items:center;gap:10px;font-size:13px;">
              <img src="img/${s.id}.jpg" style="width:34px;height:42px;object-fit:cover;border:1px solid var(--line);border-radius:2px;">
              <div style="flex:1;">
                <div style="font-weight:600;">${s.name}</div>
                <small style="color:var(--muted);">${b.names && b.names.length ? b.names.join(' · ') : 'Saree only'}</small>
              </div>
              <b style="font-variant-numeric:tabular-nums;">${inr(b.total)}</b>
            </div>`;
    }).join('')}
      </div>
      <div class="row" style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px;">
        <span>Subtotal</span>
        <span>${inr(subtotal)}</span>
      </div>
      <div class="row" style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px;color:var(--good,#2f6b4b);font-weight:600;">
        <span>Complimentary Express Shipping</span>
        <span>FREE</span>
      </div>
      <div class="row total" style="display:flex;justify-content:space-between;padding-top:10px;border-top:1px dashed var(--line);margin-top:8px;font-size:18px;font-weight:700;">
        <span>Total Payable</span>
        <span>${inr(subtotal)}</span>
      </div>`;
  }

  function handlePlaceOrder() {
    if (!bag.length) {
      toast('Your bag is empty');
      return;
    }

    const nameInput = $('#shipName');
    const phoneInput = $('#shipPhone');
    const pinInput = $('#shipPin');
    const addrInput = $('#shipAddress');

    const name = nameInput ? nameInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const pin = pinInput ? pinInput.value.trim() : '';
    const addr = addrInput ? addrInput.value.trim() : '';

    if (!name) {
      toast('Please enter your full name');
      if (nameInput) nameInput.focus();
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      toast('Please enter a valid 10-digit mobile number');
      if (phoneInput) phoneInput.focus();
      return;
    }
    if (!/^[1-9][0-9]{5}$/.test(pin)) {
      toast('Please enter a valid 6-digit India PIN code');
      if (pinInput) pinInput.focus();
      return;
    }
    if (!addr) {
      toast('Please enter your delivery address');
      if (addrInput) addrInput.focus();
      return;
    }

    const checkedPay = $('input[name="payMethod"]:checked') || $('input[name="paymentMethod"]:checked');
    const payVal = checkedPay ? checkedPay.value : 'upi';
    const payMap = {
      upi: 'UPI (Google Pay / PhonePe)',
      card: 'Credit / Debit Card',
      cod: 'Cash on Delivery (COD)'
    };
    const paymentLabel = payMap[payVal] || payVal;

    const orderId = 'SD-2026-' + Math.floor(1000 + Math.random() * 9000);
    const orderItems = JSON.parse(JSON.stringify(bag));
    const total = bag.reduce((a, b) => a + b.total, 0);

    const newOrder = {
      id: orderId,
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      items: orderItems,
      total: total,
      paymentMethod: paymentLabel,
      customer: {
        name: name,
        phone: phone,
        pincode: pin,
        address: addr
      },
      status: 'Confirmed',
      estDelivery: '4-6 business days'
    };

    // Save to localStorage sd-orders
    const orders = getOrders();
    orders.unshift(newOrder);
    try {
      localStorage.setItem('sd-orders', JSON.stringify(orders));
    } catch (e) { }

    // Clear Cart
    bag = [];
    saveBag();
    renderBag();

    // Render Order Confirmation
    const form = $('#checkoutForm');
    const confirmed = $('#orderConfirmed');

    if (form) form.hidden = true;
    if (confirmed) {
      confirmed.hidden = false;
      confirmed.innerHTML = `
        <div class="checkmark-circle">✓</div>
        <h2>Order Confirmed!</h2>
        <p class="lead-confirm">Thank you, ${name}. Your handloom drape order has been registered and is being prepared with extreme care.</p>
        <div class="order-ref-pill">${orderId}</div>
        <div>
          <span class="delivery-badge">Estimated Delivery: 4-6 business days</span>
        </div>
        <div style="border:1px solid var(--line);border-radius:var(--radius-sm);background:var(--surface);padding:16px;text-align:left;margin-bottom:20px;font-size:13.5px;">
          <div style="padding-bottom:8px;border-bottom:1px solid var(--line);">
            <div><strong>Shipping to:</strong> ${name}</div>
            <div style="color:var(--muted);margin-top:2px;">${addr}</div>
            <div style="color:var(--muted);">PIN: ${pin} · Mobile: +91 ${phone}</div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;">
            <span>Payment: <strong>${paymentLabel}</strong></span>
            <span>Total Paid: <strong style="font-size:16px;color:var(--accent);">${inr(total)}</strong></span>
          </div>
        </div>
        <div class="confirm-actions">
          <button class="btn" id="viewInOrdersBtn">View in My Orders</button>
          <button class="btn ghost" id="continueShopBtn">Continue Shopping</button>
        </div>`;
    }

    toast(`Order placed: ${orderId}`);
  }

  // --- 4. Look Builder Functionality (index.html) ---
  const homeState = {
    world: 'all',
    cur: 'SA00001',
    view: 'model',
    sel: {},
    showAllWorlds: false,
    showAllSarees: false,
    slotGroup: 'necklace'
  };

  function initHomeState() {
    if (window.SAREES && window.SAREES.length) {
      homeState.sel = { ...SAREES[0].combo };
    }
  }

  function ornTotalsHome() {
    const ids = Object.values(homeState.sel || {}).filter(Boolean);
    const sum = ids.reduce((a, id) => a + (ORN[id] ? ORN[id][3] : 0), 0);
    const save = ids.length >= 2 ? Math.round(sum * 0.10) : 0;
    const s = saree(homeState.cur) || SAREES[0];
    return { ids, sum, save, total: (s ? s.eff : 0) + sum - save };
  }

  function renderBuilder() {
    const builderEl = $('#builder');
    if (!builderEl) return;
    const s = saree(homeState.cur) || SAREES[0];
    if (!s) return;

    const CHECK = '<span class="room-check" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg></span>';

    // 1. Saree carousel
    const pickerEl = $('#picker');
    if (pickerEl) {
      const keep = pickerEl.scrollLeft;
      pickerEl.innerHTML = SAREES.map(x => `
        <button class="room-saree" data-pick="${x.id}" aria-pressed="${x.id === homeState.cur}" type="button">
          <span class="room-saree-img">${photo(x.id, '')}${x.id === homeState.cur ? CHECK : ''}</span>
          <span class="room-saree-n">${x.name}</span>
          <span class="room-saree-t">${x.tone}</span>
        </button>`).join('');
      pickerEl.scrollLeft = keep;
    }

    // Big photo + thumbnail column
    const hasD = (HAS_DETAIL || []).includes(s.id);
    const isDetail = hasD && homeState.view === 'detail';
    const stageArtEl = $('#stageArt');
    if (stageArtEl) {
      stageArtEl.innerHTML = (isDetail ? photo(s.id + '-detail', `Weave detail of the ${s.name}`) : photo(s.id, `${s.name}, ${s.tone}, worn by a model`))
        + `<div class="room-photo-tabs">${hasD ? `<button class="room-ptab" data-view="model" aria-pressed="${!isDetail}" type="button">On the model</button><button class="room-ptab" data-view="detail" aria-pressed="${isDetail}" type="button">The weave</button>` : ''}</div>`;
    }
    const viewsEl = $('#views');
    if (viewsEl) {
      viewsEl.innerHTML = `
        <button class="room-thumb" data-view="model" aria-pressed="${!isDetail}" aria-label="On the model" type="button">${photo(s.id, '')}</button>
        ${hasD ? `<button class="room-thumb" data-view="detail" aria-pressed="${isDetail}" aria-label="The weave, close up" type="button">${photo(s.id + '-detail', '')}</button>` : ''}`;
    }

    // Pairing shortcuts
    const setsEl = $('#sets');
    if (setsEl) {
      const selStr = JSON.stringify(Object.entries(homeState.sel || {}).filter(([, v]) => v).sort());
      const eq = obj => JSON.stringify(Object.entries(obj || {}).filter(([, v]) => v).sort()) === selStr;
      const isNone = Object.keys(homeState.sel || {}).filter(k => homeState.sel[k]).length === 0;
      setsEl.innerHTML = [['default', 'Our pairing', eq(s.combo)], ['bridal', 'Full bridal', eq(BRIDAL_FULL)], ['none', 'Saree only', isNone]]
        .map(([k, l, on]) => `<button class="room-set" data-set="${k}" aria-pressed="${on}" type="button">${l}</button>`).join('');
    }

    // Ornament tabs: one per main piece, the rest under More
    const TABS = [['necklace', 'Necklaces', ['necklace']], ['bangles', 'Bangles', ['bangles']], ['earrings', 'Earrings', ['earrings']], ['ring', 'Rings', ['ring']], ['more', 'More', ['anklet', 'bracelet', 'waistband']]];
    if (!TABS.some(([k]) => k === homeState.slotGroup)) homeState.slotGroup = 'necklace';
    const tab = TABS.find(([k]) => k === homeState.slotGroup);
    const slotTabsEl = $('#slotTabs');
    if (slotTabsEl) {
      slotTabsEl.innerHTML = TABS.map(([k, l, ks]) => {
        const n = ks.filter(x => homeState.sel[x]).length;
        return `<button class="room-tab" data-slot-group="${k}" aria-pressed="${k === homeState.slotGroup}" type="button">${l}${n ? `<i>${n}</i>` : ''}</button>`;
      }).join('');
    }

    // Ornament carousel
    const slotsEl = $('#slots');
    if (slotsEl) {
      const label = Object.fromEntries(SLOTS);
      slotsEl.innerHTML = tab[2].flatMap(k => (OPTS[k] || []).map(id => {
        const o = ORN[id], on = homeState.sel[k] === id;
        return `
        <button class="room-orn" data-slot="${k}" data-id="${id}" aria-pressed="${on}" type="button" aria-label="${on ? 'Remove' : 'Add'} ${o[1]}, ${inr(o[3])}">
          <span class="room-orn-img"><img src="img/orn/${id}-s.jpg" alt="" width="240" height="160" loading="lazy">${on ? CHECK : ''}${tab[0] === 'more' ? `<em>${label[k]}</em>` : ''}</span>
          <span class="room-orn-n">${o[1]}</span>
          <span class="room-orn-f"><span class="room-orn-p">${inr(o[3])}${o[3] < o[2] ? ` <s>${inr(o[2])}</s>` : ''}</span><span class="room-orn-a">${on ? 'In your look' : 'Add to look <b>+</b>'}</span></span>
        </button>`;
      })).join('');
      slotsEl.scrollLeft = 0;
    }

    // Composed look summary
    const t = ornTotalsHome();
    const totalsEl = $('#totals');
    if (totalsEl) {
      const items = [[s.id, s.name, s.eff, `img/${s.id}.jpg`], ...t.ids.map(id => [id, ORN[id][1], ORN[id][3], `img/orn/${id}-s.jpg`])];
      const mrpSave = (s.mrp - s.eff) + t.ids.reduce((a, id) => a + Math.max(0, ORN[id][2] - ORN[id][3]), 0);
      const saving = t.save + mrpSave;
      totalsEl.innerHTML = `
        <div class="room-sum-row">
          <div class="room-sum-items">
            <span class="room-sum-k">Your composed look</span>
            <div class="room-sum-list">${items.map(([id, n, p, img], i) => `${i ? '<span class="room-plus" aria-hidden="true">+</span>' : ''}<span class="room-item"><img src="${img}" alt="" loading="lazy"><span><b>${n}</b>${inr(p)}</span></span>`).join('')}</div>
          </div>
          <div class="room-sum-save"><span>Ensemble savings</span><b>${saving ? '−' + inr(saving) : '—'}</b>${!t.save ? `<small>${t.ids.length === 1 ? 'Add one more ornament for 10% off' : 'Two or more ornaments: 10% off'}</small>` : ''}</div>
          <div class="room-sum-total"><span>Total</span><b>${inr(t.total)}</b></div>
        </div>
        <button class="btn room-add" data-add type="button">Add complete look to bag <span aria-hidden="true">→</span></button>`;
    }

    // Mobile Action Bar
    renderMobileBuilderBar(s, t);
  }

  function renderMobileBuilderBar(s, t) {
    let bar = $('#mobileBuilderBar');
    if (!bar && $('#builder')) {
      bar = document.createElement('div');
      bar.id = 'mobileBuilderBar';
      bar.className = 'mobile-builder-bar';
      bar.hidden = true;
      document.body.appendChild(bar);
      // Only show the bar while the atelier is on screen, and lift Sakhi above it
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([e]) => {
          bar.hidden = !e.isIntersecting;
          document.body.classList.toggle('has-mbar', e.isIntersecting);
        }, { rootMargin: '-20% 0px -20% 0px' }).observe($('#builder'));
      } else {
        bar.hidden = false;
      }
    }
    if (bar) {
      bar.innerHTML = `
        <div class="mbar-info">
          <span class="mbar-name">${s.name}</span>
          <span class="mbar-total">${inr(t.total)}</span>
        </div>
        <button class="btn small" data-add>Add Look</button>`;
    }
  }

  function setLook(kind) {
    const s = saree(homeState.cur) || SAREES[0];
    if (kind === 'default') homeState.sel = { ...s.combo };
    if (kind === 'bridal') homeState.sel = { ...BRIDAL_FULL };
    if (kind === 'light') homeState.sel = { earrings: s.combo.earrings || 'OR00009' };
    if (kind === 'none') homeState.sel = {};
    renderBuilder();
  }

  function styleSaree(id) {
    if ($('#builder')) {
      homeState.cur = id;
      homeState.view = 'model';
      homeState.sel = { ...(saree(id) || {}).combo };
      renderBuilder();
      go('builder');
    } else {
      location.href = `index.html?style=${id}#builder`;
    }
  }

  // Heritage film: silent loop that only loads and plays while on screen
  function initHeritageFilm() {
    const v = $('#heritageVideo');
    const btn = $('#heritagePlay');
    if (!v) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (btn) { btn.textContent = 'Play film'; btn.setAttribute('aria-pressed', 'true'); }
      return;
    }
    if (!('IntersectionObserver' in window)) { v.preload = 'auto'; v.play().catch(() => {}); return; }
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !v.dataset.userPaused) v.play().catch(() => {});
      else if (!e.isIntersecting) v.pause();
    }, { threshold: 0.25 }).observe(v);
  }
  document.addEventListener('DOMContentLoaded', initHeritageFilm);
  if (document.readyState !== 'loading') initHeritageFilm();

  // --- Home Page Category Grid & Chips ---
  function renderWorlds() {
    const grid = $('#worldGrid');
    if (!grid) return;
    const houseEdits = [
      { k: 'dresses', name: 'Dresses', sub: 'Collections', img: 'img/popout-dresses.webp', href: 'bridal.html' },
      { k: 'sarees', name: 'Sarees', sub: 'Collections', img: 'img/popout-sarees.webp', href: 'occasions.html' },
      { k: 'lehanga', name: 'Lehanga', sub: 'Collections', img: 'img/popout-lehanga.webp', href: 'celebrations.html' },
      { k: 'scarf', name: 'Scarf', sub: 'Collections', img: 'img/popout-scarf.webp', href: 'everyday.html' },
      { k: 'kurta', name: 'Kurta Sets', sub: 'Collections', img: 'img/popout-kurta.webp', href: 'ornaments.html' },
      { k: 'trending', name: 'Trending', sub: 'Right now', img: 'img/popout-trending.webp', href: 'occasions.html' },
      { k: 'newstock', name: 'New Stock', sub: 'Just arrived', img: 'img/popout-newstock.webp', href: 'index.html#collection' }
    ];
    grid.className = 'house-edit-grid';
    grid.innerHTML = houseEdits.map(w => `
      <a class="house-popout-card" href="${w.href}" data-world="${w.k}" aria-label="${w.name} ${w.sub}">
        <div class="house-popout-art">
          <img src="${w.img}" alt="${w.name} ${w.sub}" width="800" height="1320" loading="lazy">
        </div>
      </a>`).join('');
  }

  function renderChips() {
    const chipsEl = $('#chips');
    if (!chipsEl || window.PAGE_CFG) return;
    const all = [{ k: 'all', name: 'All Drapes' }, ...WORLDS];
    chipsEl.innerHTML = all.map(w => `
      <button class="tab-btn" data-filter="${w.k}" aria-pressed="${homeState.world === w.k}">${w.name}</button>
    `).join('');
  }

  function renderGrid() {
    const gridEl = $('#grid');
    if (!gridEl || window.PAGE_CFG) return;
    const CURATED_ORDER = ['SA00001', 'SA00007', 'SA00002', 'SA00004'];
    const filtered = SAREES.filter(s => homeState.world === 'all' || s.worlds.includes(homeState.world));
    const list = (homeState.world === 'all' && !homeState.showAllSarees)
      ? CURATED_ORDER.map(id => SAREES.find(s => s.id === id)).filter(Boolean)
      : filtered;
    const w = WORLDS.find(x => x.k === homeState.world);
    const countEl = $('#count');
    const noteEl = $('#worldNote');
    const viewAllBtn = $('#viewAllSareesBtn');

    if (countEl) {
      countEl.textContent = (homeState.world === 'all' && !homeState.showAllSarees)
        ? `${SAREES.length} Sarees`
        : `${list.length} ${list.length === 1 ? 'Piece' : 'Pieces'}`;
    }
    if (viewAllBtn) {
      viewAllBtn.innerHTML = (homeState.world === 'all' && homeState.showAllSarees)
        ? 'Back to the reel <span aria-hidden="true">↑</span>'
        : 'See all as a grid <span aria-hidden="true">→</span>';
    }
    if (noteEl) noteEl.innerHTML = w ? `<strong>${w.name}</strong><span>${w.line}</span>` : '';

    const plate = s => `
      <article class="saree-plate">
        <div class="saree-plate-art" data-style="${s.id}" role="button" tabindex="0" aria-label="Style ${s.name} in the atelier">
          ${photo(s.id, `${s.name}, ${s.tone}, worn by a model`)}
          ${(HAS_DETAIL || []).includes(s.id) ? photo(s.id + '-detail', `Weave detail of the ${s.name}`, 'alt') : ''}
          <div class="plate-hover-bar">
            <button class="plate-hover-btn" data-style="${s.id}" type="button">Style Look →</button>
            <button class="plate-hover-add" data-quick="${s.id}" type="button">+ Bag</button>
          </div>
        </div>
        <div class="saree-plate-info">
          <h3 class="plate-title">${s.name}</h3>
          <div class="plate-tone">${s.tone}</div>
          <div class="plate-price">
            <b>${inr(s.eff)}</b>${s.disc ? `<s>${inr(s.mrp)}</s>` : ''}
          </div>
        </div>
      </article>`;

    // Default view: every saree on a slow, endless reel across the full width.
    // The second copy only exists to make the loop seamless, so it is hidden from
    // screen readers and can't be tabbed into.
    const reel = homeState.world === 'all' && !homeState.showAllSarees;
    gridEl.className = 'collection-grid' + (reel ? ' is-reel' : '');
    if (reel) {
      const set = SAREES.map(plate).join('');
      gridEl.innerHTML = `
        <div class="saree-reel${homeState.reelPaused ? ' is-paused' : ''}">
          <div class="reel-track">
            <div class="reel-set">${set}</div>
            <div class="reel-set" aria-hidden="true" inert>${set}</div>
          </div>
        </div>
        <button class="reel-toggle" id="reelToggle" type="button" aria-pressed="${!!homeState.reelPaused}">${homeState.reelPaused ? 'Play' : 'Pause'} reel</button>`;
      return;
    }
    gridEl.innerHTML = list.length ? list.map(plate).join('') : '<div class="empty">No sarees in this edit yet.</div>';
  }

  function pickWorld(k) {
    homeState.world = k;
    renderWorlds();
    renderChips();
    renderGrid();
    go('collection');
  }

  // --- Subpage / Occasion Edits, Filters & Wishlist Rendering ---
  const TONE_GROUP = {
    SA00001: 'maroon',
    SA00002: 'green',
    SA00003: 'peach',
    SA00004: 'blue',
    SA00005: 'gold',
    SA00006: 'maroon',
    SA00007: 'ivory',
    SA00008: 'gold'
  };

  const COLOR_SWATCHES = [
    ['maroon', 'Maroon & Wine', '#7b1e2c'],
    ['green', 'Emerald', '#0f5a45'],
    ['gold', 'Mustard & Rust', '#c68d28'],
    ['blue', 'Royal Blue', '#1f3f8e'],
    ['ivory', 'Ivory & Gold', '#e8dfc7'],
    ['peach', 'Peach Blush', '#efb399']
  ];

  const subState = {
    initialized: false,
    occasions: new Set(),
    colors: new Set(),
    fabrics: new Set(),
    types: new Set(),
    specialOnly: false,
    maxPrice: 15000,
    sort: 'featured',
    view: 'grid',
    pageObj: null
  };

  function sortCatalogList(list, getPrice) {
    const copy = [...list];
    if (subState.sort === 'price-asc') return copy.sort((a, b) => getPrice(a) - getPrice(b));
    if (subState.sort === 'price-desc') return copy.sort((a, b) => getPrice(b) - getPrice(a));
    const featuredOrder = ['SA00001', 'SA00007', 'SA00002', 'SA00004', 'SA00003', 'SA00006', 'SA00005', 'SA00008'];
    return copy.sort((a, b) => {
      const ia = featuredOrder.indexOf(a.id);
      const ib = featuredOrder.indexOf(b.id);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }

  function renderEdits(key) {
    const editsEl = $('#edits');
    if (!editsEl) return;
    const houseEdits = [
      { k: 'dresses', name: 'Dresses', sub: 'Collections', img: 'img/popout-dresses.webp', href: 'bridal.html' },
      { k: 'sarees', name: 'Sarees', sub: 'Collections', img: 'img/popout-sarees.webp', href: 'occasions.html' },
      { k: 'lehanga', name: 'Lehanga', sub: 'Collections', img: 'img/popout-lehanga.webp', href: 'celebrations.html' },
      { k: 'scarf', name: 'Scarf', sub: 'Collections', img: 'img/popout-scarf.webp', href: 'everyday.html' },
      { k: 'kurta', name: 'Kurta Sets', sub: 'Collections', img: 'img/popout-kurta.webp', href: 'ornaments.html' },
      { k: 'trending', name: 'Trending', sub: 'Right now', img: 'img/popout-trending.webp', href: 'occasions.html' },
      { k: 'newstock', name: 'New Stock', sub: 'Just arrived', img: 'img/popout-newstock.webp', href: 'index.html#collection' }
    ];
    const pageKeyMap = {
      bridal: 'dresses',
      festive: 'sarees',
      celebrations: 'lehanga',
      parties: 'sarees',
      everyday: 'scarf',
      ornaments: 'kurta'
    };
    const excludeKey = pageKeyMap[key] || key;
    const list = houseEdits.filter(c => c.k !== excludeKey).slice(0, 4);
    editsEl.innerHTML = list.map(c => `
      <a class="house-popout-card" href="${c.href}" aria-label="${c.name} ${c.sub}">
        <div class="house-popout-art">
          <img src="${c.img}" alt="${c.name} ${c.sub}" width="800" height="1320" loading="lazy">
        </div>
      </a>`).join('');
  }

  function renderSidebarForSarees() {
    const host = $('#filterControls');
    if (!host) return;
    const fabrics = [...new Set(SAREES.map(s => s.fabric))];
    host.innerHTML = `
      <div class="filter-group">
        <h4 class="filter-group-title">
          <span>Occasion</span>
          <svg class="filter-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </h4>
        <div class="filter-checks">
          ${WORLDS.map(w => `
            <label class="filter-check">
              <input type="checkbox" data-sub-occ="${w.k}" ${subState.occasions.has(w.k) ? 'checked' : ''}>
              <span>${w.name}</span>
            </label>`).join('')}
        </div>
      </div>
      <div class="filter-group">
        <h4 class="filter-group-title">
          <span>Colour</span>
          <svg class="filter-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </h4>
        <div class="color-swatches">
          ${COLOR_SWATCHES.map(([k, label, hex]) => `
            <button class="swatch-btn" data-color-filter="${k}" aria-pressed="${subState.colors.has(k)}" aria-label="${label}" title="${label}" type="button" style="--swatch:${hex}"></button>
          `).join('')}
          <button class="swatch-btn swatch-reset" data-color-filter="all" aria-label="All colours" title="All colours" type="button">+</button>
        </div>
      </div>
      <div class="filter-group">
        <h4 class="filter-group-title">
          <span>Fabric</span>
          <svg class="filter-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </h4>
        <div class="filter-checks">
          ${fabrics.map(f => `
            <label class="filter-check">
              <input type="checkbox" data-sub-fab="${f}" ${subState.fabrics.has(f) ? 'checked' : ''}>
              <span>${f}</span>
            </label>`).join('')}
        </div>
      </div>
      <div class="filter-group">
        <h4 class="filter-group-title">
          <span>Price Range</span>
          <svg class="filter-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </h4>
        <input class="range-slider" id="priceRangeFilter" type="range" min="2000" max="15000" step="500" value="${subState.maxPrice}" aria-label="Maximum price">
        <div class="range-labels">
          <span>₹1,000 – ₹25,000+</span>
          <strong id="priceRangeVal">Up to ${inr(subState.maxPrice)}${subState.maxPrice >= 15000 ? '+' : ''}</strong>
        </div>
      </div>
      <img class="filter-lotus-art" src="img/bg-lotus-motif.png" alt="" aria-hidden="true" width="1024" height="1024" loading="lazy">`;
  }

  function renderSidebarForOrnaments() {
    const host = $('#filterControls');
    if (!host) return;
    host.innerHTML = `
      <div class="filter-group">
        <h4 class="filter-group-title">
          <span>Category</span>
          <svg class="filter-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </h4>
        <div class="filter-checks">
          ${SLOTS.map(([k, label]) => `
            <label class="filter-check">
              <input type="checkbox" data-sub-type="${k}" ${subState.types.has(k) ? 'checked' : ''}>
              <span>${label}</span>
            </label>`).join('')}
        </div>
      </div>
      <div class="filter-group">
        <h4 class="filter-group-title">
          <span>Selection</span>
          <svg class="filter-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </h4>
        <label class="filter-check">
          <input type="checkbox" id="ornSpecialOnly" ${subState.specialOnly ? 'checked' : ''}>
          <span>Special atelier pricing</span>
        </label>
      </div>
      <div class="filter-group">
        <h4 class="filter-group-title">
          <span>Price Range</span>
          <svg class="filter-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </h4>
        <input class="range-slider" id="priceRangeFilter" type="range" min="600" max="5500" step="200" value="${Math.min(5500, subState.maxPrice)}" aria-label="Maximum ornament price">
        <div class="range-labels">
          <span>₹599 – ₹5,500+</span>
          <strong id="priceRangeVal">Up to ${inr(Math.min(5500, subState.maxPrice))}</strong>
        </div>
      </div>
      <img class="filter-lotus-art" src="img/bg-lotus-motif.png" alt="" aria-hidden="true" width="1024" height="1024" loading="lazy">`;
  }

  let ornPageFilter = 'all';
  function renderOrnaments() {
    const gridEl = $('#grid');
    const chipsEl = $('#chips');
    const countEl = $('#count');
    if (!gridEl) return;

    if ($('#filterControls') && !subState.initialized) {
      subState.initialized = true;
      subState.maxPrice = 5500;
      renderSidebarForOrnaments();
    }

    if (chipsEl) {
      chipsEl.innerHTML = [['all', 'All ornaments'], ...SLOTS].map(([k, l]) => `
        <button class="chip" data-filter="${k}" aria-pressed="${ornPageFilter === k}">${l}</button>
      `).join('');
    }

    let ids = Object.keys(ORN).filter(id => {
      const o = ORN[id];
      if (!o) return false;
      if (subState.types.size && !subState.types.has(o[0])) return false;
      if (!subState.types.size && ornPageFilter !== 'all' && o[0] !== ornPageFilter) return false;
      if (subState.specialOnly && !(o[2] > o[3])) return false;
      if (o[3] > subState.maxPrice) return false;
      return true;
    });

    ids = sortCatalogList(ids, id => ORN[id][3]);
    gridEl.classList.toggle('is-list', subState.view === 'list');
    if (countEl) countEl.textContent = `${ids.length} ${ids.length === 1 ? 'piece' : 'pieces'}`;
    gridEl.innerHTML = ids.length ? ids.map(ornCard).join('') : '<div class="empty">No ornaments match these filters. <button class="link-btn" id="filterResetBtn" type="button">Reset filters</button></div>';
  }

  function renderSubCatalog(P) {
    const gridEl = $('#grid');
    const countEl = $('#count');
    if (!gridEl) return;

    const hasSidebar = !!$('#filterControls');
    let list;
    if (hasSidebar) {
      list = SAREES.filter(s => {
        if (subState.occasions.size && !s.worlds.some(w => subState.occasions.has(w))) return false;
        if (subState.colors.size && !subState.colors.has(TONE_GROUP[s.id])) return false;
        if (subState.fabrics.size && !subState.fabrics.has(s.fabric)) return false;
        if (s.eff > subState.maxPrice) return false;
        return true;
      });
    } else {
      list = (P.sarees || []).map(saree).filter(Boolean);
    }

    list = sortCatalogList(list, s => s.eff);
    gridEl.classList.toggle('is-list', subState.view === 'list');
    if (countEl) countEl.textContent = `${list.length} ${list.length === 1 ? 'saree' : 'sarees'}`;
    gridEl.innerHTML = list.length ? list.map(card).join('') : '<div class="empty">No sarees match these filters. <button class="link-btn" id="filterResetBtn" type="button">Show all matching drapes</button></div>';
  }

  function renderSubpage(P) {
    subState.pageObj = P;
    const list = (P.sarees || []).map(saree).filter(Boolean);
    const more = (P.more || []).map(saree).filter(Boolean);

    if ($('#filterControls') && !subState.initialized) {
      subState.initialized = true;
      subState.occasions = (P.key === 'parties') ? new Set() : new Set([P.key]);
      subState.maxPrice = 15000;
      renderSidebarForSarees();
    }

    renderSubCatalog(P);

    const moreEl = $('#more');
    if (moreEl) moreEl.innerHTML = more.map(card).join('');

    const s = saree(P.lead);
    if (s) {
      const t = lookTotals(s, P.set);
      const lookArt = $('#lookArt');
      const lookName = $('#lookName');
      const lookList = $('#lookList');
      const lookTotal = $('#lookTotal');
      const lookAdd = $('#lookAdd');
      const lookEdit = $('#lookEdit');

      if (lookArt) lookArt.innerHTML = photo(s.id, `${s.name}, ${s.tone}, worn by a model`);
      if (lookName) lookName.textContent = `${s.name}, ${s.tone}`;
      if (lookList) {
        lookList.innerHTML = `<li><span>${s.name}<small>Saree</small></span><span>${inr(s.eff)}</span></li>` +
          SLOTS.filter(([k]) => P.set[k]).map(([k, l]) => {
            const o = ORN[P.set[k]];
            return `<li><span class="lt"><img src="img/orn/${P.set[k]}-s.jpg" alt="" loading="lazy"><span>${o[1]}<small>${l}</small></span></span><span>${inr(o[3])}</span></li>`;
          }).join('');
      }
      if (lookTotal) {
        lookTotal.innerHTML = (t.save ? `<div class="row save"><span>Atelier Privilege (10% on ornaments)</span><span>−${inr(t.save)}</span></div>` : '') +
          `<div class="row total"><span>Ensemble Total</span><span>${inr(t.total)}</span></div>`;
      }
      if (lookAdd) lookAdd.dataset.look = '1';
      if (lookEdit) lookEdit.href = `index.html?style=${s.id}#builder`;
    }

    renderEdits(P.key);

    const picksEl = $('#picks');
    if (picksEl && P.set) {
      picksEl.innerHTML = SLOTS.filter(([k]) => P.set[k]).map(([k]) => ornCard(P.set[k])).join('');
    }

    const factsEl = $('#facts');
    if (factsEl && list.length) {
      const pr = list.map(x => x.eff);
      const t = s ? lookTotals(s, P.set) : { ids: [] };
      factsEl.innerHTML = `
        <div><dt>In this edit</dt><dd>${list.length} ${list.length === 1 ? 'saree' : 'sarees'}</dd></div>
        <div><dt>Prices from</dt><dd>${inr(Math.min(...pr))}</dd></div>
        <div><dt>Fabrics</dt><dd>${[...new Set(list.map(x => x.fabric))].join(', ')}</dd></div>
        <div><dt>Styled set</dt><dd>${t.ids.length} pieces</dd></div>`;
    }
  }

  // --- Unified Click & Event Delegation ---
  document.addEventListener('click', e => {
    // Check closest button or actionable element
    const t = e.target.closest('button, [data-go], [data-checkout], [data-style], .payment-opt');
    if (!t) return;

    // Navigation & Scroll
    if (t.dataset.go) {
      if (t.tagName === 'A') e.preventDefault();
      if (t.dataset.go === 'collection' && homeState.world === 'all' && !homeState.showAllSarees) {
        homeState.showAllSarees = true;
        renderGrid();
      }
      go(t.dataset.go);
      return;
    }

    // Add Ornament to Bag
    if (t.dataset.orn) {
      const o = ORN[t.dataset.orn];
      if (o) {
        bag.push({ kind: 'orn', oid: t.dataset.orn, names: [o[1]], total: o[3] });
        saveBag();
        renderBag();
        toast('Added to your bag');
      }
      return;
    }

    // Quick Add Saree to Bag
    if (t.dataset.quick) {
      const s = saree(t.dataset.quick);
      if (s) {
        bag.push({ sid: s.id, names: [], total: s.eff });
        saveBag();
        renderBag();
        toast('Saree added to your bag');
      }
      return;
    }

    // Add Look (Subpage lead look)
    if (t.dataset.look) {
      if (window.CURRENT_PAGE_LEAD) {
        const s = saree(window.CURRENT_PAGE_LEAD.lead);
        const x = lookTotals(s, window.CURRENT_PAGE_LEAD.set);
        bag.push({ sid: s.id, names: x.ids.map(id => ORN[id][1]), total: x.total });
        saveBag();
        renderBag();
        toast('Look added to your bag');
      }
      return;
    }

    // Add Look (Home Look Builder)
    if ('add' in t.dataset) {
      const s = saree(homeState.cur) || SAREES[0];
      const tt = ornTotalsHome();
      bag.push({ sid: s.id, names: tt.ids.map(id => ORN[id][1]), total: tt.total });
      saveBag();
      renderBag();
      toast('Look added to your bag');
      return;
    }

    // Remove from Bag
    if (t.dataset.remove) {
      bag.splice(+t.dataset.remove, 1);
      saveBag();
      renderBag();
      return;
    }

    // Checkout Flow Trigger
    if ('checkout' in t.dataset || t.id === 'checkoutBtn') {
      openCheckout(true);
      return;
    }

    // Search Modal Triggers
    if (t.id === 'searchBtn') {
      openSearch(true);
      return;
    }
    if (t.id === 'searchClose') {
      openSearch(false);
      return;
    }
    if (t.dataset.searchFilter) {
      searchFilter = t.dataset.searchFilter;
      $$('.search-chips .chip').forEach(c => {
        const active = c.dataset.searchFilter === searchFilter;
        c.classList.toggle('is-active', active);
        c.setAttribute('aria-pressed', active);
      });
      const input = $('#searchInput');
      renderSearchResults(input ? input.value : '');
      return;
    }

    // Account Modal Triggers
    if (t.id === 'acctBtn') {
      openAccount(true);
      return;
    }
    if (t.id === 'accountClose') {
      openAccount(false);
      return;
    }
    if (t.id === 'accountBrowseBtn') {
      openAccount(false);
      return;
    }

    // Checkout Modal Triggers
    if (t.id === 'checkoutClose') {
      openCheckout(false);
      return;
    }
    if (t.id === 'placeOrderBtn') {
      handlePlaceOrder();
      return;
    }
    if (t.id === 'viewInOrdersBtn') {
      openCheckout(false);
      openAccount(true);
      return;
    }
    if (t.id === 'continueShopBtn') {
      openCheckout(false);
      return;
    }

    // Payment Radio Option Selection
    if (t.classList.contains('payment-opt')) {
      const radio = t.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        $$('.payment-opt').forEach(opt => opt.classList.remove('active'));
        t.classList.add('active');
      }
      return;
    }

    // Bag Drawer Triggers
    if (t.id === 'bagBtn') {
      openBag(true);
      return;
    }
    if (t.id === 'bagClose') {
      openBag(false);
      return;
    }

    // Mobile Navigation Menu
    if (t.id === 'menuBtn') {
      const h = t.closest('header');
      if (h) {
        const o = h.classList.toggle('open');
        t.setAttribute('aria-expanded', o);
        t.setAttribute('aria-label', o ? 'Close menu' : 'Open menu');
      }
      return;
    }

    // Theme Switch
    if (t.id === 'themeBtn') {
      const r = document.documentElement;
      const isDark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
      r.dataset.theme = isDark ? 'light' : 'dark';
      saveTheme(r.dataset.theme);
      return;
    }

    // Homepage Editorial Toggles (Worlds / Collection / Styling Studio / Heritage)
    if (t.id === 'worldsToggleBtn') {
      homeState.showAllWorlds = !homeState.showAllWorlds;
      renderWorlds();
      return;
    }
    if (t.id === 'viewAllSareesBtn') {
      if (homeState.world !== 'all') {
        homeState.world = 'all';
        homeState.showAllSarees = true;
        renderWorlds();
        renderChips();
      } else {
        homeState.showAllSarees = !homeState.showAllSarees;
      }
      renderGrid();
      return;
    }
    if (t.dataset.scroll) {
      const el = $('#' + t.dataset.scroll);
      if (el) el.scrollBy({ left: Number(t.dataset.dir) * el.clientWidth * 0.8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      return;
    }
    if (t.id === 'heritagePlay') {
      const v = $('#heritageVideo');
      if (v) {
        v.dataset.userPaused = v.paused ? '' : '1';
        if (v.paused) v.play().catch(() => {}); else v.pause();
        t.textContent = v.paused ? 'Play film' : 'Pause film';
        t.setAttribute('aria-pressed', v.paused);
      }
      return;
    }
    if (t.id === 'reelToggle') {
      homeState.reelPaused = !homeState.reelPaused;
      const r = $('.saree-reel');
      if (r) r.classList.toggle('is-paused', homeState.reelPaused);
      t.setAttribute('aria-pressed', homeState.reelPaused);
      t.textContent = homeState.reelPaused ? 'Play reel' : 'Pause reel';
      return;
    }
    if (t.id === 'startStylingBtn') {
      homeState.slotGroup = homeState.slotGroup === 'all' ? 'primary' : 'all';
      renderBuilder();
      const selectors = $('#studioSelectors');
      if (selectors && window.innerWidth <= 980) {
        selectors.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return;
    }
    if (t.id === 'heritageMoreBtn') {
      const details = $('#heritageDetails');
      if (details) {
        const opening = details.hidden;
        details.hidden = !opening;
        t.setAttribute('aria-expanded', opening);
        t.innerHTML = opening ? 'Show less <span aria-hidden="true">↑</span>' : 'Know more <span aria-hidden="true">→</span>';
      }
      return;
    }

    // Look Builder Interactivity
    if (t.dataset.slotGroup) {
      homeState.slotGroup = t.dataset.slotGroup;
      renderBuilder();
      return;
    }
    if (t.dataset.clearSlot) {
      delete homeState.sel[t.dataset.clearSlot];
      renderBuilder();
      return;
    }
    if (t.dataset.style) {
      styleSaree(t.dataset.style);
      return;
    }
    if (t.dataset.view) {
      homeState.view = t.dataset.view;
      renderBuilder();
      return;
    }
    if (t.dataset.pick) {
      homeState.cur = t.dataset.pick;
      homeState.view = 'model';
      homeState.sel = { ...(saree(homeState.cur) || {}).combo };
      renderBuilder();
      return;
    }
    if (t.dataset.set) {
      setLook(t.dataset.set);
      return;
    }
    if (t.dataset.slot) {
      const k = t.dataset.slot;
      const id = t.dataset.id;
      if (homeState.sel[k] === id) delete homeState.sel[k];
      else homeState.sel[k] = id;
      renderBuilder();
      return;
    }

    // Wishlist toggle across cards
    if (t.dataset.wish) {
      const id = t.dataset.wish;
      if (wish.has(id)) {
        wish.delete(id);
        toast('Removed from wishlist');
      } else {
        wish.add(id);
        toast('Saved to wishlist');
      }
      saveWish();
      $$(`[data-wish="${id}"]`).forEach(btn => btn.setAttribute('aria-pressed', wish.has(id)));
      return;
    }

    // Subpage Color Swatch, View Mode & Reset Filters
    if (t.dataset.colorFilter) {
      const k = t.dataset.colorFilter;
      if (k === 'all') {
        subState.colors.clear();
      } else if (subState.colors.has(k)) {
        subState.colors.delete(k);
      } else {
        subState.colors.add(k);
      }
      $$('[data-color-filter]').forEach(btn => {
        if (btn.dataset.colorFilter !== 'all') {
          btn.setAttribute('aria-pressed', subState.colors.has(btn.dataset.colorFilter));
        }
      });
      if (subState.pageObj) renderSubCatalog(subState.pageObj);
      return;
    }
    if (t.dataset.viewMode) {
      subState.view = t.dataset.viewMode;
      $$('[data-view-mode]').forEach(btn => btn.setAttribute('aria-pressed', btn.dataset.viewMode === subState.view));
      const gridEl = $('#grid');
      if (gridEl) gridEl.classList.toggle('is-list', subState.view === 'list');
      return;
    }
    if (t.id === 'filterResetBtn') {
      subState.occasions.clear();
      subState.colors.clear();
      subState.fabrics.clear();
      subState.types.clear();
      subState.specialOnly = false;
      subState.sort = 'featured';
      const sortEl = $('#sortSelect');
      if (sortEl) sortEl.value = 'featured';
      if (window.PAGE_CFG && window.PAGE_CFG.type === 'ornaments') {
        subState.maxPrice = 5500;
        renderSidebarForOrnaments();
        renderOrnaments();
      } else if (subState.pageObj) {
        subState.maxPrice = 15000;
        renderSidebarForSarees();
        renderSubCatalog(subState.pageObj);
      }
      return;
    }

    // Filter Chips on Ornaments or Home Page
    if (t.dataset.filter) {
      if (window.PAGE_CFG && window.PAGE_CFG.type === 'ornaments') {
        ornPageFilter = t.dataset.filter;
        renderOrnaments();
      } else {
        pickWorld(t.dataset.filter);
      }
      return;
    }

    // World Card Navigation
    if ('world' in t.dataset) {
      const page = PAGES[t.dataset.world];
      if (page) {
        const u = new URL(page, location.href);
        const th = document.documentElement.dataset.theme;
        if (th) u.searchParams.set('theme', th);
        location.href = u.href;
      }
      return;
    }
  });

  // Scrim and Escape Handlers
  document.addEventListener('click', e => {
    if (e.target && e.target.id === 'scrim') {
      closeAllModals();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('saree-plate-art') && e.target.dataset.style) {
      e.preventDefault();
      styleSaree(e.target.dataset.style);
    }
  });

  // Real-time Inputs Handling (Search, Price Range & Checkout PIN/Phone)
  document.addEventListener('input', e => {
    const target = e.target;
    if (target.id === 'priceRangeFilter') {
      subState.maxPrice = Number(target.value);
      const valEl = $('#priceRangeVal');
      if (valEl) {
        const isOrn = window.PAGE_CFG && window.PAGE_CFG.type === 'ornaments';
        valEl.textContent = `Up to ${inr(subState.maxPrice)}${!isOrn && subState.maxPrice >= 15000 ? '+' : ''}`;
      }
      if (window.PAGE_CFG && window.PAGE_CFG.type === 'ornaments') renderOrnaments();
      else if (subState.pageObj) renderSubCatalog(subState.pageObj);
      return;
    }
    if (target.id === 'searchInput') {
      renderSearchResults(target.value);
    }
    if (target.id === 'shipPin') {
      const digits = target.value.replace(/\D/g, '').slice(0, 6);
      target.value = digits;
      const feedback = $('#pinFeedback');
      if (feedback) {
        if (digits.length === 6) {
          if (/^6[789]/.test(digits)) {
            feedback.textContent = '✓ Kerala Express Delivery (4-6 business days)';
            feedback.style.color = 'var(--good,#2f6b4b)';
          } else {
            feedback.textContent = '✓ Valid India PIN · Insured Express Delivery (4-6 business days)';
            feedback.style.color = 'var(--good,#2f6b4b)';
          }
        } else {
          feedback.textContent = 'Please enter a 6-digit India PIN code';
          feedback.style.color = 'var(--muted)';
        }
      }
    }
    if (target.id === 'shipPhone') {
      target.value = target.value.replace(/\D/g, '').slice(0, 10);
    }
  });

  // Sidebar Checkboxes & Sort Dropdown Handler
  document.addEventListener('change', e => {
    const target = e.target;
    if (!target) return;
    let dirtySaree = false;
    let dirtyOrn = false;

    if (target.dataset.subOcc) {
      if (target.checked) subState.occasions.add(target.dataset.subOcc);
      else subState.occasions.delete(target.dataset.subOcc);
      dirtySaree = true;
    } else if (target.dataset.subFab) {
      if (target.checked) subState.fabrics.add(target.dataset.subFab);
      else subState.fabrics.delete(target.dataset.subFab);
      dirtySaree = true;
    } else if (target.dataset.subType) {
      if (target.checked) subState.types.add(target.dataset.subType);
      else subState.types.delete(target.dataset.subType);
      dirtyOrn = true;
    } else if (target.id === 'ornSpecialOnly') {
      subState.specialOnly = !!target.checked;
      dirtyOrn = true;
    } else if (target.id === 'sortSelect') {
      subState.sort = target.value;
      if (window.PAGE_CFG && window.PAGE_CFG.type === 'ornaments') dirtyOrn = true;
      else dirtySaree = true;
    }

    if (dirtyOrn) renderOrnaments();
    if (dirtySaree && subState.pageObj) renderSubCatalog(subState.pageObj);
  });

  // Form Submission Preventer
  document.addEventListener('submit', e => {
    if (e.target.id === 'checkoutForm') {
      e.preventDefault();
      handlePlaceOrder();
    }
  });

  function syncHeaderScroll() {
    const hdr = $('header');
    if (!hdr) return;
    const y = window.scrollY ?? window.pageYOffset ?? 0;
    hdr.classList.toggle('is-scrolled', y > 28);
  }

  // --- Initial Page Bootstrapping ---
  function initPage() {
    ensureModalsMounted();
    syncHeaderScroll();
    if (window.addEventListener) {
      window.addEventListener('scroll', syncHeaderScroll, { passive: true });
    }
    renderBag();

    // Check if on subpage or home page
    const CFG = window.PAGE_CFG;
    if (CFG) {
      if (CFG.type === 'ornaments') {
        renderEdits('ornaments');
        renderOrnaments();
      } else {
        const pageObj = {
          key: CFG.key,
          sarees: CFG.sarees || [],
          more: CFG.more || [],
          lead: CFG.lead,
          set: CFG.set === 'bridal' ? BRIDAL_FULL : CFG.set === 'combo' ? { ...(saree(CFG.lead) || {}).combo } : CFG.set
        };
        window.CURRENT_PAGE_LEAD = pageObj;
        renderSubpage(pageObj);
      }
    } else {
      // Home page initialization
      initHomeState();
      renderWorlds();
      renderChips();
      renderGrid();
      renderBuilder();

      const ornBand = $('#ornBand');
      if (ornBand && window.ORN) {
        ornBand.innerHTML = ['OR00003', 'OR00007', 'OR00004', 'OR00020'].map(id => {
          const o = ORN[id];
          const cat = TYPE[o[0]] || o[0];
          return `
            <article class="orn-plate">
              <a href="ornaments.html" class="orn-plate-media">
                <img src="img/orn/${id}-s.jpg" alt="${o[1]}" width="640" height="360" loading="lazy">
              </a>
              <div class="orn-plate-body">
                <span class="orn-cat">${cat}</span>
                <h3><a href="ornaments.html">${o[1]}</a></h3>
                <div class="orn-plate-foot">
                  <span class="orn-price">${inr(o[3])}</span>
                  <button class="editorial-quiet-add" data-orn="${id}">+ Add to Bag</button>
                </div>
              </div>
            </article>`;
        }).join('');
      }

      // Check URL for style query
      const urlParams = new URLSearchParams(location.search);
      const styleParam = urlParams.get('style');
      if (styleParam && saree(styleParam)) {
        homeState.cur = styleParam;
        homeState.view = 'model';
        homeState.sel = { ...(saree(styleParam) || {}).combo };
        renderBuilder();
        setTimeout(() => go('builder'), 60);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }
})();
