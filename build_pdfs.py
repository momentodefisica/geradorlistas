#!/usr/bin/env python3
"""
Compila um PDF por par (tema, subtema) a partir das questões em banco_questao/.
Gera também um disponiveis.json com o mapa de PDFs disponíveis.
"""

import json
import subprocess
import shutil
import sys
from pathlib import Path
from collections import defaultdict

BANCO = Path("banco_questao")
SAIDA = Path("pdfs")

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
    """Nome seguro para arquivo: sem acento, sem espaço, sem barra."""
    nome = nome.translate(ACENTOS)
    nome = nome.replace("/", "_").replace(" ", "_")
    return nome


def main():
    SAIDA.mkdir(exist_ok=True)

    index_path = BANCO / "index.json"
    if not index_path.exists():
        print(f"ERRO: {index_path} não existe")
        sys.exit(1)

    index = json.loads(index_path.read_text(encoding="utf-8"))

    # Agrupa questões por (tema, subtema)
    por_chave = defaultdict(list)

    for q in index["questoes"]:
        temas = q.get("temas") or [q.get("tema", "")]
        subtemas_raw = q.get("subtema", "") or ""
        subtemas = [s.strip() for s in subtemas_raw.split("/") if s.strip()]
        if not subtemas:
            subtemas = ["_sem_subtema"]

        for t in temas:
            for s in subtemas:
                por_chave[(t, s)].append(q["arquivo"])

    print(f"Compilando {len(por_chave)} pares (tema, subtema)...\n")

    falhas = []
    disponiveis = {"pdfs": []}

    for (tema, subtema) in sorted(por_chave):
        arquivos = por_chave[(tema, subtema)]
        nome_pdf = f"{sanitizar(tema)}__{sanitizar(subtema)}"

        linhas = [
            "\\documentclass[10pt,a4paper]{article}",
            "\\usepackage{estilo_questoes}",
            "\\begin{document}",
        ]
        for arq in arquivos:
            arq_limpo = arq.replace("\\", "/")
            linhas.append(f"\\input{{{arq_limpo}}}")
        linhas.append("\\end{document}")

        main_file = BANCO / f"_main_{nome_pdf}.tex"
        main_file.write_text("\n".join(linhas), encoding="utf-8")

        cmd = [
            "pdflatex",
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-file-line-error",
            f"_main_{nome_pdf}.tex",
        ]
        print(f"→ {tema} / {subtema} ({len(arquivos)})")
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
            falhas.append((tema, subtema))
            continue

        shutil.move(str(pdf_gerado), str(SAIDA / f"{nome_pdf}.pdf"))
        print(f"  ✅ pdfs/{nome_pdf}.pdf")

        disponiveis["pdfs"].append({
            "tema": tema,
            "subtema": subtema,
            "arquivo": f"{nome_pdf}.pdf",
            "total": len(arquivos),
        })

    # Limpa temporários
    for f in BANCO.glob("_main_*"):
        try:
            f.unlink()
        except Exception:
            pass

    # Salva o índice de disponíveis
    (SAIDA / "disponiveis.json").write_text(
        json.dumps(disponiveis, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    total_ok = len(por_chave) - len(falhas)
    print(f"\nResumo: {total_ok}/{len(por_chave)} PDFs gerados")
    if falhas:
        print(f"Primeiras falhas: {falhas[:10]}")


if __name__ == "__main__":
    main()