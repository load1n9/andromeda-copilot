type Suit = 'H' | 'D' | 'C' | 'S';

type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

type Card = string;

const suits: Suit[] = ['H', 'D', 'C', 'S'];
const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

let deck: Card[] = [];

for (let suit of suits) {
  for (let rank of ranks) {
    deck.push(`${suit}${rank}`);
  }
}

function drawCard(): Card {
  if (deck.length === 0) {
    throw new Error('The deck is empty.');
  }

  const randomIndex = Math.floor(Math.random() * deck.length);
  const card = deck[randomIndex];
  deck.splice(randomIndex, 1);
  return card;
}

function handValue(hand: Card[]): number {
  let minVal = 0;
  let maxVal = 0;
  for (let card of hand) {
    let rank = card.slice(1);
    if (rank === 'A') {
      minVal += 1;
      maxVal += 11;
    } else if ('KQJ'.includes(rank)) {
      minVal += 10;
      maxVal += 10;
    } else {
      minVal += parseInt(rank);
      maxVal += parseInt(rank);
    }
  }
  if (maxVal > 21) {
    return minVal;
  } else {
    return maxVal;
  }
}

let hand = [drawCard(), drawCard()];
console.log(hand, handValue(hand));