(() => {
  const routes = {
    moscow: { name: "Москва · быстрый", type: "WireGuard" },
    helsinki: { name: "Хельсинки · устойчивый", type: "VLESS" },
    frankfurt: { name: "Франкфурт · спокойный", type: "Shadowsocks" }
  };
  const storageKey = "liniya-setup-mock-v1";
  const state = { step: 1, primary: "moscow", backup: "helsinki", policy: "auto", failure: "pause", fileName: "" };
  const form = document.querySelector("#setup-form");
  const linkInput = document.querySelector("#connection-link");
  const fileInput = document.querySelector("#config-file");
  const fileStatus = document.querySelector("#file-status");
  const next = document.querySelector("#next-button");
  const back = document.querySelector("#back-button");
  const connectionError = document.querySelector("#connection-error");
  const routeError = document.querySelector("#route-error");
  const previewRoute = document.querySelector("#preview-route");
  const previewPolicy = document.querySelector("#preview-policy");

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved === "object") Object.assign(state, { primary: saved.primary || state.primary, backup: saved.backup || state.backup, policy: saved.policy || state.policy, failure: saved.failure || state.failure });
  } catch (_) { /* storage is optional */ }

  function persistChoices() {
    try { localStorage.setItem(storageKey, JSON.stringify({ primary: state.primary, backup: state.backup, policy: state.policy, failure: state.failure })); } catch (_) { /* storage is optional */ }
  }
  function selected(name) { return form.querySelector(`input[name="${name}"]:checked`)?.value; }
  function syncState() {
    state.primary = selected("primary") || state.primary;
    state.backup = selected("backup") || state.backup;
    state.policy = selected("policy") || state.policy;
    state.failure = selected("failure") || state.failure;
    persistChoices(); updatePreview();
  }
  function setInputs() {
    ["primary", "backup", "policy", "failure"].forEach((name) => {
      const input = form.querySelector(`input[name="${name}"][value="${state[name]}"]`);
      if (input) input.checked = true;
    });
  }
  function updatePreview() {
    previewRoute.textContent = routes[state.primary].name;
    previewPolicy.textContent = state.policy === "all" ? "Вся сеть через маршрут" : "Выбранные сервисы";
  }
  function validateStep() {
    connectionError.textContent = ""; routeError.textContent = "";
    if (state.step === 1 && !linkInput.value.trim() && !state.fileName) {
      connectionError.textContent = "Добавьте ссылку или выберите файл, чтобы продолжить в макете.";
      linkInput.focus(); return false;
    }
    if (state.step === 2 && selected("primary") === selected("backup")) {
      routeError.textContent = "Основной и резервный маршруты должны различаться.";
      return false;
    }
    return true;
  }
  function renderChecks() {
    const checks = document.querySelector("#checks");
    const summary = document.querySelector("#summary");
    const rows = [
      ["Схема маршрутов", "Основной и резервный маршруты различаются"],
      ["Правило трафика", state.policy === "all" ? "Вся сеть будет использовать выбранный маршрут" : "Обычные сервисы останутся на прямом соединении"],
      ["Поведение при отказе", state.failure === "direct" ? "При отказе трафик перейдёт на прямое соединение" : "Выбранные сервисы будут приостановлены"],
    ];
    checks.innerHTML = rows.map(([title, detail]) => `<div class="check-row"><svg class="checking" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><div><strong>${title}</strong><small>${detail}</small></div></div>`).join("");
    summary.hidden = true;
    window.setTimeout(() => {
      checks.querySelectorAll(".checking").forEach((icon) => icon.classList.remove("checking"));
      summary.innerHTML = `<h2>Схема готова для демонстрации</h2><p>Вы настроили только макет. Никакие параметры не отправлены на Flint 2 и не применены к сети.</p><dl><dt>Основной</dt><dd>${routes[state.primary].name} · ${routes[state.primary].type}</dd><dt>Резервный</dt><dd>${routes[state.backup].name} · ${routes[state.backup].type}</dd><dt>Трафик</dt><dd>${state.policy === "all" ? "Вся сеть через маршрут" : "Автовыбор для выбранных сервисов"}</dd><dt>При отказе</dt><dd>${state.failure === "direct" ? "Прямое соединение" : "Приостановить выбранные сервисы"}</dd></dl>`;
      summary.hidden = false;
    }, 650);
  }
  function render() {
    document.querySelectorAll(".flow-step").forEach((section) => { section.hidden = Number(section.dataset.step) !== state.step; });
    document.querySelectorAll("[data-rail-step]").forEach((item) => {
      const num = Number(item.dataset.railStep);
      item.classList.toggle("is-current", num === state.step);
      item.classList.toggle("is-complete", num < state.step);
    });
    back.hidden = state.step === 1;
    next.textContent = state.step === 4 ? "Завершить макет" : "Продолжить";
    if (state.step === 4) renderChecks();
    updatePreview();
  }
  document.querySelector("#fill-demo").addEventListener("click", () => {
    linkInput.value = "vless://demo-user@edge.moscow.example:443?type=grpc#Линия_демо";
    state.fileName = ""; fileInput.value = ""; fileStatus.textContent = "Демонстрационная ссылка подставлена"; connectionError.textContent = "";
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    state.fileName = file ? file.name : "";
    fileStatus.textContent = file ? `Выбран файл: ${file.name}` : "Файл не выбран";
    connectionError.textContent = "";
  });
  form.addEventListener("change", syncState);
  next.addEventListener("click", () => {
    syncState();
    if (state.step === 4) { window.location.href = "../index.html"; return; }
    if (!validateStep()) return;
    state.step += 1; render();
  });
  back.addEventListener("click", () => { state.step -= 1; render(); });
  setInputs(); syncState(); render();
})();
