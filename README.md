# Gestão — MVP v10

Painel mobile-first para agenda, clientes, serviços e financeiro.

## Mudança principal desta versão

O sistema não nasce mais com o nome de um negócio fixo. No primeiro acesso, a proprietária cria o próprio espaço e informa:

- nome do negócio;
- nome da profissional;
- WhatsApp opcional;
- usuário;
- senha.

Depois disso, o nome escolhido passa a aparecer no painel e nas mensagens de WhatsApp.

## Limite de acessos do MVP

Existem somente duas identidades possíveis:

1. **Proprietária** — criada uma única vez pelo onboarding inicial.
2. **Administrador/teste** — definido em `assets/js/config.js`.

Não existe cadastro público adicional nesta fase.

Conta administrativa padrão para teste:

- usuário: `admin`
- senha: `1234`

Troque esses dados no `config.js` antes de qualquer demonstração externa.

## Importante sobre segurança

A autenticação desta versão ainda é local e serve somente para o MVP. Usuários, senha da proprietária e sessão ficam no navegador. Isso não deve ser usado como segurança real em produção.

Para uso em dispositivos diferentes e dados reais, a próxima etapa é conectar Supabase Auth e o banco Supabase. A pasta `supabase/` já contém uma estrutura inicial com `studios` e `studio_members`, preparada para separar negócio e usuários.

## Acesso aos Ajustes no mobile

No mobile, toque no nome do negócio no topo do painel para abrir **Ajustes**.

## Configuração central

O arquivo `assets/js/config.js` concentra tema, conta administrativa de teste, padrões da agenda, formas de pagamento e serviços iniciais.
