// Padrões de mate e táticas (posições montadas para o app). Ficam ESCONDIDOS até o usuário liberar.
// solucao: lances em SAN, alternando você e o adversário (o adversário é jogado pelo app).
export const TEMAS = ['Mate do corredor', 'Mate sufocado', 'Mate com dama', 'Mate com torres', 'Mate de Boden', 'Mate de Anastácia', 'Garfo', 'Cravada', 'Espeto', 'Ataque descoberto', 'Ataque duplo', 'Sobrecarga', 'Desvio', 'Final', 'Outro'];
export const PADROES = [
  { id: 'corredor', tipo: 'mate', tema: 'Mate do corredor', nome: 'Mate do corredor', nivel: 1, fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', solucao: ['Rd8#'],
    reconhecer: 'Rei rocado com os três peões na frente e a última fileira sem defesa. Uma torre ou dama na 8ª fileira dá mate.' },
  { id: 'beijo', tipo: 'mate', tema: 'Mate com dama', nome: 'Beijo da dama', nivel: 1, fen: '7k/8/6K1/8/8/8/1Q6/8 w - - 0 1', solucao: ['Qg7#'],
    reconhecer: 'A dama encosta no rei adversário protegida pelo seu rei (ou outra peça).' },
  { id: 'escada', tipo: 'mate', tema: 'Mate com torres', nome: 'Mate da escada (duas torres)', nivel: 1, fen: '7k/R7/8/8/8/8/8/1R4K1 w - - 0 1', solucao: ['Rb8#'],
    reconhecer: 'Uma torre corta a fileira de fuga e a outra dá xeque na borda.' },
  { id: 'sufocado', tipo: 'mate', tema: 'Mate sufocado', nome: 'Mate sufocado', nivel: 2, fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', solucao: ['Nf7#'],
    reconhecer: 'O rei está cercado pelas próprias peças; só o cavalo consegue dar xeque.' },
  { id: 'anastacia', tipo: 'mate', tema: 'Mate de Anastácia', nome: 'Mate de Anastácia', nivel: 2, fen: '8/4Nppk/8/8/8/3R4/6PP/6K1 w - - 0 1', solucao: ['Rh3#'],
    reconhecer: 'Cavalo em e7 tira as casas g8 e g6; a torre dá mate pela coluna h.' },
  { id: 'boden', tipo: 'mate', tema: 'Mate de Boden', nome: 'Mate de Boden', nivel: 2, fen: '2kr4/p2n4/8/8/5B2/8/4B3/4K3 w - - 0 1', solucao: ['Ba6#'],
    reconhecer: 'Rei rocado na ala da dama: dois bispos em diagonais cruzadas fecham a rede.' },
  { id: 'philidor', tipo: 'mate', tema: 'Mate sufocado', nome: 'Mate de Philidor (em 2)', nivel: 3, fen: 'r6k/6pp/7N/3Q4/8/8/6PP/6K1 w - - 0 1', solucao: ['Qg8+', 'Rxg8', 'Nf7#'],
    reconhecer: 'Sacrifique a dama em g8 para a torre fechar a última casa de fuga; depois o cavalo dá mate sufocado.' },
  { id: 'garfo-cavalo', tipo: 'tatica', tema: 'Garfo', nome: 'Garfo de cavalo', nivel: 1, fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', solucao: ['Nc7+'],
    reconhecer: 'O cavalo ataca duas peças ao mesmo tempo, de preferência com xeque.' },
  { id: 'garfo-peao', tipo: 'tatica', tema: 'Garfo', nome: 'Garfo de peão', nivel: 1, fen: '4k3/8/3n1b2/8/4P3/8/8/4K3 w - - 0 1', solucao: ['e5'],
    reconhecer: 'Duas peças lado a lado, a uma casa de distância: um peão avança e ataca as duas.' },
  { id: 'cravada', tipo: 'tatica', tema: 'Cravada', nome: 'Atacar a peça cravada', nivel: 1, fen: '4k3/8/2n5/1B6/3P4/8/8/4K3 w - - 0 1', solucao: ['d5'],
    reconhecer: 'O cavalo não pode sair porque deixaria o rei em xeque: ataque-o com uma peça de menor valor.' },
  { id: 'espeto', tipo: 'tatica', tema: 'Espeto', nome: 'Espeto (raio X)', nivel: 2, fen: '4q3/8/8/4k3/8/8/8/R5K1 w - - 0 1', solucao: ['Re1+'],
    reconhecer: 'Peça valiosa na frente, outra atrás na mesma linha: o xeque obriga o rei a sair e a peça de trás cai.' },
  { id: 'descoberto', tipo: 'tatica', tema: 'Ataque descoberto', nome: 'Xeque descoberto', nivel: 2, fen: '4k3/8/8/q3N3/8/8/8/4R1K1 w - - 0 1', solucao: ['Nc6+'],
    reconhecer: 'Ao mover uma peça, outra que estava atrás dela dá xeque; a peça que saiu ataca outra coisa.' },
  { id: 'duplo-dama', tipo: 'tatica', tema: 'Ataque duplo', nome: 'Ataque duplo da dama', nivel: 1, fen: '4k3/8/8/8/7n/8/8/3QK3 w - - 0 1', solucao: ['Qa4+'],
    reconhecer: 'A dama dá xeque e, na mesma jogada, ataca uma peça solta.' }
];
