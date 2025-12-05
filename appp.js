// توابع کمکی و ابزارهای اضافی

// فرمت کردن اعداد به فارسی
function formatNumber(num) {
    return num.toLocaleString('fa-IR');
}

// فرمت کردن تاریخ به شمسی
function formatDate(date) {
    const options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return new Date(date).toLocaleDateString('fa-IR', options);
}

// محاسبه زمان گذشته از یک تاریخ
function timeAgo(date) {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now - past;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffDay > 0) {
        return `${diffDay} روز پیش`;
    } else if (diffHour > 0) {
        return `${diffHour} ساعت پیش`;
    } else if (diffMin > 0) {
        return `${diffMin} دقیقه پیش`;
    } else {
        return 'همین حالا';
    }
}

// تولید رنگ تصادفی برای آواتار
function getRandomColor() {
    const colors = [
        '#00D474', // سبز اسنپ
        '#6C63FF', // بنفش
        '#FF6584', // صورتی
        '#FFB74D', // نارنجی
        '#4FC3F7', // آبی
        '#9575CD', // بنفش روشن
        '#4DB6AC', // فیروزه‌ای
        '#FF8A65', // نارنجی روشن
        '#7986CB', // آبی بنفش
        '#A1887F'  // قهوه‌ای
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// ایجاد گرادیانت برای آواتار
function getAvatarGradient(letter) {
    const gradients = [
        'linear-gradient(135deg, #00D474 0%, #6C63FF 100%)',
        'linear-gradient(135deg, #FF6584 0%, #FF9A9E 100%)',
        'linear-gradient(135deg, #4FC3F7 0%, #0288D1 100%)',
        'linear-gradient(135deg, #FFB74D 0%, #FF9800 100%)',
        'linear-gradient(135deg, #9575CD 0%, #673AB7 100%)'
    ];
    
    // استفاده از کد اسکی حرف برای انتخاب گرادیانت
    const index = letter.charCodeAt(0) % gradients.length;
    return gradients[index];
}

// ایجاد آواتار اولیه
function createAvatar(name, size = 100) {
    const firstLetter = name.charAt(0).toUpperCase();
    const gradient = getAvatarGradient(firstLetter);
    
    return {
        letter: firstLetter,
        gradient: gradient,
        size: size
    };
}

// نمایش آواتار در المان
function renderAvatar(elementId, name, size = 100) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const avatar = createAvatar(name, size);
    element.textContent = avatar.letter;
    element.style.background = avatar.gradient;
    element.style.width = `${size}px`;
    element.style.height = `${size}px`;
    element.style.fontSize = `${size * 0.4}px`;
}

// اعتبارسنجی شماره تلفن افغانستان
function validateAfghanPhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    
    // شماره‌های افغانستان معمولاً با ۰۷ شروع می‌شوند
    if (cleaned.length !== 10 && cleaned.length !== 9) {
        return false;
    }
    
    // بررسی شروع با ۷ یا ۰۷
    if (!cleaned.match(/^(7|07)/)) {
        return false;
    }
    
    return true;
}

// فرمت کردن شماره تلفن
function formatPhoneNumber(phone) {
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.length === 10 && cleaned.startsWith('07')) {
        return `0${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
    } else if (cleaned.length === 9 && cleaned.startsWith('7')) {
        return `07${cleaned.slice(0, 2)} ${cleaned.slice(2, 5)} ${cleaned.slice(5)}`;
    }
    
    return phone;
}

// محاسبه زمان تخمینی رسیدن
function calculateETA(distanceKm, trafficFactor = 1) {
    // سرعت متوسط: 30 کیلومتر در ساعت در ترافیک عادی
    const averageSpeed = 30; // km/h
    const timeHours = distanceKm / averageSpeed * trafficFactor;
    const timeMinutes = Math.ceil(timeHours * 60);
    
    // حداقل ۲ دقیقه
    return Math.max(2, timeMinutes);
}

// تولید کد تخفیف تصادفی
function generateDiscountCode(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return code;
}

// ذخیره در localStorage
function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error('Error saving to localStorage:', error);
        return false;
    }
}

// خواندن از localStorage
function loadFromLocalStorage(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('Error loading from localStorage:', error);
        return null;
    }
}

// حذف از localStorage
function removeFromLocalStorage(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.error('Error removing from localStorage:', error);
        return false;
    }
}

// بررسی پشتیبانی از geolocation
function checkGeolocationSupport() {
    return 'geolocation' in navigator;
}

// دریافت موقعیت کاربر
function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!checkGeolocationSupport()) {
            reject(new Error('مرورگر شما از موقعیت‌یابی پشتیبانی نمی‌کند'));
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}

// تبدیل درجه به رادیان
function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// محاسبه فاصله بین دو نقطه جغرافیایی (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // شعاع زمین به کیلومتر
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // مسافت به کیلومتر
    
    return distance;
}

// تابع debounce برای کاهش فراخوانی‌های مکرر
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// تابع throttle برای محدود کردن نرخ فراخوانی
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// تولید شناسه منحصر به فرد
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// کپی متن به کلیپ‌بورد
function copyToClipboard(text) {
    return new Promise((resolve, reject) => {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text)
                .then(resolve)
                .catch(reject);
        } else {
            // روش قدیمی برای مرورگرهای قدیمی
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                document.execCommand('copy');
                resolve();
            } catch (error) {
                reject(error);
            }
            
            textArea.remove();
        }
    });
}

// بارگذاری تصویر
function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

// اعتبارسنجی ایمیل
function validateEmail(email) {
    const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

// اعتبارسنجی نام کامل
function validateFullName(name) {
    return name.trim().length >= 2 && name.trim().split(' ').length >= 2;
}

// صادر کردن توابع
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatNumber,
        formatDate,
        timeAgo,
        getRandomColor,
        getAvatarGradient,
        createAvatar,
        renderAvatar,
        validateAfghanPhone,
        formatPhoneNumber,
        calculateETA,
        generateDiscountCode,
        saveToLocalStorage,
        loadFromLocalStorage,
        removeFromLocalStorage,
        checkGeolocationSupport,
        getUserLocation,
        calculateDistance,
        debounce,
        throttle,
        generateUniqueId,
        copyToClipboard,
        loadImage,
        validateEmail,
        validateFullName
    };
} else {
    window.utils = {
        formatNumber,
        formatDate,
        timeAgo,
        getRandomColor,
        getAvatarGradient,
        createAvatar,
        renderAvatar,
        validateAfghanPhone,
        formatPhoneNumber,
        calculateETA,
        generateDiscountCode,
        saveToLocalStorage,
        loadFromLocalStorage,
        removeFromLocalStorage,
        checkGeolocationSupport,
        getUserLocation,
        calculateDistance,
        debounce,
        throttle,
        generateUniqueId,
        copyToClipboard,
        loadImage,
        validateEmail,
        validateFullName
    };
}