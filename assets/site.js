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
          <button class="btn catalog-add-btn" data-orn="${id}" type="button">Add to bag <span aria-hidden="true">→</span></button>
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
          <a class="art-link" href="styling-room.html?style=${s.id}" aria-label="Style ${s.name} in the atelier">
            ${photo(s.id, `${s.name}, ${s.tone}, worn by a model`)}
            ${hasD ? photo(s.id + '-detail', `Weave detail of the ${s.name}`, 'alt') : ''}
          </a>
          <button class="wish-btn" data-wish="${s.id}" aria-pressed="${wished}" aria-label="Save ${s.name} to wishlist" type="button">${wishHeartSvg}</button>
        </div>
        <div class="card-copy">
          <h3><a href="styling-room.html?style=${s.id}">${s.name},</a></h3>
          <div class="meta">${s.tone}</div>
          <div class="price">
            <b>${inr(s.eff)}</b>${s.disc ? `<s>${inr(s.mrp)}</s>` : ''}
          </div>
        </div>
        <div class="actions">
          <a class="btn catalog-add-btn" href="styling-room.html?style=${s.id}">Style this saree <span aria-hidden="true">→</span></a>
          <button class="catalog-quick" data-quick="${s.id}" type="button">or add the saree only</button>
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
  function reloadBag() {
    try { bag = JSON.parse(localStorage.getItem('sd-bag') || '[]'); } catch (e) { bag = []; }
    renderBag();
  }

  // --- Journey: saree -> ornaments -> bag -> order request ---
  const JOURNEY = ['Saree', 'Ornaments', 'Bag', 'Request'];
  function journey(at) {
    return `<ol class="sd-journey" aria-label="Your progress">${JOURNEY.map((n, i) =>
      `<li class="${i < at ? 'done' : i === at ? 'now' : ''}"${i === at ? ' aria-current="step"' : ''}><span aria-hidden="true">${i < at ? '✓' : i + 1}</span>${n}</li>`).join('')}</ol>`;
  }

  // --- Lead (prototype: kept in this browser only, nothing is sent anywhere) ---
  function getLead() {
    try { return JSON.parse(localStorage.getItem('sd-lead') || 'null'); } catch (e) { return null; }
  }
  function setLead(l) {
    try { localStorage.setItem('sd-lead', JSON.stringify(Object.assign(getLead() || {}, l))); } catch (e) { }
  }
  const LEAD_COPY = {
    hold: {
      t: 'Hold this look for 48 hours?',
      p: 'Handloom pieces are woven in small runs, so the one you picked may not be here tomorrow. Leave your WhatsApp number and we will set these pieces aside for you.',
      b: 'Hold my look'
    },
    send: {
      t: 'Send this look to your WhatsApp',
      p: 'Get the saree, ornaments and total on WhatsApp so you can decide with family. A stylist can answer blouse and drape questions in the same chat.',
      b: 'Send my look'
    }
  };
  let leadNext = null;
  function openLead(kind, next) {
    leadNext = next || null;
    let m = $('#leadModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'leadModal';
      m.className = 'lead-modal';
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-modal', 'true');
      m.setAttribute('aria-labelledby', 'leadTitle');
      document.body.appendChild(m);
    }
    const c = LEAD_COPY[kind] || LEAD_COPY.hold;
    const L = getLead() || {};
    m.innerHTML = `
      <form class="lead-box" id="leadForm" novalidate>
        <button class="ibtn lead-x" type="button" data-leadskip aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <p class="lead-k">Sopanam Drapes</p>
        <h3 id="leadTitle">${c.t}</h3>
        <p class="lead-p">${c.p}</p>
        <label for="leadName">Your name</label>
        <input id="leadName" autocomplete="name" value="${L.name || ''}" placeholder="e.g. Anjali">
        <label for="leadPhone">WhatsApp number</label>
        <div class="lead-tel"><span>+91</span><input id="leadPhone" type="tel" inputmode="numeric" maxlength="10" autocomplete="tel-national" value="${L.phone || ''}" placeholder="10-digit mobile"></div>
        <small class="lead-err" id="leadErr" hidden>Enter the 10-digit number you use on WhatsApp.</small>
        <button class="btn lead-go" type="submit">${c.b}</button>
        <button class="lead-skip" type="button" data-leadskip>${kind === 'hold' ? 'Skip, just show my bag' : 'Not now'}</button>
        <p class="lead-fine">We only message you about this look. No spam, no calls.</p>
      </form>`;
    m.dataset.kind = kind;
    m.hidden = false;
    const ph = $('#leadPhone');
    setTimeout(() => { (L.phone ? $('.lead-go') : $('#leadName'))?.focus(); }, 30);
    ph.addEventListener('input', () => { ph.value = ph.value.replace(/\D/g, '').slice(0, 10); $('#leadErr').hidden = true; });
    $('#leadForm').addEventListener('submit', ev => {
      ev.preventDefault();
      const phone = ph.value.trim();
      if (!/^[6-9]\d{9}$/.test(phone)) { $('#leadErr').hidden = false; ph.focus(); return; }
      setLead({ name: $('#leadName').value.trim(), phone, via: kind });
      closeLead(true);
      toast(kind === 'send' ? `Look sent to +91 ${phone}` : 'Held for 48 hours. We will WhatsApp you.');
    });
  }
  function closeLead(go) {
    const m = $('#leadModal');
    if (m) m.hidden = true;
    const n = leadNext; leadNext = null;
    if (n && go !== false) n();
  }
  function afterAdd(msg) {
    let asked = false;
    try { asked = !!sessionStorage.getItem('sd-lead-asked'); } catch (e) { }
    if (!getLead() && !asked) {
      try { sessionStorage.setItem('sd-lead-asked', '1'); } catch (e) { }
      openLead('hold', () => openBag(true));
    } else {
      openBag(true);
      if (msg) toast(msg);
    }
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

    const jEl = $('#bagJourney') || (() => {
      const d = document.createElement('div');
      d.id = 'bagJourney';
      itemsEl.parentNode.insertBefore(d, itemsEl);
      return d;
    })();
    jEl.innerHTML = journey(2);
    if (!n) {
      itemsEl.innerHTML = '<div class="empty">Your bag is empty.<br><a class="btn small" href="styling-room.html" style="margin-top:14px">Start in the Styling Room</a></div>';
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
      const bare = bag.find(b => b.kind !== 'orn' && !(b.names && b.names.length));
      const hasSaree = bag.some(b => b.kind !== 'orn');
      const up = bare
        ? `<a class="bag-upsell" href="styling-room.html?style=${bare.sid}"><b>Complete this saree</b><span>Pick its ornaments in the Styling Room. Two or more pieces: 10% off.</span><i aria-hidden="true">→</i></a>`
        : !hasSaree
          ? `<a class="bag-upsell" href="styling-room.html"><b>Find the saree for these</b><span>Pair your ornaments with a saree in the Styling Room.</span><i aria-hidden="true">→</i></a>`
          : '';
      footEl.innerHTML = `
        ${up}
        <div class="row total"><span>Subtotal</span><span>${inr(subtotal)}</span></div>
        <button class="btn bag-go" data-checkout type="button">Request this order <span aria-hidden="true">→</span></button>
        <p class="bag-fine">No payment now. We confirm on WhatsApp first.</p>`;
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
    if (checkoutModal.dataset.v !== 'req') {
      checkoutModal.dataset.v = 'req';
      checkoutModal.innerHTML = `
        <div class="modal-box checkout-box">
          <div class="modal-head">
            <h3 id="checkoutModalTitle">Request your order</h3>
            <button class="ibtn modal-close" id="checkoutClose" aria-label="Close checkout">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div id="coJourney"></div>
          <div class="checkout-body" id="checkoutBody">
            <form id="checkoutForm" class="checkout-form" onsubmit="return false;" novalidate>
              <p class="co-lede">No payment now. A Sopanam stylist checks every piece, confirms your blouse and drape details on WhatsApp, then you pay.</p>
              <div class="checkout-step">
                <h4>Your details</h4>
                <div class="form-grid">
                  <div class="form-group full">
                    <label for="shipName">Full name</label>
                    <input type="text" id="shipName" autocomplete="name" required>
                  </div>
                  <div class="form-group">
                    <label for="shipPhone">WhatsApp number</label>
                    <input type="tel" id="shipPhone" inputmode="numeric" maxlength="10" autocomplete="tel-national" required placeholder="10-digit mobile">
                  </div>
                  <div class="form-group">
                    <label for="shipPin">PIN code</label>
                    <input type="text" id="shipPin" inputmode="numeric" maxlength="6" autocomplete="postal-code" required>
                    <small id="pinFeedback" class="co-pin" hidden></small>
                  </div>
                  <div class="form-group full">
                    <label for="shipAddress">Delivery address</label>
                    <textarea id="shipAddress" required rows="2" autocomplete="street-address" placeholder="House or flat, street, locality, city"></textarea>
                  </div>
                  <div class="form-group full">
                    <label for="shipBy">Need it by <span class="co-opt">optional</span></label>
                    <input type="date" id="shipBy">
                  </div>
                </div>
              </div>
              <div class="checkout-step">
                <h4>How you'd like to pay</h4>
                <div class="payment-methods">
                  <label class="payment-opt active">
                    <input type="radio" name="payMethod" value="upi" checked>
                    <span class="pay-title">UPI link on WhatsApp</span>
                    <span class="pay-desc">Sent once we confirm your order</span>
                  </label>
                  <label class="payment-opt">
                    <input type="radio" name="payMethod" value="cod">
                    <span class="pay-title">Cash on delivery</span>
                    <span class="pay-desc">Pay when your parcel arrives</span>
                  </label>
                </div>
              </div>
              <div class="checkout-summary" id="checkoutSummary"></div>
              <div class="checkout-actions">
                <button type="submit" class="btn" id="placeOrderBtn" style="width:100%;justify-content:center">Send order request <span aria-hidden="true">→</span></button>
                <p class="co-fine">By sending, you agree to hear from us on WhatsApp about this order.</p>
              </div>
            </form>
            <div class="order-confirmed" id="orderConfirmed" hidden></div>
          </div>
        </div>`;
      const pin = $('#shipPin'), fb = $('#pinFeedback'), ph = $('#shipPhone');
      pin.addEventListener('input', () => {
        pin.value = pin.value.replace(/\D/g, '').slice(0, 6);
        const ok = /^[1-9]\d{5}$/.test(pin.value);
        fb.hidden = !ok;
        if (ok) fb.textContent = /^6[7-9]/.test(pin.value) ? '✓ Kerala: delivered in 2–4 days' : '✓ Delivered in 4–6 business days';
      });
      ph.addEventListener('input', () => { ph.value = ph.value.replace(/\D/g, '').slice(0, 10); });
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
            <a class="btn small ghost" href="styling-room.html?style=${s.id}">Style the look</a>
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
      const L = getLead();
      const set = (sel, v) => { const el = modal.querySelector(sel); if (el) el.textContent = v; };
      const nm = (L && L.name) || 'Guest';
      set('.profile-name', nm);
      set('.profile-avatar', nm.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase());
      set('.profile-phone', L && L.phone ? '+91 ' + L.phone.replace(/(\d{5})(\d{5})/, '$1 $2') : 'Add your WhatsApp number at checkout');
      set('.profile-location', '');
      set('.profile-tier', L ? 'Sopanam client' : '');
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

      const cj = $('#coJourney');
      if (cj) cj.innerHTML = journey(3);
      const L = getLead() || {};
      if (L.name && !$('#shipName').value) $('#shipName').value = L.name;
      if (L.phone && !$('#shipPhone').value) $('#shipPhone').value = L.phone;
      renderCheckoutSummary();
      setTimeout(() => { const f = ['#shipName', '#shipPhone', '#shipPin', '#shipAddress'].map(x => $(x)).find(x => x && !x.value); if (f) f.focus(); }, 60);
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
      <h4 style="margin-top:0;margin-bottom:12px;font-size:17px;">Order summary (${bag.length} ${bag.length === 1 ? 'item' : 'items'})</h4>
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
        <span>Shipping across India</span>
        <span>FREE</span>
      </div>
      <div class="row total" style="display:flex;justify-content:space-between;padding-top:10px;border-top:1px dashed var(--line);margin-top:8px;font-size:18px;font-weight:700;">
        <span>Total <small style="font-weight:400;font-size:12px;color:var(--muted)">pay after we confirm</small></span>
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
    if (!/^[6-9]\d{9}$/.test(phone)) {
      toast('Enter the 10-digit number you use on WhatsApp');
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
      upi: 'UPI link on WhatsApp',
      cod: 'Cash on delivery'
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
      status: 'Requested',
      needBy: ($('#shipBy') || {}).value || '',
      estDelivery: '4-6 business days'
    };

    // Save to localStorage sd-orders
    const orders = getOrders();
    orders.unshift(newOrder);
    try {
      localStorage.setItem('sd-orders', JSON.stringify(orders));
    } catch (e) { }

    setLead({ name: name, phone: phone });

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
      const first = name.split(' ')[0];
      const lines = orderItems.map(b => b.kind === 'orn'
        ? `• ${(ORN[b.oid] || [, 'Ornament'])[1]} (${inr(b.total)})`
        : `• ${(saree(b.sid) || { name: 'Saree' }).name}${b.names && b.names.length ? ' + ' + b.names.join(', ') : ''} (${inr(b.total)})`).join('\n');
      const waText = `Hi Sopanam Drapes, I just sent order request ${orderId}.\n${lines}\nTotal: ${inr(total)}\nPayment: ${paymentLabel}\nName: ${name}, PIN ${pin}`;
      confirmed.innerHTML = `
        <div class="checkmark-circle">✓</div>
        <h2>Request sent</h2>
        <p class="lead-confirm">Thank you, ${first}. Your pieces are set aside. A stylist will message you on WhatsApp at +91 ${phone} within 2 hours.</p>
        <div class="order-ref-pill">${orderId}</div>
        <ol class="co-next">
          <li><b>Within 2 hours</b><span>We check each piece and confirm blouse size and drape with you on WhatsApp.</span></li>
          <li><b>Payment</b><span>${payVal === 'cod' ? 'Pay in cash when your parcel arrives.' : 'We send a secure UPI link in the same chat.'}</span></li>
          <li><b>Delivery</b><span>Packed by hand and delivered in 4–6 business days.</span></li>
        </ol>
        <div class="co-total"><span>${orderItems.length} ${orderItems.length === 1 ? 'item' : 'items'} · ${paymentLabel}</span><b>${inr(total)}</b></div>
        <div class="confirm-actions">
          <a class="btn co-wa" href="https://wa.me/919847012345?text=${encodeURIComponent(waText)}" target="_blank" rel="noopener noreferrer">Confirm on WhatsApp</a>
          <button class="btn ghost" id="viewInOrdersBtn" type="button">View my orders</button>
        </div>`;
    }

    toast(`Request ${orderId} sent`);
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

  const ROOM_ICONS = {
    necklace: '<path d="M5 4c0 6 3 10 7 10s7-4 7-10"/><path d="M12 14v2.5"/><path d="M12 16.5l2 2.2-2 2.3-2-2.3z"/>',
    bangles: '<ellipse cx="9.5" cy="12" rx="5.5" ry="7"/><ellipse cx="14.5" cy="12" rx="5.5" ry="7"/>',
    earrings: '<path d="M8 3.5a2.5 2.5 0 1 1 0 5"/><path d="M8 8.5v2"/><path d="M8 10.5c-2 2.5-3 4.3-3 6a3 3 0 0 0 6 0c0-1.7-1-3.5-3-6z"/><path d="M17 5.5v3"/><circle cx="17" cy="11" r="2.5"/>',
    ring: '<circle cx="12" cy="15" r="5.5"/><path d="M9.5 6.5h5l1.5 2-4 3-4-3z"/>',
    more: '<path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z"/>'
  };
  const roomIcon = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ROOM_ICONS[k]}</svg>`;

  function renderBuilder() {
    const builderEl = $('#builder');
    if (!builderEl) return;
    const s = saree(homeState.cur) || SAREES[0];
    if (!s) return;

    const CHECK = '<span class="room-check" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg></span>';
    const label = Object.fromEntries(SLOTS);
    const t = ornTotalsHome();

    // Ambient backdrop picks up the saree's colour
    const amb = $('#studioAmb');
    if (amb && amb.dataset.cur !== s.id) {
      amb.dataset.cur = s.id;
      amb.style.backgroundImage = `url(img/${s.id}.jpg)`;
    }

    // 1. Saree: the chosen one, with the rest a tap away
    const pickerEl = $('#picker');
    if (pickerEl) {
      const open = !!homeState.pickOpen;
      pickerEl.innerHTML = `
        <button class="studio-saree" data-pickopen aria-expanded="${open}" type="button">
          ${photo(s.id, '')}
          <span><b>${s.name}</b><i>${s.tone}</i><em>${inr(s.eff)}${s.disc ? ` <s>${inr(s.mrp)}</s>` : ''}</em></span>
          <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        </button>
        <div class="studio-saree-list" ${open ? '' : 'hidden'}>
          ${SAREES.filter(x => x.id !== s.id).map(x => `
          <button class="studio-saree-opt" data-pick="${x.id}" type="button">
            ${photo(x.id, '')}<span><b>${x.name}</b><i>${x.tone}</i></span><em>${inr(x.eff)}</em>
          </button>`).join('')}
        </div>`;
    }

    // Stage photo, view switch and tools
    const hasD = (HAS_DETAIL || []).includes(s.id);
    if (homeState.view === 'detail' && !hasD) homeState.view = 'model';
    const view = homeState.view || 'model';
    const stageArtEl = $('#stageArt');
    if (stageArtEl) {
      const key = s.id + (view === 'detail' ? '-d' : '');
      if (stageArtEl.dataset.key !== key) {
        stageArtEl.dataset.key = key;
        stageArtEl.innerHTML = view === 'detail' ? photo(s.id + '-detail', `Weave detail of the ${s.name}`) : photo(s.id, `${s.name}, ${s.tone}, worn by a model`);
      }
      stageArtEl.classList.toggle('is-close', view === 'close');
      stageArtEl.classList.toggle('is-back', view === 'look');
    }
    // "Your look": everything chosen, laid out on the stage
    const stageEl = $('#stage');
    if (stageEl) {
      let board = $('#stageBoard');
      if (!board) { board = document.createElement('div'); board.id = 'stageBoard'; board.className = 'studio-board'; stageEl.insertBefore(board, $('#stageTools')); }
      board.hidden = view !== 'look';
      stageEl.classList.toggle('has-board', view === 'look');
      if (view === 'look') {
        const slotOf = id => Object.keys(homeState.sel).find(k => homeState.sel[k] === id);
        const mrpSave = (s.mrp - s.eff) + t.ids.reduce((a, id) => a + Math.max(0, ORN[id][2] - ORN[id][3]), 0);
        board.innerHTML = `
          <div class="sb-in">
            <h2>Your look</h2>
            <p class="sb-sub">${t.ids.length + 1} ${t.ids.length ? 'pieces' : 'piece'}, chosen by you</p>
            <div class="sb-grid${t.ids.length > 4 ? ' many' : ''}">
              <figure class="sb-saree">${photo(s.id, '')}<figcaption><b>${s.name}</b><span>${s.tone}</span><em>${inr(s.eff)}</em></figcaption></figure>
              <div class="sb-orns">
                ${t.ids.map(id => `<figure><img src="img/orn/${id}-s.jpg" alt=""><button data-clear-slot="${slotOf(id)}" type="button" aria-label="Remove ${ORN[id][1]}">×</button><figcaption><b>${ORN[id][1]}</b><em>${inr(ORN[id][3])}</em></figcaption></figure>`).join('')}
                ${t.ids.length ? '' : '<p class="sb-empty">No ornaments yet. Pick a type on the left, or try a suggestion on the right.</p>'}
              </div>
            </div>
            <div class="sb-foot">
              <span>${t.save + mrpSave ? `You save ${inr(t.save + mrpSave)}` : 'Two or more ornaments take 10% off'}</span>
              <b>${inr(t.total)}</b>
              <button class="btn" data-add type="button">Add look to bag</button>
            </div>
          </div>`;
      }
    }
    const viewsEl = $('#views');
    if (viewsEl) {
      const V = [['model', 'Full view', '<circle cx="12" cy="7" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3"/>'], ['close', 'Close-up', '<path d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3"/><circle cx="12" cy="12" r="3"/>']];
      if (hasD) V.push(['detail', 'The weave', '<path d="M4 8h16M4 12h16M4 16h16M8 4v16M12 4v16M16 4v16"/>']);
      V.push(['look', `Your look <i>${t.ids.length + 1}</i>`, '<path d="M5.5 8.5h13l-1 11h-11z"/><path d="M9 8.5V7a3 3 0 016 0v1.5"/>']);
      viewsEl.innerHTML = V.map(([k, l, ic]) => `<button data-view="${k}" aria-pressed="${view === k}" type="button"><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg>${l}</button>`).join('');
    }
    const toolsEl = $('#stageTools');
    if (toolsEl) {
      const fs = !!document.fullscreenElement;
      toolsEl.innerHTML = `
        <button data-view="${view === 'close' ? 'model' : 'close'}" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>${view === 'close' ? '<path d="M8.5 11h5"/>' : '<path d="M8.5 11h5M11 8.5v5"/>'}</svg>Zoom</button>
        <button data-wish="${s.id}" aria-pressed="${wish.has(s.id)}" type="button"><svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 15.6 12 20 12 20z"/></svg>Save</button>
        ${document.fullscreenEnabled ? `<button data-fullscreen type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>${fs ? 'Exit' : 'Fullscreen'}</button>` : ''}`;
    }

    // 2. Ornament types
    const TABS = [['necklace', 'Necklaces', ['necklace']], ['bangles', 'Bangles', ['bangles']], ['earrings', 'Earrings', ['earrings']], ['ring', 'Rings', ['ring']], ['more', 'More', ['anklet', 'bracelet', 'waistband']]];
    if (!TABS.some(([k]) => k === homeState.slotGroup)) homeState.slotGroup = 'necklace';
    const tab = TABS.find(([k]) => k === homeState.slotGroup);
    const slotTabsEl = $('#slotTabs');
    if (slotTabsEl) {
      slotTabsEl.innerHTML = TABS.map(([k, l, ks]) => {
        const n = ks.filter(x => homeState.sel[x]).length;
        return `<button class="studio-chip" data-slot-group="${k}" aria-pressed="${k === homeState.slotGroup}" type="button">${roomIcon(k)}${l}${n ? `<i>${n}</i>` : ''}</button>`;
      }).join('');
    }

    // 3. What's in the look
    const lookEl = $('#lookList');
    if (lookEl) {
      const slotOf = id => Object.keys(homeState.sel).find(k => homeState.sel[k] === id);
      lookEl.innerHTML = `
        <li><img src="img/${s.id}.jpg" alt=""><span><b>${s.name}</b>${inr(s.eff)}</span></li>
        ${t.ids.map(id => `<li><img src="img/orn/${id}-s.jpg" alt=""><span><b>${ORN[id][1]}</b>${inr(ORN[id][3])}</span><button data-clear-slot="${slotOf(id)}" type="button" aria-label="Remove ${ORN[id][1]}">×</button></li>`).join('')}
        ${t.ids.length ? '' : '<li class="hint">No ornaments yet. Pick a type above, or try a suggestion.</li>'}`;
    }
    const sideFoot = $('#sideFoot');
    if (sideFoot) {
      sideFoot.innerHTML = `
        <button class="btn studio-save" data-wish="${s.id}" aria-pressed="${wish.has(s.id)}" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16l-5-3.5L7 20z"/></svg><span class="off">Save look</span><span class="on">Look saved</span></button>
        <button class="studio-share" data-sendlook type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2.2"/><circle cx="17" cy="6" r="2.2"/><circle cx="17" cy="18" r="2.2"/><path d="M8 11l7-4M8 13l7 4"/></svg>Send look to WhatsApp</button>`;
    }

    // Style suggestions: three curated looks for this saree
    const setsEl = $('#sets');
    if (setsEl) {
      const norm = o => JSON.stringify(Object.entries(o || {}).filter(([, v]) => v).sort());
      const cur = norm(homeState.sel);
      const light = { earrings: s.combo.earrings || 'OR00009' };
      const LOOKS = [
        ['default', 'Classic pairing', 'Chosen for this saree', s.combo],
        ['light', 'Light touch', 'Earrings only', light],
        ['bridal', 'Full bridal', 'Necklace to waistband', BRIDAL_FULL]
      ];
      setsEl.innerHTML = LOOKS.map(([k, n, d, sel]) => {
        const x = lookTotals(s, sel), on = norm(sel) === cur;
        const pics = x.ids.slice(0, 3);
        return `
        <button class="studio-lookcard" data-set="${k}" aria-pressed="${on}" type="button">
          <span class="lc-art">${photo(s.id, '')}<span class="lc-orn">${pics.map(id => `<img src="img/orn/${id}-s.jpg" alt="" loading="lazy">`).join('')}</span>${on ? CHECK : ''}</span>
          <b>${n}</b><i>${d}</i><em>${inr(x.total)}</em>
        </button>`;
      }).join('');
    }

    // Ornaments for the chosen type
    const slotsEl = $('#slots');
    if (slotsEl) {
      const tt = $('#touchTitle'), ts = $('#touchSub');
      if (tt) tt.textContent = tab[0] === 'more' ? 'Anklets, bracelets and waistbands' : tab[1];
      if (ts) ts.textContent = t.ids.length >= 2 ? '10% off your ornaments is applied' : 'Two or more ornaments take 10% off';
      const grp = slotsEl.dataset.grp !== tab[0];
      slotsEl.dataset.grp = tab[0];
      slotsEl.innerHTML = tab[2].flatMap(k => (OPTS[k] || []).map(id => {
        const o = ORN[id], on = homeState.sel[k] === id;
        return `
        <button class="studio-orn" data-slot="${k}" data-id="${id}" aria-pressed="${on}" type="button" aria-label="${on ? 'Remove' : 'Add'} ${o[1]}, ${inr(o[3])}">
          <span class="so-img"><img src="img/orn/${id}-s.jpg" alt="" width="240" height="160" loading="lazy">${on ? CHECK : '<span class="so-plus" aria-hidden="true">+</span>'}${tab[0] === 'more' ? `<em>${label[k]}</em>` : ''}</span>
          <b>${o[1]}</b>
          <i>${inr(o[3])}${o[3] < o[2] ? ` <s>${inr(o[2])}</s>` : ''}</i>
        </button>`;
      })).join('');
      if (grp) slotsEl.scrollLeft = 0;
    }

    // Total and the way forward
    const totalsEl = $('#totals');
    if (totalsEl) {
      const mrpSave = (s.mrp - s.eff) + t.ids.reduce((a, id) => a + Math.max(0, ORN[id][2] - ORN[id][3]), 0);
      const saving = t.save + mrpSave;
      const n = t.ids.length + 1;
      totalsEl.innerHTML = `
        <div class="st-row">
          <span>${n} ${n === 1 ? 'piece' : 'pieces'}${saving ? `<small>You save ${inr(saving)}</small>` : ''}</span>
          <b>${inr(t.total)}</b>
        </div>
        <button class="btn room-add" data-add type="button">Add look to bag</button>`;
    }

    // Mobile Action Bar
    renderMobileBuilderBar(s, t);
    tellSakhi();
  }

  // Sakhi sits in the room's side panel and always knows what is on the stage
  function stageText() {
    const s = saree(homeState.cur) || SAREES[0];
    const t = ornTotalsHome();
    return `${s.name}, ${s.tone}, ${s.fabric}, ${inr(s.eff)}; ornaments: ${t.ids.map(id => ORN[id][1]).join(', ') || 'none'}; look total ${inr(t.total)}`;
  }
  function tellSakhi() {
    const f = $('#sakhiPane iframe');
    if (f && f.contentWindow) { try { f.contentWindow.postMessage({ type: 'sd-stage', text: stageText() }, location.origin); } catch (e) { } }
  }
  function setPanelTab(tab) {
    const pane = $('#sakhiPane'), browse = $('#browsePane');
    if (!pane || !browse) return;
    const sk = tab === 'sakhi';
    if (sk && !pane.firstChild) {
      const th = document.documentElement.dataset.theme;
      const f = document.createElement('iframe');
      f.title = 'Sakhi, your stylist';
      f.src = 'stylist.html?embed=1&room=1&from=styling-room&v=20261114e' + (th ? '&theme=' + th : '');
      f.addEventListener('load', tellSakhi);
      pane.appendChild(f);
    }
    pane.hidden = !sk;
    browse.hidden = sk;
    $$('[data-ptab]').forEach(b => b.setAttribute('aria-selected', b.dataset.ptab === tab));
    const b = $('#builder');
    if (b) b.classList.toggle('is-sakhi', sk);
  }
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data || !$('#builder')) return;
    if (e.data.type === 'sd-look' && saree(e.data.sid)) {
      homeState.cur = e.data.sid;
      homeState.view = 'model';
      homeState.pickOpen = false;
      homeState.sel = { ...(e.data.sel || {}) };
      renderBuilder();
      if (innerWidth <= 980) $('#stage').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
    if (e.data.type === 'sd-added') { reloadBag(); afterAdd('Look added to your bag'); }
  });

  // Home: a slim preview of the Styling Room with one composed look
  function renderRoomTeaser() {
    const el = $('#roomTeaser');
    if (!el) return;
    const s = saree('SA00001') || SAREES[0];
    const ids = Object.values(s.combo || {}).filter(Boolean);
    const sum = ids.reduce((a, id) => a + ORN[id][3], 0);
    const save = ids.length >= 2 ? Math.round(sum * 0.10) : 0;
    const total = s.eff + sum - save;
    const pieces = [[`img/${s.id}.jpg`, s.name, s.eff], ...ids.map(id => [`img/orn/${id}-s.jpg`, ORN[id][1], ORN[id][3]])];
    const starts = SAREES.filter(x => x.id !== s.id).slice(0, 4);
    el.innerHTML = `
      <div class="rt-in">
        <a class="rt-photo" href="styling-room.html?style=${s.id}" aria-label="Open this look in the Styling Room">${photo(s.id, `${s.name}, ${s.tone}, styled with ornaments`)}</a>
        <div class="rt-copy">
          <p class="room-eyebrow">The Sopanam Styling Room</p>
          <h2 id="teaserTitle">A look, beautifully composed.</h2>
          <p class="rt-sub">Pick a saree, add its ornaments, see the total. Two or more pieces take 10% off the jewellery.</p>
          <div class="rt-look">
            ${pieces.map(([img, n, p], i) => `${i ? '<span class="rt-plus" aria-hidden="true">+</span>' : ''}<span class="rt-piece"><img src="${img}" alt="" loading="lazy"><b>${n}</b><span>${inr(p)}</span></span>`).join('')}
            <span class="rt-eq" aria-hidden="true">=</span>
            <span class="rt-total"><b>${inr(total)}</b>${save ? `<span>you save ${inr(save + (s.mrp - s.eff))}</span>` : ''}</span>
          </div>
          <div class="rt-cta">
            <a class="btn" href="styling-room.html">Compose your own look <span aria-hidden="true">→</span></a>
            <a class="btn ghost" href="styling-room.html?sakhi=1">Help me choose</a>
          </div>
        </div>
        <div class="rt-starts">
          <p class="rt-starts-h">Or start from</p>
          <div class="rt-grid">${starts.map(x => `<a class="rt-start" href="styling-room.html?style=${x.id}">${photo(x.id, '')}<span>${x.name}<small>${x.tone}</small></span></a>`).join('')}</div>
        </div>
      </div>`;
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
      location.href = `styling-room.html?style=${id}`;
    }
  }

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
    const list = houseEdits.filter(c => c.k !== excludeKey);
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
      if (lookEdit) lookEdit.href = `styling-room.html?style=${s.id}`;
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
        afterAdd(`${o[1]} added`);
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
        afterAdd('Saree added to your bag');
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
        afterAdd('Look added to your bag');
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
      afterAdd('Look added to your bag');
      return;
    }

    // Lead sheet
    if ('sendlook' in t.dataset) {
      openLead('send');
      return;
    }
    if ('leadskip' in t.dataset) {
      closeLead(true);
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
      return; // handled by the form's submit event
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
    if (t.dataset.ptab) {
      setPanelTab(t.dataset.ptab);
      return;
    }
    if ('pickopen' in t.dataset) {
      homeState.pickOpen = !homeState.pickOpen;
      renderBuilder();
      return;
    }
    if ('fullscreen' in t.dataset) {
      const st = $('#stage');
      if (document.fullscreenElement) document.exitFullscreen();
      else if (st && st.requestFullscreen) st.requestFullscreen().catch(() => { });
      return;
    }
    if (t.dataset.pick) {
      homeState.pickOpen = false;
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

    if (t.id === 'filterToggle') { toggleFilters(!document.body.classList.contains('filters-open')); return; }
    if (t.id === 'filterApply') { toggleFilters(false); return; }

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
      if (wish.has(id) && t.classList.contains('studio-save') && !getLead()) openLead('send');
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
    if (e.target && e.target.id === 'leadModal') closeLead(true);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const lm = $('#leadModal');
      if (lm && !lm.hidden) { closeLead(true); return; }
      if (document.body.classList.contains('filters-open')) { toggleFilters(false); return; }
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

  function toggleFilters(open) {
    document.body.classList.toggle('filters-open', open);
    const b = $('#filterToggle');
    if (b) b.setAttribute('aria-expanded', open);
    if (open) { const f = $('.filter-panel input, .filter-panel button'); if (f) f.focus({ preventScroll: true }); }
    else if (b) b.focus({ preventScroll: true });
  }

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
    window.SD = { reloadBag, openBag, openCheckout: () => openCheckout(true) };
    if (/[?&]checkout=1/.test(location.search)) {
      try { history.replaceState(null, '', location.pathname); } catch (e) { }
      if (bag.length) setTimeout(() => openCheckout(true), 80);
    }

    // Filters live behind a button on phones and tablets
    const fp = $('.filter-panel'), cc = $('.catalog-controls');
    if (fp && cc && !$('#filterToggle')) {
      cc.insertAdjacentHTML('afterbegin', '<button class="filter-toggle" id="filterToggle" type="button" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>Filters</button>');
      fp.insertAdjacentHTML('beforeend', '<button class="btn filter-apply" id="filterApply" type="button">Show results</button>');
      const bd = document.createElement('div');
      bd.className = 'filter-backdrop';
      bd.id = 'filterBackdrop';
      document.body.appendChild(bd);
      bd.addEventListener('click', () => toggleFilters(false));
    }

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
      renderRoomTeaser();

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
        const selParam = urlParams.get('sel');
        if (selParam !== null) {
          homeState.sel = {};
          selParam.split(',').forEach(id => { if (ORN[id]) homeState.sel[ORN[id][0]] = id; });
        }
        renderBuilder();
      }
      if ($('#builder')) {
        window.SD.openSakhi = () => { setPanelTab('sakhi'); if (innerWidth <= 980) $('#sakhiPane').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
        if (urlParams.get('sakhi') === '1') { setPanelTab('sakhi'); if (innerWidth <= 980) setTimeout(() => $('.studio-tabs').scrollIntoView({ block: 'start' }), 300); }
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }
  document.addEventListener('fullscreenchange', () => renderBuilder());
})();
