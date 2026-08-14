const IMG_BASE = "img/full/";
const ALL_LABEL = "すべて";

let records = [];
let categories = [];
let selectedGachaCategory = ALL_LABEL;
let selectedListCategory = ALL_LABEL;

async function loadData() {
  const res = await fetch("data/prompts.json");
  records = await res.json();

  const set = new Set();
  records.forEach((r) => r.categories.forEach((c) => set.add(c)));
  categories = [ALL_LABEL, ...Array.from(set)];
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

function filteredRecords(category) {
  if (category === ALL_LABEL) return records;
  return records.filter((r) => r.categories.includes(category));
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

// ---- ガチャ画面 ----

function drawGacha() {
  const pool = filteredRecords(selectedGachaCategory);
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

  const tagsWrap = document.createElement("div");
  tagsWrap.className = "tags";
  renderTagChips(tagsWrap, picked.tags);
  resultEl.appendChild(tagsWrap);

  const redrawBtn = document.createElement("button");
  redrawBtn.className = "mode-btn";
  redrawBtn.style.marginTop = "16px";
  redrawBtn.textContent = "もう一回引く";
  redrawBtn.addEventListener("click", drawGacha);
  resultEl.appendChild(redrawBtn);
}

function setupGachaView() {
  const container = document.getElementById("category-buttons");

  function handleSelect(cat) {
    selectedGachaCategory = cat;
    renderCategoryButtons(container, selectedGachaCategory, handleSelect);
    drawGacha();
  }

  renderCategoryButtons(container, selectedGachaCategory, handleSelect);

  let gachaBtn = document.getElementById("gacha-draw-btn");
  if (!gachaBtn) {
    gachaBtn = document.createElement("button");
    gachaBtn.id = "gacha-draw-btn";
    gachaBtn.className = "mode-btn";
    gachaBtn.textContent = "ガチャを引く";
    gachaBtn.style.display = "block";
    gachaBtn.style.margin = "0 auto 24px";
    gachaBtn.addEventListener("click", drawGacha);
    container.insertAdjacentElement("afterend", gachaBtn);
  }
}

// ---- 一覧画面 ----

function renderListGrid() {
  const grid = document.getElementById("list-grid");
  const pool = filteredRecords(selectedListCategory);
  grid.innerHTML = "";

  if (pool.length === 0) {
    grid.innerHTML = '<p class="empty-note">このカテゴリの画像がまだありません</p>';
    return;
  }

  pool.forEach((r) => {
    const img = document.createElement("img");
    img.src = IMG_BASE + r.file;
    img.alt = r.tags.join(", ");
    img.addEventListener("click", () => openModal(r));
    grid.appendChild(img);
  });
}

function setupListView() {
  const container = document.getElementById("list-category-buttons");
  renderCategoryButtons(container, selectedListCategory, (cat) => {
    selectedListCategory = cat;
    setupListView();
    renderListGrid();
  });
  renderListGrid();
}

// ---- モーダル ----

function openModal(record) {
  document.getElementById("modal-img").src = IMG_BASE + record.file;
  renderTagChips(document.getElementById("modal-tags"), record.tags);
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
    });
  });
}

async function init() {
  await loadData();
  setupModeSwitch();
  setupGachaView();
  setupListView();

  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal();
  });
}

init();
