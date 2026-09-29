# Painel — MVP v11

Protótipo mobile-first e genérico de agenda, clientes, serviços e financeiro.

## O que mudou nesta versão

- O projeto não assume mais o segmento de manicure ou estética.
- O catálogo inicial de serviços começa vazio.
- O primeiro acesso define o nome do negócio e o responsável.
- A tela de login usa a logo configurada em `assets/js/config.js` e tenta extrair automaticamente uma cor de destaque da própria imagem; há uma paleta neutra de fallback.
- O botão com a inicial do usuário aparece também no mobile e abre Ajustes.
- A Agenda agora possui:
  - agenda do dia;
  - visão semanal;
  - visão mensal;
  - navegação entre períodos;
  - clique em um dia da semana/mês para abrir os horários daquele dia.
- Em Ajustes > Agenda é possível escolher:
  - agenda do dia acima ou abaixo da visão geral;
  - Semana ou Mês como visualização geral padrão;
  - informações exibidas nos cartões dos atendimentos.

## Login do MVP

A autenticação continua local para testes. Há no máximo duas identidades previstas nesta fase:

1. responsável criado no onboarding inicial;
2. conta administrativa/teste definida em `assets/js/config.js`.

A conta administrativa padrão continua:

- usuário: `admin`
- senha: `1234`

Troque esses dados antes de compartilhar o protótipo.

## Identidade do login

No `config.js`:

```js
branding: {
  logoUrl: 'https://avatars.githubusercontent.com/u/326558902?v=4&size=512',
  deriveLoginPalette: true,
  loginFallbackAccent: '#536273',
  loginFallbackDark: '#171b20',
  loginFallbackSoft: '#e9edf1'
}
```

A logo remota continua visível mesmo quando a leitura de pixels para gerar a paleta não estiver disponível. Nesse caso, o login usa as cores de fallback acima.

## Próxima etapa separada

O compartilhamento de agenda entre usuários não foi simulado com `localStorage`, pois isso daria uma falsa sensação de segurança e não funcionaria corretamente entre dispositivos. Essa etapa deve entrar junto da autenticação/banco real, com permissões de visualização separadas do acesso de edição.

A pasta `supabase/` permanece apenas como rascunho de estrutura futura e não está conectada ao MVP atual.

## v12
- 5 temas do painel: Marca, Terra, Sálvia, Oceano e Vinho.
- Tema Marca é o padrão e tenta usar a cor predominante da logo quando disponível.
- Agenda com estados visuais: próximo, em andamento, pago, aguardando pagamento/baixa e cancelado.
- Ao selecionar um dia no calendário mensal, a visão muda para a semana correspondente sem alterar a preferência padrão salva.
- Duração de serviços: mínimo de 15 minutos, em intervalos de 5 minutos (15, 20, 25, 30...).

## v14 — horários de atendimento

A agenda pode operar em dois modos:

- **Agenda livre:** qualquer horário pode ser informado manualmente.
- **Horários definidos:** o usuário configura a grade semanal, com dias ativos, abertura, fechamento, pausa/almoço e intervalo entre inícios de atendimento.

Quando os horários definidos estão ativos, o modal de novo atendimento mostra somente horários válidos para a data e serviço escolhidos, removendo períodos fechados, pausas e conflitos com atendimentos existentes.

## Atualização v15

- Tipografia global alterada para Poppins, com fallbacks do sistema.
- Aparência reorganizada logo após Rotina nos Ajustes e em coluna própria no desktop.
- Cores fixas remanescentes foram substituídas por variáveis do tema sempre que eram decorativas; cores semânticas de financeiro/status foram preservadas.
- Indicador circular da agenda agora usa halo suave da própria cor do status.
- Dias de atendimento funcionam independentemente da grade de horários: com a grade desligada, o horário é livre, mas dias fechados continuam bloqueados.
- Datas específicas podem ser bloqueadas para folgas, feriados e compromissos.
- Switch de pausa/almoço usa o mesmo componente visual dos demais switches.

## v17 — Cadastros

- A antiga área **Clientes** passou a se chamar **Cadastros**.
- Cadastros reúne três abas: **Clientes**, **Serviços** e **Pagamentos**.
- Serviços saíram de Ajustes e agora ficam próximos dos demais dados operacionais.
- Formas de pagamento podem ser adicionadas, editadas, ativadas/desativadas e removidas.
- A baixa de um atendimento usa somente as formas de pagamento ativas cadastradas nessa área.
- Ajustes ficou reservado para regras de funcionamento, aparência, agenda, horários, identidade e acesso.

## v19 — Pacotes

A área **Cadastros** agora inclui **Pacotes**. Um pacote é um modelo comercial com nome, valor, validade, frequência sugerida e uma ou mais quantidades de serviços.

Na ficha do cliente é possível adicionar um pacote, registrar o pagamento como recebido ou pendente e acompanhar o saldo restante de cada serviço. Ao concluir um atendimento, quando existir saldo válido para aquele serviço, o painel oferece **Usar pacote**. Essa baixa consome uma utilização e não cria uma nova receita, evitando contar o mesmo dinheiro duas vezes.

A receita do pacote entra no Financeiro uma única vez, na data da compra/recebimento. Pacotes pendentes aparecem junto das demais pendências. Se um atendimento pago com pacote for cancelado, o sistema permite devolver a utilização ao saldo ou mantê-la consumida.


## v19
- Edição e reagendamento de atendimentos em aberto.
- Ajuste manual de horário na edição para atrasos/encaixes fora da grade.
- Aviso de pendências financeiras antes de criar novo atendimento, com opção de continuar.

## v20 — Pacotes dentro do Novo atendimento

- Pacotes continuam sendo modelos cadastrados em **Cadastros → Pacotes**.
- A venda/agendamento do pacote agora acontece em **Novo atendimento**, escolhendo `Serviço avulso` ou `Pacote`.
- Ao selecionar um pacote, o sistema transforma as quantidades em visitas. Ex.: `4× Serviço A + 4× Serviço B` gera 4 visitas contendo os dois serviços.
- Cada visita recebe data e horário próprios antes de salvar e é criada automaticamente na Agenda.
- Com grade de horários ativa, cada visita respeita duração combinada, expediente, pausas e conflitos existentes.
- O pacote entra no Financeiro uma única vez, na venda; as visitas posteriores consomem saldo sem duplicar receita.
- Na ficha do cliente, o botão de inclusão virou **Agendar pacote**, direcionando para o mesmo fluxo de Novo atendimento.
