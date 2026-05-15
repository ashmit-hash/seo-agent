/**
 * Indian Festival Calendar — Month-wise lookup
 * Covers pan-India, regional, and secular commercial moments for D2C brands
 */

/**
 * Year-specific actual dates for festivals that vary every year.
 * Format: { FestivalName: { YYYY: { month: "MonthName", day: N } } }
 * "month" is the calendar month the festival actually falls in that year.
 * Used by isFestivalUpcoming() in route.js to correctly filter past "varies" festivals.
 */
export const YEAR_SPECIFIC_FESTIVAL_DATES = {
  "Akshaya Tritiya": {
    2024: { month: "May", day: 10 },
    2025: { month: "April", day: 30 },  // April 30 — already past by May
    2026: { month: "April", day: 20 },  // April 20 — already past by May 15
    2027: { month: "May", day: 9 },
  },
  "Holi": {
    2024: { month: "March", day: 25 },
    2025: { month: "March", day: 14 },
    2026: { month: "March", day: 3 },
  },
  "Diwali": {
    2024: { month: "November", day: 1 },
    2025: { month: "October", day: 20 },
    2026: { month: "November", day: 8 },
  },
  "Dhanteras": {
    2024: { month: "October", day: 29 },
    2025: { month: "October", day: 18 },
    2026: { month: "November", day: 6 },
  },
  "Navratri": {
    2024: { month: "October", day: 3 },
    2025: { month: "September", day: 22 },
    2026: { month: "October", day: 11 },
  },
  "Dussehra": {
    2024: { month: "October", day: 12 },
    2025: { month: "October", day: 2 },
    2026: { month: "October", day: 21 },
  },
  "Ganesh Chaturthi": {
    2024: { month: "September", day: 7 },
    2025: { month: "August", day: 27 },
    2026: { month: "September", day: 16 },
  },
  "Onam": {
    2024: { month: "September", day: 15 },
    2025: { month: "September", day: 5 },
    2026: { month: "August", day: 25 },
  },
  "Raksha Bandhan": {
    2024: { month: "August", day: 19 },
    2025: { month: "August", day: 9 },
    2026: { month: "August", day: 28 },
  },
  "Janmashtami": {
    2024: { month: "August", day: 26 },
    2025: { month: "August", day: 16 },
    2026: { month: "August", day: 5 },
  },
  "Eid ul-Fitr": {
    2024: { month: "April", day: 11 },
    2025: { month: "March", day: 31 },
    2026: { month: "March", day: 20 },
  },
  "Eid ul-Adha": {
    2024: { month: "June", day: 17 },
    2025: { month: "June", day: 7 },
    2026: { month: "May", day: 27 },
  },
  "Buddha Purnima": {
    2024: { month: "May", day: 23 },
    2025: { month: "May", day: 12 },
    2026: { month: "May", day: 31 },
  },
  "Guru Nanak Jayanti": {
    2024: { month: "November", day: 15 },
    2025: { month: "November", day: 5 },
    2026: { month: "November", day: 24 },
  },
};

export const FESTIVAL_CALENDAR = {
  January: [
    {
      name: "Makar Sankranti / Uttarayan",
      date: "January 14",
      significance: "Harvest festival marking the sun's northward journey. Kite flying, sesame sweets, new beginnings. Major across Gujarat, Rajasthan, Maharashtra, UP.",
      d2cAngles: ["festive gifting sets", "traditional sweets pairings", "new season launch", "winter collections", "kite-themed packaging"],
    },
    {
      name: "Lohri",
      date: "January 13",
      significance: "Punjabi harvest festival celebrated around bonfires. Family gatherings, rewri, popcorn, folk music.",
      d2cAngles: ["winter gifting", "family celebration bundles", "North India seasonal collections", "bonfire-night gift boxes"],
    },
    {
      name: "Pongal",
      date: "January 14–17",
      significance: "South Indian Thanksgiving. Four-day harvest festival — Bhogi, Thai Pongal, Mattu Pongal, Kaanum Pongal. Deeply rooted across Tamil Nadu, Andhra, Telangana.",
      d2cAngles: ["South India festive gifting", "traditional home decor", "rice-based food gifting", "festive apparel"],
    },
    {
      name: "Republic Day",
      date: "January 26",
      significance: "National holiday. Strong Made-in-India sentiment, patriotism, handloom and craft revival.",
      d2cAngles: ["Made in India angle", "artisan collections", "tricolour-inspired designs", "handloom feature content"],
    },
  ],

  February: [
    {
      name: "Valentine's Day",
      date: "February 14",
      significance: "Biggest romantic gifting occasion of Q1. High purchase intent from 10 days prior. Couples, long-distance, self-gifting all relevant.",
      d2cAngles: ["romantic gifting", "couples collections", "personalised keepsakes", "luxury unboxing experience", "self-love campaign"],
    },
    {
      name: "Basant Panchami",
      date: "February (varies by lunar calendar)",
      significance: "Saraswati Puja, start of spring, yellow is auspicious. Popular in Bengal, Bihar, UP, Punjab.",
      d2cAngles: ["yellow-themed collections", "traditional ethnic wear", "spring launch content", "educational gifting"],
    },
    {
      name: "Maha Shivratri",
      date: "February–March (varies)",
      significance: "Major pan-India Hindu festival. Night-long vigil, fasting, spiritual significance. Strong across all regions.",
      d2cAngles: ["spiritual products", "minimalist gifting", "ritual items", "wellness content", "fasting-foods adjacent"],
    },
  ],

  March: [
    {
      name: "Holi",
      date: "March (varies, usually mid-March)",
      significance: "Festival of colours, joy, and community. One of the most commercially vibrant festivals. High footfall for skin/hair care, white clothing, festive gifting.",
      d2cAngles: ["pre-Holi skin and hair protection", "white-fabric collections", "colour-safe gifting", "festive hampers", "colour-play accessories"],
    },
    {
      name: "International Women's Day",
      date: "March 8",
      significance: "Celebration of women, empowerment, and recognition. Gifting to mothers, wives, sisters. Brands run empowerment campaigns.",
      d2cAngles: ["women-focused collections", "self-care gifting for women", "empowerment messaging", "gifting guides for women"],
    },
    {
      name: "Ugadi / Gudi Padwa",
      date: "March–April (varies)",
      significance: "New Year for Karnataka, Andhra, Telangana (Ugadi) and Maharashtra (Gudi Padwa). New beginnings, sweets, new clothes.",
      d2cAngles: ["new year gifting", "traditional sweets", "auspicious launches", "festive ethnic wear"],
    },
    {
      name: "Ram Navami",
      date: "March–April (varies)",
      significance: "Birth of Lord Ram, religious observance with fasting, puja, and community gatherings across India.",
      d2cAngles: ["traditional ethnic collections", "pooja items", "devotional gifting", "sattvic food adjacent"],
    },
  ],

  April: [
    {
      name: "Baisakhi",
      date: "April 13–14",
      significance: "Punjabi New Year and harvest festival. Major celebration in Punjab, Haryana, Delhi. Community fairs, bhangra, traditional dress.",
      d2cAngles: ["traditional Punjabi wear", "festive gifting", "North India seasonal collections", "harvest-themed content"],
    },
    {
      name: "Eid ul-Fitr",
      date: "April (varies by lunar calendar)",
      significance: "End of Ramadan — biggest Muslim festival. Three days of celebration, gifting, new clothes, feasting, charity. Pan-India significance, especially Maharashtra, UP, West Bengal, Kerala.",
      d2cAngles: ["festive gifting hampers", "ethnic and modest wear", "attar and fragrance", "sweet boxes", "Eid-special collections"],
    },
    {
      name: "Vishu",
      date: "April 14–15",
      significance: "Kerala New Year. Auspicious first sight (Vishukkani), new clothes, gifts for children. Strong D2C relevance in Kerala.",
      d2cAngles: ["Kerala-focused gifting", "traditional wear", "auspicious new year content"],
    },
  ],

  May: [
    {
      name: "Mother's Day",
      date: "Second Sunday of May",
      significance: "The most commercially significant gifting day of Q2. Extremely high purchase intent 1–2 weeks prior. Jewellery, self-care, personalised gifts all peak.",
      d2cAngles: ["gifting guides for mothers", "jewellery for mothers", "personalised keepsakes", "self-care sets", "premium unboxing experience", "emotional storytelling content"],
    },
    {
      name: "Akshaya Tritiya",
      date: "May (varies — usually April or May)",
      significance: "One of the most auspicious buying days in the Hindu calendar. Gold, jewellery, and property purchases are considered highly blessed. Enormous commercial significance for jewellery D2C.",
      d2cAngles: ["jewellery collection launch", "gold and silver gifting", "auspicious purchase guides", "heirloom pieces", "investment jewellery angle"],
    },
    {
      name: "Buddha Purnima",
      date: "May (full moon day)",
      significance: "Birth, enlightenment, and death of Gautam Buddha. Peaceful, spiritual significance. Rising mindfulness audience.",
      d2cAngles: ["wellness and mindfulness products", "peaceful gifting", "calm-lifestyle content", "meditation-adjacent items"],
    },
  ],

  June: [
    {
      name: "Father's Day",
      date: "Third Sunday of June",
      significance: "Growing gifting occasion in India. Grooming, accessories, experiences, tech. Younger Indian consumers actively gifting fathers.",
      d2cAngles: ["gifting guides for fathers", "grooming sets", "accessories for men", "premium gifting experiences", "personalised items for dads"],
    },
    {
      name: "Eid al-Adha (Bakrid)",
      date: "June (varies by lunar calendar)",
      significance: "Second major Eid. Sacrifice, sharing, community feasting, new clothes. Pan-India significance for Muslim consumers.",
      d2cAngles: ["festive gifting hampers", "modest ethnic wear", "premium food gifting", "Eid-special collections"],
    },
    {
      name: "World Environment Day",
      date: "June 5",
      significance: "Growing eco-consciousness in India's urban D2C audience. Brands run sustainability campaigns.",
      d2cAngles: ["eco-friendly product angles", "sustainable collections", "green packaging content", "zero-waste messaging"],
    },
    {
      name: "International Yoga Day",
      date: "June 21",
      significance: "Wellness and fitness focus. Strong angle for health, lifestyle, and activewear brands.",
      d2cAngles: ["wellness product launches", "fitness collections", "yoga-adjacent gifting", "health content"],
    },
  ],

  July: [
    {
      name: "Guru Purnima",
      date: "July (full moon day)",
      significance: "Honouring teachers, mentors, and guides. Spiritual significance. Gifting occasion for teacher communities.",
      d2cAngles: ["gifting for teachers and mentors", "books and stationery", "premium thoughtful gifting", "gratitude-themed content"],
    },
    {
      name: "Monsoon Season Content",
      date: "June–August",
      significance: "Monsoon is a distinct content season for Indian D2C — hair care, skin care, home care, comfort products all see search spikes.",
      d2cAngles: ["monsoon skin and hair care guides", "rainy season comfort products", "home care during humidity", "seasonal collections"],
    },
  ],

  August: [
    {
      name: "Independence Day",
      date: "August 15",
      significance: "National holiday. Strong Made-in-India pride, patriotism, artisan and handloom revival messaging.",
      d2cAngles: ["Made in India collections", "artisan craft features", "tricolour-themed content", "India-inspired designs", "independent brands feature"],
    },
    {
      name: "Raksha Bandhan",
      date: "August (varies — Shravan Purnima)",
      significance: "One of the biggest sibling gifting occasions of the year. Extremely high purchase intent for jewellery, sweets, personalised gifts for sisters.",
      d2cAngles: ["gifting guides for sisters", "rakhi combo sets", "sweet boxes", "jewellery for sisters", "personalised rakhi gifts", "brother-sister gifting content"],
    },
    {
      name: "Janmashtami",
      date: "August (varies — Bhadrapada Krishna Ashtami)",
      significance: "Birth of Krishna. Playful and devotional celebration. Dahi Handi (Maharashtra), fasting, midnight puja. Pan-India but especially strong in Mathura, Mumbai.",
      d2cAngles: ["ethnic wear for celebrations", "festive home decor", "devotional gifting", "children's festive collections"],
    },
    {
      name: "Onam",
      date: "August–September (varies)",
      significance: "Kerala's grandest festival. 10-day celebration, Pookkalam flower designs, Vallam Kali boat race, Onasadya feast. Major commercial occasion for Kerala.",
      d2cAngles: ["Kerala traditional gifting", "kasavu sarees and mundu", "floral decor", "Onam feast food gifting", "gold and jewellery for Onam"],
    },
  ],

  September: [
    {
      name: "Ganesh Chaturthi",
      date: "September (varies — Bhadrapada Shukla Chaturthi)",
      significance: "Major 10-day festival across Maharashtra, Karnataka, AP, Goa. Enormous community celebration, idol installation, modak sweets. Huge D2C relevance in Mumbai and Pune.",
      d2cAngles: ["modak and sweet gifting", "festive home decor", "ethnic festive wear", "eco-friendly celebration items", "puja accessories"],
    },
    {
      name: "Navratri Begins",
      date: "September–October (varies — Ashwin Shukla Pratipada)",
      significance: "9-night festival of goddess worship. Garba dancing, fasting, new clothes and jewellery. Extremely high purchase intent for ethnic wear, jewellery, footwear.",
      d2cAngles: ["chaniya choli and garba wear", "traditional jewellery", "festive footwear", "Navratri accessories collections"],
    },
    {
      name: "Teachers' Day",
      date: "September 5",
      significance: "Honouring teachers. Gifting occasion, especially driven by school and college students.",
      d2cAngles: ["gifting guides for teachers", "stationery and books", "personalised teacher gifts", "appreciation gifting content"],
    },
  ],

  October: [
    {
      name: "Navratri / Garba Season",
      date: "October (varies)",
      significance: "Peak Navratri commercial season. Extremely high purchase intent for ethnic wear and jewellery. Garba events across Gujarat, Rajasthan, and urban metros.",
      d2cAngles: ["chaniya choli", "garba-ready jewellery", "festive footwear", "traditional accessories", "9 nights 9 colours content"],
    },
    {
      name: "Durga Puja",
      date: "October (varies — Mahalaya to Vijayadashami)",
      significance: "Eastern India's biggest festival. 5-day pandal celebration in West Bengal, Odisha, Assam. Enormous cultural and commercial significance. The 'Bengali fashion week' for ethnic wear.",
      d2cAngles: ["Bengali ethnic wear", "pandal-ready fashion", "festive gifting sets", "home decor", "Durga Puja style guides"],
    },
    {
      name: "Dussehra / Vijayadashami",
      date: "October (Navami/Dashami)",
      significance: "Victory of good over evil. Festive mood at peak before Diwali countdown begins. Strong pan-India celebration.",
      d2cAngles: ["ethnic wear for Dussehra", "festive gifting", "new season launches", "post-Navratri festive content"],
    },
    {
      name: "Gandhi Jayanti",
      date: "October 2",
      significance: "National holiday. Khadi, simplicity, and Made-in-India messaging.",
      d2cAngles: ["handloom and khadi collections", "Made in India content", "sustainable and artisan products"],
    },
  ],

  November: [
    {
      name: "Dhanteras",
      date: "November (2 days before Diwali)",
      significance: "Buying gold, silver, and metal objects is considered highly auspicious. Single highest-intent buying day for jewellery in the Indian calendar.",
      d2cAngles: ["jewellery collection launch for Dhanteras", "gold-finish and silver products", "auspicious gifting", "Dhanteras buying guides"],
    },
    {
      name: "Diwali",
      date: "November (varies — Kartik Amavasya)",
      significance: "The single biggest festival and gifting occasion of the year. 2–3 weeks of elevated purchase intent. Gifting hampers, jewellery, home decor, fashion all peak.",
      d2cAngles: ["Diwali gifting hampers", "jewellery for Diwali", "home decor collections", "luxury packaging", "festive fashion", "premium gifting content", "Diwali gift guides"],
    },
    {
      name: "Bhai Dooj",
      date: "November (2 days after Diwali)",
      significance: "Sibling celebration, second major gifting moment for sisters after Raksha Bandhan.",
      d2cAngles: ["sibling gifting sets", "jewellery and accessories for sisters", "sweet gifting"],
    },
    {
      name: "Children's Day",
      date: "November 14",
      significance: "Celebrating children. Gifting occasion for parents buying for kids.",
      d2cAngles: ["kids collections", "toy and game gifting", "children's accessories", "educational gifting"],
    },
  ],

  December: [
    {
      name: "Christmas",
      date: "December 25",
      significance: "Global gifting occasion with strong India traction in urban metros. Santa, gifting, winter joy, premium packaging.",
      d2cAngles: ["premium gift sets", "winter collections", "luxury unboxing", "Christmas gift guides", "festive hampers"],
    },
    {
      name: "New Year's Eve",
      date: "December 31",
      significance: "New beginnings, celebration, party fashion. Strong self-gifting and couple-gifting intent.",
      d2cAngles: ["party wear collections", "New Year gifting", "festive accessories", "countdown-to-new-year content"],
    },
    {
      name: "Year-End Sale Season",
      date: "Throughout December",
      significance: "End-of-year buying surge. Consumers clearing wishlists, brands clearing inventory. Strong purchase intent.",
      d2cAngles: ["year-end sale guides", "gift buying guides", "winter collections clearance", "best-of-year product roundups"],
    },
  ],
};

/**
 * Get festivals for a given month name (e.g. "May", "October")
 * Returns empty array if month not found
 */
export function getFestivalsForMonth(monthName) {
  if (!monthName) return [];
  const key = monthName.trim();
  return FESTIVAL_CALENDAR[key] ?? [];
}

/**
 * Get current month name in IST
 */
export function getCurrentMonthIST() {
  return new Date().toLocaleString("en-US", {
    month: "long",
    timeZone: "Asia/Kolkata",
  });
}

export const ALL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
