/*
 * sources.js — free, publicly offered RSS/Atom feeds from publishers who provide them
 * for headline syndication. Only titles + publisher names are displayed (no article text,
 * no images), which is the standard use RSS feeds are published for.
 *
 * Feed addresses change over time. Broken feeds are detected automatically (see
 * aggregator.js "source health"), backed off, and skipped — the rest keep flowing.
 * To add a source: copy a line, change the fields, restart. `every` = minutes between checks.
 */
/*
 * GDELT (gdeltproject.org) is a free, key-less index that watches news websites across the
 * world and updates every 15 minutes. One query returns up to 250 of the newest English-language
 * articles, each credited to its own outlet. This is what extends coverage from a hand-picked
 * list to many thousands of outlets. GDELT asks for no more than about one request every 5 s,
 * so these queries are spaced 6 s apart. Remove these lines to use only the named feeds below.
 */
function gdelt(label, query, every) {
  const q = encodeURIComponent(query);
  return {
    type: 'gdelt', name: 'GDELT: ' + label, region: '', category: 'world', every: every || 15, hostGapMs: 6000,
    url: `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&format=json&maxrecords=250&sort=datedesc&timespan=30min`,
  };
}

const GDELT = [
  gdelt('worldwide', 'sourcelang:english'),
  gdelt('Australia', 'sourcelang:english sourcecountry:australia', 20),
  gdelt('New Zealand & Pacific', 'sourcelang:english (sourcecountry:newzealand OR sourcecountry:fiji OR sourcecountry:papuanewguinea)', 30),
  gdelt('Asia', 'sourcelang:english (sourcecountry:india OR sourcecountry:singapore OR sourcecountry:philippines OR sourcecountry:malaysia OR sourcecountry:pakistan OR sourcecountry:japan OR sourcecountry:southkorea)', 20),
  gdelt('Africa', 'sourcelang:english (sourcecountry:nigeria OR sourcecountry:southafrica OR sourcecountry:kenya OR sourcecountry:ghana OR sourcecountry:uganda OR sourcecountry:zimbabwe)', 20),
  gdelt('Europe', 'sourcelang:english (sourcecountry:unitedkingdom OR sourcecountry:ireland OR sourcecountry:germany OR sourcecountry:france OR sourcecountry:ukraine)', 20),
  gdelt('Americas', 'sourcelang:english (sourcecountry:canada OR sourcecountry:unitedstates OR sourcecountry:jamaica OR sourcecountry:mexico OR sourcecountry:brazil)', 20),
  gdelt('Middle East', 'sourcelang:english (sourcecountry:israel OR sourcecountry:qatar OR sourcecountry:unitedarabemirates OR sourcecountry:saudiarabia OR sourcecountry:turkey)', 30),
];

const FEEDS = [
  // ── World / breaking ────────────────────────────────────────────────
  { name: 'BBC News',        region: 'UK',          category: 'world',    every: 10, url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'BBC News',        region: 'UK',          category: 'top',      every: 10, url: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { name: 'The Guardian',    region: 'UK',          category: 'world',    every: 10, url: 'https://www.theguardian.com/world/rss' },
  { name: 'Al Jazeera',      region: 'Qatar',       category: 'world',    every: 10, url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'NPR',             region: 'USA',         category: 'top',      every: 15, url: 'https://feeds.npr.org/1001/rss.xml' },
  { name: 'DW',              region: 'Germany',     category: 'world',    every: 15, url: 'https://rss.dw.com/rdf/rss-en-all' },
  { name: 'France 24',       region: 'France',      category: 'world',    every: 15, url: 'https://www.france24.com/en/rss' },
  { name: 'CBC News',        region: 'Canada',      category: 'world',    every: 15, url: 'https://www.cbc.ca/webfeed/rss/rss-world' },
  { name: 'Sky News',        region: 'UK',          category: 'world',    every: 15, url: 'https://feeds.skynews.com/feeds/rss/world.xml' },
  { name: 'The New York Times', region: 'USA',      category: 'world',    every: 15, url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
  { name: 'Euronews',        region: 'EU',          category: 'world',    every: 15, url: 'https://www.euronews.com/rss' },
  { name: 'UN News',         region: 'International', category: 'world',  every: 30, url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },

  // ── Australia / Asia-Pacific ────────────────────────────────────────
  { name: 'ABC News',        region: 'Australia',   category: 'top',      every: 10, url: 'https://www.abc.net.au/news/feed/51120/rss.xml' },
  { name: 'ABC News',        region: 'Australia',   category: 'latest',   every: 10, url: 'https://www.abc.net.au/news/feed/2942460/rss.xml' },
  { name: 'The Guardian',    region: 'Australia',   category: 'australia', every: 10, url: 'https://www.theguardian.com/australia-news/rss' },
  { name: 'SBS News',        region: 'Australia',   category: 'top',      every: 15, url: 'https://www.sbs.com.au/news/feed' },
  { name: 'RNZ',             region: 'New Zealand', category: 'world',    every: 20, url: 'https://www.rnz.co.nz/rss/world.xml' },
  { name: 'The Japan Times', region: 'Japan',       category: 'top',      every: 20, url: 'https://www.japantimes.co.jp/feed/' },
  { name: 'South China Morning Post', region: 'Hong Kong', category: 'world', every: 20, url: 'https://www.scmp.com/rss/91/feed' },
  { name: 'The Times of India', region: 'India',    category: 'top',      every: 20, url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms' },

  // ── Africa / Americas ───────────────────────────────────────────────
  { name: 'AllAfrica',       region: 'Africa',      category: 'world',    every: 20, url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf' },
  { name: 'MercoPress',      region: 'South America', category: 'world',  every: 30, url: 'https://en.mercopress.com/rss/' },

  // ── Business / economy ──────────────────────────────────────────────
  { name: 'BBC News',        region: 'UK',          category: 'business', every: 15, url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { name: 'The Guardian',    region: 'UK',          category: 'business', every: 15, url: 'https://www.theguardian.com/business/rss' },
  { name: 'CNBC',            region: 'USA',         category: 'business', every: 15, url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html' },

  // ── Science / technology / health ───────────────────────────────────
  { name: 'BBC News',        region: 'UK',          category: 'science',  every: 20, url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml' },
  { name: 'BBC News',        region: 'UK',          category: 'technology', every: 20, url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
  { name: 'The Guardian',    region: 'UK',          category: 'science',  every: 20, url: 'https://www.theguardian.com/science/rss' },
  { name: 'Ars Technica',    region: 'USA',         category: 'technology', every: 20, url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { name: 'The Verge',       region: 'USA',         category: 'technology', every: 20, url: 'https://www.theverge.com/rss/index.xml' },
  { name: 'ScienceDaily',    region: 'USA',         category: 'science',  every: 30, url: 'https://www.sciencedaily.com/rss/top.xml' },
  { name: 'NASA',            region: 'USA',         category: 'science',  every: 60, url: 'https://www.nasa.gov/news-release/feed/' },
  { name: 'WHO',             region: 'International', category: 'health', every: 60, url: 'https://www.who.int/rss-feeds/news-english.xml' },
  { name: 'BBC News',        region: 'UK',          category: 'health',   every: 30, url: 'https://feeds.bbci.co.uk/news/health/rss.xml' },

  // ── Environment / climate ───────────────────────────────────────────
  { name: 'The Guardian',    region: 'UK',          category: 'environment', every: 20, url: 'https://www.theguardian.com/environment/rss' },

  // ── Sport / culture ─────────────────────────────────────────────────
  { name: 'BBC Sport',       region: 'UK',          category: 'sport',    every: 15, url: 'https://feeds.bbci.co.uk/sport/rss.xml' },
  { name: 'ESPN',            region: 'USA',         category: 'sport',    every: 20, url: 'https://www.espn.com/espn/rss/news' },
  { name: 'The Guardian',    region: 'UK',          category: 'culture',  every: 30, url: 'https://www.theguardian.com/culture/rss' },
  { name: 'BBC News',        region: 'UK',          category: 'entertainment', every: 30, url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml' },

  // ── More Australia ──────────────────────────────────────────────────
  { name: 'The Sydney Morning Herald', region: 'Australia', category: 'top', every: 15, url: 'https://www.smh.com.au/rss/feed.xml' },
  { name: 'Brisbane Times',  region: 'Australia',   category: 'top',      every: 20, url: 'https://www.brisbanetimes.com.au/rss/feed.xml' },
  { name: 'The Conversation', region: 'Australia',  category: 'analysis', every: 30, url: 'https://theconversation.com/au/articles.atom' },

  // ── More Asia-Pacific ───────────────────────────────────────────────
  { name: 'The Hindu',       region: 'India',       category: 'world',    every: 20, url: 'https://www.thehindu.com/news/international/feeder/default.rss' },
  { name: 'Dawn',            region: 'Pakistan',    category: 'top',      every: 20, url: 'https://www.dawn.com/feeds/home' },
  { name: 'The Straits Times', region: 'Singapore', category: 'world',    every: 20, url: 'https://www.straitstimes.com/news/world/rss.xml' },
  { name: 'CNA',             region: 'Singapore',   category: 'top',      every: 20, url: 'https://www.channelnewsasia.com/rssfeeds/8395986' },
  { name: 'Yonhap',          region: 'South Korea', category: 'top',      every: 20, url: 'https://en.yna.co.kr/RSS/news.xml' },
  { name: 'Bangkok Post',    region: 'Thailand',    category: 'top',      every: 30, url: 'https://www.bangkokpost.com/rss/data/topstories.xml' },
  { name: 'Rappler',         region: 'Philippines', category: 'top',      every: 30, url: 'https://www.rappler.com/feed/' },

  // ── More Europe / Middle East ───────────────────────────────────────
  { name: 'RT\u00C9 News',    region: 'Ireland',     category: 'top',      every: 20, url: 'https://www.rte.ie/feeds/rss/?index=/news/' },
  { name: 'The Independent', region: 'UK',          category: 'world',    every: 20, url: 'https://www.independent.co.uk/news/world/rss' },
  { name: 'Le Monde',        region: 'France',      category: 'world',    every: 30, url: 'https://www.lemonde.fr/en/rss/une.xml' },
  { name: 'The Kyiv Independent', region: 'Ukraine', category: 'world',   every: 30, url: 'https://kyivindependent.com/rss/' },
  { name: 'The Times of Israel', region: 'Israel',  category: 'world',    every: 30, url: 'https://www.timesofisrael.com/feed/' },
  { name: 'Arab News',       region: 'Saudi Arabia', category: 'world',   every: 30, url: 'https://www.arabnews.com/rss.xml' },

  // ── More Africa ─────────────────────────────────────────────────────
  { name: 'News24',          region: 'South Africa', category: 'top',     every: 20, url: 'https://feeds.news24.com/articles/news24/TopStories/rss' },
  { name: 'Daily Maverick',  region: 'South Africa', category: 'top',     every: 30, url: 'https://www.dailymaverick.co.za/dmrss/' },
  { name: 'Mail & Guardian', region: 'South Africa', category: 'top',     every: 30, url: 'https://mg.co.za/feed/' },
  { name: 'Premium Times',   region: 'Nigeria',     category: 'top',      every: 30, url: 'https://www.premiumtimesng.com/feed' },

  // ── More Americas ───────────────────────────────────────────────────
  { name: 'PBS NewsHour',    region: 'USA',         category: 'top',      every: 20, url: 'https://www.pbs.org/newshour/feeds/rss/headlines' },
  { name: 'CBS News',        region: 'USA',         category: 'top',      every: 20, url: 'https://www.cbsnews.com/latest/rss/main' },
  { name: 'ABC News (US)',   region: 'USA',         category: 'top',      every: 20, url: 'https://feeds.abcnews.com/abcnews/topstories' },
  { name: 'The Washington Post', region: 'USA',     category: 'world',    every: 20, url: 'https://feeds.washingtonpost.com/rss/world' },
  { name: 'Los Angeles Times', region: 'USA',       category: 'world',    every: 30, url: 'https://www.latimes.com/world-nation/rss2.0.xml' },
  { name: 'Politico',        region: 'USA',         category: 'politics', every: 20, url: 'https://rss.politico.com/politics-news.xml' },
  { name: 'Global News',     region: 'Canada',      category: 'top',      every: 20, url: 'https://globalnews.ca/feed/' },
  { name: 'Buenos Aires Times', region: 'Argentina', category: 'top',     every: 30, url: 'https://www.batimes.com.ar/feed' },
  { name: 'Mexico News Daily', region: 'Mexico',    category: 'top',      every: 30, url: 'https://mexiconewsdaily.com/feed/' },

  // ── More science / tech / business / health / climate / culture ────
  { name: 'Nature',          region: 'International', category: 'science', every: 60, url: 'https://www.nature.com/nature.rss' },
  { name: 'New Scientist',   region: 'UK',          category: 'science',  every: 30, url: 'https://www.newscientist.com/feed/home/' },
  { name: 'Phys.org',        region: 'International', category: 'science', every: 30, url: 'https://phys.org/rss-feed/' },
  { name: 'Science',         region: 'USA',         category: 'science',  every: 60, url: 'https://www.science.org/rss/news_current.xml' },
  { name: 'Wired',           region: 'USA',         category: 'technology', every: 30, url: 'https://www.wired.com/feed/rss' },
  { name: 'TechCrunch',      region: 'USA',         category: 'technology', every: 30, url: 'https://techcrunch.com/feed/' },
  { name: 'MarketWatch',     region: 'USA',         category: 'business', every: 20, url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { name: 'STAT',            region: 'USA',         category: 'health',   every: 30, url: 'https://www.statnews.com/feed/' },
  { name: 'Inside Climate News', region: 'USA',     category: 'environment', every: 60, url: 'https://insideclimatenews.org/feed/' },
  { name: 'Mongabay',        region: 'International', category: 'environment', every: 60, url: 'https://news.mongabay.com/feed/' },
  { name: 'Sky Sports',      region: 'UK',          category: 'sport',    every: 30, url: 'https://www.skysports.com/rss/12040' },
  { name: 'Variety',         region: 'USA',         category: 'entertainment', every: 30, url: 'https://variety.com/feed/' },
];

// Spread the GDELT queries through the list so their 6-second spacing never holds up other feeds.
const ALL = [];
FEEDS.forEach((f, i) => { if (i % 10 === 0 && GDELT[i / 10]) ALL.push(GDELT[i / 10]); ALL.push(f); });
for (const g of GDELT) if (!ALL.includes(g)) ALL.push(g);
module.exports = ALL;
