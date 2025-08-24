/*
  ProyectoFinal_Olivares - Simulador Ecommerce en JavaScript
  - Datos desde JSON (data/products.json)
  - HTML generado desde JS
  - Carrito con persistencia en localStorage
  - Reemplazo de alert/prompt/confirm por SweetAlert2
*/

// Utilidades
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const money = (n) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Genera variantes responsive para imágenes (pensado para Unsplash)
function imgSources(url, widths = [400, 800, 1200], sizes) {
  const defaultSizes = '(max-width: 600px) 100vw, (max-width: 1200px) 50vw, 33vw';
  try {
    const withWidth = (w) => {
      const u = new URL(url);
      u.searchParams.set('w', String(w));
      u.searchParams.set('q', '80');
      u.searchParams.set('auto', 'format');
      u.searchParams.set('fit', 'crop');
      return u.toString();
    };
    const src = withWidth(Math.max(...widths));
    const srcset = widths.map(w => `${withWidth(w)} ${w}w`).join(', ');
    return { src, srcset, sizes: sizes || defaultSizes };
  } catch (_) {
    return { src: url, srcset: '', sizes: sizes || defaultSizes };
  }
}

const STORAGE_KEYS = {
  CART: 'pf_olivares_cart_v1',
  PREFS: 'pf_olivares_prefs_v1'
};

// Estado de la app
const state = {
  products: [],
  categories: [],
  filtered: [],
  cart: new Map(), // id -> { product, qty }
  prefs: { search: '', category: '', sort: 'relevance', coupon: '', couponApplied: '', shippingZip: '', shippingCost: 0 }
};

async function fetchData() {
  const res = await fetch('./data/products.json');
  if (!res.ok) throw new Error('No se pudieron cargar los datos');
  const data = await res.json();
  return data;
}

function loadPersisted() {
  try {
    const cartRaw = localStorage.getItem(STORAGE_KEYS.CART);
    if (cartRaw) {
      const parsed = JSON.parse(cartRaw);
      for (const item of parsed) {
        state.cart.set(item.product.id, { product: item.product, qty: item.qty });
      }
    }
    const prefsRaw = localStorage.getItem(STORAGE_KEYS.PREFS);
    if (prefsRaw) state.prefs = { ...state.prefs, ...JSON.parse(prefsRaw) };
  } catch (_) { /* noop */ }
}

function persist() {
  const cartArr = Array.from(state.cart.values());
  localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cartArr));
  localStorage.setItem(STORAGE_KEYS.PREFS, JSON.stringify(state.prefs));
}

// Renderizado
function renderCategories() {
  const sel = $('#category-filter');
  sel.innerHTML = '<option value="">Todas las categorías</option>' + state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  sel.value = state.prefs.category;
}

// Ofertas: ids y porcentajes (0.5 = 50%)
const OFFERS = new Map([
  ['p-1002', 0.5], // Smartwatch
  ['p-1007', 0.3], // Ratón Razer
  ['p-1008', 0.15] // MacBook M4
]);
const getDiscount = (p) => OFFERS.get(p.id) || 0;
const discountedPrice = (p) => {
  const d = getDiscount(p);
  if (!d) return null;
  const final = Math.round((p.price * (1 - d)) * 100) / 100;
  return { old: p.price, final, percent: Math.round(d * 100) };
};

function productCard(p) {
  const inCart = state.cart.get(p.id)?.qty || 0;
  const stockLeft = p.stock - inCart;
  const disabled = stockLeft <= 0 ? 'disabled' : '';
  const disc = discountedPrice(p);
  const badge = disc ? `<span class="badge-offer" style="display:inline-block;background:#ef4444;color:#fff;border-radius:8px;padding:2px 6px;font-size:12px;font-weight:700">-${disc.percent}%</span>` : '';
  const img = imgSources(p.image);
  return `
  <article class="product-card" data-id="${p.id}" ${disc ? 'data-offer="true"' : ''}>
    <img src="${img.src}" srcset="${img.srcset}" sizes="${img.sizes}" alt="${p.title}" loading="lazy" decoding="async" />
    <div class="product-card__body">
      ${badge}
      <h3 class="product-title">${p.title}</h3>
      <p class="product-meta">${p.description}</p>
      <div class="product-price">
        ${disc ? `<span style="text-decoration:line-through;color:#9ca3af;margin-right:6px">${money(disc.old)}</span> <strong>${money(disc.final)}</strong>` : `<strong>${money(p.price)}</strong>`}
      </div>
      <div class="product-actions">
        <button class="btn btn-outline btn-dec" aria-label="Quitar">−</button>
        <button class="btn btn-secondary btn-details">Ver detalles</button>
        <button class="btn btn-primary btn-add" ${disabled}>Agregar</button>
      </div>
      <small class="product-meta">Stock disponible: ${stockLeft}</small>
    </div>
  </article>`;
}

function renderProducts() {
  const container = $('#products-container');
  container.innerHTML = state.filtered.map(productCard).join('') || '<p>No se encontraron productos.</p>';
}

// Loader skeleton para productos
function showSkeleton(count = 8) {
  const container = $('#products-container');
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="product-card" aria-hidden="true">
      <div style="width:100%;aspect-ratio:4/3;background:rgba(255,255,255,0.06)"></div>
      <div class="product-card__body">
        <div style="height:14px;width:60%;background:rgba(255,255,255,0.06);border-radius:6px"></div>
        <div style="height:12px;width:90%;background:rgba(255,255,255,0.04);border-radius:6px"></div>
        <div style="height:22px;width:40%;background:rgba(255,255,255,0.06);border-radius:6px;margin-top:6px"></div>
      </div>
    </div>
  `).join('');
}

// Chips de filtros activos
function renderChips() {
  const host = document.getElementById('filter-chips');
  if (!host) return;
  const chips = [];
  if (state.prefs.search) chips.push({ k: 'search', label: `Búsqueda: "${state.prefs.search}"` });
  if (state.prefs.category) chips.push({ k: 'category', label: `Categoría: ${catName(state.prefs.category)}` });
  if (state.prefs.sort && state.prefs.sort !== 'relevance') chips.push({ k: 'sort', label: `Orden: ${state.prefs.sort}` });
  host.innerHTML = chips.map(c => `<button data-k="${c.k}" class="chip" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#e5e7eb;border-radius:999px;padding:4px 8px;margin-right:6px;cursor:pointer">${c.label} ✕</button>`).join('');
}

// Cupones y envío
function couponDiscount(code, subtotal) {
  const c = (code || '').toUpperCase();
  if (c === 'VALIDA10') return Math.round(subtotal * 0.10 * 100) / 100;
  if (c === '50OFF') return Math.round(subtotal * 0.50 * 100) / 100;
  return 0;
}
function shippingCostFor(zip) {
  const z = (zip || '').trim();
  if (!z) return 0;
  return z.startsWith('1') ? 4.99 : 7.99;
}
function computeCartTotals(items) {
  const itemsCount = items.reduce((acc, it) => acc + it.qty, 0);
  const subtotal = items.reduce((acc, it) => acc + it.qty * (discountedPrice(it.product)?.final || it.product.price), 0);
  const discount = couponDiscount(state.prefs.couponApplied, subtotal);
  const shipping = (state.prefs.couponApplied || '').toUpperCase() === 'ENVIOGRATIS' ? 0 : (state.prefs.shippingCost || 0);
  const total = Math.max(0, Math.round((subtotal - discount + shipping) * 100) / 100);
  return { itemsCount, subtotal, discount, shipping, total };
}

function renderCart() {
  const itemsEl = $('#cart-items');
  const countEl = $('#cart-count');
  const itemsCountEl = $('#cart-items-count');
  const totalEl = $('#cart-total');

  const items = Array.from(state.cart.values());
  const totals = computeCartTotals(items);

  countEl.textContent = String(totals.itemsCount);
  itemsCountEl.textContent = String(totals.itemsCount);
  totalEl.textContent = money(totals.total);
  const summary = document.getElementById('cart-summary-lines');
  if (summary) {
    summary.innerHTML = `
      <div style="display:flex;justify-content:space-between"><span>Subtotal</span><strong>${money(totals.subtotal)}</strong></div>
      ${totals.discount > 0 ? `<div style="display:flex;justify-content:space-between;color:#22d3ee"><span>Descuento</span><strong>−${money(totals.discount)}</strong></div>` : ''}
      <div style="display:flex;justify-content:space-between"><span>Envío</span><strong>${money(totals.shipping)}</strong></div>
      <div style="display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.08);padding-top:.4rem;margin-top:.4rem"><span>Total</span><strong>${money(totals.total)}</strong></div>
    `;
  }

  if (items.length === 0) {
    itemsEl.innerHTML = '<p>Tu carrito está vacío.</p>';
    return;
  }

  itemsEl.innerHTML = items.map(it => `
    <div class="cart-item" data-id="${it.product.id}">
      <img src="${it.product.image}" alt="${it.product.title}" loading="lazy" width="64" height="64" decoding="async">
      <div>
        <p class="cart-item__title">${it.product.title}</p>
        <small class="product-meta">${money(it.product.price)} c/u</small>
        <div class="cart-item__controls">
          <button class="btn btn-outline btn-qty-dec" aria-label="Disminuir">−</button>
          <input class="cart-item__qty" type="number" min="1" step="1" value="${it.qty}" />
          <button class="btn btn-outline btn-qty-inc" aria-label="Aumentar">+</button>
          <button class="btn btn-icon btn-remove" aria-label="Eliminar">🗑️</button>
        </div>
      </div>
      <div><strong>${money(it.qty * it.product.price)}</strong></div>
    </div>
  `).join('');
}

// Filtrado y orden
function applyFilters() {
  const s = state.prefs.search.trim().toLowerCase();
  const cat = state.prefs.category;
  const sort = state.prefs.sort;

  let data = [...state.products];
  if (s) data = data.filter(p => `${p.title} ${p.description}`.toLowerCase().includes(s));
  if (cat) data = data.filter(p => p.category === cat);

  switch (sort) {
    case 'price-asc': data.sort((a,b) => a.price - b.price); break;
    case 'price-desc': data.sort((a,b) => b.price - a.price); break;
    case 'name-asc': data.sort((a,b) => a.title.localeCompare(b.title)); break;
    case 'name-desc': data.sort((a,b) => b.title.localeCompare(a.title)); break;
    default: // relevance: keep as is
      break;
  }

  state.filtered = data;
}

// Utilidad: nombre de categoría legible
const catName = (id) => state.categories.find(c => c.id === id)?.name || id;

// Modal de detalles de producto
async function showProductDetails(p) {
  const inCart = state.cart.get(p.id)?.qty || 0;
  const stockLeft = p.stock - inCart;
  const img = imgSources(p.image, [600, 900, 1200], '(max-width: 900px) 90vw, 700px');
  const canBuy = stockLeft > 0;

  const result = await Swal.fire({
    title: p.title,
    html: `
      <img src="${img.src}" srcset="${img.srcset}" sizes="${img.sizes}" alt="${p.title}" style="width:100%;border-radius:12px;margin-bottom:12px" />
      <p style="text-align:left;color:#9ca3af;margin:0 0 8px">${p.description}</p>
      <div style="text-align:left;display:grid;gap:4px;font-size:14px">
        <div><strong>Precio:</strong> ${money(p.price)}</div>
        <div><strong>Categoría:</strong> ${catName(p.category)}</div>
        <div><strong>Stock disponible:</strong> ${stockLeft}</div>
      </div>
      ${canBuy ? '<input id="det-qty" type="number" min="1" step="1" value="1" class="swal2-input" style="margin-top:12px" />' : '<p style="margin-top:12px;color:#f87171">Sin stock actualmente</p>'}
    `,
    showCancelButton: true,
    cancelButtonText: 'Cerrar',
    showConfirmButton: canBuy,
    confirmButtonText: 'Agregar al carrito',
    focusConfirm: false,
    preConfirm: () => {
      if (!canBuy) return false;
      const el = document.getElementById('det-qty');
      let qty = parseInt(el?.value || '1', 10);
      if (Number.isNaN(qty) || qty < 1) qty = 1;
      if (qty > stockLeft) {
        Swal.showValidationMessage('Cantidad supera el stock disponible');
        return false;
      }
      return { qty };
    }
  });

  if (result.isConfirmed) {
    addToCart(p, result.value.qty);
  }
}

// Carrito
function addToCart(product, qty = 1) {
  const current = state.cart.get(product.id)?.qty || 0;
  if (current + qty > product.stock) {
    Swal.fire({ icon: 'warning', title: 'Sin stock', text: 'No hay suficiente stock para agregar más unidades.' });
    return;
  }
  state.cart.set(product.id, { product, qty: current + qty });
  persist();
  renderCart();
  renderProducts();
  Swal.fire({ position: 'top-end', icon: 'success', title: 'Agregado al carrito', showConfirmButton: false, timer: 900 });
}

function removeFromCart(id) {
  state.cart.delete(id);
  persist();
  renderCart();
  renderProducts();
}

function setQty(id, qty) {
  const item = state.cart.get(id);
  if (!item) return;
  qty = Math.max(1, Math.min(qty, item.product.stock));
  state.cart.set(id, { ...item, qty });
  persist();
  renderCart();
  renderProducts();
}

function clearCart() {
  state.cart.clear();
  persist();
  renderCart();
  renderProducts();
}

async function checkout() {
  if (state.cart.size === 0) {
    Swal.fire({ icon: 'info', title: 'Carrito vacío', text: 'Agrega productos antes de finalizar la compra.' });
    return;
  }

  const steps = [
    { title: 'Datos de contacto', html: `
      <input id="chk-name" class="swal2-input" placeholder="Nombre y Apellido" value="María Olivares" />
      <input id="chk-email" class="swal2-input" placeholder="Email" type="email" value="maria@example.com" />
    `},
    { title: 'Dirección de envío', html: `
      <input id="chk-address" class="swal2-input" placeholder="Calle 123" value="Av. Siempre Viva 742" />
      <input id="chk-city" class="swal2-input" placeholder="Ciudad" value="CABA" />
    `},
    { title: 'Método de pago', html: `
      <select id="chk-payment" class="swal2-select">
        <option value="card">Tarjeta</option>
        <option value="transfer">Transferencia</option>
        <option value="cash">Efectivo</option>
      </select>
    `}
  ];

  const formData = {};
  for (const step of steps) {
    const result = await Swal.fire({
      title: step.title,
      html: step.html,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Continuar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const inputs = Swal.getHtmlContainer().querySelectorAll('input, select');
        const data = {};
        inputs.forEach(i => data[i.id] = i.value.trim());
        return data;
      }
    });
    if (!result.isConfirmed) return; // cancel checkout
    Object.assign(formData, result.value);
  }

  // Simular procesamiento
  await Swal.fire({ title: 'Procesando pago...', didOpen: () => Swal.showLoading(), allowOutsideClick: false, allowEscapeKey: false, timer: 1000 });
  await sleep(400);

  const resumen = Array.from(state.cart.values()).map(it => `• ${it.qty} x ${it.product.title} — ${money(it.qty * it.product.price)}`).join('\n');
  const total = Array.from(state.cart.values()).reduce((acc, it) => acc + it.qty * it.product.price, 0);

  clearCart();
  Swal.fire({ icon: 'success', title: 'Compra realizada', html: `<pre style="text-align:left">${resumen}\nTotal: ${money(total)}</pre>` });
}

// Eventos UI
function bindUI() {
  const search = $('#search-input');
  const cat = $('#category-filter');
  const sort = $('#sort-select');
  const openCart = $('#btn-open-cart');
  const closeCart = $('#btn-close-cart');
  const cartPanel = $('#cart-panel');
  const cartItems = $('#cart-items');
  const chatWidget = $('#chat-widget');
  const chatToggle = $('#chat-toggle');
  const chatClose = $('#chat-close');
  const chatForm = $('#chat-form');
  const chatText = $('#chat-text');
  const chatMsgs = $('#chat-messages');
  const heroOffersBtn = $('#btn-hero-offers');

  // Chips host
  const controlsHost = document.querySelector('.controls');
  if (controlsHost && !document.getElementById('filter-chips')) {
    const chips = document.createElement('div');
    chips.id = 'filter-chips';
    chips.style.marginTop = '.25rem';
    controlsHost.appendChild(chips);
    chips.addEventListener('click', (e) => {
      const b = e.target.closest('button.chip');
      if (!b) return;
      const k = b.getAttribute('data-k');
      if (k === 'search') state.prefs.search = '';
      if (k === 'category') state.prefs.category = '';
      if (k === 'sort') state.prefs.sort = 'relevance';
      persist();
      applyFilters();
      renderProducts();
      renderChips();
    });
  }

  // Extras en carrito: cupón + envío + resumen detallado
  const footer = document.querySelector('.cart-panel__footer');
  if (footer && !document.getElementById('cart-extra-forms')) {
    const wrap = document.createElement('div');
    wrap.id = 'cart-extra-forms';
    wrap.style.marginTop = '.5rem';
    wrap.innerHTML = `
      <div id="cart-summary-lines" style="display:grid;gap:.2rem;margin-bottom:.5rem"></div>
      <form id="coupon-form" style="display:flex;gap:.4rem;margin:.25rem 0">
        <input id="coupon-code" type="text" placeholder="Cupón (VALIDA10/50OFF/ENVIOGRATIS)" style="flex:1;padding:.45rem .6rem;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(2,6,23,0.4);color:#e5e7eb" />
        <button class="btn btn-outline" type="submit">Aplicar</button>
      </form>
      <form id="shipping-form" style="display:flex;gap:.4rem;margin:.25rem 0">
        <input id="shipping-zip" type="text" placeholder="C.P. (ej: 1000)" style="flex:1;padding:.45rem .6rem;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(2,6,23,0.4);color:#e5e7eb" />
        <button class="btn btn-outline" type="submit">Calcular envío</button>
      </form>
    `;
    footer.insertBefore(wrap, footer.firstChild);

    const couponForm = document.getElementById('coupon-form');
    const couponInput = document.getElementById('coupon-code');
    const shipForm = document.getElementById('shipping-form');
    const shipZip = document.getElementById('shipping-zip');
    couponInput.value = state.prefs.coupon || state.prefs.couponApplied || '';
    shipZip.value = state.prefs.shippingZip || '';

    couponForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = (couponInput.value || '').trim().toUpperCase();
      if (!code) return;
      const preview = couponDiscount(code, 100);
      if (preview > 0 || code === 'ENVIOGRATIS') {
        state.prefs.coupon = couponInput.value;
        state.prefs.couponApplied = code;
        persist();
        renderCart();
        Swal.fire({ icon: 'success', title: 'Cupón aplicado' });
      } else {
        Swal.fire({ icon: 'info', title: 'Cupón inválido', text: 'Prueba con VALIDA10, 50OFF o ENVIOGRATIS.' });
      }
    });

    shipForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const zip = (shipZip.value || '').trim();
      state.prefs.shippingZip = zip;
      state.prefs.shippingCost = shippingCostFor(zip);
      persist();
      renderCart();
    });
  }

  // Prefills
  search.value = state.prefs.search;

  search.addEventListener('input', () => {
    state.prefs.search = search.value;
    persist();
    applyFilters();
    renderProducts();
    renderChips();
  });

  cat.addEventListener('change', () => {
    state.prefs.category = cat.value;
    persist();
    applyFilters();
    renderProducts();
    renderChips();
  });

  sort.addEventListener('change', () => {
    state.prefs.sort = sort.value;
    persist();
    applyFilters();
    renderProducts();
    renderChips();
  });

  // Open/Close cart
  openCart.addEventListener('click', () => {
    cartPanel.classList.add('open');
    cartPanel.setAttribute('aria-hidden', 'false');
    openCart.setAttribute('aria-expanded', 'true');
  });
  closeCart.addEventListener('click', () => {
    cartPanel.classList.remove('open');
    cartPanel.setAttribute('aria-hidden', 'true');
    openCart.setAttribute('aria-expanded', 'false');
  });

  // Delegación en grid de productos
  $('#products-container').addEventListener('click', (e) => {
    const card = e.target.closest('.product-card');
    if (!card) return;
    const id = card.getAttribute('data-id');
    const product = state.products.find(p => p.id === id);
    if (!product) return;

    if (e.target.matches('.btn-add')) {
      addToCart(product, 1);
    } else if (e.target.matches('.btn-details')) {
      showProductDetails(product);
    } else if (e.target.matches('.btn-dec')) {
      // quitar 1 si está en carrito
      const current = state.cart.get(id)?.qty || 0;
      if (current > 1) setQty(id, current - 1);
      else if (current === 1) removeFromCart(id);
    }
  });

  // Delegación en carrito
  cartItems.addEventListener('click', (e) => {
    const row = e.target.closest('.cart-item');
    if (!row) return;
    const id = row.getAttribute('data-id');

    if (e.target.matches('.btn-remove')) {
      removeFromCart(id);
    } else if (e.target.matches('.btn-qty-inc')) {
      const item = state.cart.get(id);
      if (item) addToCart(item.product, 1);
    } else if (e.target.matches('.btn-qty-dec')) {
      const item = state.cart.get(id);
      if (item) setQty(id, item.qty - 1);
    }
  });

  cartItems.addEventListener('change', (e) => {
    if (!e.target.matches('.cart-item__qty')) return;
    const row = e.target.closest('.cart-item');
    const id = row.getAttribute('data-id');
    const val = parseInt(e.target.value, 10);
    if (!Number.isNaN(val)) setQty(id, val);
    else renderCart();
  });

  $('#btn-clear-cart').addEventListener('click', async () => {
    const ok = await Swal.fire({ title: 'Vaciar carrito', text: '¿Seguro que quieres eliminar todos los ítems?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, vaciar', cancelButtonText: 'Cancelar' });
    if (ok.isConfirmed) clearCart();
  });

  $('#btn-checkout').addEventListener('click', checkout);

  // Chatbot
  function chatAppend(text, who = 'bot') {
    const b = document.createElement('div');
    b.className = `chat-bubble ${who}`;
    b.textContent = text;
    chatMsgs.appendChild(b);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
  }

  function chatReply(q) {
    const s = q.toLowerCase();
    if (/env[ií]o|envios|envíos|costo/.test(s)) return 'Realizamos envíos a todo el país. Gratis en compras superiores a 50€.';
    if (/pago|tarjeta|cuotas|transfer/.test(s)) return 'Aceptamos tarjeta, transferencia y efectivo. Hasta 12 cuotas en productos seleccionados.';
    if (/devoluc/i.test(s)) return 'Tenés 10 días para cambios/devoluciones, con ticket y producto en buen estado.';
    if (/horario|atenci[oó]n|soporte/.test(s)) return 'Atendemos de Lunes a Viernes, 9 a 18hs. Soporte online 24/7.';
    if (/stock|dispon/i.test(s)) return 'El stock está indicado en cada producto; el carrito respeta stock disponible.';
    return 'No estoy seguro de eso. Puedo ayudarte con envíos, pagos, devoluciones, horarios y stock.';
  }

  function chatOpen() {
    chatWidget.classList.add('open');
    chatWidget.setAttribute('aria-hidden', 'false');
    chatToggle.setAttribute('aria-expanded', 'true');
    // Quick replies
    if (!document.getElementById('chat-quick')) {
      const header = chatWidget.querySelector('.chat-header');
      const quick = document.createElement('div');
      quick.id = 'chat-quick';
      quick.style.display = 'flex';
      quick.style.flexWrap = 'wrap';
      quick.style.gap = '6px';
      quick.style.padding = '6px 8px';
      quick.style.borderBottom = '1px solid rgba(255,255,255,0.08)';
      quick.innerHTML = ['Envíos','Pagos','Devoluciones','Horarios','Stock'].map(t => `<button type="button" data-q="${t}" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#e5e7eb;border-radius:999px;padding:4px 8px;cursor:pointer">${t}</button>`).join('');
      header.after(quick);
      quick.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-q]');
        if (!b) return;
        const q = b.getAttribute('data-q');
        chatText.value = q;
        chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
      });
    }
    if (!chatMsgs.dataset.greeted) {
      chatAppend('¡Hola! Soy tu asistente. ¿En qué puedo ayudarte hoy?');
      chatMsgs.dataset.greeted = '1';
    }
  }
  function chatCloseFn() {
    chatWidget.classList.remove('open');
    chatWidget.setAttribute('aria-hidden', 'true');
    chatToggle.setAttribute('aria-expanded', 'false');
  }

  if (chatToggle && chatWidget) {
    chatToggle.addEventListener('click', () => {
      if (chatWidget.classList.contains('open')) chatCloseFn(); else chatOpen();
    });
  }
  if (chatClose) chatClose.addEventListener('click', chatCloseFn);
  if (heroOffersBtn) {
    heroOffersBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await Swal.fire({
        title: '¡Semana de Descuentos! 🎉',
        html: '<div style="font-size:22px;font-weight:800;margin-bottom:6px">Hasta 50% OFF</div><div>En selección de electrónica, hogar y moda</div>',
        icon: 'info',
        confirmButtonText: 'Ver ofertas',
      });
      document.getElementById('ofertas')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  if (chatForm && chatText) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = chatText.value.trim();
      if (!msg) return;
      chatAppend(msg, 'user');
      chatText.value = '';
      setTimeout(() => chatAppend(chatReply(msg), 'bot'), 250);
    });
  }

  // Navbar: toggle menú móvil
  const navToggle = $('#btn-menu');
  const navLinks = $('#nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    navLinks.addEventListener('click', (e) => {
      if (e.target.tagName === 'A' && navLinks.classList.contains('is-open')) {
        navLinks.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Formulario de contacto
  const contactForm = $('#contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(contactForm);
      const name = fd.get('name') || '¡Gracias!';
      await Swal.fire({ icon: 'success', title: 'Mensaje enviado', text: `Nos pondremos en contacto, ${name}.` });
      contactForm.reset();
    });
  }
}

// Inicialización
(async function init() {
  loadPersisted();
  showSkeleton();
  try {
    const data = await fetchData();
    state.products = data.products;
    state.categories = data.categories;
    renderCategories();
    applyFilters();
    renderProducts();
    renderCart();
    bindUI();
  } catch (err) {
    /* error logged intentionally omitted; feedback shown to user via alert */
    const container = $('#products-container');
    container.innerHTML = '<p>Ocurrió un error al cargar datos.</p>';
    Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudieron cargar los datos de productos.' });
  }
})();
