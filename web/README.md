# Plataforma web da Rosana

Interface visual isolada do backend da Rosana. Este primeiro scaffold usa **Vite + React + TypeScript**: é leve, rápido para prototipar e não impõe uma camada de servidor antes de definirmos autenticação e contratos com o backend. Todos os dados exibidos nesta etapa são mocks locais.

## Rodar localmente

Requer Node.js 20 ou superior.

```bash
cd web
npm install
npm run dev
```

Acesse o endereço indicado pelo Vite (normalmente `http://localhost:5173`).

## Comandos

```bash
npm run dev      # ambiente de desenvolvimento
npm run build    # checagem de tipos e build de produção
npm run lint     # análise estática
npm run preview  # serve o build localmente
```

## Estrutura

- `src/components`: componentes reutilizáveis do layout e dashboard.
- `src/data`: mocks tipados que simulam os futuros contratos da API.
- `src/styles`: tokens, estilos globais e responsividade.

Não há credenciais, chamadas ao Supabase ou conexão com o backend neste diretório.
