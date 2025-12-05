// تنظیمات Supabase
const SUPABASE_CONFIG = {
    URL: 'https://ewzgpfpllwhhrjupqyvy.supabase.co',
    KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3emdwZnBsbHdoaHJqdXBxeXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NjUzMTIsImV4cCI6MjA4MDQ0MTMxMn0.Us3nf0wOfYD0_aCDc-3Y0PaxsqUKiBvW95no0SkNgiI'
};

// تنظیمات نقشه
const MAP_CONFIG = {
    center: [34.5553, 69.2075], // مرکز کابل
    zoom: 12,
    tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors'
};

// تنظیمات قیمت‌گذاری
const PRICE_CONFIG = {
    baseFares: {
        economy: 50,
        comfort: 80,
        bike: 30
    },
    distanceFarePerKm: 20, // افغانی به ازای هر کیلومتر
    minDistance: 1, // حداقل مسافت برای محاسبه
    maxDistance: 50 // حداکثر مسافت برای محاسبه
};

// مناطق کابل
const KABUL_DISTRICTS = [
    { name: 'شاروالی کابل', description: 'مرکز شهر کابل', latitude: 34.5155, longitude: 69.1722 },
    { name: 'کارته سخی', description: 'منطقه مسکونی', latitude: 34.5180, longitude: 69.1830 },
    { name: 'کارته پروان', description: 'منطقه تجاری', latitude: 34.5250, longitude: 69.1900 },
    { name: 'کارته چهار', description: 'منطقه مسکونی', latitude: 34.5300, longitude: 69.1950 },
    { name: 'دشت برچی', description: 'منطقه مسکونی', latitude: 34.5080, longitude: 69.1680 },
    { name: 'چهاردهی', description: 'منطقه مسکونی', latitude: 34.5350, longitude: 69.1750 },
    { name: 'قلعه‌وزی', description: 'منطقه تاریخی', latitude: 34.5100, longitude: 69.1800 },
    { name: 'ده مرادخان', description: 'منطقه مسکونی', latitude: 34.5200, longitude: 69.1700 },
    { name: 'مکرویان', description: 'منطقه صنعتی', latitude: 34.5400, longitude: 69.2100 }
];

// مقاصد پرطرفدار
const POPULAR_DESTINATIONS = [
    { name: 'میدان هوایی بین المللی کابل', icon: 'fas fa-plane', latitude: 34.5658, longitude: 69.2124 },
    { name: 'سفارت امریکا', icon: 'fas fa-landmark', latitude: 34.5358, longitude: 69.1824 },
    { name: 'سفارت ایران', icon: 'fas fa-landmark', latitude: 34.5458, longitude: 69.1924 },
    { name: 'سفارت پاکستان', icon: 'fas fa-landmark', latitude: 34.5558, longitude: 69.2024 },
    { name: 'وزارت امور خارجه', icon: 'fas fa-building', latitude: 34.5258, longitude: 69.1724 },
    { name: 'ارگ ریاست جمهوری', icon: 'fas fa-monument', latitude: 34.5158, longitude: 69.1624 }
];

// تنظیمات سیستم
const SYSTEM_CONFIG = {
    appName: 'اسنپ افغانستان',
    supportPhone: '۰۷۰۰۱۲۳۴۵۶',
    supportEmail: 'support@snapp.af',
    workingHours: '۲۴ ساعته',
    currency: 'افغانی',
    currencySymbol: '؋',
    defaultLanguage: 'fa',
    rtl: true
};

// صادر کردن تنظیمات
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SUPABASE_CONFIG,
        MAP_CONFIG,
        PRICE_CONFIG,
        KABUL_DISTRICTS,
        POPULAR_DESTINATIONS,
        SYSTEM_CONFIG
    };
} else {
    window.CONFIG = {
        SUPABASE_CONFIG,
        MAP_CONFIG,
        PRICE_CONFIG,
        KABUL_DISTRICTS,
        POPULAR_DESTINATIONS,
        SYSTEM_CONFIG
    };
}