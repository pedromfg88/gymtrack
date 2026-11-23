#!/usr/bin/env python3
"""Hooks do Claude Code para este repositório (ver .claude/settings.json).

  pre-bash    bloqueia `git push` para main/master e de tags (publicam APK/PWA)
  pre-write   bloqueia a escrita de chaves de assinatura e ficheiros .env
  post-edit   formata ficheiros .dart; no gymtrack corre `npm test` após mexer em src/ ou test/

Saída 2 = o Claude recebe a mensagem de stderr e a ação é recusada (pre) ou
reportada como falha a corrigir (post).
"""
import json
import os
import re
import shlex
import shutil
import subprocess
import sys

RAMOS_PROTEGIDOS = {"main", "master"}
FICHEIROS_PROIBIDOS = re.compile(
    r"(\.jks|\.keystore|\.p12|key\.properties|(^|/)\.env(\..*)?)$", re.IGNORECASE
)


def recusar(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(2)


def ramo_actual(pasta: str) -> str:
    try:
        return subprocess.run(
            ["git", "-C", pasta, "branch", "--show-current"],
            capture_output=True, text=True, timeout=5,
        ).stdout.strip()
    except Exception:
        return ""


def pre_bash(dados: dict) -> None:
    comando = dados.get("tool_input", {}).get("command", "")
    cwd = dados.get("cwd") or os.getcwd()
    # Analisa cada sub-comando (separado por ;, &&, ||, |).
    for parte in re.split(r"&&|\|\||;|\|", comando):
        try:
            tokens = shlex.split(parte)
        except ValueError:
            tokens = parte.split()
        if "git" not in tokens or "push" not in tokens:
            continue
        pasta = cwd
        if "-C" in tokens:
            i = tokens.index("-C")
            if i + 1 < len(tokens):
                pasta = os.path.join(cwd, tokens[i + 1])
        args = [t for t in tokens[tokens.index("push") + 1:]]
        if "--tags" in args or any(a.startswith("refs/tags/") for a in args):
            recusar("Bloqueado: push de tags publica uma versão (APK/Release). Pede confirmação ao Pedro.")
        refspecs = [a for a in args if not a.startswith("-")][1:]  # o 1.º é o remoto
        for r in refspecs:
            destino = r.split(":")[-1].lstrip("+").removeprefix("refs/heads/")
            if destino in RAMOS_PROTEGIDOS or re.fullmatch(r"v\d[\w.\-]*", destino):
                recusar(f"Bloqueado: push para '{destino}' publica APK/PWA. Trabalha num ramo claude/… e pede ao Pedro para fundir.")
        if not refspecs and ramo_actual(pasta) in RAMOS_PROTEGIDOS:
            recusar("Bloqueado: estás em main/master e um push publica APK/PWA. Muda para um ramo de trabalho.")


def pre_write(dados: dict) -> None:
    caminho = dados.get("tool_input", {}).get("file_path", "")
    if FICHEIROS_PROIBIDOS.search(caminho):
        recusar(f"Bloqueado: '{caminho}' é uma chave ou ficheiro de segredos. Os segredos ficam nos Secrets do GitHub.")


def post_edit(dados: dict) -> None:
    caminho = dados.get("tool_input", {}).get("file_path", "")
    raiz = os.environ.get("CLAUDE_PROJECT_DIR") or dados.get("cwd") or os.getcwd()
    if caminho.endswith(".dart") and shutil.which("dart") and os.path.exists(caminho):
        subprocess.run(["dart", "format", caminho], capture_output=True, timeout=60)
        return
    rel = os.path.relpath(caminho, raiz) if caminho else ""
    eh_gymtrack = os.path.exists(os.path.join(raiz, "src", "store.mjs"))
    if eh_gymtrack and re.match(r"(src|test)/.*\.(mjs|js|jsx)$", rel) and shutil.which("npm"):
        r = subprocess.run(["npm", "test", "--silent"], cwd=raiz, capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            saida = (r.stdout + r.stderr)[-4000:]
            recusar(f"npm test falhou depois de editar {rel}:\n{saida}")


def main() -> None:
    modo = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        dados = json.load(sys.stdin)
    except Exception:
        return
    {"pre-bash": pre_bash, "pre-write": pre_write, "post-edit": post_edit}.get(modo, lambda d: None)(dados)


if __name__ == "__main__":
    main()
