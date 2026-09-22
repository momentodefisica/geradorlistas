const estado = {
  taxonomia: null,
  disponiveis: null,
  selecionados: new Set(),
  pdfsPorChave: {},
};

async function iniciar() {
  try {
    const [r1, r2] = await Promise.all([
      fetch("taxonomia.json"),
      fetch("pdfs/disponiveis.json"),
    ]);
    if (!r1.ok || !r2.ok) throw new Error("Falha ao carregar dados");
    estado.taxonomia = await r1.json();
    estado.disponiveis = await r2.json();
  } catch (e) {
    document.getElementById("carregando").textContent =
      "Erro ao carregar. Tente novamente mais tarde.";
    console.error(e);
    return;
  }

  for (const p of estado.disponiveis.pdfs) {
    estado.pdfsPorChave[`${p.tema}::${p.subtema}`] = p;
  }

  document.getElementById("carregando").hidden = true;
  document.getElementById("arvore").hidden = false;
  document.getElementById("selecionados").hidden = false;
  renderizarArvore();
  atualizarSelecionados();
}

function renderizarArvore() {
  const container = document.getElementById("arvore");
  container.innerHTML = "";

  for (const [disc, infoDisc] of Object.entries(estado.taxonomia)) {
    const blocoDisc = document.createElement("div");
    blocoDisc.className = "disciplina";

    const h = document.createElement("h2");
    h.textContent = infoDisc.nome;
    blocoDisc.appendChild(h);

    for (const [tema, infoTema] of Object.entries(infoDisc.temas || {})) {
      blocoDisc.appendChild(criarBlocoTema(disc, tema, infoTema));
    }

    container.appendChild(blocoDisc);
  }
}

function criarBlocoTema(disc, tema, infoTema) {
  const bloco = document.createElement("details");
  bloco.className = "tema";
  bloco.open = false;

  // Cabeçalho do tema
  const summary = document.createElement("summary");
  const checkTema = document.createElement("input");
  checkTema.type = "checkbox";
  checkTema.className = "check-tema";
  checkTema.addEventListener("click", (e) => e.stopPropagation());
  checkTema.addEventListener("change", (e) => {
    const marcar = e.target.checked;
    for (const sub of Object.keys(infoTema.subtemas || {})) {
      const chave = `${tema}::${sub}`;
      if (!(chave in estado.pdfsPorChave)) continue;
      if (marcar) estado.selecionados.add(chave);
      else estado.selecionados.delete(chave);
    }
    bloco.querySelectorAll(".check-sub").forEach((cb) => {
      if (!cb.disabled) cb.checked = marcar;
    });
    atualizarSelecionados();
  });

  const nomeTema = document.createElement("span");
  nomeTema.className = "nome-tema";
  nomeTema.textContent = infoTema.nome;

  const contTema = document.createElement("span");
  contTema.className = "contagem";
  const totalTema = Object.keys(infoTema.subtemas || {}).reduce((s, sub) => {
    const p = estado.pdfsPorChave[`${tema}::${sub}`];
    return s + (p ? p.total : 0);
  }, 0);
  contTema.textContent = totalTema;

  summary.append(checkTema, nomeTema, contTema);
  bloco.appendChild(summary);

  // Lista de subtemas
  const lista = document.createElement("div");
  lista.className = "subtemas";

  for (const [sub, nomeSub] of Object.entries(infoTema.subtemas || {})) {
    const chave = `${tema}::${sub}`;
    const info = estado.pdfsPorChave[chave];
    const disponivel = !!info;

    const label = document.createElement("label");
    label.className = "subtema";
    if (!disponivel) label.classList.add("indisponivel");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "check-sub";
    cb.disabled = !disponivel;
    cb.dataset.chave = chave;
    cb.addEventListener("change", (e) => {
      if (e.target.checked) estado.selecionados.add(chave);
      else estado.selecionados.delete(chave);
      sincronizarCheckTema(bloco, tema, infoTema);
      atualizarSelecionados();
    });

    const nome = document.createElement("span");
    nome.textContent = nomeSub;

    const cnt = document.createElement("span");
    cnt.className = "contagem";
    cnt.textContent = disponivel ? info.total : "0";

    label.append(cb, nome, cnt);
    lista.appendChild(label);
  }

  bloco.appendChild(lista);
  return bloco;
}

function sincronizarCheckTema(bloco, tema, infoTema) {
  const subs = Object.keys(infoTema.subtemas || {}).filter(
    (s) => `${tema}::${s}` in estado.pdfsPorChave
  );
  const marcados = subs.filter((s) => estado.selecionados.has(`${tema}::${s}`));
  const cb = bloco.querySelector(".check-tema");
  cb.checked = subs.length > 0 && marcados.length === subs.length;
  cb.indeterminate = marcados.length > 0 && marcados.length < subs.length;
}

function atualizarSelecionados() {
  const chips = document.getElementById("chips");
  const btn = document.getElementById("btn-gerar");

  chips.innerHTML = "";
  const total = estado.selecionados.size;

  if (total === 0) {
    chips.innerHTML = "<p class='vazio'>Nada selecionado ainda.</p>";
    btn.disabled = true;
    btn.textContent = "Baixar lista";
    return;
  }

  const porTema = {};
  for (const chave of estado.selecionados) {
    const [tema, sub] = chave.split("::");
    if (!porTema[tema]) porTema[tema] = [];
    porTema[tema].push(sub);
  }

  for (const [tema, subs] of Object.entries(porTema)) {
    const grupo = document.createElement("div");
    grupo.className = "chip-grupo";

    const titulo = document.createElement("strong");
    titulo.textContent = nomeBonitoTema(tema);
    grupo.appendChild(titulo);

    for (const s of subs) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = nomeBonitoSubtema(tema, s);
      chip.title = "Remover";
      chip.addEventListener("click", () => {
        estado.selecionados.delete(`${tema}::${s}`);
        const cb = document.querySelector(
          `input[data-chave="${CSS.escape(`${tema}::${s}`)}"]`
        );
        if (cb) cb.checked = false;
        sincronizarCheckTemaPorChave(tema);
        atualizarSelecionados();
      });
      grupo.appendChild(chip);
    }
    chips.appendChild(grupo);
  }

  btn.disabled = false;
  btn.textContent = `Baixar lista (${total} subtema${total > 1 ? "s" : ""})`;
}

function nomeBonitoTema(tema) {
  for (const d of Object.values(estado.taxonomia)) {
    if (d.temas && d.temas[tema]) return d.temas[tema].nome;
  }
  return tema;
}

function nomeBonitoSubtema(tema, sub) {
  for (const d of Object.values(estado.taxonomia)) {
    if (d.temas && d.temas[tema] && d.temas[tema].subtemas[sub]) {
      return d.temas[tema].subtemas[sub];
    }
  }
  return sub;
}

function sincronizarCheckTemaPorChave(tema) {
  // Recalcula o estado do checkbox do tema dono dessa chave
  const bloco = [...document.querySelectorAll("details.tema")].find((d) => {
    const cb = d.querySelector(".check-sub");
    return cb && cb.dataset.chave.startsWith(`${tema}::`);
  });
  if (!bloco) return;
  // Recalcula todos
  document.querySelectorAll("details.tema").forEach((d) => {
    const algumSub = d.querySelector(".check-sub");
    if (!algumSub) return;
    const chave = algumSub.dataset.chave;
    const t = chave.split("::")[0];
    if (t !== tema) return;
    // Recalcula contagens
    const subtemas = [...d.querySelectorAll(".check-sub")];
    const marcados = subtemas.filter((cb) => cb.checked && !cb.disabled);
    const habilitados = subtemas.filter((cb) => !cb.disabled);
    const checkTema = d.querySelector(".check-tema");
    checkTema.checked = habilitados.length > 0 && marcados.length === habilitados.length;
    checkTema.indeterminate = marcados.length > 0 && marcados.length < habilitados.length;
  });
}

// --- Geração do PDF ---

document.getElementById("btn-gerar").addEventListener("click", gerarLista);
document.getElementById("btn-limpar").addEventListener("click", () => {
  estado.selecionados.clear();
  document.querySelectorAll(".check-sub, .check-tema").forEach((cb) => {
    cb.checked = false;
    cb.indeterminate = false;
  });
  atualizarSelecionados();
});

async function gerarLista() {
  const btn = document.getElementById("btn-gerar");
  const chaves = [...estado.selecionados];
  if (chaves.length === 0) return;

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Gerando…";

  try {
    const arquivos = chaves
      .map((c) => estado.pdfsPorChave[c]?.arquivo)
      .filter(Boolean);

    if (arquivos.length === 1) {
      window.open(`pdfs/${arquivos[0]}`, "_blank");
      return;
    }

    const { PDFDocument } = PDFLib;
    const merged = await PDFDocument.create();

    for (const arq of arquivos) {
      const resp = await fetch(`pdfs/${arq}`);
      if (!resp.ok) throw new Error(`Falha ao baixar ${arq}`);
      const bytes = await resp.arrayBuffer();
      const doc = await PDFDocument.load(bytes);
      const paginas = await merged.copyPages(doc, doc.getPageIndices());
      paginas.forEach((p) => merged.addPage(p));
    }

    const bytes = await merged.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "lista-enem.pdf";
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (e) {
    alert("Erro: " + e.message);
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

iniciar();