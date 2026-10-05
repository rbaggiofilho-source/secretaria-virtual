/**
 * Geografia por DDD. O número de WhatsApp (wa_id) começa com 55 (BR) + DDD (2
 * dígitos) + número. O DDD mapeia para a UF de forma CONFIÁVEL; a cidade é só
 * aproximada (a área de um DDD cobre várias cidades), então expomos a UF como
 * verdade e a "região do DDD" como pista de cidade.
 */

/** DDD (2 dígitos) → sigla da UF. Tabela oficial da Anatel. */
const DDD_UF: Record<string, string> = {
  "11": "SP", "12": "SP", "13": "SP", "14": "SP", "15": "SP", "16": "SP", "17": "SP", "18": "SP", "19": "SP",
  "21": "RJ", "22": "RJ", "24": "RJ",
  "27": "ES", "28": "ES",
  "31": "MG", "32": "MG", "33": "MG", "34": "MG", "35": "MG", "37": "MG", "38": "MG",
  "41": "PR", "42": "PR", "43": "PR", "44": "PR", "45": "PR", "46": "PR",
  "47": "SC", "48": "SC", "49": "SC",
  "51": "RS", "53": "RS", "54": "RS", "55": "RS",
  "61": "DF",
  "62": "GO", "64": "GO",
  "63": "TO",
  "65": "MT", "66": "MT",
  "67": "MS",
  "68": "AC",
  "69": "RO",
  "71": "BA", "73": "BA", "74": "BA", "75": "BA", "77": "BA",
  "79": "SE",
  "81": "PE", "87": "PE",
  "82": "AL",
  "83": "PB",
  "84": "RN",
  "85": "CE", "88": "CE",
  "86": "PI", "89": "PI",
  "91": "PA", "93": "PA", "94": "PA",
  "92": "AM", "97": "AM",
  "95": "RR",
  "96": "AP",
  "98": "MA", "99": "MA",
};

/** Nome da UF (para rótulos e tooltips do mapa). */
export const UF_NOME: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};

/** "Cidade/região" aproximada do DDD (a maior praça do DDD). Pista, não verdade. */
const DDD_PRACA: Record<string, string> = {
  "11": "São Paulo (Grande SP)", "12": "Vale do Paraíba/SP", "13": "Baixada Santista/SP",
  "14": "Bauru/SP", "15": "Sorocaba/SP", "16": "Ribeirão Preto/SP", "17": "São José do Rio Preto/SP",
  "18": "Presidente Prudente/SP", "19": "Campinas/SP",
  "21": "Rio de Janeiro/RJ", "22": "Campos/RJ", "24": "Volta Redonda/RJ",
  "27": "Vitória/ES", "28": "Cachoeiro/ES",
  "31": "Belo Horizonte/MG", "32": "Juiz de Fora/MG", "33": "Governador Valadares/MG",
  "34": "Uberlândia/MG", "35": "Poços de Caldas/MG", "37": "Divinópolis/MG", "38": "Montes Claros/MG",
  "41": "Curitiba/PR", "42": "Ponta Grossa/PR", "43": "Londrina/PR", "44": "Maringá/PR",
  "45": "Foz do Iguaçu/PR", "46": "Pato Branco/PR",
  "47": "Joinville/Blumenau/SC", "48": "Florianópolis/SC", "49": "Chapecó/SC",
  "51": "Porto Alegre/RS", "53": "Pelotas/RS", "54": "Caxias do Sul/RS", "55": "Santa Maria/RS",
  "61": "Brasília/DF", "62": "Goiânia/GO", "64": "Rio Verde/GO", "63": "Palmas/TO",
  "65": "Cuiabá/MT", "66": "Rondonópolis/MT", "67": "Campo Grande/MS",
  "68": "Rio Branco/AC", "69": "Porto Velho/RO",
  "71": "Salvador/BA", "73": "Ilhéus/BA", "74": "Juazeiro/BA", "75": "Feira de Santana/BA", "77": "Barreiras/BA",
  "79": "Aracaju/SE", "81": "Recife/PE", "87": "Petrolina/PE", "82": "Maceió/AL",
  "83": "João Pessoa/PB", "84": "Natal/RN", "85": "Fortaleza/CE", "88": "Juazeiro do Norte/CE",
  "86": "Teresina/PI", "89": "Picos/PI",
  "91": "Belém/PA", "93": "Santarém/PA", "94": "Marabá/PA", "92": "Manaus/AM", "97": "Tefé/AM",
  "95": "Boa Vista/RR", "96": "Macapá/AP", "98": "São Luís/MA", "99": "Imperatriz/MA",
};

/** Extrai o DDD (2 dígitos) de um wa_id brasileiro. null se não der. */
export function dddDoWa(wa: string | null | undefined): string | null {
  if (!wa) return null;
  const d = wa.replace(/\D/g, "");
  // 55 + DDD + número (10 ou 11 dígitos nacionais). Aceita com/sem o 55.
  let nacional = d;
  if (d.startsWith("55") && d.length >= 12) nacional = d.slice(2);
  if (nacional.length < 10) return null;
  const ddd = nacional.slice(0, 2);
  return DDD_UF[ddd] ? ddd : null;
}

export function ufDoWa(wa: string | null | undefined): string | null {
  const ddd = dddDoWa(wa);
  return ddd ? DDD_UF[ddd] ?? null : null;
}

export function pracaDoWa(wa: string | null | undefined): string | null {
  const ddd = dddDoWa(wa);
  return ddd ? DDD_PRACA[ddd] ?? null : null;
}
