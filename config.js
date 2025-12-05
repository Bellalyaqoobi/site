// Configuration for Snapp Afghanistan System
const CONFIG = {
    MAP: {
        CENTER: [34.5553, 69.2075],
        ZOOM: 12,
        TILE_LAYER: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ATTRIBUTION: '© OpenStreetMap contributors'
    },
    
    PRICING: {
        BASE_FARES: {
            economy: 50,
            comfort: 80,
            bike: 30
        },
        PER_KM_RATE: 20,
        PER_MINUTE_RATE: 5,
        MINIMUM_FARE: 70
    },
    
    ADMIN: {
        EMAIL: 'yaqoobi@gmail.com',
        DEFAULT_PASSWORD: 'admin123'
    },
    
    SYSTEM: {
        AUTO_APPROVE_DRIVERS: false,
        AUTO_APPROVE_USERS: false,
        DEFAULT_USER_STATUS: 'pending',
        DEFAULT_DRIVER_STATUS: 'pending',
        MAX_RETRY_ATTEMPTS: 3
    },
    
    DRIVERS: {
        MIN_RATING: 3.0,
        MAX_ACTIVE_TRIPS: 1,
        ONLINE_STATUS_TIMEOUT: 300
    },
    
    DISCOUNTS: {
        DEFAULT_EXPIRY_DAYS: 30,
        MAX_PERCENTAGE: 100,
        MIN_ORDER_AMOUNT: 0
    },
    
    NOTIFICATIONS: {
        DEFAULT_DURATION: 5000,
        POSITION: 'top-right',
        MAX_STACK: 5
    }
};

window.CONFIG = CONFIG;