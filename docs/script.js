const IMG_BASE = "img/full/";
const ALL_LABEL = "すべて";
const OTHER_CATEGORY = "無所属";
const OTHER_FALLBACK_LABEL = "無所属（その他）";
const NON_COMPOSITE_TAGS = new Set(["fang", "skin fang"]);

let records = [];
let categories = [];
let translations = {};
let partRules = {};
let selectedGachaCategory = ALL_LABEL;
let selectedListCategory = ALL_LABEL;
let selectedGachaComposite = "all"; // all | single | composite
let selectedListComposite = "all";

async function loadData() {
  const [promptsRes, translationsRes, partRulesRes] = await Promise.all([
    fetch("data/prompts.json"),
    fetch("data/tag_translations.json"),
    fetch("data/part_rules.json"),
  ]);
  records = await promptsRes.json();
  translations = await translationsRes.json();
  partRules = await partRulesRes.json();

  const set = new Set();
  records.forEach((r) => effectiveCategories(r).forEach((c) => set.add(c)));
  categories = [ALL_LABEL, ...Array.from(set)];
}

// 「無所属」を、タグの中身に応じて口元/目元/無所属（その他）に読み替える（サイト表示専用、CSVは変更しない）
function effectiveCategories(record) {
  return record.categories.map((cat) => {
    if (cat !== OTHER_CATEGORY) return cat;

    const tagSet = new Set(record.tags);
    for (const [part, keywords] of Object.entries(partRules)) {
      if (keywords.some((k) => tagSet.has(k))) return part;
    }
    return OTHER_FALLBACK_LABEL;
  });
}

// タグ数が2以上（fang/skin fangは数えない）なら複合とみなす
function isComposite(record) {
  const count = record.tags.filter((t) => !NON_COMPOSITE_TAGS.has(t)).length;
  return count >= 2;
}

function renderCategoryButtons(container, selected, onSelect) {
  container.innerHTML = "";
  categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.textContent = cat;
    if (cat === selected) btn.classList.add("selected");
    btn.addEventListener("click", () => onSelect(cat));
    container.appendChild(btn);
  });
}

const COMPOSITE_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "single", label: "単体" },
  { value: "composite", label: "複合" },
];

function renderCompositeButtons(container, selected, onSelect) {
  container.innerHTML = "";
  COMPOSITE_OPTIONS.forEach((opt) => {
    const btn = document.createElement("button");
    btn.textContent = opt.label;
    if (opt.value === selected) btn.classList.add("selected");
    btn.addEventListener("click", () => onSelect(opt.value));
    container.appendChild(btn);
  });
}

function filteredRecords(category, compositeMode) {
  return records.filter((r) => {
    if (category !== ALL_LABEL && !effectiveCategories(r).includes(category)) return false;
    if (compositeMode === "single" && isComposite(r)) return false;
    if (compositeMode === "composite" && !isComposite(r)) return false;
    return true;
  });
}

function renderTagChips(container, tags) {
  container.innerHTML = "";
  tags.forEach((t) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = t;
    container.appendChild(chip);
  });
}

function renderTranslatedChips(container, tags) {
  container.innerHTML = "";
  tags.forEach((t) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip tag-chip-ja";
    chip.textContent = translations[t] || t;
    container.appendChild(chip);
  });
}

function renderNote(container, note) {
  container.innerHTML = "";
  if (!note) return;
  const p = document.createElement("p");
  p.className = "note-text";
  p.textContent = "※ " + note;
  container.appendChild(p);
}

function buildTagsRow(tags) {
  const row = document.createElement("div");
  row.className = "tags-row";

  const chipsWrap = document.createElement("div");
  chipsWrap.className = "tags";
  renderTagChips(chipsWrap, tags);
  row.appendChild(chipsWrap);

  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.type = "button";
  copyBtn.textContent = "コピー";
  copyBtn.title = "プロンプトをコピー";
  copyBtn.addEventListener("click", () => {
    const original = copyBtn.textContent;
    navigator.clipboard.writeText(tags.join(", "))
      .then(() => {
        copyBtn.textContent = "コピーしました";
      })
      .catch(() => {
        copyBtn.textContent = "コピーに失敗しました";
      })
      .finally(() => {
        setTimeout(() => {
          copyBtn.textContent = original;
        }, 1200);
      });
  });
  row.appendChild(copyBtn);

  return row;
}

// ---- お気に入り ----

const FAVORITES_KEY = "hyoujou-gacha-favorites";

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
  } catch {
    return [];
  }
}

function isFavorite(file) {
  return getFavorites().includes(file);
}

function toggleFavorite(file) {
  const favs = getFavorites();
  const idx = favs.indexOf(file);
  if (idx === -1) {
    favs.push(file);
  } else {
    favs.splice(idx, 1);
  }
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

function buildFavoriteButton(record, onChange) {
  const btn = document.createElement("button");
  btn.className = "favorite-btn";
  btn.type = "button";

  function render() {
    const active = isFavorite(record.file);
    btn.textContent = active ? "★ お気に入り登録済み" : "☆ お気に入りに追加";
    btn.classList.toggle("active", active);
  }

  btn.addEventListener("click", () => {
    toggleFavorite(record.file);
    render();
    if (onChange) onChange();
  });

  render();
  return btn;
}

// ---- ガチャ画面 ----

function drawGacha() {
  const pool = filteredRecords(selectedGachaCategory, selectedGachaComposite);
  const resultEl = document.getElementById("gacha-result");

  if (pool.length === 0) {
    resultEl.innerHTML = '<p class="placeholder">このカテゴリの画像がまだありません</p>';
    return;
  }

  const picked = pool[Math.floor(Math.random() * pool.length)];

  resultEl.innerHTML = "";
  const img = document.createElement("img");
  img.src = IMG_BASE + picked.file;
  img.alt = picked.tags.join(", ");
  resultEl.appendChild(img);

  resultEl.appendChild(buildFavoriteButton(picked));
  resultEl.appendChild(buildTagsRow(picked.tags));

  const jaWrap = document.createElement("div");
  jaWrap.className = "tags";
  renderTranslatedChips(jaWrap, picked.tags);
  resultEl.appendChild(jaWrap);

  const noteWrap = document.createElement("div");
  renderNote(noteWrap, picked.note);
  resultEl.appendChild(noteWrap);

  const redrawBtn = document.createElement("button");
  redrawBtn.className = "mode-btn";
  redrawBtn.style.marginTop = "16px";
  redrawBtn.textContent = "もう一回引く";
  redrawBtn.addEventListener("click", drawGacha);
  resultEl.appendChild(redrawBtn);
}

function setupGachaView() {
  const container = document.getElementById("category-buttons");
  const compositeContainer = document.getElementById("gacha-composite-buttons");

  function handleSelect(cat) {
    selectedGachaCategory = cat;
    renderCategoryButtons(container, selectedGachaCategory, handleSelect);
    drawGacha();
  }

  function handleCompositeSelect(mode) {
    selectedGachaComposite = mode;
    renderCompositeButtons(compositeContainer, selectedGachaComposite, handleCompositeSelect);
    drawGacha();
  }

  renderCategoryButtons(container, selectedGachaCategory, handleSelect);
  renderCompositeButtons(compositeContainer, selectedGachaComposite, handleCompositeSelect);

  let gachaBtn = document.getElementById("gacha-draw-btn");
  if (!gachaBtn) {
    gachaBtn = document.createElement("button");
    gachaBtn.id = "gacha-draw-btn";
    gachaBtn.className = "mode-btn";
    gachaBtn.textContent = "ガチャを引く";
    gachaBtn.style.display = "block";
    gachaBtn.style.margin = "0 auto 24px";
    gachaBtn.addEventListener("click", drawGacha);
    compositeContainer.insertAdjacentElement("afterend", gachaBtn);
  }
}

// ---- 一覧画面 ----

function renderGridItems(grid, pool, emptyMessage) {
  grid.innerHTML = "";

  if (pool.length === 0) {
    grid.innerHTML = `<p class="empty-note">${emptyMessage}</p>`;
    return;
  }

  pool.forEach((r) => {
    const item = document.createElement("div");
    item.className = "grid-item";

    const img = document.createElement("img");
    img.src = IMG_BASE + r.file;
    img.alt = r.tags.join(", ");
    img.addEventListener("click", () => openModal(r));
    item.appendChild(img);

    if (r.note) {
      const badge = document.createElement("span");
      badge.className = "note-badge";
      badge.textContent = "※";
      badge.title = r.note;
      item.appendChild(badge);
    }

    grid.appendChild(item);
  });
}

function renderListGrid() {
  const grid = document.getElementById("list-grid");
  const pool = filteredRecords(selectedListCategory, selectedListComposite);
  renderGridItems(grid, pool, "このカテゴリの画像がまだありません");
}

function renderFavoritesGrid() {
  const grid = document.getElementById("favorites-grid");
  const favs = getFavorites();
  const pool = records.filter((r) => favs.includes(r.file));
  renderGridItems(grid, pool, "まだお気に入りがありません");
}

function setupListView() {
  const container = document.getElementById("list-category-buttons");
  const compositeContainer = document.getElementById("list-composite-buttons");

  renderCategoryButtons(container, selectedListCategory, (cat) => {
    selectedListCategory = cat;
    setupListView();
    renderListGrid();
  });
  renderCompositeButtons(compositeContainer, selectedListComposite, (mode) => {
    selectedListComposite = mode;
    setupListView();
    renderListGrid();
  });
  renderListGrid();
}

// ---- モーダル ----

function openModal(record) {
  document.getElementById("modal-img").src = IMG_BASE + record.file;

  const favSlot = document.getElementById("modal-favorite");
  favSlot.innerHTML = "";
  favSlot.appendChild(buildFavoriteButton(record, () => {
    if (document.getElementById("favorites-view").classList.contains("active")) {
      renderFavoritesGrid();
    }
  }));

  const tagsSlot = document.getElementById("modal-tags-row");
  tagsSlot.innerHTML = "";
  tagsSlot.appendChild(buildTagsRow(record.tags));

  renderTranslatedChips(document.getElementById("modal-tags-ja"), record.tags);
  renderNote(document.getElementById("modal-note"), record.note);
  document.getElementById("modal").classList.add("active");
}

function closeModal() {
  document.getElementById("modal").classList.remove("active");
}

// ---- モード切り替え ----

function setupModeSwitch() {
  document.querySelectorAll(".mode-btn[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn[data-mode]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const mode = btn.dataset.mode;
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      document.getElementById(mode + "-view").classList.add("active");

      if (mode === "favorites") renderFavoritesGrid();
    });
  });
}

async function init() {
  await loadData();
  setupModeSwitch();
  setupGachaView();
  setupListView();
  renderFavoritesGrid();

  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal();
  });
}

init();
