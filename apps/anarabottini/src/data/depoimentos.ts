/**
 * Depoimentos e marcas atendidas — OPT-IN e honesto.
 * As seções correspondentes só aparecem quando houver itens reais aqui.
 * NÃO inventar depoimentos, nomes, cargos ou logos. Preencher apenas com
 * conteúdo autorizado por quem deu o depoimento / pela empresa.
 */
export type Depoimento = {
  id: string;
  quote: string;
  author: string;
  role?: string; // cargo · empresa
};

export const depoimentos: Depoimento[] = [];

export type Marca = {
  name: string;
  /** Logo em public/images/marcas/ (servida em /anarabottini/images/marcas/...). Opcional. */
  logo?: string;
};

export const marcas: Marca[] = [];

export const hasDepoimentos = depoimentos.length > 0;
export const hasMarcas = marcas.length > 0;
