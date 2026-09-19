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
    r"""\b(?:condomínio|condominio|edifício|edificio|residencial|prédio|predio|conjunto residencial|residencial multifamiliar)\b[:\-–—]?\s*([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .&'()/\-]{1,100})?""",
    re.IGNORECASE,
)

PALAVRAS_FIM = re.compile(
    r"""\s+(?:são paulo|sao paulo|sp|brasil|endereço|endereco|mapa|telefone|avaliações|avaliacoes|como chegar)\b.*$""",
    re.IGNORECASE,
)

def limpar_texto(texto):
    texto = re.sub(r"\s+", " ", texto or "").strip(" -–—:|,.")
    return PALAVRAS_FIM.sub("", texto).strip(" -–—:|,.")

def extrair_nomes(textos):
    nomes = []
    vistos = set()
    for texto in textos:
        texto = limpar_texto(texto)
        for m in PADRAO_NOME.finditer(texto):
            tipo = m.group(0).split()[0]
            trecho = limpar_texto(m.group(0))
            if len(trecho) < 5:
                continue
            chave = trecho.casefold()
            if chave not in vistos:
                vistos.add(chave)
                nomes.append(trecho[:120])
    return nomes

def pesquisar_google(endereco):
    consulta = f'"{endereco}" condomínio residencial edifício'
    url = "https://www.google.com/search?hl=pt-BR&num=10&q=" + quote_plus(consulta)
    resposta = requests.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9"},
        timeout=12,
    )
    resposta.raise_for_status()
    soup = BeautifulSoup(resposta.text, "html.parser")
    textos = []

    for elemento in soup.select("h3"):
        texto = elemento.get_text(" ", strip=True)
        if texto:
            textos.append(texto)

    for seletor in ["[data-sncf]", ".VwiC3b", ".yXK7lf", ".IsZvec", ".MjjYud"]:
        for elemento in soup.select(seletor):
            texto = elemento.get_text(" ", strip=True)
            if texto:
                textos.append(texto)

    unicos = []
    vistos = set()
    for texto in textos:
        chave = texto.casefold()
        if chave not in vistos:
            vistos.add(chave)
            unicos.append(texto)

    return unicos

@app.route("/", methods=["GET"])
def buscar():
    endereco = request.args.get("endereco", "").strip()
    if len(endereco) < 5:
        return jsonify({"sucesso": False, "erro": "Informe um endereço válido."}), 400

    try:
        textos = pesquisar_google(endereco)
        nomes = extrair_nomes(textos)
        return jsonify({
            "sucesso": True,
            "endereco": endereco,
            "nomes_encontrados": nomes,
            "quantidade": len(nomes),
            "textos_analisados": textos[:20],
        })
    except requests.Timeout:
        return jsonify({"sucesso": False, "erro": "O Google demorou muito para responder."}), 504
    except requests.HTTPError as erro:
        return jsonify({"sucesso": False, "erro": "O Google retornou erro HTTP.", "detalhes": str(erro)}), 502
    except requests.RequestException as erro:
        return jsonify({"sucesso": False, "erro": "Não foi possível consultar o Google.", "detalhes": str(erro)}), 502
    except Exception as erro:
        return jsonify({"sucesso": False, "erro": "Erro interno na API Python.", "detalhes": str(erro)}), 500
