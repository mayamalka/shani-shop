// Shared header/footer + felt-page placeholder art for the mockups.
const ICON = {
  cart:'<svg viewBox="0 0 24 24"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11.5l2-8H6.5"/></svg>',
  menu:'<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  user:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
};
const ART = {
  sun:'<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="22" fill="#F8C33A"/><g stroke="#F8C33A" stroke-width="7" stroke-linecap="round"><path d="M50 8v12M50 80v12M8 50h12M80 50h12M20 20l9 9M71 71l9 9M80 20l-9 9M29 71l-9 9"/></g></svg>',
  heart:'<svg viewBox="0 0 100 100"><path d="M50 85S12 62 12 36c0-12 9-20 20-20 8 0 14 5 18 11 4-6 10-11 18-11 11 0 20 8 20 20 0 26-38 49-38 49z" fill="#E8573C"/></svg>',
  star:'<svg viewBox="0 0 100 100"><path d="M50 8l12 28 30 3-23 20 7 30-26-16-26 16 7-30L8 39l30-3z" fill="#F8C33A"/></svg>',
  tree:'<svg viewBox="0 0 100 100"><rect x="44" y="60" width="12" height="30" rx="4" fill="#8B5A2B"/><circle cx="50" cy="40" r="30" fill="#6BAF5B"/><circle cx="40" cy="35" r="5" fill="#E8573C"/><circle cx="60" cy="48" r="5" fill="#E8573C"/></svg>',
  fish:'<svg viewBox="0 0 100 100"><ellipse cx="45" cy="50" rx="30" ry="20" fill="#F28C28"/><path d="M72 50l20-16v32z" fill="#F28C28"/><circle cx="30" cy="45" r="4" fill="#5A3A22"/></svg>',
  house:'<svg viewBox="0 0 100 100"><path d="M15 48L50 18l35 30z" fill="#E8573C"/><rect x="24" y="46" width="52" height="40" rx="4" fill="#FBE3A0"/><rect x="43" y="62" width="14" height="24" rx="3" fill="#8B5A2B"/></svg>',
  balloon:'<svg viewBox="0 0 100 100"><ellipse cx="38" cy="38" rx="16" ry="20" fill="#E8573C"/><ellipse cx="62" cy="34" rx="16" ry="20" fill="#4A90C8"/><path d="M38 58q4 15 10 30M62 54q-4 18-12 34" stroke="#5A3A22" stroke-width="2" fill="none"/></svg>',
  flower:'<svg viewBox="0 0 100 100"><g fill="#F07FA0"><circle cx="50" cy="28" r="14"/><circle cx="50" cy="62" r="14"/><circle cx="33" cy="45" r="14"/><circle cx="67" cy="45" r="14"/></g><circle cx="50" cy="45" r="10" fill="#F8C33A"/></svg>',
  apple:'<svg viewBox="0 0 100 100"><circle cx="50" cy="56" r="30" fill="#D9412F"/><path d="M50 26q2-12 12-14" stroke="#5A3A22" stroke-width="4" fill="none"/><ellipse cx="62" cy="22" rx="9" ry="5" fill="#6BAF5B"/></svg>',
  car:'<svg viewBox="0 0 100 100"><path d="M12 62V48l14-16h40l16 16h6v14z" fill="#4A90C8"/><circle cx="30" cy="66" r="10" fill="#5A3A22"/><circle cx="72" cy="66" r="10" fill="#5A3A22"/><rect x="32" y="37" width="14" height="12" rx="2" fill="#fff"/><rect x="52" y="37" width="14" height="12" rx="2" fill="#fff"/></svg>',
  family:'<svg viewBox="0 0 100 100"><circle cx="30" cy="30" r="11" fill="#F2C9A0"/><circle cx="70" cy="30" r="11" fill="#F2C9A0"/><circle cx="50" cy="55" r="9" fill="#F2C9A0"/><rect x="19" y="44" width="22" height="40" rx="10" fill="#4A90C8"/><rect x="59" y="44" width="22" height="40" rx="10" fill="#E8573C"/><rect x="42" y="66" width="16" height="22" rx="7" fill="#F8C33A"/></svg>',
  book:'<svg viewBox="0 0 100 100"><path d="M10 25q20-8 40 4v58q-20-12-40-4z" fill="#F28C28"/><path d="M90 25q-20-8-40 4v58q20-12 40-4z" fill="#F8C33A"/><circle cx="30" cy="48" r="7" fill="#fff"/><path d="M62 45h18M62 55h14" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>',
};
const BG = ['#FBD38D','#F9B97A','#BFE0B5','#B9D7EE','#F7C6D4','#FFE7A3','#D9C7F0','#F5B5A0'];
function felt(name, i = 0, extra = '') {
  return `<div class="felt ${extra}" style="background:${BG[i % BG.length]}" role="img" aria-label="${name}">${ART[name] || ART.star}</div>`;
}
function header(active = '', opts = {}) {
  const items = [['home','דף הבית'],['about','אודות'],['shop','חנות'],['contact','צור קשר']];
  if (opts.admin) items.push(['orders','הזמנות'],['products','ניהול מוצרים']);
  const nav = items.map(([k,t]) => `<a href="#" class="${k===active?'on':''}">${t}</a>`).join('');
  const adminChip = opts.admin ? '<a href="#" class="admin" style="text-decoration:none;color:#fff;background:#B5541E;border-radius:999px;padding:6px 14px;font-weight:500">יציאה מניהול</a>' : '';
  return `<a class="skip" href="#main">דלג לתוכן</a>
  <header class="hdr">
    <img class="logo" src="logo.jpg" alt="הדודה שני - לדף הבית">
    <nav class="nav" aria-label="ראשי">${nav}</nav>
    <div class="tools">${adminChip}
      <button class="iconbtn burger" aria-label="תפריט">${ICON.menu}</button>
      <a class="iconbtn" aria-label="סל קניות, ${opts.count ?? 2} פריטים">${ICON.cart}<span class="badge">${opts.count ?? 2}</span></a>
    </div>
  </header>`;
}
function footer() {
  return `<footer class="ftr"><div><a href="#">תקנון</a><a href="#">מדיניות פרטיות</a><a href="#">הצהרת נגישות</a><a href="#">משלוחים והחזרות</a><a href="#">הגדרות עוגיות</a></div><div>© 2026 הדודה שני · ספרי לבד בעבודת יד</div></footer>
  <button class="a11y" aria-label="תפריט נגישות"><svg viewBox="0 0 24 24"><circle cx="12" cy="4" r="2"/><path d="M4 8l8 1.5L20 8l.4 1.8L15 11v4l2 6-1.8.7L12.5 16h-1L8.8 21.7 7 21l2-6v-4L3.6 9.8z"/></svg></button>`;
}
function mount(active, opts = {}) {
  if (new URLSearchParams(location.search).get('m') === '1') document.body.classList.add('m');
  document.body.insertAdjacentHTML('afterbegin', header(active, opts));
  if (!opts.noFooter) document.body.insertAdjacentHTML('beforeend', footer());
  document.querySelectorAll('[data-felt]').forEach((el, i) => { el.outerHTML = felt(el.dataset.felt, +(el.dataset.i ?? i)); });
  // Keep number ranges, times and @handles left-to-right inside Hebrew text (same fix the real site uses: <bdi>/dir=ltr).
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
  const re = /(@[\w.]+|\d[\d:]*\s?[–-]\s?\d[\d:]*)/g;
  nodes.forEach(n => { if (!re.test(n.nodeValue) || n.parentElement.closest('script,style')) return;
    const span = document.createElement('span');
    span.innerHTML = n.nodeValue.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])).replace(re, '<bdi dir="ltr">$1</bdi>');
    n.replaceWith(...span.childNodes); re.lastIndex = 0; });
}
