import re
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request

app = Flask(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

PADRAO_NOME = re.compile(
    r"""
    \b
    (?:
        condomínio |
        condominio |
        edifício |
        edificio |
        residencial |
        prédio |
        predio |
        conjunto residencial |
        residencial multifamiliar
    )
    \b
    [:\-–—]?
    \s*
    ([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .&'()/\-]{1,100})?
    """,
    re.IGNORECASE | re.VERBOSE,
)

PALAVRAS_FIM = re.compile(
    r"""
    \s+
    (?:
        são paulo |
        sao paulo |
        sp |
        brasil |
        endereço |
        endereco |
        mapa |
        telefone |
        avaliações |
        avaliacoes |
        como chegar
    )
    \b.*
    $
    """,
    re.IGNORECASE | re.VERBOSE,
)


def limpar_texto(texto):
    if not texto:
        return ""
    texto = re.sub(r"\s+", " ", texto).strip(" -–—:|,.")
    texto = PALAVRAS_FIM.sub("", texto)
    return texto.strip(" -–—:|,.")


def extrair_nomes(textos):
    nomes = []
    vistos = set()

    for texto in textos:
        texto = limpar_texto(texto)
        if not texto:
            continue

        for correspondencia in PADRAO_NOME.finditer(texto):
            trecho = limpar_texto(correspondencia.group(0))
            if len(trecho) < 5:
                continue

            chave = trecho.casefold()
            if chave not in vistos:
                vistos.add(chave)
                nomes.append(trecho[:120])

    return nomes


def pesquisar_google(endereco):
    consulta = f'"{endereco}" condomínio OR condominio OR residencial OR edifício'
    url = (
        "https://www.google.com/search"
        f"?hl=pt-BR&num=10&q={quote_plus(consulta)}"
    )

    resposta = requests.get(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "pt-BR,pt;q=0.9",
        },
        timeout=15,
    )
    resposta.raise_for_status()

    soup = BeautifulSoup(resposta.text, "html.parser")
    textos = []

    for elemento in soup.select("h3"):
        texto = elemento.get_text(" ", strip=True)
        if texto:
            textos.append(texto)

    for seletor in [
        "[data-sncf]",
        ".VwiC3b",
        ".yXK7lf",
        ".IsZvec",
        ".MjjYud",
    ]:
        for elemento in soup.select(seletor):
            texto = elemento.get_text(" ", strip=True)
            if texto:
                textos.append(texto)

    textos_unicos = []
    textos_vistos = set()

    for texto in textos:
        chave = texto.casefold()
        if chave not in textos_vistos:
            textos_vistos.add(chave)
            textos_unicos.append(texto)

    return textos_unicos


@app.route("/", methods=["GET"])
def inicio():
    return jsonify({
        "status": "online",
        "mensagem": "API de identificação de condomínio",
        "uso": "/buscar?endereco=Estrada%20dos%20Mirandas,%20303",
    })


@app.route("/api/index.py/buscar", methods=["GET"])
@app.route("/api/buscar", methods=["GET"])
@app.route("/buscar", methods=["GET"])
def buscar():
    endereco = request.args.get("endereco", "").strip()

    if not endereco:
        return jsonify({
            "sucesso": False,
            "erro": "O parâmetro 'endereco' é obrigatório.",
        }), 400

    if len(endereco) < 5:
        return jsonify({
            "sucesso": False,
            "erro": "Informe um endereço válido.",
        }), 400

    try:
        textos = pesquisar_google(endereco)
        nomes = extrair_nomes(textos)

        return jsonify({
            "sucesso": True,
            "endereco": endereco,
            "nomes_encontrados": nomes,
            "quantidade": len(nomes),
            "textos_analisados": textos[:20],
        }), 200

    except requests.Timeout:
        return jsonify({
            "sucesso": False,
            "erro": "O Google demorou muito para responder.",
        }), 504

    except requests.HTTPError as erro:
        return jsonify({
            "sucesso": False,
            "erro": "O Google retornou um erro HTTP.",
            "detalhes": str(erro),
        }), 502

    except requests.RequestException as erro:
        return jsonify({
            "sucesso": False,
            "erro": "Não foi possível consultar o Google.",
            "detalhes": str(erro),
        }), 502

    except Exception as erro:
        return jsonify({
            "sucesso": False,
            "erro": "Erro interno na API.",
            "detalhes": str(erro),
        }), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
