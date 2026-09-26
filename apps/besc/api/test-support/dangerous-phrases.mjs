// Frases da tese antiga que não podem aparecer como afirmação da plataforma (ADR-010).
// Compartilhado pelos testes de conteúdo (API) e de copy pública (frontend roteado).
export const DANGEROUS = [
  /investir em t[íi]tulos/i,
  /t[íi]tulos? de d[íi]vida p[úu]blica/i,
  /equiparad[ao]s? a dinheiro/i,
  /not[óo]ria liquidez/i,
  /2º grau na hierarquia/i,
  /30 dias para converter/i,
  /converter .{0,40} ou vender/i,
  /redu[çc][ãa]o de 70/i,
  /libera[çc][ãa]o de CND/i,
  /gera o [áa]gio/i,
  /preserva[çc][ãa]o (autom[áa]tica )?de valor/i,
  /rentabilidade/i,
  /liquidez garantida/i,
  /consolida-se favoravelmente/i,
  /futura tokeniza/i,
  /quitar e compensar/i,
];
