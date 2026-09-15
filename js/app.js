const estado = {
  index: null,
  selecionados: new Set(),
};

async function iniciar() {
  try {
    const resp = await fetch("index.json");
    if (!resp.ok) throw new Error("Não consegui carregar index.json");
    estado.index = await resp.json();
  } catch (e) {
    document.getElementById("carregando").textContent =
      "Erro ao carregar os temas. Tente novamente mais tarde.";
    console.error(e);
    return;
  }

  document.getElementById("carregando").hidden = true;
  document.getElementById("menu").hidden = false;
  renderizarMenu();
}

function renderizarMenu() {
  const container = document.getElementById("disciplinas");
  container.innerHTML = "";

  // Agrupa temas por disciplina
  const porDisciplina = {};
  for (const [nome, info] of Object.entries(estado.index.temas)) {
    const disc = info.disciplinas[0] || "outros";
    if (!porDisciplina[disc]) porDisciplina[disc] = [];
    porDisciplina[disc].push({ nome, ...info });
  }

  // Ordena temas alfabeticamente dentro de cada disciplina
  for (const disc of Object.keys(porDisciplina)) {
    porDisciplina[disc].sort((a, b) => a.nome.localeCompare(b.nome));
  }

  // Renderiza
  for (const [disciplina, temas] of Object.entries(porDisciplina)) {
    const bloco = document.createElement("div");
    bloco.className = "disciplina";

    const titulo = document.createElement("h3");
    titulo.textContent = disciplina;
    bloco.appendChild(titulo);

    const grid = document.createElement("div");
    grid.className = "temas";

    for (const t of temas) {
      const label = document.createElement("label");
      label.className = "tema";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = t.nome;
      checkbox.addEventListener("change", (e) => {
        if (e.target.checked) estado.selecionados.add(t.nome);
        else estado.selecionados.delete(t.nome);
        atualizarSelecionados();
      });

      const nome = document.createElement("span");
      nome.textContent = t.nome.replace(/_/g, " ");

      const contagem = document.createElement("span");
      contagem.className = "contagem";
      contagem.textContent = `${t.total}`;

      label.append(checkbox, nome, contagem);
      grid.appendChild(label);
    }

    bloco.appendChild(grid);
    container.appendChild(bloco);
  }
}

function atualizarSelecionados() {
  const secao = document.getElementById("selecionados");
  const lista = document.getElementById("lista-selecionados");
  const botao = document.getElementById("btn-gerar");

  secao.hidden = estado.selecionados.size === 0;

  lista.innerHTML = "";
  for (const tema of estado.selecionados) {
    const li = document.createElement("li");
    li.textContent = tema.replace(/_/g, " ");
    lista.appendChild(li);
  }

  botao.disabled = estado.selecionados.size === 0;
  botao.textContent = estado.selecionados.size > 0
    ? `Gerar lista (${estado.selecionados.size} tema${estado.selecionados.size > 1 ? "s" : ""})`
    : "Gerar lista (em breve)";
}

// --- Geração da lista ---

async function gerarLista() {
  const btn = document.getElementById("btn-gerar");
  const temas = [...estado.selecionados];
  if (temas.length === 0) return;

  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Gerando...";

  try {
    if (temas.length === 1) {
      // Um só tema: baixa direto
      const url = `pdfs/${temas[0]}.pdf`;
      window.open(url, "_blank");
    } else {
      // Vários temas: baixa cada um e junta em um único PDF
      const { PDFDocument } = PDFLib;
      const merged = await PDFDocument.create();

      for (const tema of temas) {
        const url = `pdfs/${tema}.pdf`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Não consegui baixar "${tema}"`);
        const bytes = await resp.arrayBuffer();
        const doc = await PDFDocument.load(bytes);
        const paginas = await merged.copyPages(doc, doc.getPageIndices());
        paginas.forEach((p) => merged.addPage(p));
      }

      const bytes = await merged.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "lista.pdf";
      link.click();
      URL.revokeObjectURL(link.href);
    }
  } catch (e) {
    alert("Erro ao gerar a lista: " + e.message);
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

// --- Inicialização ---

document.getElementById("btn-gerar").addEventListener("click", gerarLista);
iniciar();
