const estado = {
  index: null,          // index.json do banco
  disponiveis: null,    // disponiveis.json (mapa de PDFs gerados)
  selecionados: new Set(),  // chaves "tema::subtema"
};

async function iniciar() {
  try {
    const [r1, r2] = await Promise.all([
      fetch("index.json"),
      fetch("pdfs/disponiveis.json"),
    ]);
    if (!r1.ok || !r2.ok) throw new Error("Falha ao carregar dados");
    estado.index = await r1.json();
    estado.disponiveis = await r2.json();
  } catch (e) {
    document.getElementById("carregando").innerHTML =
      "<p>Erro ao carregar. Tente novamente mais tarde.</p>";
    console.error(e);
    return;
  }

  // Indexa os PDFs disponíveis por chave "tema::subtema"
  estado.pdfsPorChave = {};
  for (const p of estado.disponiveis.pdfs) {
    estado.pdfsPorChave[`${p.tema}::${p.subtema}`] = p.arquivo;
  }

  document.getElementById("carregando").hidden = true;
  document.getElementById("menu").hidden = false;
  document.getElementById("selecionados").hidden = false;
  renderizarArvore();
  atualizarSelecionados();
}

function renderizarArvore() {
  const container = document.getElementById("arvore");
  container.innerHTML = "";

  // Agrupa temas por disciplina
  const porDisciplina = {};
  for (const [nome, info] of Object.entries(estado.index.temas)) {
    const disc = info.disciplinas[0] || "outros";
    if (!porDisciplina[disc]) porDisciplina[disc] = [];
    porDisciplina[disc].push({ nome, ...info });
  }

  const nomesDisc = { matematica: "Matemática", fisica: "Física" };

  for (const [disc, temas] of Object.entries(porDisciplina)) {
    const blocoDisc = document.createElement("div");
    blocoDisc.className = "disciplina";

    const h = document.createElement("h2");
    h.textContent = nomesDisc[disc] || disc;
    blocoDisc.appendChild(h);

    temas.sort((a, b) => a.nome.localeCompare(b.nome));

    for (const tema of temas) {
      blocoDisc.appendChild(criarBlocoTema(tema));
    }

    container.appendChild(blocoDisc);
  }
}

function criarBlocoTema(tema) {
  const bloco = document.createElement("details");
  bloco.className = "tema";
  bloco.open = false;

  const summary = document.createElement("summary");
  summary.innerHTML = `
    <input type="checkbox" class="check-tema" data-tema="${tema.nome}">
    <span class="nome-tema">${formatar(tema.nome)}</span>
    <span class="contagem">${tema.total}</span>
  `;
  bloco.appendChild(summary);

  // Checkbox do tema marca/desmarca todos os subtemas
  const checkTema = summary.querySelector(".check-tema");
  checkTema.addEventListener("click", (e) => e.stopPropagation());
  checkTema.addEventListener("change", (e) => {
    const marcar = e.target.checked;
    for (const subtema of Object.keys(tema.subtemas)) {
      const chave = `${tema.nome}::${subtema}`;
      if (!pdfExiste(chave)) continue;
      if (marcar) estado.selecionados.add(chave);
      else estado.selecionados.delete(chave);
    }
    // Atualiza checkboxes dos subtemas
    bloco.querySelectorAll(".check-sub").forEach((cb) => { cb.checked = marcar; });
    atualizarSelecionados();
  });

  // Lista de subtemas
  const listaSub = document.createElement("div");
  listaSub.className = "subtemas";

  const subtemasOrdenados = Object.entries(tema.subtemas)
    .sort((a, b) => a[0].localeCompare(b[0]));

  for (const [subtema, contagem] of subtemasOrdenados) {
    const chave = `${tema.nome}::${subtema}`;
    const disponivel = pdfExiste(chave);

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
      sincronizarCheckTema(bloco, tema);
      atualizarSelecionados();
    });

    const nome = document.createElement("span");
    nome.textContent = formatar(subtema);

    const cnt = document.createElement("span");
    cnt.className = "contagem";
    cnt.textContent = disponivel ? contagem : `${contagem} (indisponível)`;

    label.append(cb, nome, cnt);
    listaSub.appendChild(label);
  }

  bloco.appendChild(listaSub);
  return bloco;
}

function pdfExiste(chave) {
  return chave in estado.pdfsPorChave;
}

function sincronizarCheckTema(bloco, tema) {
  const subs = Object.keys(tema.subtemas).filter((s) => pdfExiste(`${tema.nome}::${s}`));
  const marcados = subs.filter((s) => estado.selecionados.has(`${tema.nome}::${s}`));
  const checkTema = bloco.querySelector(".check-tema");
  checkTema.checked = subs.length > 0 && marcados.length === subs.length;
  checkTema.indeterminate = marcados.length > 0 && marcados.length < subs.length;
}

function formatar(nome) {
  return nome.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function atualizarSelecionados() {
  const secao = document.getElementById("selecionados");
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

  // Agrupa chips por tema
  const porTema = {};
  for (const chave of estado.selecionados) {
    const [tema, subtema] = chave.split("::");
    if (!porTema[tema]) porTema[tema] = [];
    porTema[tema].push(subtema);
  }

  for (const [tema, subs] of Object.entries(porTema)) {
    const grupo = document.createElement("div");
    grupo.className = "chip-grupo";

    const titulo = document.createElement("strong");
    titulo.textContent = formatar(tema);
    grupo.appendChild(titulo);

    for (const s of subs) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = formatar(s);
      chip.title = "Remover";
      chip.addEventListener("click", () => {
        estado.selecionados.delete(`${tema}::${s}`);
        // Desmarca no menu
        const cb = document.querySelector(`input[data-chave="${CSS.escape(`${tema}::${s}`)}"]`);
        if (cb) cb.checked = false;
        atualizarSelecionados();
      });
      grupo.appendChild(chip);
    }
    chips.appendChild(grupo);
  }

  btn.disabled = false;
  btn.textContent = `Baixar lista (${total})`;
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
      .map((c) => estado.pdfsPorChave[c])
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