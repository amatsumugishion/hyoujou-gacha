const IMG_BASE = "img/full/";
const ALL_LABEL = "すべて";
const OTHER_CATEGORY = "無所属";
const OTHER_FALLBACK_LABEL = "無所属（その他）";
const NON_COMPOSITE_TAGS = new Set(["fang", "skin fang"]);
const CATEGORY_ORDER = ["笑顔", "照れ", "怒り", "悲しみ", "驚き", "嗜虐"];

let records = [];
let categories = [];
let translations = {};
let partRules = {};
let selectedGachaCategory = ALL_LABEL;
let selectedListCategory = ALL_LABEL;
let selectedGachaComposite = "all"; // all | single | composite
let selectedListComposite = "all";
let selectedGachaPart = ALL_LABEL; // すべて | 口元 | 目元
let selectedListPart = ALL_LABEL;

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
  const known = CATEGORY_ORDER.filter((c) => set.has(c));
  const others = Array.from(set).filter((c) => !CATEGORY_ORDER.includes(c) && c !== OTHER_FALLBACK_LABEL);
  categories = [ALL_LABEL, ...known, ...others, ...(set.has(OTHER_FALLBACK_LABEL) ? [OTHER_FALLBACK_LABEL] : [])];
}

// 「無所属」はサイト表示上「無所属（その他）」というラベルにする（CSVは変更しない）
function effectiveCategories(record) {
  return record.categories.map((cat) => (cat === OTHER_CATEGORY ? OTHER_FALLBACK_LABEL : cat));
}

// 無所属に分類された画像のタグを、口元/目元のどちらに該当するか判定する（サイト表示専用）
function recordParts(record) {
  if (!record.categories.includes(OTHER_CATEGORY)) return [];
  const tagSet = new Set(record.tags);
  const parts = [];
  for (const [part, keywords] of Object.entries(partRules)) {
    if (keywords.some((k) => tagSet.has(k))) parts.push(part);
  }
  return parts;
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

// すべて画面用：すべて/口元/目元
const PART_OPTIONS_ALL = [
  { value: ALL_LABEL, label: "すべて" },
  { value: "口元", label: "口元" },
  { value: "目元", label: "目元" },
];

// 無所属（その他）画面用：単体/複合の代わりにこちらを出す
const PART_OPTIONS_OTHER = [
  { value: "口元", label: "口元" },
  { value: "目元", label: "目元" },
  { value: "その他", label: "その他" },
];

function renderToggleButtons(container, options, selected, onSelect) {
  container.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.textContent = opt.label;
    if (opt.value === selected) btn.classList.add("selected");
    btn.addEventListener("click", () => onSelect(opt.value));
    container.appendChild(btn);
  });
}

// カテゴリに応じて、口元/目元の絞り込み行をどう出すか決める
// "other" = 無所属（その他）を選択中（単体/複合は隠し、口元/目元/その他を出す）
// "all"   = すべてを選択中（単体/複合と、すべて/口元/目元を両方出す）
// "none"  = それ以外の個別カテゴリ（単体/複合のみ、口元/目元は隠す）
function partContextFor(category) {
  if (category === OTHER_FALLBACK_LABEL) return "other";
  if (category === ALL_LABEL) return "all";
  return "none";
}

function renderSecondaryRows(category, compositeContainer, partContainer, getComposite, setComposite, getPart, setPart, onChange) {
  const ctx = partContextFor(category);

  if (ctx === "other") {
    compositeContainer.style.display = "none";
    partContainer.style.display = "flex";
    if (!["口元", "目元", "その他"].includes(getPart())) setPart("");
    renderToggleButtons(partContainer, PART_OPTIONS_OTHER, getPart(), (v) => {
      setPart(v);
      onChange();
    });
  } else if (ctx === "all") {
    compositeContainer.style.display = "flex";
    partContainer.style.display = "flex";
    if (![ALL_LABEL, "口元", "目元"].includes(getPart())) setPart(ALL_LABEL);
    renderToggleButtons(partContainer, PART_OPTIONS_ALL, getPart(), (v) => {
      setPart(v);
      onChange();
    });
    renderToggleButtons(compositeContainer, COMPOSITE_OPTIONS, getComposite(), (v) => {
      setComposite(v);
      onChange();
    });
  } else {
    partContainer.style.display = "none";
    setPart(ALL_LABEL);
    compositeContainer.style.display = "flex";
    renderToggleButtons(compositeContainer, COMPOSITE_OPTIONS, getComposite(), (v) => {
      setComposite(v);
      onChange();
    });
  }

  return ctx;
}

function filteredRecords(category, compositeMode, partMode) {
  return records.filter((r) => {
    if (category !== ALL_LABEL && !effectiveCategories(r).includes(category)) return false;
    if (compositeMode === "single" && isComposite(r)) return false;
    if (compositeMode === "composite" && !isComposite(r)) return false;
    if (partMode === "口元" || partMode === "目元") {
      if (!recordParts(r).includes(partMode)) return false;
    } else if (partMode === "その他") {
      if (!(r.categories.includes(OTHER_CATEGORY) && recordParts(r).length === 0)) return false;
    }
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
  const pool = filteredRecords(selectedGachaCategory, selectedGachaComposite, selectedGachaPart);
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
  const partContainer = document.getElementById("gacha-part-buttons");

  function refreshSecondaryRows() {
    renderSecondaryRows(
      selectedGachaCategory, compositeContainer, partContainer,
      () => selectedGachaComposite, (v) => { selectedGachaComposite = v; },
      () => selectedGachaPart, (v) => { selectedGachaPart = v; },
      () => { refreshSecondaryRows(); drawGacha(); }
    );
  }

  function handleSelect(cat) {
    selectedGachaCategory = cat;
    renderCategoryButtons(container, selectedGachaCategory, handleSelect);
    refreshSecondaryRows();
    drawGacha();
  }

  renderCategoryButtons(container, selectedGachaCategory, handleSelect);
  refreshSecondaryRows();

  let gachaBtn = document.getElementById("gacha-draw-btn");
  if (!gachaBtn) {
    gachaBtn = document.createElement("button");
    gachaBtn.id = "gacha-draw-btn";
    gachaBtn.className = "mode-btn";
    gachaBtn.textContent = "ガチャを引く";
    gachaBtn.style.display = "block";
    gachaBtn.style.margin = "0 auto 24px";
    gachaBtn.addEventListener("click", drawGacha);
    partContainer.insertAdjacentElement("afterend", gachaBtn);
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

function buildGridSection(title, pool) {
  const section = document.createElement("div");
  section.className = "grid-section";

  const heading = document.createElement("h3");
  heading.className = "grid-section-title";
  heading.textContent = `${title}（${pool.length}）`;
  section.appendChild(heading);

  const grid = document.createElement("div");
  grid.className = "grid";
  section.appendChild(grid);
  renderGridItems(grid, pool, "該当する画像がまだありません");

  return section;
}

function renderListGrid() {
  const container = document.getElementById("list-grid-container");
  container.innerHTML = "";

  const ctx = partContextFor(selectedListCategory);
  const pool = filteredRecords(selectedListCategory, ctx === "other" ? "all" : selectedListComposite, selectedListPart);

  if (pool.length === 0) {
    container.innerHTML = '<p class="empty-note">このカテゴリの画像がまだありません</p>';
    return;
  }

  if (ctx === "other") {
    const grid = document.createElement("div");
    grid.className = "grid";
    container.appendChild(grid);
    renderGridItems(grid, pool, "該当する画像がまだありません");
    return;
  }

  const singlePool = pool.filter((r) => !isComposite(r));
  const compositePool = pool.filter((r) => isComposite(r));

  if (selectedListComposite !== "composite") {
    container.appendChild(buildGridSection("単体", singlePool));
  }
  if (selectedListComposite !== "single") {
    container.appendChild(buildGridSection("複合", compositePool));
  }
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
  const partContainer = document.getElementById("list-part-buttons");

  function refreshSecondaryRows() {
    renderSecondaryRows(
      selectedListCategory, compositeContainer, partContainer,
      () => selectedListComposite, (v) => { selectedListComposite = v; },
      () => selectedListPart, (v) => { selectedListPart = v; },
      () => { refreshSecondaryRows(); renderListGrid(); }
    );
  }

  function handleSelect(cat) {
    selectedListCategory = cat;
    renderCategoryButtons(container, selectedListCategory, handleSelect);
    refreshSecondaryRows();
    renderListGrid();
  }

  renderCategoryButtons(container, selectedListCategory, handleSelect);
  refreshSecondaryRows();
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
