#!/usr/bin/env python3
"""
Compila um PDF por tema a partir das questões em banco_questao/.
Usa o estilo_questoes.sty do próprio banco.
"""

import json
import subprocess
import shutil
import sys
from pathlib import Path
from collections import defaultdict

BANCO = Path("banco_questao")
SAIDA = Path("pdfs")


def main():
    SAIDA.mkdir(exist_ok=True)

    index_path = BANCO / "index.json"
    if not index_path.exists():
        print(f"ERRO: {index_path} não existe")
        sys.exit(1)

    index = json.loads(index_path.read_text(encoding="utf-8"))

    # Agrupa questões por tema
    por_tema = defaultdict(list)
    for q in index["questoes"]:
        for tema in q["temas"]:
            por_tema[tema].append(q["arquivo"])

    print(f"Compilando {len(por_tema)} temas...\n")

    falhas = []
    for tema in sorted(por_tema):
        arquivos = por_tema[tema]
        nome = tema.replace("/", "_").replace(" ", "_")

        # Monta um main.tex com todas as questões do tema
        linhas = [
            "\\documentclass[10pt,a4paper]{article}",
            "\\usepackage{estilo_questoes}",
            "\\begin{document}",
        ]
        for arq in arquivos:
            arq_limpo = arq.replace("\\", "/")
            linhas.append(f"\\input{{{arq_limpo}}}")
        linhas.append("\\end{document}")

        main_file = BANCO / f"_main_{nome}.tex"
        main_file.write_text("\n".join(linhas), encoding="utf-8")

        # Compila de dentro da pasta do banco, para que os caminhos
        # relativos (questoes/..., imagens/...) resolvam corretamente
        cmd = [
            "pdflatex",
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-file-line-error",
            f"_main_{nome}.tex",
        ]
        print(f"→ {tema} ({len(arquivos)} questões)")
        resultado = subprocess.run(cmd, cwd=BANCO, capture_output=True, text=True)

        pdf_gerado = BANCO / f"_main_{nome}.pdf"
        if resultado.returncode != 0 or not pdf_gerado.exists():
            print(f"  ❌ falhou")
            for linha in resultado.stdout.splitlines()[-25:]:
                print(f"     {linha}")
            falhas.append(tema)
            continue

        shutil.move(str(pdf_gerado), str(SAIDA / f"{nome}.pdf"))
        print(f"  ✅ pdfs/{nome}.pdf")

    # Limpa arquivos temporários do banco
    for padrao in ("_main_*",):
        for f in BANCO.glob(padrao):
            try:
                f.unlink()
            except Exception:
                pass

    total_ok = len(por_tema) - len(falhas)
    print(f"\nResumo: {total_ok}/{len(por_tema)} PDFs gerados com sucesso")
    if falhas:
        print(f"Temas com erro: {falhas}")


if __name__ == "__main__":
    main()
