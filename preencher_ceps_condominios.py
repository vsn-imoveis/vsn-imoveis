#!/usr/bin/env python3
"""
Preenche CEPs dos condomínios da base VSN Imóveis.

Estratégia:
1. Usa CEP já existente em properties.condominium_cep/properties.cep quando
   houver correspondência inequívoca de condomínio/endereço.
2. Consulta o ViaCEP por UF + cidade + logradouro.
3. Se o logradouro retornar apenas 1 CEP, considera candidato seguro.
4. Se retornar vários CEPs, NÃO grava automaticamente: salva como ambíguo.
5. Com --apply, atualiza condominiums.cep e, quando existir, também
   condominium_address_map.cep.

Por padrão roda em DRY-RUN. Use --apply para gravar.
"""

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from collections import defaultdict

import requests
from supabase import create_client


def env(name):
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Variável de ambiente ausente: {name}")
    return value


SUPABASE_URL = env("SUPABASE_URL")
SUPABASE_KEY = env("SUPABASE_KEY")
db = create_client(SUPABASE_URL, SUPABASE_KEY)

VIACEP_URL = "https://viacep.com.br/ws"
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "VSN-Imoveis-CEP-Updater/1.0"
})


def norm(value):
    value = str(value or "").strip().lower()
    value = unicodedata.normalize("NFKD", value)
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def clean_cep(value):
    digits = re.sub(r"\D", "", str(value or ""))
    return digits if len(digits) == 8 else None


def fetch_all(table, columns, filters=None):
    rows = []
    start = 0
    page_size = 1000

    while True:
        query = db.table(table).select(columns).range(start, start + page_size - 1)
        for column, value in (filters or []):
            query = query.eq(column, value)

        result = query.execute()
        batch = result.data or []
        rows.extend(batch)

        if len(batch) < page_size:
            break
        start += page_size

    return rows


def load_property_ceps():
    rows = fetch_all(
        "properties",
        "id,address,number,neighborhood,city,state,cep,condominium_name,condominium_cep",
    )

    by_key = defaultdict(set)

    for row in rows:
        cep = clean_cep(row.get("condominium_cep")) or clean_cep(row.get("cep"))
        if not cep:
            continue

        key = (
            norm(row.get("address")),
            norm(row.get("number")),
            norm(row.get("neighborhood")),
            norm(row.get("city")),
            norm(row.get("state")),
        )
        if key[0]:
            by_key[key].add(cep)

        condo_key = norm(row.get("condominium_name"))
        if condo_key:
            by_key[("condo", condo_key)].add(cep)

    return by_key


def viacep(address, city, state):
    state = norm(state).upper()
    city = str(city or "").strip()
    address = str(address or "").strip()

    if len(state) != 2 or not city or not address:
        return []

    url = f"{VIACEP_URL}/{state}/{requests.utils.quote(city)}/{requests.utils.quote(address)}/json/"
    response = SESSION.get(url, timeout=15)

    if response.status_code == 429:
        raise RuntimeError("ViaCEP bloqueou temporariamente por excesso de consultas.")
    response.raise_for_status()

    data = response.json()
    if isinstance(data, dict):
        if data.get("erro"):
            return []
        data = [data]

    results = []
    for item in data:
        cep = clean_cep(item.get("cep"))
        if cep:
            results.append({
                "cep": cep,
                "logradouro": item.get("logradouro"),
                "bairro": item.get("bairro"),
                "localidade": item.get("localidade"),
                "uf": item.get("uf"),
            })

    unique = {}
    for item in results:
        unique[item["cep"]] = item
    return list(unique.values())


def same_address(condo, result):
    if norm(condo.get("city")) and norm(condo.get("city")) != norm(result.get("localidade")):
        return False
    if norm(condo.get("state")) and norm(condo.get("state")) != norm(result.get("uf")):
        return False

    # ViaCEP pode normalizar abreviações/acentos; comparação por tokens evita
    # rejeitar diferenças pequenas sem aceitar uma rua completamente diferente.
    a = set(norm(condo.get("address")).split())
    b = set(norm(result.get("logradouro")).split())
    if not a or not b:
        return False

    overlap = len(a & b) / max(1, min(len(a), len(b)))
    return overlap >= 0.70


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="grava os CEPs encontrados")
    parser.add_argument("--limit", type=int, default=0, help="limita quantidade para teste")
    parser.add_argument("--delay", type=float, default=0.8, help="segundos entre consultas ao ViaCEP")
    parser.add_argument("--output", default="resultado_ceps.json")
    args = parser.parse_args()

    print("Carregando condomínios...")
    condos = fetch_all(
        "condominiums",
        "id,name,address,number,neighborhood,city,state,cep,normalized_name",
    )

    property_ceps = load_property_ceps()

    targets = [
        c for c in condos
        if not clean_cep(c.get("cep"))
        and c.get("address")
        and c.get("city")
        and c.get("state")
    ]

    if args.limit:
        targets = targets[:args.limit]

    print(f"Condomínios sem CEP e com endereço: {len(targets)}")

    result = {
        "safe": [],
        "ambiguous": [],
        "not_found": [],
        "errors": [],
    }

    for index, condo in enumerate(targets, 1):
        cid = condo["id"]
        key = (
            norm(condo.get("address")),
            norm(condo.get("number")),
            norm(condo.get("neighborhood")),
            norm(condo.get("city")),
            norm(condo.get("state")),
        )

        known = property_ceps.get(key, set())
        if len(known) == 1:
            cep = next(iter(known))
            result["safe"].append({
                "id": cid,
                "name": condo["name"],
                "cep": cep,
                "source": "properties",
            })
            print(f"[{index}/{len(targets)}] ✓ {condo['name']} -> {cep} (properties)")
            continue

        try:
            matches = viacep(
                condo.get("address"),
                condo.get("city"),
                condo.get("state"),
            )
            matches = [m for m in matches if same_address(condo, m)]

            if len(matches) == 1:
                cep = matches[0]["cep"]
                result["safe"].append({
                    "id": cid,
                    "name": condo["name"],
                    "cep": cep,
                    "source": "viacep",
                    "logradouro": matches[0].get("logradouro"),
                    "bairro": matches[0].get("bairro"),
                })
                print(f"[{index}/{len(targets)}] ✓ {condo['name']} -> {cep}")
            elif len(matches) > 1:
                result["ambiguous"].append({
                    "id": cid,
                    "name": condo["name"],
                    "address": condo.get("address"),
                    "number": condo.get("number"),
                    "neighborhood": condo.get("neighborhood"),
                    "city": condo.get("city"),
                    "state": condo.get("state"),
                    "candidates": matches,
                })
                print(f"[{index}/{len(targets)}] ⚠ {condo['name']} -> {len(matches)} CEPs")
            else:
                result["not_found"].append({
                    "id": cid,
                    "name": condo["name"],
                    "address": condo.get("address"),
                    "number": condo.get("number"),
                    "city": condo.get("city"),
                    "state": condo.get("state"),
                })
                print(f"[{index}/{len(targets)}] ? {condo['name']} -> não encontrado")

        except Exception as exc:
            result["errors"].append({
                "id": cid,
                "name": condo["name"],
                "error": str(exc),
            })
            print(f"[{index}/{len(targets)}] ✗ {condo['name']} -> {exc}")

        time.sleep(max(0, args.delay))

    if args.apply:
        print("\nGravando CEPs seguros...")
        for item in result["safe"]:
            db.table("condominiums").update({
                "cep": item["cep"],
                "updated_at": "now()",
            }).eq("id", item["id"]).execute()

            # Atualiza somente o relacionamento existente; não cria linhas
            # novas para não alterar a estrutura da base.
            db.table("condominium_address_map").update({
                "cep": item["cep"],
            }).eq("condominium_id", item["id"]).execute()

        print(f"✓ {len(result['safe'])} CEPs gravados.")
    else:
        print("\nDRY-RUN: nada foi alterado. Use --apply para gravar.")

    with open(args.output, "w", encoding="utf-8") as file:
        json.dump(result, file, ensure_ascii=False, indent=2)

    print(f"\nRelatório: {args.output}")
    print(f"Seguros: {len(result['safe'])}")
    print(f"Ambíguos: {len(result['ambiguous'])}")
    print(f"Não encontrados: {len(result['not_found'])}")
    print(f"Erros: {len(result['errors'])}")


if __name__ == "__main__":
    main()
