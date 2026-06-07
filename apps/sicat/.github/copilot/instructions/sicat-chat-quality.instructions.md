# Instruções globais — Qualidade Conversacional SICAT

Ao trabalhar no Chat SICAT:

- consulte `docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl`;
- toda nova intenção precisa ter cenário de smoke;
- toda resposta esperada precisa ser verificável;
- respostas devem ser úteis, objetivas e auditáveis;
- ações sensíveis nunca devem ser executadas sem confirmação explícita;
- o modo smoke não deve mutar dados reais por padrão;
- a avaliação com IA deve usar a rubrica em `docs/ai-chat/evaluation/expected-response-rubric.md`;
- quando o chat não tiver uma ferramenta implementada, a resposta deve dizer a limitação e oferecer caminho seguro.
