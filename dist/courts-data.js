// Community-maintained directory supplied by the Sideout owner. These are
// ordinary Google Maps search links, not Google Places/API listing data.
const rows=[
 ['paddle-grove','Paddle Grove','Purok 17, Hindangon'],
 ['jerpits-pickleball-hub','Jerpits Pickleball Hub','Purok 17A, Hagkol'],
 ['hive-pickleball-court','Hive Pickleball Court','W34W+52F'],
 ['acp-pickleball','ACP Pickleball','Purok 17, Hindangon'],
 ['pickle-point-arena-bukidnon','Pickle Point Arena Bukidnon','Purok 4, Guinoyuran Rd'],
 ['spinners-pickle-yard','Spinners Pickle Yard','Purok 15, NIA Road'],
 ['valencia-goodwill-giants-sports-town','VALENCIA GOODWILL GIANTS SPORTS TOWN','W423+H4J'],
 ['the-bodega','The Bodega','A Bonifacio St']
];
export const COURTS=Object.freeze(rows.map(([id,name,address])=>Object.freeze({id,name,address,
 mapsUrl:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(name+' '+address+', Valencia City, Bukidnon, Philippines')})));
export const COURT_STATUSES=Object.freeze(['playing','idle','practice']);
export const COURT_TTL_MINUTES=120;
export const COURT_ROSTER_LIMIT=100;
