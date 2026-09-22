#!/usr/bin/env python3
"""
Compila um PDF por par (tema, subtema) presente na taxonomia.
Só compila o que está na taxonomia — o que não está, é ignorado.
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
    return nome.translate(ACENTOS).replace("/", "_").replace(" ", "_")


def coletar_arquivos(tema, subtema, questoes):
    """Retorna os caminhos dos .tex que casam com (tema, subtema)."""
    arquivos = []
    for q in questoes:
        temas_q = q.get("temas") or [q.get("tema", "")]
        subs_raw = q.get("subtema", "") or ""
        subs_q = [s.strip() for s in subs_raw.split("/") if s.strip()]
        if tema in temas_q and subtema in subs_q:
            arquivos.append(q["arquivo"])
    return arquivos


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

    # Achata a taxonomia em lista de (disciplina, tema, subtema, nome_bonito)
    alvos = []
    for disc, info_disc in tax.items():
        for tema, info_tema in info_disc.get("temas", {}).items():
            for sub, nome_sub in info_tema.get("subtemas", {}).items():
                alvos.append((disc, tema, sub, nome_sub))

    print(f"Taxonomia define {len(alvos)} pares (tema, subtema) para compilar.\n")

    disponiveis = {"pdfs": [], "vazios": []}
    falhas = []

    for disc, tema, sub, nome_bonito in alvos:
        arquivos = coletar_arquivos(tema, sub, questoes)

        if not arquivos:
            print(f"→ [{disc}] {tema} / {sub} — 0 questões (pulado)")
            disponiveis["vazios"].append({
                "disciplina": disc, "tema": tema, "subtema": sub,
            })
            continue

        nome_pdf = f"{sanitizar(tema)}__{sanitizar(sub)}"

        linhas = [
            "\\documentclass[10pt,a4paper]{article}",
            "\\usepackage{estilo_questoes}",
            "\\begin{document}",
        ]
        for arq in arquivos:
            linhas.append(f"\\input{{{arq.replace(chr(92), '/')}}}")
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
        print(f"→ [{disc}] {tema} / {sub} ({len(arquivos)} questões)")
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