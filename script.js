// تنظیمات سیستم
const CONFIG = {
    MAP: {
        CENTER: [34.5553, 69.2075],
        ZOOM: 12
    },
    PRICING: {
        BASE_FARES: {
            economy: 50,
            comfort: 80,
            bike: 30
        },
        PER_KM_RATE: 20
    },
    ADMIN: {
        EMAIL: 'yaqoobi@gmail.com',
        PASSWORD: 'admin123'
    }
};

// تنظیمات Supabase
const SUPABASE_URL = 'https://ewzgpfpllwhhrjupqyvy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3emdwZnBsbHdoaHJqdXBxeXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NjUzMTIsImV4cCI6MjA4MDQ0MTMxMn0.Us3nf0wOfYD0_aCDc-3Y0PaxsqUKiBvW95no0SkNgiI';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// بقیه کدهای script.js...