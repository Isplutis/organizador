// Sugestões de aberturas (linha principal curta). O usuário escolhe quais entram no repertório.
// lances em SAN a partir da posição inicial; cor = com qual cor você joga.
export const ABERTURAS_SUG = [
  { id: 'italiana', nome: 'Italiana (Giuoco Piano)', cor: 'w', lances: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4'], ideia: 'Desenvolver rápido, mirar f7 com o bispo e preparar d4 para dominar o centro.' },
  { id: 'espanhola', nome: 'Espanhola (Ruy López)', cor: 'w', lances: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'], ideia: 'Pressionar o cavalo que defende e5 e rocar cedo; jogo posicional de longo prazo.' },
  { id: 'escocesa', nome: 'Escocesa', cor: 'w', lances: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4'], ideia: 'Abrir o centro logo com d4 e jogar com peças ativas.' },
  { id: 'gambito-dama', nome: 'Gambito da Dama', cor: 'w', lances: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7'], ideia: 'Oferecer o peão c4 para tirar o peão d5 do centro.' },
  { id: 'londres', nome: 'Sistema Londres', cor: 'w', lances: ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'e6', 'Nf3', 'c5', 'c3', 'Nc6'], ideia: 'Estrutura sólida e fácil de lembrar: bispo em f4, peões em c3-d4-e3.' },
  { id: 'inglesa', nome: 'Inglesa', cor: 'w', lances: ['c4', 'e5', 'Nc3', 'Nf6', 'g3', 'd5', 'cxd5', 'Nxd5', 'Bg2'], ideia: 'Controlar d5 pelo flanco e usar o bispo em fianqueto.' },
  { id: 'siciliana', nome: 'Siciliana (Najdorf)', cor: 'b', lances: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], ideia: 'Jogo desequilibrado: trocar o peão c pelo d branco e contra-atacar na ala da dama.' },
  { id: 'francesa', nome: 'Francesa', cor: 'b', lances: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'Bg5', 'Be7'], ideia: 'Estrutura sólida; desafiar o centro com d5 e depois c5.' },
  { id: 'caro-kann', nome: 'Caro-Kann', cor: 'b', lances: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'], ideia: 'Como a Francesa, mas o bispo das casas brancas sai antes de e6.' },
  { id: 'escandinava', nome: 'Escandinava', cor: 'b', lances: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5'], ideia: 'Atacar e4 de imediato; a dama sai cedo, mas a posição é simples.' },
  { id: 'dois-cavalos', nome: 'Dois Cavalos (contra a Italiana)', cor: 'b', lances: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], ideia: 'Contra-atacar e4 em vez de defender; cuidado com Ng5 mirando f7.' },
  { id: 'india-rei', nome: 'Índia do Rei', cor: 'b', lances: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O'], ideia: 'Deixar as brancas ocuparem o centro e atacá-lo depois com e5 ou c5.' },
  { id: 'eslava', nome: 'Eslava', cor: 'b', lances: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'dxc4'], ideia: 'Defender d5 com c6 mantendo o bispo de c8 livre.' }
];
