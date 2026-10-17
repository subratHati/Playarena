// Homepage hero slides. Edit this file to change what rotates at the top of the homepage.
//
// To use your own picture on a slide:
//   1. Put the image in client/public/hero/  (e.g. client/public/hero/diwali-cup.jpg)
//      Best size: 1200 × 900 px (4:3), JPG or WebP, under 300 KB.
//   2. Set  image: '/hero/diwali-cup.jpg'  and  imageAlt: 'what the picture shows'  on that slide.
// Without an image, the slide shows its built-in illustration (art: 'ttt' | 'trophy' | 'c4' | 'sps').
//
// theme sets the background colour: 'ttt' (teal), 'sps' (amber), 'c4' (pink-red), 'court' (blue), 'ink' (dark).
// Keep 2–4 slides; they rotate every 6 seconds and pause while someone hovers or focuses them.

export const HERO_SLIDES = [
  {
    id: 'play-now',
    theme: 'ttt',
    art: 'ttt',
    title: 'Play in seconds. No signup needed.',
    text: 'Tic Tac Toe, Stone Paper Scissors and Connect Four against Mivo, right in your browser.',
    cta: { label: 'Play Tic Tac Toe', to: '/play/tic-tac-toe' },
    image: null,
    imageAlt: '',
  },
  {
    id: 'tournaments',
    theme: 'court',
    art: 'trophy',
    title: 'Tournaments every week',
    text: 'Book a seat, get your pass, and play live knockout matches. Win a champion badge and a spot on the leaderboard.',
    cta: { label: 'See tournaments', to: '/tournaments' },
    image: null,
    imageAlt: '',
  },
  {
    id: 'friends',
    theme: 'c4',
    art: 'c4',
    title: 'Challenge a friend',
    text: 'Share a 5-letter code and play Connect Four together from anywhere.',
    cta: { label: 'Invite a friend', to: '/play/connect-four' },
    image: null,
    imageAlt: '',
  },
];
