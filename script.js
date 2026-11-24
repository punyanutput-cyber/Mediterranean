/* ==========================================================================
   Dame core — shared script (product.html, order.html, admin.html)
   Each init function runs only if its page's elements exist.
   ========================================================================== */

const PRODUCTS_URL = 'products.json';

// Apps Script web app (the deployed doPost endpoint)
const SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbyKoqpEBCGp9TJ9DYcdKcJ9rb40KXnszmr8TotSQYOT9Q1ss9MxOFp4bU3HMk8pewvv/exec';

// Orders sheet exported as CSV (sheet must be shared as "Anyone with the link can view")
const SHEET_ID = '16KHrk_hEaxBMWN6PNIXn8H-oMZvXApvBwZuqBXUMvbk';
const CSV_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv';

const MOODS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'fresh', label: 'Fresh' },
  { key: 'sweet', label: 'Sweet' },
  { key: 'confident', label: 'Confident' },
  { key: 'romance', label: 'Romance' }
];

/* --------------------------------------------------------------------------
   product.html — product cards + mood filter
   -------------------------------------------------------------------------- */
async function initProducts() {
  const list = document.getElementById('product-list');
  const bar = document.getElementById('filter-bar');
  if (!list || !bar) return;

  list.classList.add('product-grid');
  bar.classList.add('filter-bar');

  let products = [];
  try {
    const res = await fetch(PRODUCTS_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    products = await res.json();
  } catch (error) {
    console.error(error);
    list.textContent = 'โหลดสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    return;
  }

  const validKeys = MOODS.map(function (m) { return m.key; });
  const param = (new URLSearchParams(window.location.search).get('mood') || '').toLowerCase();
  let current = validKeys.indexOf(param) !== -1 ? param : 'all';

  function createCard(p) {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.setAttribute('data-mood', p.mood);

    const img = document.createElement('img');
    img.className = 'product-card__image';
    img.src = p.image;
    img.alt = p.name;
    img.loading = 'lazy';

    const body = document.createElement('div');
    body.className = 'product-card__body';

    const name = document.createElement('h3');
    name.className = 'product-card__name';
    const dot = document.createElement('span');
    dot.className = 'mood-dot';
    name.appendChild(dot);
    name.appendChild(document.createTextNode(p.name));

    const meta = document.createElement('div');
    meta.className = 'product-card__meta';
    const size = document.createElement('span');
    size.textContent = p.size;
    const price = document.createElement('span');
    price.className = 'price';
    price.textContent = Number(p.price).toLocaleString('th-TH') + ' บาท';
    meta.appendChild(size);
    meta.appendChild(price);

    const buy = document.createElement('a');
    buy.className = 'btn';
    buy.textContent = 'สั่งซื้อ';
    buy.href =
      'order.html?item=' + encodeURIComponent(p.name) +
      '&price=' + encodeURIComponent(p.price);

    body.appendChild(name);
    body.appendChild(meta);
    body.appendChild(buy);
    card.appendChild(img);
    card.appendChild(body);
    return card;
  }

  function render() {
    list.textContent = '';
    const shown = products.filter(function (p) {
      return current === 'all' || p.mood === current;
    });
    if (shown.length === 0) {
      list.textContent = 'ยังไม่มีสินค้าในหมวดนี้';
      return;
    }
    shown.forEach(function (p) { list.appendChild(createCard(p)); });
  }

  function updateButtons() {
    Array.prototype.forEach.call(bar.querySelectorAll('button'), function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.mood === current));
    });
  }

  MOODS.forEach(function (m) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--soft';
    btn.dataset.mood = m.key;
    btn.textContent = m.label;
    btn.addEventListener('click', function () {
      current = m.key;
      updateButtons();
      render();
      try {
        const url = new URL(window.location.href);
        if (current === 'all') {
          url.searchParams.delete('mood');
        } else {
          url.searchParams.set('mood', current);
        }
        window.history.replaceState(null, '', url);
      } catch (e) { /* ignore (e.g. file:// preview) */ }
    });
    bar.appendChild(btn);
  });

  updateButtons();
  render();
}

/* --------------------------------------------------------------------------
   order.html — prefill from URL, submit to Apps Script
   -------------------------------------------------------------------------- */
function initOrder() {
  const form = document.getElementById('orderForm');
  if (!form) return;

  // Prefill both fields from ?item=...&price=...
  const params = new URLSearchParams(window.location.search);
  const item = params.get('item');
  const price = params.get('price');
  if (item !== null) document.getElementById('items').value = item;
  if (price !== null) document.getElementById('total').value = price;

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    const payload = {
      customerName: document.getElementById('customerName').value.trim(),
      contact: document.getElementById('contact').value.trim(),
      items: document.getElementById('items').value.trim(),
      total: document.getElementById('total').value.trim(),
      note: document.getElementById('note').value.trim()
    };

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    .then(() => {
      window.location.href = 'thankyou.html';
    })
    .catch(error => {
      console.error(error);
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    })
    .finally(() => {
      if (submitBtn) submitBtn.disabled = false;
    });
  });
}

/* --------------------------------------------------------------------------
   admin.html — orders table from CSV
   -------------------------------------------------------------------------- */

// Minimal CSV parser: handles quoted fields, "" escapes, commas and
// line breaks inside quotes, and both \n and \r\n line endings.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // drop completely blank rows
  return rows.filter(function (r) {
    return r.some(function (cell) { return cell.trim() !== ''; });
  });
}

async function initAdmin() {
  const tbody = document.querySelector('#ordersTable tbody');
  if (!tbody) return;

  const COLS = 6;

  function showMessage(text) {
    tbody.textContent = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = COLS;
    td.textContent = text;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  showMessage('กำลังโหลดข้อมูล...');

  let rows;
  try {
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    rows = parseCSV(await res.text());
  } catch (error) {
    console.error(error);
    showMessage('โหลดข้อมูลไม่สำเร็จ ตรวจสอบว่า Sheet เปิดสิทธิ์ดูด้วยลิงก์แล้ว');
    return;
  }

  // If the first row is a header (its first cell has no digits, unlike a date), skip it
  if (rows.length > 0 && !/\d/.test(rows[0][0])) rows.shift();

  if (rows.length === 0) {
    showMessage('ยังไม่มีคำสั่งซื้อ');
    return;
  }

  // Rows are appended in order, so reversing puts the newest first
  rows.reverse();

  tbody.textContent = '';
  rows.forEach(function (r) {
    const tr = document.createElement('tr');
    for (let i = 0; i < COLS; i++) {
      const td = document.createElement('td');
      td.textContent = r[i] || ''; // textContent keeps customer input from running as HTML
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
}

/* --------------------------------------------------------------------------
   Start
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function () {
  initProducts();
  initOrder();
  initAdmin();
});
