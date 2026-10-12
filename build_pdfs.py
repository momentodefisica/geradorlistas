#!/usr/bin/env python3
"""
Compila PDFs a partir da taxonomia.
Suporta três modos por tema:
  - sem_subtemas: 1 PDF único com todas as questões do tema
  - transversal: casa por subtema + disciplina, ignorando o tema
  - normal: casa por tema E subtema exatos

Cada PDF tem cabeçalho com logo, título, subtítulo e rodapé com o autor.
"""

import json
import subprocess
import shutil
import sys
from pathlib import Path

BANCO = Path("banco_questao")
SAIDA = Path("pdfs")

AUTOR = "Breno D. Anjos - @momentodefisica"
LOGO = "imagens/logos/MFlogo.jpg"

ACENTOS = str.maketrans({
    "á":"a","à":"a","ã":"a","â":"a","ä":"a",
    "é":"e","è":"e","ê":"e","ë":"e",
    "í":"i","ì":"i","î":"i","ï":"i",
    "ó":"o","ò":"o","õ":"o","ô":"o","ö":"o",
    "ú":"u","ù":"u","û":"u","ü":"u",
    "ç":"c",
    "Á":"A","À":"A","Ã":"A","Â":"A","Ä":"A",
    "É":"E","È":"E","Ê":"E","Ë":"E",
    "Í":"I","Ì":"I","Î":"I","Ï":"I",
    "Ó":"O","Ò":"O","Õ":"O","Ô":"O","Ö":"O",
    "Ú":"U","Ù":"U","Û":"U","Ü":"U",
    "Ç":"C",
})


def sanitizar(nome: str) -> str:
    return nome.translate(ACENTOS).replace("/", "_").replace(" ", "_")


def coletar_arquivos(tema, subtema, questoes, info_tema=None):
    """Retorna os .tex que casam com (tema, subtema).
    Se subtema é None (tema sem_subtemas), pega todas as questões do tema.
    Se info_tema tem 'transversal', usa a regra especial.
    """
    arquivos = []
    info_tema = info_tema or {}
    transversal = info_tema.get("transversal")

    for q in questoes:
        temas_q = q.get("temas") or [q.get("tema", "")]
        subs_raw = q.get("subtema", "") or ""
        subs_q = [s.strip() for s in subs_raw.split("/") if s.strip()]

        # Modo 1: tema sem subtemas
        if subtema is None:
            if tema in temas_q:
                arquivos.append(q["arquivo"])
            continue

        # Modo 2: tema transversal
        if transversal:
            disc_q = q.get("disciplina", "")
            discs_ok = transversal.get("disciplinas", [])
            temas_ok = transversal.get("temas", [])
            if (subtema in subs_q
                    and disc_q in discs_ok
                    and any(t in temas_q for t in temas_ok)):
                arquivos.append(q["arquivo"])
            continue

        # Modo 3: casamento normal
        if tema in temas_q and subtema in subs_q:
            arquivos.append(q["arquivo"])

    return arquivos


def montar_main_tex(arquivos, titulo, subtitulo):
    """Monta o conteúdo do arquivo main.tex com cabeçalho e inputs."""
    linhas = []
    linhas.append("\\documentclass[11pt,a4paper]{article}")
    linhas.append("\\usepackage{estilo_questoes}")
    linhas.append("")
    linhas.append(f"\\fancyhead[L]{{\\includegraphics[height=1.3cm]{{{LOGO}}}}}")
    linhas.append(f"\\fancyfoot[C]{{\\small {AUTOR}}}")
    linhas.append("")
    linhas.append("\\fancyhead[C]{%")
    linhas.append(f"    \\Large\\bfseries {titulo}\\\\[3pt]")
    linhas.append(f"    \\normalsize\\itshape {subtitulo}")
    linhas.append("}")
    linhas.append("")
    linhas.append("\\begin{document}")
    linhas.append("")
    linhas.append("")

    for arq in arquivos:
        linhas.append(f"\\input{{{arq.replace(chr(92), '/')}}}")

    linhas.append("")
    linhas.append("\\end{document}")
    return "\n".join(linhas)


def main():
    SAIDA.mkdir(exist_ok=True)

    tax_path = BANCO / "taxonomia.json"
    index_path = BANCO / "index.json"

    if not tax_path.exists():
        print(f"ERRO: {tax_path} não existe")
        sys.exit(1)
    if not index_path.exists():
        print(f"ERRO: {index_path} não existe")
        sys.exit(1)

    tax = json.loads(tax_path.read_text(encoding="utf-8"))
    index = json.loads(index_path.read_text(encoding="utf-8"))
    questoes = index["questoes"]

    # Achata a taxonomia em alvos
    # Cada alvo: (disc, tema, subtema_ou_None, nome_alvo, info_tema)
    alvos = []
    for disc, info_disc in tax.items():
        for tema, info_tema in info_disc.get("temas", {}).items():
            if info_tema.get("sem_subtemas"):
                alvos.append((disc, tema, None, info_tema["nome"], info_tema))
            else:
                for sub, nome_sub in info_tema.get("subtemas", {}).items():
                    alvos.append((disc, tema, sub, nome_sub, info_tema))

    print(f"Taxonomia define {len(alvos)} alvos para compilar.\n")

    disponiveis = {"pdfs": [], "vazios": []}
    falhas = []

    for disc, tema, sub, nome_alvo, info_tema in alvos:
        arquivos = coletar_arquivos(tema, sub, questoes, info_tema)

        rotulo = tema if sub is None else f"{tema} / {sub}"

        if not arquivos:
            print(f"→ [{disc}] {rotulo} — 0 questões (pulado)")
            disponiveis["vazios"].append({
                "disciplina": disc, "tema": tema, "subtema": sub,
            })
            continue

        # Nome do arquivo PDF
        if sub is None:
            nome_pdf = sanitizar(tema)
            subtitulo = "Questões do ENEM"
        else:
            nome_pdf = f"{sanitizar(tema)}__{sanitizar(sub)}"
            subtitulo = nome_alvo

        titulo = f"Lista de {info_tema['nome']}"

        # Monta e grava o main.tex
        conteudo = montar_main_tex(arquivos, titulo, subtitulo)
        main_file = BANCO / f"_main_{nome_pdf}.tex"
        main_file.write_text(conteudo, encoding="utf-8")

        # Compila
        cmd = [
            "pdflatex",
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-file-line-error",
            f"_main_{nome_pdf}.tex",
        ]
        print(f"→ [{disc}] {rotulo} ({len(arquivos)} questões)")
        resultado = subprocess.run(
            cmd, cwd=BANCO, capture_output=True,
            encoding="utf-8", errors="replace",
        )

        pdf_gerado = BANCO / f"_main_{nome_pdf}.pdf"
        if resultado.returncode != 0 or not pdf_gerado.exists():
            print(f"  ❌ falhou")
            linhas_log = resultado.stdout.splitlines()
            relevantes = [l for l in linhas_log if l.startswith("!") or "Error" in l or ".tex:" in l]
            if not relevantes:
                relevantes = linhas_log[-15:]
            for linha in relevantes[:10]:
                print(f"     {linha}")
            falhas.append((disc, tema, sub))
            continue

        shutil.move(str(pdf_gerado), str(SAIDA / f"{nome_pdf}.pdf"))
        print(f"  ✅ pdfs/{nome_pdf}.pdf")

        disponiveis["pdfs"].append({
            "disciplina": disc,
            "tema": tema,
            "subtema": sub,
            "arquivo": f"{nome_pdf}.pdf",
            "total": len(arquivos),
        })

    # Limpa temporários
    for f in BANCO.glob("_main_*"):
        try:
            f.unlink()
        except Exception:
            pass

    (SAIDA / "disponiveis.json").write_text(
        json.dumps(disponiveis, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    total_ok = len(disponiveis["pdfs"])
    print(f"\nResumo: {total_ok} PDFs gerados, {len(disponiveis['vazios'])} vazios, {len(falhas)} falhas")
    if falhas:
        print(f"Falhas: {falhas[:10]}")


if __name__ == "__main__":
    main()