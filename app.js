/* =========================================
   Aテック 帳票PWA - app.js
========================================= */

const KEY_SETTINGS = "atech_settings_v1";
const KEY_CLIENTS  = "atech_clients_v1";
const KEY_ITEMS    = "atech_items_v1";
const KEY_DOCS     = "atech_docs_v1";
const KEY_COUNTER  = "atech_counter_v1";

const DOC_LABELS = {
  quote:    { ja: "見積書",   en: "Quote",    greet: "下記の通り御見積申し上げます。" },
  delivery: { ja: "納品書",   en: "Delivery", greet: "下記の通り納品いたします。" },
  invoice:  { ja: "請求書",   en: "Invoice",  greet: "下記の通りご請求申し上げます。" }
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
  items: []
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

function nextDocNo(type) {
  const counter = load(KEY_COUNTER, {});
  const today = new Date();
  const ymd = `${today.getFullYear()}${pad(today.getMonth()+1)}${pad(today.getDate())}`;
  const key = `${type}_${ymd}`;
  counter[key] = (counter[key] || 0) + 1;
  save(KEY_COUNTER, counter);
  const prefix = { quote: "Q", delivery: "D", invoice: "I" }[type];
  return `A-${ymd}-${prefix}${pad3(counter[key])}`;
}

const pad = n => String(n).padStart(2, "0");
const pad3 = n => String(n).padStart(3, "0");
const yen = n => "¥" + Number(n || 0).toLocaleString("ja-JP");

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
  let sub = 0;
  state.items.forEach(it => sub += (+it.qty) * (+it.price));
  const tax = Math.floor(sub * 0.1);
  const total = sub + tax;
  document.getElementById("sum-subtotal").textContent = yen(sub);
  document.getElementById("sum-tax").textContent = yen(tax);
  document.getElementById("sum-total").textContent = yen(total);
  return { sub, tax, total };
}
document.getElementById("btn-add-item").addEventListener("click", () => {
  const master = getItemsMaster();
  if (master.length === 0) { addItem(); return; }
  // 簡易選択：プロンプトで選ぶ
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
  document.getElementById("settings-modal").classList.remove("hidden");
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
  a.download = `atech_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
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
  if (!confirm("すべてのデータを削除します。元に戻せません。本当によろしいですか？")) return;
  if (!confirm("最終確認：全データを削除しますか？")) return;
  [KEY_SETTINGS, KEY_CLIENTS, KEY_ITEMS, KEY_DOCS, KEY_COUNTER].forEach(k => localStorage.removeItem(k));
  location.reload();
});

/* ====== History ====== */
function renderHistory() {
  const list = getDocs().slice().reverse();
  const q = document.getElementById("hist-search").value.trim().toLowerCase();
  const c = document.getElementById("history-list");
  const filtered = q ? list.filter(d =>
    (d.client && d.client.toLowerCase().includes(q)) ||
    (d.no && d.no.toLowerCase().includes(q))) : list;
  c.innerHTML = filtered.length ? "" : '<div class="empty">履歴がありません</div>';
  filtered.forEach(d => {
    const row = document.createElement("div");
    row.className = "hist-item";
    const lbl = DOC_LABELS[d.type].ja;
    const cls = d.type;
    row.innerHTML = `
      <div class="hist-item-main">
        <div class="hist-item-title"><span class="tag ${cls}">${lbl}</span>${escapeHtml(d.client || "(宛名未入力)")}</div>
        <div class="hist-item-sub">${d.no} ／ ${d.date} ／ ${yen(d.total)}</div>
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
document.getElementById("hist-search").addEventListener("input", renderHistory);

function loadDoc(id) {
  const d = getDocs().find(x => x.id === id);
  if (!d) return;
  document.querySelectorAll(".seg-btn").forEach(x =>
    x.classList.toggle("active", x.dataset.doctype === d.type));
  state.docType = d.type;
  document.getElementById("issue-date").value = d.date;
  document.getElementById("client-name").value = d.client || "";
  document.getElementById("vehicle-name").value = d.vehicleName || "";
  document.getElementById("vehicle-no").value = d.vehicleNo || "";
  document.getElementById("notes").value = d.notes || "";
  state.items = JSON.parse(JSON.stringify(d.items || []));
  renderItems();
  document.querySelector('.tab[data-tab=create]').click();
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
  const blankRows = Math.max(0, 4 - data.items.length);
  const blanks = '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>'.repeat(blankRows);
  const s = data.settings;
  const vehicleBlock = (data.vehicleName || data.vehicleNo) ? `
    <div class="doc-vehicle">
      <div class="vh-title">【作業対象車両】</div>
      ${data.vehicleName ? `<div>${escapeHtml(data.vehicleName)}</div>` : ""}
      ${data.vehicleNo ? `<div>${escapeHtml(data.vehicleNo)}</div>` : ""}
    </div>
  ` : "";

  return `
  <div class="doc">
    <div class="doc-title">${lbl.ja.split("").join(" ")}</div>
    <div class="doc-meta">
      発行日：${data.date}<br>
      ${lbl.ja}番号：${data.no}
    </div>
    <div class="doc-to">${escapeHtml(data.client || "")} 御中</div>
    <div class="doc-greeting">${lbl.greet}</div>

    <div class="doc-total-line">
      <span class="label">御${lbl.ja.slice(0,2)}金額</span>
      <span class="amount">${yen(total)}-（税込）</span>
    </div>

    <div class="doc-issuer">
      <div class="company">${escapeHtml(s.company)}</div>
      <div>〒${escapeHtml(s.zip)}</div>
      <div>${escapeHtml(s.address)}</div>
      <div>TEL：${escapeHtml(s.tel)}</div>
      <div>担当：${escapeHtml(s.staff)}</div>
      <div>登録番号：${escapeHtml(s.invoiceNo)}</div>
      <div class="stamp-wrap">
        <img class="stamp" src="stamp_anzai.png" alt="印" crossorigin="anonymous">
      </div>
    </div>

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
        <tr><td colspan="3" style="border:none"></td><td class="cen" style="background:#f3f4f6">小計</td><td class="num">${yen(sub)}</td></tr>
        <tr><td colspan="3" style="border:none"></td><td class="cen" style="background:#f3f4f6">消費税(10%)</td><td class="num">${yen(tax)}</td></tr>
        <tr><td colspan="3" style="border:none"></td><td class="cen" style="background:#fff8e7;font-weight:700">合計(税込)</td><td class="num" style="font-weight:700">${yen(total)}</td></tr>
      </tbody>
    </table>

    <div class="doc-notes">
      <div class="nt-title">備考</div>
      <pre>${escapeHtml(data.notes || "")}
${(data.type==="invoice"||data.type==="quote") ? `・お振込先：${escapeHtml(s.bank)}\n　　　　　　口座名義：${escapeHtml(s.bankName)}` : ""}</pre>
    </div>
  </div>
  `;
}

function totalsOf(items) {
  let sub = 0;
  items.forEach(it => sub += ((+it.qty) || 0) * ((+it.price) || 0));
  const tax = Math.floor(sub * 0.1);
  return { sub, tax, total: sub + tax };
}

/* ====== Preview ====== */
function gatherData() {
  return {
    type: state.docType,
    date: document.getElementById("issue-date").value,
    no: state._previewNo || nextDocNo(state.docType),
    client: document.getElementById("client-name").value.trim(),
    vehicleName: document.getElementById("vehicle-name").value.trim(),
    vehicleNo: document.getElementById("vehicle-no").value.trim(),
    notes: document.getElementById("notes").value,
    items: state.items,
    settings: getSettings()
  };
}

document.getElementById("btn-preview").addEventListener("click", () => {
  if (state.items.length === 0) { alert("明細を1つ以上追加してください。"); return; }
  if (!document.getElementById("client-name").value.trim()) {
    if (!confirm("宛名が空です。続けますか？")) return;
  }
  state._previewNo = nextDocNoPeek(state.docType);
  const data = gatherData();
  data.no = state._previewNo;
  document.getElementById("preview-area").innerHTML = buildDocHTML(data);
  scalePreview();
  document.getElementById("preview-modal").classList.remove("hidden");
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
  const containerW = wrap.clientWidth - 16;
  const scale = Math.min(1, containerW / 794);
  doc.style.transform = `scale(${scale})`;
  doc.style.marginBottom = `${(1 - scale) * doc.offsetHeight * -1}px`;
}
window.addEventListener("resize", scalePreview);

/* nextDocNoPeek: 番号を確定せず採番候補だけ取得 */
function nextDocNoPeek(type) {
  const counter = load(KEY_COUNTER, {});
  const today = new Date();
  const ymd = `${today.getFullYear()}${pad(today.getMonth()+1)}${pad(today.getDate())}`;
  const key = `${type}_${ymd}`;
  const next = (counter[key] || 0) + 1;
  const prefix = { quote: "Q", delivery: "D", invoice: "I" }[type];
  return `A-${ymd}-${prefix}${pad3(next)}`;
}
function commitDocNo(type) {
  const counter = load(KEY_COUNTER, {});
  const today = new Date();
  const ymd = `${today.getFullYear()}${pad(today.getMonth()+1)}${pad(today.getDate())}`;
  const key = `${type}_${ymd}`;
  counter[key] = (counter[key] || 0) + 1;
  save(KEY_COUNTER, counter);
}

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

    // 画像読み込み待ち
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

    const lbl = DOC_LABELS[data.type].ja;
    const fname = `${lbl}_${(data.client || "宛名なし").slice(0,20)}_${data.date}_${data.no}.pdf`;

    // 履歴保存 & 採番確定
    commitDocNo(data.type);
    const docs = getDocs();
    docs.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      type: data.type, no: data.no, date: data.date,
      client: data.client, vehicleName: data.vehicleName, vehicleNo: data.vehicleNo,
      notes: data.notes, items: data.items,
      total: totalsOf(data.items).total,
      createdAt: new Date().toISOString()
    });
    save(KEY_DOCS, docs);

    // モバイル：Web Share API でファイル共有を試す → ダメならダウンロード
    const blob = pdf.output("blob");
    const file = new File([blob], fname, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fname });
      } catch (e) {
        // 共有キャンセル時はダウンロードにフォールバック
        triggerDownload(blob, fname);
      }
    } else {
      triggerDownload(blob, fname);
    }
    closePreview();
    alert("PDFを作成しました。");
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

/* ====== Utils ====== */
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/* ====== Initial ====== */
function init() {
  document.getElementById("issue-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("notes").value = DEFAULT_NOTES_BY_TYPE.quote;
  addItem(); // 1行用意
}
init();

/* ====== Service Worker ====== */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("service-worker.js").catch(() => {}));
}
