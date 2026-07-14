// Demo showcase seed for the Feed. Rendered ONLY when the real For You feed is empty
// (no user posts yet), so a fresh install / demo looks alive like the design instead of
// dark placeholder blocks. Real posts replace all of this automatically. Everything here
// is clearly SAMPLE content: ids are `demo-*`, `source: 'demo'`, and places carry
// `demo: true` so the screen keeps interactions local (no DB writes, no broken navigation).
// Photos are free stock (Unsplash / pravatar); if they fail to load, cards fall back to a
// solid colour — same as any missing image.

const IMG = (id) => `https://images.unsplash.com/photo-${id}?w=800&q=80&auto=format&fit=crop`;
const PHOTO = {
  rooftop: IMG('1414235077428-338989a2e8c0'),  // warm restaurant / rooftop dining
  burger: IMG('1568901346375-23c9450c58cd'),   // burger + fries
  beach: IMG('1507525428034-b723cf961d3e'),    // aerial beach
  beach2: IMG('1519046904884-53103b34b206'),   // beach with palms
  cocktail: IMG('1551024506-0bccd828d307'),    // dessert / drink
  food: IMG('1504674900247-0877df9cc836'),     // plated food
  concert: IMG('1470229722913-7c0e2dbbafd3'),  // concert crowd
  coffee: IMG('1495474472287-4d71bcdd2085'),   // coffee
};
const AV = (n) => `https://i.pravatar.cc/150?img=${n}`;
const AUTHORS = {
  percy: { id: 'demo-percy', name: 'Percyslage', avatarUrl: AV(12), trustTier: 'verified_citizen' },
  foodie: { id: 'demo-foodie', name: 'FoodieAlger', avatarUrl: AV(33), trustTier: 'verified_citizen' },
  ahmed: { id: 'demo-ahmed', name: 'Ahmed', avatarUrl: AV(15), trustTier: 'verified_citizen' },
  zara: { id: 'demo-zara', name: 'TravelWithZ', avatarUrl: AV(45), trustTier: 'community_guide' },
};

const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();

function demoPost({ id, author, place, body, photoUrls, likes, comments, h }) {
  return {
    source: 'demo', id, ownerId: null, author, rating: null,
    place: place ? { kind: 'venue', demo: true, city: 'Algiers', ...place } : null,
    body, photoUrls, helpfulCount: likes, commentCount: comments, createdAt: hoursAgo(h),
  };
}

const HERO = demoPost({
  id: 'demo-hero', author: AUTHORS.percy,
  place: { id: 'demo-jardin', name: "Le Jardin d'Essai", category: 'cafe' },
  body: "Best rooftop for sunsets — hidden gem with insane views and even better coffee. ☕ #Rooftop #Coffee #Outdoor #Views",
  photoUrls: [PHOTO.rooftop], likes: 284, comments: 36, h: 2,
});

const CAROUSEL = demoPost({
  id: 'demo-carousel', author: AUTHORS.zara,
  place: { id: 'demo-beaches', name: 'Hidden beaches', category: 'outdoor' },
  body: '5 Hidden beaches in Algeria 🌊',
  photoUrls: [PHOTO.beach, PHOTO.beach2, PHOTO.cocktail, PHOTO.food], likes: 176, comments: 22, h: 4,
});

const BURGER = demoPost({
  id: 'demo-burger', author: AUTHORS.foodie,
  place: { id: 'demo-burger', name: 'The Burger Joint', category: 'restaurant' },
  body: 'Best burger in town!', photoUrls: [PHOTO.burger], likes: 132, comments: 18, h: 3,
});

const FRIENDS = demoPost({
  id: 'demo-friends', author: AUTHORS.ahmed,
  place: { id: 'demo-sidi', name: 'Sidi Fredj, Algiers', category: 'outdoor' },
  body: 'Perfect weekend escape ☀️',
  photoUrls: [PHOTO.beach2, PHOTO.cocktail, PHOTO.food, PHOTO.beach], likes: 92, comments: 12, h: 5,
});

const COFFEE = demoPost({
  id: 'demo-coffee', author: AUTHORS.percy,
  place: { id: 'demo-cafe', name: 'Café Central', category: 'cafe' },
  body: 'Morning ritual done right ☕', photoUrls: [PHOTO.coffee], likes: 58, comments: 6, h: 6,
});

export const DEMO_EVENT = {
  kind: 'event', id: 'demo-event', demo: true, title: 'Afrobeats Night', category: 'music_event',
  imageUrl: PHOTO.concert, startTime: hoursAgo(-2), city: 'Algiers', venueName: 'The Warehouse',
};

export const DEMO_STORIES = [
  { id: 'demo-percy', name: 'Percyslage', avatarUrl: AUTHORS.percy.avatarUrl, storyUrl: PHOTO.rooftop },
  { id: 'demo-foodie', name: 'FoodieAlger', avatarUrl: AUTHORS.foodie.avatarUrl, storyUrl: PHOTO.burger },
  { id: 'demo-ahmed', name: 'Ahmed', avatarUrl: AUTHORS.ahmed.avatarUrl, storyUrl: PHOTO.beach2 },
  { id: 'demo-zara', name: 'TravelWithZ', avatarUrl: AUTHORS.zara.avatarUrl, storyUrl: PHOTO.beach },
];

// The split the immersive Feed expects (hero / carousel / trending / friends / recent).
export const DEMO_FEED = {
  hero: HERO,
  carousel: CAROUSEL,
  trendingPosts: [BURGER],
  friendsPost: FRIENDS,
  recent: [COFFEE, BURGER],
};
