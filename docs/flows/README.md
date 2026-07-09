# Como o Rei do Bar funciona

Esta pasta explica, em linguagem simples, o que acontece em cada etapa do aplicativo — desde alguém abrir o app pela primeira vez até o pedido chegar na porta.

Não é preciso saber programar para ler. Cada documento conta uma jornada: o caminho normal, as regras que existem, por que elas existem, e o que a pessoa vê quando algo dá errado.

## As jornadas

| Documento | Sobre o quê |
|---|---|
| [Entrar e criar conta](./entrar-e-criar-conta.md) | Navegar sem conta, receber o código por mensagem, virar cliente |
| [Montar o carrinho](./montar-carrinho.md) | Escolher produtos, ajustar quantidades, o que limita |
| [Cupons de desconto](./cupons.md) | Aplicar um cupom e todas as regras que podem barrar |
| [O pedido](./pedido.md) | Fechar o pedido, acompanhar o preparo, cancelar |
| [Minha conta](./minha-conta.md) | Endereços, dados pessoais, excluir a conta |
| [Gestão do bar](./gestao-do-bar.md) | O outro lado: catálogo, estoque, pedidos, cupons, abrir e pausar |

## Quem é quem

Alguns termos aparecem em todos os documentos. Vale entender antes de começar.

**Pessoa sem conta.** Quem abriu o app mas ainda não se identificou. Consegue ver o cardápio e montar um carrinho, mas não consegue fechar pedido nem usar cupom. O app reconhece o aparelho, então o carrinho não se perde se a pessoa fechar e abrir de novo.

**Cliente.** Quem já entrou com o telefone e confirmou o código. Tem nome, endereços e histórico de pedidos.

**Produto.** Um item do cardápio. Pertence a uma categoria (por exemplo, "Cervejas"), tem preço e uma quantidade em estoque.

**Carrinho.** A lista do que a pessoa pretende comprar. Existe tanto para quem tem conta quanto para quem não tem — e acompanha a pessoa quando ela entra.

**Pedido.** Um carrinho que foi fechado. A partir daí ele tem um número, um endereço de entrega e passa por etapas até ser entregue.

**Cupom.** Um código que dá desconto. Pode ser um valor fixo (R$ 10 de desconto) ou uma porcentagem (10% de desconto).

**Bar.** Quem administra: cadastra produtos, controla estoque, aceita e prepara os pedidos, cria cupons, e decide quando está aberto ou em pausa.

## Duas coisas que costumam surpreender

Vale saber desde já, porque afetam quase todas as jornadas:

**O carrinho segue a pessoa no login, e substitui o antigo.** Se alguém monta um carrinho sem estar logado e depois entra na conta, esse carrinho passa a ser o da conta. Se já havia um carrinho salvo lá de uma sessão anterior, ele é descartado.

**Um cupom aplicado no carrinho é conferido de novo na hora de fechar o pedido.** Entre aplicar e finalizar pode passar tempo — o cupom pode ter expirado, esgotado, ou ter sido desativado pelo bar nesse meio-tempo.

---

> Os valores citados aqui (quantidade de endereços, tempo de validade do código, etc.) refletem a configuração padrão do sistema. Alguns deles o bar pode ajustar.
