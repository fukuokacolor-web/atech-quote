/* =========================================
   Aテック 帳票PWA - app.js (v1.1)
   Phase 1+2 改修:
   - 件名 / 先方発注No / 親番号継承
   - 振込先：請求書のみ、専用ブロック化
   - 10%対象金額の明示
   - 屋号強調
   - 連番のコミット/ロールバック修正
   - 履歴：append-only / 日付・金額レンジ検索 / 種別フィルタ
   - メール本文テンプレ自動生成
   - 最終バックアップ日時の表示
========================================= */

const KEY_SETTINGS = "atech_settings_v1";
const KEY_CLIENTS  = "atech_clients_v1";
const KEY_ITEMS    = "atech_items_v1";
const KEY_DOCS     = "atech_docs_v1";
const KEY_COUNTER  = "atech_counter_v1";
const KEY_BACKUP_AT = "atech_last_backup_v1";

const DOC_LABELS = {
  quote:    { ja: "見積書",   en: "Quote",    greet: "下記の通り御見積申し上げます。",     closing: "上記の通り御見積申し上げます。",  fileSlug: "見積書" },
  delivery: { ja: "納品書",   en: "Delivery", greet: "下記の通り納品いたします。",         closing: "上記の通り納品いたしました。ご査収ください。", fileSlug: "納品書" },
  invoice:  { ja: "請求書",   en: "Invoice",  greet: "下記の通りご請求申し上げます。",     closing: "上記の通りご請求申し上げます。", fileSlug: "請求書" }
};

const DEFAULT_SETTINGS = {
  company: "Aテック",
  zip: "820-1113",
  address: "福岡県鞍手郡小竹町勝野4053-1",
  tel: "090-4485-0184",
  staff: "安西",
  invoiceNo: "T5810248089393",
  bank: "福岡銀行 黒崎支店 普通預金 口座番号 2879217",
  bankName: "安西 賢一郎（アンザイ ケンイチロウ）"
};

const DEFAULT_NOTES_BY_TYPE = {
  quote:    "・有効期限：発行日より30日間\n・納期：別途ご相談",
  delivery: "・上記の通り納品いたしました。ご査収ください。",
  invoice:  "・お支払期限：発行月の翌月末日\n・お振込手数料は貴社にてご負担願います。"
};

/* ====== State ====== */
let state = {
  docType: "quote",
  items: [],
  parentNo: null,
  parentType: null,
  _previewNo: null
};

/* ====== Storage helpers ====== */
const load = (k, def) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? def; }
  catch { return def; }
};
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...load(KEY_SETTINGS, {}) };
}
function getClients() { return load(KEY_CLIENTS, []); }
function getItemsMaster() { return load(KEY_ITEMS, []); }
function getDocs() { return load(KEY_DOCS, []); }

const pad = n => String(n).padStart(2, "0");
const pad3 = n => String(n).padStart(3, "0");
const yen = n => "¥" + Number(n || 0).toLocaleString("ja-JP");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
};
const ymdCompact = dateStr => (dateStr || today()).replace(/-/g, "");

/* ====== 採番（peek/commit分離） ====== */
function nextDocNoPeek(type, dateStr) {
  const counter = load(KEY_COUNTER, {});
  const ymd = ymdCompact(dateStr);
  const key = `${type}_${ymd}`;
  const next = (counter[key] || 0) + 1;
  const prefix = { quote: "Q", delivery: "D", invoice: "I" }[type];
  return `A-${ymd}-${prefix}${pad3(next)}`;
}
function commitDocNo(type, dateStr) {
  const counter = load(KEY_COUNTER, {});
  const ymd = ymdCompact(dateStr);
  const key = `${type}_${ymd}`;
  counter[key] = (counter[key] || 0) + 1;
  save(KEY_COUNTER, counter);
  return counter[key];
}

/* ====== Tab nav ====== */
document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    document.getElementById("tab-" + t.dataset.tab).classList.add("active");
    if (t.dataset.tab === "history") renderHistory();
    if (t.dataset.tab === "master") renderMaster();
  });
});

/* ====== Doctype segmented ====== */
document.querySelectorAll(".seg-btn").forEach(b => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".seg-btn").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    state.docType = b.dataset.doctype;
    const notes = document.getElementById("notes");
    if (!notes.value || Object.values(DEFAULT_NOTES_BY_TYPE).includes(notes.value)) {
      notes.value = DEFAULT_NOTES_BY_TYPE[state.docType];
    }
  });
});

/* ====== Parent banner ====== */
function setParent(no, type) {
  state.parentNo = no || null;
  state.parentType = type || null;
  const banner = document.getElementById("parent-banner");
  if (no) {
    document.getElementById("parent-banner-text").textContent =
      `${DOC_LABELS[type]?.ja || ""} ${no}`;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}
document.getElementById("btn-clear-parent").addEventListener("click", () => setParent(null));

/* ====== Items ====== */
function addItem(data = {}) {
  state.items.push({
    name: data.name || "",
    qty:  data.qty  || 1,
    unit: data.unit || "個",
    price:data.price|| 0
  });
  renderItems();
}
function removeItem(i) {
  state.items.splice(i, 1);
  renderItems();
}
function renderItems() {
  const c = document.getElementById("items-container");
  c.innerHTML = "";
  state.items.forEach((it, i) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <div class="item-head">
        <span class="item-num">明細 ${i + 1}</span>
        <button class="del-btn" data-i="${i}">🗑</button>
      </div>
      <input type="text" data-f="name" data-i="${i}" placeholder="品名" value="${escapeHtml(it.name)}">
      <div class="qty-row">
        <input type="number" data-f="qty" data-i="${i}" placeholder="数量" value="${it.qty}" inputmode="decimal">
        <input type="text" data-f="unit" data-i="${i}" placeholder="単位" value="${escapeHtml(it.unit)}">
        <input type="number" data-f="price" data-i="${i}" placeholder="単価(税抜)" value="${it.price}" inputmode="numeric">
      </div>
    `;
    c.appendChild(row);
  });
  c.querySelectorAll(".del-btn").forEach(b =>
    b.addEventListener("click", () => removeItem(+b.dataset.i)));
  c.querySelectorAll("input").forEach(inp =>
    inp.addEventListener("input", () => {
      const i = +inp.dataset.i, f = inp.dataset.f;
      state.items[i][f] = (f === "qty" || f === "price") ? +inp.value : inp.value;
      updateTotals();
    }));
  updateTotals();
}
function updateTotals() {
  const { sub, tax, total } = totalsOf(state.items);
  document.getElementById("sum-subtotal").textContent = yen(sub);
  document.getElementById("sum-tax").textContent = yen(tax);
  document.getElementById("sum-total").textContent = yen(total);
}
function totalsOf(items) {
  let sub = 0;
  items.forEach(it => sub += ((+it.qty) || 0) * ((+it.price) || 0));
  const tax = Math.floor(sub * 0.1);
  return { sub, tax, total: sub + tax };
}
document.getElementById("btn-add-item").addEventListener("click", () => {
  const master = getItemsMaster();
  if (master.length === 0) { addItem(); return; }
  const choice = prompt(
    "品名マスタから選択（番号入力）。空欄でカスタム入力：\n" +
    master.map((m, i) => `${i+1}. ${m.name} (${yen(m.price)}/${m.unit})`).join("\n")
  );
  if (choice === null) return;
  if (choice === "") { addItem(); return; }
  const idx = +choice - 1;
  if (master[idx]) addItem(master[idx]);
  else addItem();
});

/* ====== Clients ====== */
document.getElementById("btn-pick-client").addEventListener("click", () => {
  const list = getClients();
  if (list.length === 0) { alert("登録された取引先がありません。マスタタブから追加してください。"); return; }
  const choice = prompt("取引先を選択（番号入力）：\n" + list.map((c, i) => `${i+1}. ${c}`).join("\n"));
  if (!choice) return;
  const c = list[+choice - 1];
  if (c) document.getElementById("client-name").value = c;
});
document.getElementById("btn-save-client").addEventListener("click", () => {
  const v = document.getElementById("client-name").value.trim();
  if (!v) return;
  const list = getClients();
  if (list.includes(v)) { alert("既に登録済みです。"); return; }
  list.push(v); save(KEY_CLIENTS, list);
  alert("マスタに保存しました：" + v);
});

/* ====== Master tab ====== */
function renderMaster() {
  const c = document.getElementById("clients-list");
  const clients = getClients();
  c.innerHTML = clients.length ? "" : '<div class="empty">未登録</div>';
  clients.forEach((name, i) => {
    const d = document.createElement("div");
    d.className = "master-item";
    d.innerHTML = `<span>${escapeHtml(name)}</span><button class="del-btn" data-i="${i}">🗑</button>`;
    c.appendChild(d);
  });
  c.querySelectorAll(".del-btn").forEach(b =>
    b.addEventListener("click", () => {
      const list = getClients(); list.splice(+b.dataset.i, 1); save(KEY_CLIENTS, list);
      renderMaster();
    }));

  const im = document.getElementById("items-master-list");
  const items = getItemsMaster();
  im.innerHTML = items.length ? "" : '<div class="empty">未登録</div>';
  items.forEach((it, i) => {
    const d = document.createElement("div");
    d.className = "master-item";
    d.innerHTML = `<span>${escapeHtml(it.name)}<br><small>${yen(it.price)} / ${escapeHtml(it.unit)}</small></span><button class="del-btn" data-i="${i}">🗑</button>`;
    im.appendChild(d);
  });
  im.querySelectorAll(".del-btn").forEach(b =>
    b.addEventListener("click", () => {
      const list = getItemsMaster(); list.splice(+b.dataset.i, 1); save(KEY_ITEMS, list);
      renderMaster();
    }));
}
document.getElementById("btn-add-client").addEventListener("click", () => {
  const v = document.getElementById("new-client").value.trim();
  if (!v) return;
  const list = getClients();
  if (!list.includes(v)) list.push(v);
  save(KEY_CLIENTS, list);
  document.getElementById("new-client").value = "";
  renderMaster();
});
document.getElementById("btn-add-item-master").addEventListener("click", () => {
  const name = document.getElementById("new-item-name").value.trim();
  const unit = document.getElementById("new-item-unit").value.trim() || "個";
  const price = +document.getElementById("new-item-price").value;
  if (!name) return;
  const list = getItemsMaster();
  list.push({ name, unit, price });
  save(KEY_ITEMS, list);
  document.getElementById("new-item-name").value = "";
  document.getElementById("new-item-unit").value = "";
  document.getElementById("new-item-price").value = "";
  renderMaster();
});

/* ====== Settings modal ====== */
function openSettings() {
  const s = getSettings();
  document.getElementById("set-company").value = s.company;
  document.getElementById("set-zip").value = s.zip;
  document.getElementById("set-address").value = s.address;
  document.getElementById("set-tel").value = s.tel;
  document.getElementById("set-staff").value = s.staff;
  document.getElementById("set-invoice-no").value = s.invoiceNo;
  document.getElementById("set-bank").value = s.bank;
  document.getElementById("set-bank-name").value = s.bankName;
  updateBackupStatus();
  document.getElementById("settings-modal").classList.remove("hidden");
}
function updateBackupStatus() {
  const last = load(KEY_BACKUP_AT, null);
  const el = document.getElementById("backup-status");
  if (!last) {
    el.textContent = "⚠ 一度もバックアップしていません。Google Drive等への保存を強く推奨します。";
    el.classList.add("warn");
    return;
  }
  const d = new Date(last);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  const dateStr = d.toLocaleDateString("ja-JP");
  if (days > 30) {
    el.textContent = `⚠ 最終バックアップ：${dateStr}（${days}日前・更新推奨）`;
    el.classList.add("warn");
  } else {
    el.textContent = `✅ 最終バックアップ：${dateStr}（${days}日前）`;
    el.classList.remove("warn");
  }
}
document.getElementById("btn-settings").addEventListener("click", openSettings);
document.getElementById("btn-close-settings").addEventListener("click", () =>
  document.getElementById("settings-modal").classList.add("hidden"));
document.getElementById("btn-save-settings").addEventListener("click", () => {
  const s = {
    company: document.getElementById("set-company").value,
    zip: document.getElementById("set-zip").value,
    address: document.getElementById("set-address").value,
    tel: document.getElementById("set-tel").value,
    staff: document.getElementById("set-staff").value,
    invoiceNo: document.getElementById("set-invoice-no").value,
    bank: document.getElementById("set-bank").value,
    bankName: document.getElementById("set-bank-name").value
  };
  save(KEY_SETTINGS, s);
  document.getElementById("settings-modal").classList.add("hidden");
  alert("設定を保存しました。");
});

/* ====== Export / Import ====== */
document.getElementById("btn-export").addEventListener("click", () => {
  const all = {
    settings: load(KEY_SETTINGS, {}),
    clients: getClients(),
    items: getItemsMaster(),
    docs: getDocs(),
    counter: load(KEY_COUNTER, {}),
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `atech_backup_${today()}.json`;
  a.click();
  save(KEY_BACKUP_AT, new Date().toISOString());
  updateBackupStatus();
});
document.getElementById("file-import").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!confirm("既存データを上書きします。よろしいですか？")) return;
      if (data.settings) save(KEY_SETTINGS, data.settings);
      if (data.clients)  save(KEY_CLIENTS, data.clients);
      if (data.items)    save(KEY_ITEMS, data.items);
      if (data.docs)     save(KEY_DOCS, data.docs);
      if (data.counter)  save(KEY_COUNTER, data.counter);
      alert("インポート完了。アプリを再読込してください。");
      location.reload();
    } catch { alert("ファイルの読み込みに失敗しました。"); }
  };
  r.readAsText(f);
});
document.getElementById("btn-reset").addEventListener("click", () => {
  if (!confirm("⚠ 電子帳簿保存法では帳簿の7年保存が義務付けられています。\n\nすべてのデータを削除します。元に戻せません。本当によろしいですか？")) return;
  if (!confirm("最終確認：全データを削除しますか？")) return;
  [KEY_SETTINGS, KEY_CLIENTS, KEY_ITEMS, KEY_DOCS, KEY_COUNTER, KEY_BACKUP_AT].forEach(k => localStorage.removeItem(k));
  location.reload();
});

/* ====== History（拡張検索） ====== */
function renderHistory() {
  const list = getDocs().slice().reverse();
  const q = document.getElementById("hist-search").value.trim().toLowerCase();
  const df = document.getElementById("hist-date-from").value;
  const dt = document.getElementById("hist-date-to").value;
  const amin = +document.getElementById("hist-amt-min").value || 0;
  const amax = +document.getElementById("hist-amt-max").value || Infinity;
  const tp = document.getElementById("hist-type").value;

  const filtered = list.filter(d => {
    if (q) {
      const hay = (d.client + " " + d.no + " " + (d.subject || "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (df && d.date < df) return false;
    if (dt && d.date > dt) return false;
    if (d.total < amin || d.total > amax) return false;
    if (tp && d.type !== tp) return false;
    return true;
  });

  const sum = filtered.reduce((acc, d) => acc + d.total, 0);
  document.getElementById("hist-summary").textContent =
    `${filtered.length}件 / 合計 ${yen(sum)}`;

  const c = document.getElementById("history-list");
  c.innerHTML = filtered.length ? "" : '<div class="empty">該当なし</div>';
  filtered.forEach(d => {
    const row = document.createElement("div");
    row.className = "hist-item";
    const lbl = DOC_LABELS[d.type].ja;
    const cls = d.type;
    const subjectLine = d.subject ? `<br>件名：${escapeHtml(d.subject)}` : "";
    row.innerHTML = `
      <div class="hist-item-main">
        <div class="hist-item-title"><span class="tag ${cls}">${lbl}</span>${escapeHtml(d.client || "(宛名未入力)")}</div>
        <div class="hist-item-sub">${d.no} ／ ${d.date} ／ ${yen(d.total)}${subjectLine}</div>
      </div>
      <div class="hist-item-act">
        <button class="mini-btn" data-act="load" data-id="${d.id}">読込</button>
      </div>
    `;
    c.appendChild(row);
  });
  c.querySelectorAll("button[data-act=load]").forEach(b =>
    b.addEventListener("click", () => loadDoc(b.dataset.id)));
}
["hist-search","hist-date-from","hist-date-to","hist-amt-min","hist-amt-max","hist-type"]
  .forEach(id => document.getElementById(id).addEventListener("input", renderHistory));
document.getElementById("btn-hist-clear").addEventListener("click", () => {
  ["hist-search","hist-date-from","hist-date-to","hist-amt-min","hist-amt-max"]
    .forEach(id => document.getElementById(id).value = "");
  document.getElementById("hist-type").value = "";
  renderHistory();
});

function loadDoc(id) {
  const d = getDocs().find(x => x.id === id);
  if (!d) return;
  document.querySelectorAll(".seg-btn").forEach(x =>
    x.classList.toggle("active", x.dataset.doctype === d.type));
  state.docType = d.type;
  document.getElementById("issue-date").value = today();  // 新規発行日にする
  document.getElementById("client-name").value = d.client || "";
  document.getElementById("subject").value = d.subject || "";
  document.getElementById("po-no").value = d.poNo || "";
  document.getElementById("vehicle-name").value = d.vehicleName || "";
  document.getElementById("vehicle-no").value = d.vehicleNo || "";
  document.getElementById("notes").value = d.notes || "";
  state.items = JSON.parse(JSON.stringify(d.items || []));
  renderItems();
  setParent(d.no, d.type);  // 親番号を継承
  document.querySelector('.tab[data-tab=create]').click();
  alert(`「${DOC_LABELS[d.type].ja} ${d.no}」を読み込みました。\n帳票種別を切り替えて新規発行できます。`);
}

/* ====== Build document HTML ====== */
function buildDocHTML(data) {
  const lbl = DOC_LABELS[data.type];
  const { sub, tax, total } = totalsOf(data.items);
  const itemRows = data.items.map(it => `
    <tr>
      <td>${escapeHtml(it.name || "")}</td>
      <td class="cen">${it.qty || ""}</td>
      <td class="cen">${escapeHtml(it.unit || "")}</td>
      <td class="num">${yen((+it.price)||0)}</td>
      <td class="num">${yen(((+it.qty)||0) * ((+it.price)||0))}</td>
    </tr>
  `).join("");
  const blankRows = Math.max(0, 3 - data.items.length);
  const blanks = '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>'.repeat(blankRows);
  const s = data.settings;
  const vehicleBlock = (data.vehicleName || data.vehicleNo) ? `
    <div class="doc-vehicle">
      <div class="vh-title">【作業対象車両】</div>
      ${data.vehicleName ? `<div>${escapeHtml(data.vehicleName)}</div>` : ""}
      ${data.vehicleNo ? `<div>${escapeHtml(data.vehicleNo)}</div>` : ""}
    </div>
  ` : "";

  // 振込先：請求書のみ独立ブロック
  const bankBlock = (data.type === "invoice") ? `
    <div class="doc-bank">
      <div class="bank-title">お振込先</div>
      <table>
        <tr><td class="label">銀行</td><td class="value">${escapeHtml(s.bank)}</td></tr>
        <tr><td class="label">口座名義</td><td class="value">${escapeHtml(s.bankName)}</td></tr>
      </table>
    </div>
  ` : "";

  // 親番号参照
  const parentRef = data.parentNo ? `
    <div class="doc-parent-ref">
      ※${DOC_LABELS[data.parentType]?.ja || ""}番号 ${escapeHtml(data.parentNo)} に基づく
    </div>
  ` : "";

  // 件名
  const subjectBlock = data.subject ? `
    <div class="doc-subject">件名：${escapeHtml(data.subject)}</div>
  ` : "";

  // 先方発注No
  const poBlock = data.poNo ? `
    <div class="doc-po-ref">貴社発注No：${escapeHtml(data.poNo)}</div>
  ` : "";

  return `
  <div class="doc">
    <div class="doc-title">${lbl.ja.split("").join(" ")}</div>

    <div class="doc-issuer">
      <img class="stamp" src="stamp_anzai.png" alt="印" crossorigin="anonymous">
      <div class="company">${escapeHtml(s.company)}</div>
      <div class="issuer-info">
        <div>〒${escapeHtml(s.zip)}</div>
        <div>${escapeHtml(s.address)}</div>
        <div>TEL：${escapeHtml(s.tel)}</div>
        <div>担当：${escapeHtml(s.staff)}</div>
        <div>登録番号：${escapeHtml(s.invoiceNo)}</div>
      </div>
    </div>

    <div class="doc-left-block">
      <div class="doc-meta">
        発行日：${data.date}<br>
        ${lbl.ja}番号：${data.no}
        ${parentRef}
      </div>
      <div class="doc-to">${escapeHtml(data.client || "")} 御中</div>
      ${poBlock}
      <div class="doc-greeting">${lbl.greet}</div>
      <div class="doc-total-line">
        <span class="label">御${lbl.ja.slice(0,2)}金額</span>
        <span class="amount">${yen(total)}（税込）</span>
      </div>
    </div>

    <div class="doc-clear"></div>
    ${subjectBlock}
    ${vehicleBlock}

    <table class="items">
      <thead>
        <tr>
          <th style="width:45%">品名・作業内容</th>
          <th style="width:10%">数量</th>
          <th style="width:10%">単位</th>
          <th style="width:17%">単価(税抜)</th>
          <th style="width:18%">金額(税抜)</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}${blanks}
        <tr><td colspan="3" style="border:none"></td><td class="cen" style="background:#f3f4f6">小計（10%対象・税抜）</td><td class="num">${yen(sub)}</td></tr>
        <tr><td colspan="3" style="border:none"></td><td class="cen" style="background:#f3f4f6">消費税（10%）</td><td class="num">${yen(tax)}</td></tr>
        <tr><td colspan="3" style="border:none"></td><td class="cen" style="background:#fff8e7;font-weight:700">合計（税込）</td><td class="num" style="font-weight:700">${yen(total)}</td></tr>
      </tbody>
    </table>

    ${bankBlock}

    <div class="doc-notes">
      <div class="nt-title">備考</div>
      <pre>${escapeHtml(data.notes || "")}</pre>
    </div>

    <div class="doc-closing">${lbl.closing}</div>
  </div>
  `;
}

/* ====== Preview ====== */
function gatherData() {
  return {
    type: state.docType,
    date: document.getElementById("issue-date").value || today(),
    no: state._previewNo || nextDocNoPeek(state.docType, document.getElementById("issue-date").value),
    client: document.getElementById("client-name").value.trim(),
    subject: document.getElementById("subject").value.trim(),
    poNo: document.getElementById("po-no").value.trim(),
    vehicleName: document.getElementById("vehicle-name").value.trim(),
    vehicleNo: document.getElementById("vehicle-no").value.trim(),
    notes: document.getElementById("notes").value,
    items: state.items,
    settings: getSettings(),
    parentNo: state.parentNo,
    parentType: state.parentType
  };
}

document.getElementById("btn-preview").addEventListener("click", () => {
  if (state.items.length === 0) { alert("明細を1つ以上追加してください。"); return; }
  if (!document.getElementById("client-name").value.trim()) {
    if (!confirm("宛名が空です。続けますか？")) return;
  }
  // プレビュー毎に番号は再計算（種別/日付変更に追随）
  state._previewNo = nextDocNoPeek(state.docType, document.getElementById("issue-date").value);
  const data = gatherData();
  data.no = state._previewNo;
  document.getElementById("preview-area").innerHTML = buildDocHTML(data);
  document.getElementById("preview-modal").classList.remove("hidden");
  requestAnimationFrame(() => requestAnimationFrame(scalePreview));
});
document.getElementById("btn-close-preview").addEventListener("click", closePreview);
document.getElementById("btn-back-edit").addEventListener("click", closePreview);
function closePreview() {
  document.getElementById("preview-modal").classList.add("hidden");
  state._previewNo = null;
}

function scalePreview() {
  const wrap = document.getElementById("preview-area");
  const doc = wrap.querySelector(".doc");
  if (!doc) return;
  const containerW = Math.max(200, wrap.clientWidth - 16);
  const scale = Math.max(0.2, Math.min(1, containerW / 794));
  doc.style.transform = `scale(${scale})`;
  doc.style.marginBottom = `${(1 - scale) * doc.offsetHeight * -1}px`;
}
window.addEventListener("resize", scalePreview);

/* ====== PDF生成 ====== */
document.getElementById("btn-make-pdf").addEventListener("click", async () => {
  const btn = document.getElementById("btn-make-pdf");
  btn.disabled = true; btn.textContent = "作成中…";
  try {
    const data = gatherData();
    data.no = state._previewNo;
    const host = document.getElementById("doc-canvas-host");
    host.innerHTML = buildDocHTML(data);
    const docEl = host.querySelector(".doc");

    const imgs = docEl.querySelectorAll("img");
    await Promise.all([...imgs].map(im =>
      im.complete ? Promise.resolve() : new Promise(r => { im.onload = r; im.onerror = r; })
    ));

    const canvas = await html2canvas(docEl, { scale: 2, useCORS: true, backgroundColor: "#fff" });
    const img = canvas.toDataURL("image/jpeg", 0.92);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = canvas.height / canvas.width;
    let w = pageW;
    let h = w * ratio;
    if (h > pageH) { h = pageH; w = h / ratio; }
    const x = (pageW - w) / 2, y = 0;
    pdf.addImage(img, "JPEG", x, y, w, h);

    const lbl = DOC_LABELS[data.type];
    const clientSlug = (data.client || "宛名なし").slice(0, 20);
    const subjectSlug = data.subject ? "_" + data.subject.slice(0, 15) : "";
    const fname = `${lbl.fileSlug}_${clientSlug}${subjectSlug}_${data.date}_${data.no}.pdf`;

    // 採番確定 → append-only保存
    commitDocNo(data.type, data.date);
    const docs = getDocs();
    const totals = totalsOf(data.items);
    docs.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      type: data.type, no: data.no, date: data.date,
      client: data.client, subject: data.subject, poNo: data.poNo,
      vehicleName: data.vehicleName, vehicleNo: data.vehicleNo,
      notes: data.notes, items: data.items,
      subtotal: totals.sub, tax: totals.tax, total: totals.total,
      taxRate10Base: totals.sub,
      parentNo: data.parentNo, parentType: data.parentType,
      createdAt: new Date().toISOString()
    });
    save(KEY_DOCS, docs);

    // 共有 or ダウンロード
    const blob = pdf.output("blob");
    const file = new File([blob], fname, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: fname }); }
      catch (e) { triggerDownload(blob, fname); }
    } else {
      triggerDownload(blob, fname);
    }
    closePreview();
    // メール本文テンプレ提示
    showMailTemplate(data);
  } catch (e) {
    console.error(e);
    alert("PDF作成中にエラーが発生しました。\n" + e.message);
  } finally {
    btn.disabled = false; btn.textContent = "📄 PDFを作成";
    document.getElementById("doc-canvas-host").innerHTML = "";
  }
});

function triggerDownload(blob, fname) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ====== メール本文テンプレ ====== */
function showMailTemplate(data) {
  const s = data.settings;
  const lbl = DOC_LABELS[data.type];
  const clientLine = data.client ? `${data.client} 御中\n\nご担当者様` : "ご担当者様";
  const subjectLine = data.subject ? `\n（件名：${data.subject}）` : "";
  const refLine = data.poNo ? `\n貴社発注No：${data.poNo}` : "";
  const totals = totalsOf(data.items);
  const bankLine = (data.type === "invoice")
    ? `\n\n【お振込先】\n　${s.bank}\n　口座名義：${s.bankName}\n　※お振込手数料は貴社にてご負担願います。`
    : "";

  const body = `${clientLine}

平素より大変お世話になっております。
${s.company} ${s.staff}でございます。

${lbl.ja}をお送りいたします。${subjectLine}${refLine}

合計金額：${yen(totals.total)}（税込）

ご査収のほどよろしくお願いいたします。
ご不明点等ございましたらお気軽にご連絡ください。${bankLine}

―――――――――――――――――――
${s.company}
〒${s.zip} ${s.address}
TEL：${s.tel}
担当：${s.staff}
登録番号：${s.invoiceNo}
―――――――――――――――――――`;

  document.getElementById("mail-body").value = body;
  document.getElementById("mail-modal").classList.remove("hidden");
}
document.getElementById("btn-close-mail").addEventListener("click", () =>
  document.getElementById("mail-modal").classList.add("hidden"));
document.getElementById("btn-mail-close-2").addEventListener("click", () =>
  document.getElementById("mail-modal").classList.add("hidden"));
document.getElementById("btn-mail-copy").addEventListener("click", async () => {
  const txt = document.getElementById("mail-body").value;
  try {
    await navigator.clipboard.writeText(txt);
    alert("コピーしました。メール／LINEに貼り付けてください。");
  } catch {
    document.getElementById("mail-body").select();
    document.execCommand("copy");
    alert("コピーしました。");
  }
});

/* ====== Utils ====== */
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/* ====== Initial ====== */
function init() {
  document.getElementById("issue-date").value = today();
  document.getElementById("notes").value = DEFAULT_NOTES_BY_TYPE.quote;
  addItem();
}
init();

/* ====== Service Worker ====== */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("service-worker.js").catch(() => {}));
}
