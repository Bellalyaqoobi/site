// ============================================
// متغیرهای عمومی و حالت‌های برنامه
// ============================================

let currentUser = null;
let currentTrip = null;
let map = null;
let userMarker = null;
let driverMarker = null;
let routeLayer = null;
let drivers = [];
let activeRideSearch = null;
let trackingInterval = null;
let currentRideType = 'economy';

// ============================================
// توابع مقداردهی اولیه
// ============================================

// تابع اصلی برای شروع برنامه
document.addEventListener('DOMContentLoaded', function() {
    console.log('اسنپ افغانستان بارگذاری شد');
    
    // بررسی وضعیت ورود کاربر
    checkAuthStatus();
    
    // راه‌اندازی نقشه
    initMap();
    
    // بارگذاری داده‌های اولیه
    loadInitialData();
    
    // راه‌اندازی رویدادها
    setupEventListeners();
    
    // نمایش مناطق کابل
    loadKabulDistricts();
    
    // بارگذاری مقاصد پرطرفدار
    loadPopularDestinations();
    
    // بارگذاری سفرهای کاربر (اگر وارد شده باشد)
    if (currentUser) {
        loadMyTrips();
    }
});

// ============================================
// توابع احراز هویت
// ============================================

// بررسی وضعیت ورود کاربر
async function checkAuthStatus() {
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        if (data.session) {
            currentUser = data.session.user;
            await loadUserProfile();
            showAppContent();
        } else {
            showWelcomePage();
        }
    } catch (error) {
        console.error('خطا در بررسی وضعیت ورود:', error);
        showWelcomePage();
    }
}

// بارگذاری پروفایل کاربر
async function loadUserProfile() {
    if (!currentUser) return;
    
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', currentUser.id)
            .single();
            
        if (error) throw error;
        
        // نمایش اطلاعات کاربر در هدر
        updateUserHeader(data);
        
        // نمایش دکمه پنل مدیریت برای ادمین‌ها
        if (data.role === 'admin') {
            document.getElementById('adminLink').style.display = 'block';
            document.getElementById('mobileAdminLink').style.display = 'block';
        }
        
        // بارگذاری اطلاعات پروفایل
        if (document.getElementById('profile-page').classList.contains('active')) {
            loadProfileData(data);
        }
        
    } catch (error) {
        console.error('خطا در بارگذاری پروفایل کاربر:', error);
    }
}

// نمایش صفحه خوشآمدگویی
function showWelcomePage() {
    document.getElementById('welcome-page').style.display = 'block';
    document.getElementById('main-header').style.display = 'none';
    document.getElementById('main-container').style.display = 'none';
    document.getElementById('main-footer').style.display = 'none';
}

// نمایش محتوای اصلی برنامه
function showAppContent() {
    document.getElementById('welcome-page').style.display = 'none';
    document.getElementById('main-header').style.display = 'flex';
    document.getElementById('main-container').style.display = 'block';
    document.getElementById('main-footer').style.display = 'block';
}

// بروزرسانی هدر کاربر
function updateUserHeader(userData) {
    const userName = userData.full_name || userData.email;
    const userInitial = userName.charAt(0);
    
    document.getElementById('userAvatar').textContent = userInitial;
    document.getElementById('userName').textContent = userName;
    document.getElementById('userProfile').style.display = 'flex';
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'block';
    document.getElementById('mobileLoginBtn').style.display = 'none';
    document.getElementById('mobileLogoutBtn').style.display = 'block';
}

// ============================================
// توابع نقشه
// ============================================

// راه‌اندازی نقشه
function initMap() {
    // مختصات مرکز کابل
    const kabulCenter = [34.5553, 69.2075];
    
    // ایجاد نقشه
    map = L.map('map').setView(kabulCenter, 12);
    
    // افزودن لایه نقشه
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);
    
    // افزودن نشانگر موقعیت کاربر
    addUserLocationMarker(kabulCenter);
    
    // افزودن رانندگان نمونه
    addSampleDrivers();
}

// افزودن نشانگر موقعیت کاربر
function addUserLocationMarker(position) {
    if (userMarker) {
        map.removeLayer(userMarker);
    }
    
    userMarker = L.marker(position, {
        icon: L.divIcon({
            className: 'user-marker',
            html: '<div class="marker-icon user-marker-icon"><i class="fas fa-user"></i></div>',
            iconSize: [40, 40]
        })
    }).addTo(map);
    
    // نمایش بالون اطلاعات
    userMarker.bindPopup('موقعیت شما').openPopup();
}

// افزودن رانندگان نمونه
function addSampleDrivers() {
    // پاک کردن رانندگان قبلی
    drivers.forEach(driver => {
        if (driver.marker) {
            map.removeLayer(driver.marker);
        }
    });
    
    drivers = [];
    
    // موقعیت‌های تصادفی برای رانندگان در کابل
    const driverPositions = [
        { lat: 34.5153, lng: 69.1585, type: 'car', status: 'available' },
        { lat: 34.5253, lng: 69.1785, type: 'car', status: 'busy' },
        { lat: 34.5353, lng: 69.1985, type: 'bike', status: 'available' },
        { lat: 34.5453, lng: 69.2185, type: 'car', status: 'available' },
        { lat: 34.5553, lng: 69.2385, type: 'car', status: 'available' },
        { lat: 34.5653, lng: 69.2585, type: 'bike', status: 'available' },
        { lat: 34.5753, lng: 69.2785, type: 'car', status: 'busy' }
    ];
    
    driverPositions.forEach((pos, index) => {
        const driver = {
            id: `driver_${index + 1}`,
            name: `راننده ${index + 1}`,
            position: [pos.lat, pos.lng],
            type: pos.type,
            status: pos.status,
            rating: (Math.random() * 0.5 + 4.5).toFixed(1), // امتیاز بین 4.5 تا 5
            carModel: pos.type === 'car' ? 'تویوتا کورولا' : 'هوندا CBR',
            plateNumber: `کابل ${Math.floor(1000 + Math.random() * 9000)}`,
            color: pos.type === 'car' ? 'سفید' : 'قرمز'
        };
        
        // ایجاد آیکون بر اساس نوع وسیله
        const iconClass = pos.type === 'bike' ? 'bike-marker-icon' : 'car-marker-icon';
        const iconFa = pos.type === 'bike' ? 'fa-motorcycle' : 'fa-car';
        
        driver.marker = L.marker(driver.position, {
            icon: L.divIcon({
                className: 'driver-marker',
                html: `<div class="marker-icon ${iconClass}"><i class="fas ${iconFa}"></i></div>`,
                iconSize: [40, 40]
            })
        }).addTo(map);
        
        // اطلاعات راننده در بالون
        const popupContent = `
            <div style="padding: 10px;">
                <strong>${driver.name}</strong><br>
                امتیاز: ${driver.rating} ⭐<br>
                وضعیت: ${driver.status === 'available' ? 'آماده' : 'مشغول'}<br>
                نوع: ${driver.type === 'car' ? 'خودرو' : 'موتور'}
            </div>
        `;
        
        driver.marker.bindPopup(popupContent);
        drivers.push(driver);
    });
}

// ترسیم مسیر بین دو نقطه
function drawRoute(start, end) {
    // پاک کردن مسیر قبلی
    if (routeLayer) {
        map.removeLayer(routeLayer);
    }
    
    // استفاده از خط مستقیم (در نسخه واقعی از سرویس مسیریابی استفاده کنید)
    routeLayer = L.polyline([start, end], {
        color: '#4CAF50',
        weight: 4,
        opacity: 0.7,
        dashArray: '10, 10'
    }).addTo(map);
    
    // تنظیم محدوده نقشه برای نمایش کل مسیر
    map.fitBounds([start, end], { padding: [50, 50] });
}

// ============================================
// توابع بارگذاری داده‌ها
// ============================================

// بارگذاری داده‌های اولیه
function loadInitialData() {
    if (!currentUser) return;
    
    // بارگذاری سفرهای کاربر
    loadMyTrips();
    
    // بارگذاری تخفیف‌ها
    loadDiscounts();
    
    // بارگذاری داده‌های پنل مدیریت (اگر ادمین باشد)
    if (document.getElementById('adminLink').style.display === 'block') {
        loadAdminData();
    }
}

// بارگذاری مناطق کابل
function loadKabulDistricts() {
    const districts = [
        { name: 'وزیر اکبرخان', color: '#FF6B6B' },
        { name: 'شهر نو', color: '#4ECDC4' },
        { name: 'کارته سخی', color: '#45B7D1' },
        { name: 'کارته ۴', color: '#96CEB4' },
        { name: 'ده افغانان', color: '#FFEAA7' },
        { name: 'پغمان', color: '#DDA0DD' },
        { name: 'چمن‌حوزوری', color: '#98D8C8' },
        { name: 'قلعه فتح‌الله', color: '#F7DC6F' },
        { name: 'مکروریان', color: '#BB8FCE' },
        { name: 'پل چرخی', color: '#82E0AA' },
        { name: 'کارته پروان', color: '#F8C471' },
        { name: 'دشت برچی', color: '#85C1E9' }
    ];
    
    const districtsGrid = document.getElementById('districtsGrid');
    districtsGrid.innerHTML = '';
    
    districts.forEach(district => {
        const districtElement = document.createElement('div');
        districtElement.className = 'district-card';
        districtElement.innerHTML = `
            <div class="district-color" style="background-color: ${district.color};"></div>
            <div class="district-name">${district.name}</div>
        `;
        
        // رویداد کلیک برای انتخاب منطقه
        districtElement.addEventListener('click', function() {
            showNotification(`منطقه ${district.name} انتخاب شد`, 'info');
            
            // اگر مقصد خالی بود، این منطقه را به عنوان مقصد قرار بده
            const destinationInput = document.getElementById('destination');
            if (!destinationInput.value.trim()) {
                destinationInput.value = district.name + '، کابل';
                calculateTripPrice();
            }
        });
        
        districtsGrid.appendChild(districtElement);
    });
}

// بارگذاری مقاصد پرطرفدار
function loadPopularDestinations() {
    const destinations = [
        { name: 'فرودگاه بین‌المللی کابل', icon: 'fa-plane', time: '20 دقیقه' },
        { name: 'سینما پامیر', icon: 'fa-film', time: '15 دقیقه' },
        { name: 'باغ وحش کابل', icon: 'fa-paw', time: '25 دقیقه' },
        { name: 'بازار شاه‌دوست', icon: 'fa-shopping-bag', time: '10 دقیقه' },
        { name: 'بیمارستان علی‌آباد', icon: 'fa-hospital', time: '18 دقیقه' },
        { name: 'دانشگاه کابل', icon: 'fa-graduation-cap', time: '22 دقیقه' },
        { name: 'وزارت امور خارجه', icon: 'fa-landmark', time: '12 دقیقه' },
        { name: 'هتل انترکانتیننتال', icon: 'fa-hotel', time: '30 دقیقه' }
    ];
    
    const suggestionsList = document.getElementById('suggestionsList');
    suggestionsList.innerHTML = '';
    
    destinations.forEach(destination => {
        const suggestionElement = document.createElement('div');
        suggestionElement.className = 'suggestion-card';
        suggestionElement.innerHTML = `
            <div class="suggestion-icon">
                <i class="fas ${destination.icon}"></i>
            </div>
            <div class="suggestion-details">
                <h4>${destination.name}</h4>
                <p>حدود ${destination.time} با خودرو</p>
            </div>
            <button class="suggestion-select">
                <i class="fas fa-arrow-left"></i>
            </button>
        `;
        
        // رویداد انتخاب مقصد
        suggestionElement.querySelector('.suggestion-select').addEventListener('click', function() {
            document.getElementById('destination').value = destination.name;
            calculateTripPrice();
            showNotification(`مقصد "${destination.name}" انتخاب شد`, 'success');
        });
        
        suggestionsList.appendChild(suggestionElement);
    });
}

// بارگذاری سفرهای کاربر
async function loadMyTrips() {
    if (!currentUser) return;
    
    try {
        const { data, error } = await supabase
            .from('trips')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(20);
            
        if (error) throw error;
        
        displayMyTrips(data || []);
    } catch (error) {
        console.error('خطا در بارگذاری سفرها:', error);
        showNotification('خطا در بارگذاری سفرها', 'error');
    }
}

// نمایش سفرهای کاربر
function displayMyTrips(trips) {
    const tripsTable = document.getElementById('myTripsTable');
    
    if (trips.length === 0) {
        tripsTable.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 30px; color: var(--gray);">
                    <i class="fas fa-history" style="font-size: 48px; margin-bottom: 20px;"></i>
                    <p>هنوز سفری ثبت نکرده‌اید</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tripsTable.innerHTML = '';
    
    trips.forEach(trip => {
        const row = document.createElement('tr');
        
        // فرمت تاریخ
        const date = new Date(trip.created_at);
        const formattedDate = date.toLocaleDateString('fa-IR');
        const formattedTime = date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
        
        // وضعیت سفر
        let statusBadge = '';
        switch(trip.status) {
            case 'completed':
                statusBadge = '<span class="status-badge status-completed">تکمیل شده</span>';
                break;
            case 'cancelled':
                statusBadge = '<span class="status-badge status-cancelled">لغو شده</span>';
                break;
            case 'in_progress':
                statusBadge = '<span class="status-badge status-in-progress">در حال سفر</span>';
                break;
            default:
                statusBadge = '<span class="status-badge status-pending">در انتظار</span>';
        }
        
        row.innerHTML = `
            <td>${formattedDate}<br><small>${formattedTime}</small></td>
            <td>${trip.pickup_address || '--'}</td>
            <td>${trip.destination_address || '--'}</td>
            <td>${getRideTypeName(trip.ride_type)}</td>
            <td>${trip.distance ? trip.distance.toFixed(1) + ' کیلومتر' : '--'}</td>
            <td>${trip.fare ? trip.fare.toLocaleString('fa-IR') + ' افغانی' : '--'}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="table-action view-trip" data-id="${trip.id}">
                    <i class="fas fa-eye"></i>
                </button>
                ${trip.status === 'completed' && !trip.rating ? 
                    `<button class="table-action rate-trip" data-id="${trip.id}">
                        <i class="fas fa-star"></i>
                    </button>` : ''
                }
            </td>
        `;
        
        tripsTable.appendChild(row);
    });
    
    // اضافه کردن رویدادها برای دکمه‌های عملیات
    document.querySelectorAll('.view-trip').forEach(btn => {
        btn.addEventListener('click', function() {
            const tripId = this.getAttribute('data-id');
            viewTripDetails(tripId);
        });
    });
    
    document.querySelectorAll('.rate-trip').forEach(btn => {
        btn.addEventListener('click', function() {
            const tripId = this.getAttribute('data-id');
            showRatingModal(tripId);
        });
    });
}

// بارگذاری تخفیف‌ها
async function loadDiscounts() {
    try {
        const { data, error } = await supabase
            .from('discounts')
            .select('*')
            .eq('is_active', true)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        displayDiscounts(data || []);
    } catch (error) {
        console.error('خطا در بارگذاری تخفیف‌ها:', error);
    }
}

// نمایش تخفیف‌ها
function displayDiscounts(discounts) {
    const discountsList = document.getElementById('discountsList');
    
    if (discounts.length === 0) {
        discountsList.innerHTML = `
            <div style="text-align: center; padding: 50px; color: var(--gray);">
                <i class="fas fa-gift" style="font-size: 48px; margin-bottom: 20px;"></i>
                <p>در حال حاضر تخفیف فعالی وجود ندارد</p>
            </div>
        `;
        return;
    }
    
    discountsList.innerHTML = '';
    
    discounts.forEach(discount => {
        const discountElement = document.createElement('div');
        discountElement.className = 'discount-card';
        
        // تاریخ انقضا
        const expiresDate = new Date(discount.expires_at);
        const formattedDate = expiresDate.toLocaleDateString('fa-IR');
        
        discountElement.innerHTML = `
            <div class="discount-header">
                <div class="discount-code">${discount.code}</div>
                <div class="discount-value">${discount.discount_percent}% تخفیف</div>
            </div>
            <div class="discount-body">
                <p>${discount.description || 'تخفیف ویژه اسنپ افغانستان'}</p>
                <div class="discount-meta">
                    <span><i class="fas fa-calendar"></i> انقضا: ${formattedDate}</span>
                    <span><i class="fas fa-users"></i> ${discount.used_count || 0} استفاده</span>
                </div>
            </div>
            <div class="discount-footer">
                <button class="btn btn-outline copy-discount" data-code="${discount.code}">
                    <i class="fas fa-copy"></i> کپی کد
                </button>
                <button class="btn btn-primary use-discount" data-code="${discount.code}">
                    استفاده
                </button>
            </div>
        `;
        
        discountsList.appendChild(discountElement);
    });
    
    // رویداد کپی کردن کد تخفیف
    document.querySelectorAll('.copy-discount').forEach(btn => {
        btn.addEventListener('click', function() {
            const code = this.getAttribute('data-code');
            navigator.clipboard.writeText(code).then(() => {
                showNotification('کد تخفیف در کلیپ‌بورد کپی شد', 'success');
            });
        });
    });
    
    // رویداد استفاده از تخفیف
    document.querySelectorAll('.use-discount').forEach(btn => {
        btn.addEventListener('click', function() {
            const code = this.getAttribute('data-code');
            applyDiscountCode(code);
        });
    });
}

// ============================================
// توابع درخواست سفر
// ============================================

// محاسبه قیمت سفر
function calculateTripPrice() {
    const pickup = document.getElementById('pickup').value.trim();
    const destination = document.getElementById('destination').value.trim();
    
    if (!pickup || !destination) {
        hideTripCalculator();
        return;
    }
    
    // نمایش ماشین حساب سفر
    document.getElementById('tripCalculator').style.display = 'block';
    
    // محاسبه مسافت تصادفی (بین 2 تا 15 کیلومتر)
    const distance = (Math.random() * 13 + 2).toFixed(1);
    
    // قیمت پایه بر اساس نوع سفر
    const rideTypeElement = document.querySelector('.ride-type.selected');
    const baseFare = parseInt(rideTypeElement.getAttribute('data-base-fare'));
    
    // کرایه مسافت (هر کیلومتر 20 افغانی برای خودرو، 10 افغانی برای موتور)
    const perKmRate = rideTypeElement.classList.contains('bike') ? 10 : 20;
    const distanceFare = Math.floor(distance * perKmRate);
    
    // کرایه نهایی
    const totalFare = baseFare + distanceFare;
    
    // به‌روزرسانی نمایش
    document.getElementById('distanceValue').textContent = distance + ' کیلومتر';
    document.getElementById('baseFareValue').textContent = baseFare.toLocaleString('fa-IR') + ' افغانی';
    document.getElementById('distanceFareValue').textContent = distanceFare.toLocaleString('fa-IR') + ' افغانی';
    document.getElementById('totalFareValue').textContent = totalFare.toLocaleString('fa-IR') + ' افغانی';
    
    // به‌روزرسانی قیمت در انتخاب نوع سفر
    document.getElementById(`${currentRideType}Price`).textContent = totalFare.toLocaleString('fa-IR') + ' افغانی';
}

// مخفی کردن ماشین حساب سفر
function hideTripCalculator() {
    document.getElementById('tripCalculator').style.display = 'none';
}

// ارسال درخواست سفر
async function submitRideRequest(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showNotification('لطفاً ابتدا وارد شوید', 'warning');
        showAuthModal();
        return;
    }
    
    const pickup = document.getElementById('pickup').value.trim();
    const destination = document.getElementById('destination').value.trim();
    
    if (!pickup || !destination) {
        showNotification('لطفاً مبدا و مقصد را وارد کنید', 'warning');
        return;
    }
    
    // محاسبه مجدد قیمت
    calculateTripPrice();
    const totalFare = parseInt(document.getElementById('totalFareValue').textContent.replace(/[^0-9]/g, ''));
    
    // روش پرداخت
    const paymentMethod = document.querySelector('.payment-method.selected').getAttribute('data-method');
    
    // ذخیره اطلاعات سفر فعلی
    currentTrip = {
        pickup,
        destination,
        type: currentRideType,
        fare: totalFare,
        paymentMethod,
        distance: parseFloat(document.getElementById('distanceValue').textContent),
        status: 'searching',
        createdAt: new Date()
    };
    
    // نمایش وضعیت جستجو
    showSearchingOverlay();
    
    // شبیه‌سازی جستجوی راننده
    activeRideSearch = setTimeout(() => {
        findAvailableDriver();
    }, 3000); // 3 ثانیه شبیه‌سازی جستجو
}

// نمایش وضعیت جستجو
function showSearchingOverlay() {
    const overlay = document.getElementById('searchingOverlay');
    overlay.style.display = 'flex';
    
    // متنی که تغییر می‌کند
    const texts = [
        'در حال یافتن نزدیکترین راننده...',
        'بررسی موقعیت رانندگان...',
        'راننده مناسب در حال پیدا شدن است...'
    ];
    
    let index = 0;
    const textElement = document.getElementById('searchingText');
    
    const textInterval = setInterval(() => {
        index = (index + 1) % texts.length;
        textElement.textContent = texts[index];
    }, 2000);
    
    // ذخیره interval برای پاک کردن بعداً
    overlay.textInterval = textInterval;
}

// مخفی کردن وضعیت جستجو
function hideSearchingOverlay() {
    const overlay = document.getElementById('searchingOverlay');
    overlay.style.display = 'none';
    
    if (overlay.textInterval) {
        clearInterval(overlay.textInterval);
    }
}

// یافتن راننده موجود
function findAvailableDriver() {
    hideSearchingOverlay();
    
    // یافتن راننده مناسب
    const availableDrivers = drivers.filter(driver => 
        driver.status === 'available' && 
        driver.type === (currentTrip.type === 'bike' ? 'bike' : 'car')
    );
    
    if (availableDrivers.length === 0) {
        showNotification('راننده‌ای یافت نشد. لطفاً دوباره تلاش کنید', 'error');
        return;
    }
    
    // انتخاب تصادفی یک راننده
    const selectedDriver = availableDrivers[Math.floor(Math.random() * availableDrivers.length)];
    
    // به‌روزرسانی راننده برای ردیابی
    selectedDriver.status = 'busy';
    currentTrip.driver = selectedDriver;
    
    // نمایش مدال راننده
    showDriverModal(selectedDriver);
    
    // ترسیم مسیر
    const userPos = userMarker.getLatLng();
    drawRoute(userPos, selectedDriver.position);
    
    // شبیه‌سازی حرکت راننده به سمت کاربر
    simulateDriverMovement(selectedDriver, userPos);
}

// نمایش مدال راننده پیدا شده
function showDriverModal(driver) {
    const modal = document.getElementById('driverModal');
    const driverAvatar = document.getElementById('driverAvatar');
    const driverName = document.getElementById('driverName');
    const driverRating = document.getElementById('driverRating');
    const driverTrips = document.getElementById('driverTrips');
    const carModel = document.getElementById('carModel');
    const carColor = document.getElementById('carColor');
    const plateNumber = document.getElementById('plateNumber');
    const eta = document.getElementById('eta');
    const distance = document.getElementById('distance');
    const price = document.getElementById('price');
    
    // پر کردن اطلاعات
    driverAvatar.textContent = driver.name.charAt(0);
    driverName.textContent = driver.name;
    driverRating.textContent = driver.rating;
    driverTrips.textContent = `(${Math.floor(Math.random() * 200 + 50)} سفر)`;
    carModel.textContent = driver.carModel;
    carColor.textContent = driver.color;
    plateNumber.textContent = driver.plateNumber;
    
    // اطلاعات سفر
    eta.textContent = '۴ دقیقه';
    distance.textContent = currentTrip.distance + ' کیلومتر';
    price.textContent = currentTrip.fare.toLocaleString('fa-IR') + ' افغانی';
    
    // نمایش مدال
    modal.style.display = 'block';
}

// شبیه‌سازی حرکت راننده
function simulateDriverMovement(driver, destination) {
    const startPos = driver.position;
    const steps = 100;
    let currentStep = 0;
    
    // حرکت راننده روی نقشه
    const moveInterval = setInterval(() => {
        if (currentStep >= steps) {
            clearInterval(moveInterval);
            return;
        }
        
        currentStep++;
        
        // محاسبه موقعیت جدید
        const lat = startPos[0] + (destination.lat - startPos[0]) * (currentStep / steps);
        const lng = startPos[1] + (destination.lng - startPos[1]) * (currentStep / steps);
        
        // به‌روزرسانی موقعیت راننده
        if (driver.marker) {
            map.removeLayer(driver.marker);
        }
        
        driver.marker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'driver-marker',
                html: `<div class="marker-icon ${driver.type === 'bike' ? 'bike-marker-icon' : 'car-marker-icon'}">
                          <i class="fas ${driver.type === 'bike' ? 'fa-motorcycle' : 'fa-car'}"></i>
                       </div>`,
                iconSize: [40, 40]
            })
        }).addTo(map);
        
        // به‌روزرسانی موقعیت در مدال ردیابی
        updateLiveTracking(currentStep, steps, driver);
        
    }, 200); // هر 200 میلی‌ثانیه یک قدم
}

// ============================================
// توابع ردیابی زنده
// ============================================

// نمایش ردیابی زنده
function showLiveTracking() {
    document.getElementById('liveTracking').style.display = 'block';
    
    // شروع ردیابی
    startTracking();
}

// شروع ردیابی
function startTracking() {
    const trackingDriverName = document.getElementById('trackingDriverName');
    const trackingETA = document.getElementById('trackingETA');
    const trackingDistance = document.getElementById('trackingDistance');
    const trackingProgress = document.getElementById('trackingProgress');
    
    // مقداردهی اولیه
    if (currentTrip && currentTrip.driver) {
        trackingDriverName.textContent = currentTrip.driver.name;
        trackingETA.textContent = '۴ دقیقه';
        trackingDistance.textContent = currentTrip.distance + ' کیلومتر';
        trackingProgress.style.width = '0%';
    }
    
    // شبیه‌سازی پیشرفت
    let progress = 0;
    trackingInterval = setInterval(() => {
        progress += 2;
        if (progress > 100) {
            progress = 100;
            clearInterval(trackingInterval);
            
            // وقتی راننده رسید
            setTimeout(() => {
                showPaymentModal();
            }, 1000);
        }
        
        trackingProgress.style.width = progress + '%';
        
        // به‌روزرسانی زمان باقیمانده
        const remainingTime = Math.max(0, 4 - Math.floor(progress / 25));
        trackingETA.textContent = remainingTime + ' دقیقه';
        
    }, 1000);
}

// به‌روزرسانی ردیابی زنده
function updateLiveTracking(currentStep, totalSteps, driver) {
    const progress = Math.floor((currentStep / totalSteps) * 100);
    
    if (document.getElementById('liveTracking').style.display === 'block') {
        document.getElementById('trackingProgress').style.width = progress + '%';
        
        // محاسبه زمان باقیمانده
        const remainingTime = Math.max(1, Math.floor(4 * (100 - progress) / 100));
        document.getElementById('trackingETA').textContent = remainingTime + ' دقیقه';
        
        // به‌روزرسانی نام راننده
        document.getElementById('trackingDriverName').textContent = driver.name;
    }
}

// ============================================
// توابع پرداخت
// ============================================

// نمایش مدال پرداخت
function showPaymentModal() {
    const modal = document.getElementById('paymentModal');
    const paymentDistance = document.getElementById('paymentDistance');
    const paymentPrice = document.getElementById('paymentPrice');
    const walletBalance = document.getElementById('walletBalance');
    
    // پر کردن اطلاعات
    paymentDistance.textContent = currentTrip.distance + ' کیلومتر';
    paymentPrice.textContent = currentTrip.fare.toLocaleString('fa-IR') + ' افغانی';
    
    // شبیه‌سازی موجودی کیف پول
    walletBalance.textContent = (Math.random() * 1000 + 200).toFixed(0);
    
    // نمایش مدال
    modal.style.display = 'block';
    
    // مخفی کردن ردیابی
    document.getElementById('liveTracking').style.display = 'none';
    if (trackingInterval) {
        clearInterval(trackingInterval);
    }
}

// پرداخت سفر
async function processPayment() {
    const paymentMethod = document.querySelector('#paymentModal .payment-method.selected').getAttribute('data-method');
    
    showNotification('پرداخت با موفقیت انجام شد', 'success');
    
    // بستن مدال پرداخت
    document.getElementById('paymentModal').style.display = 'none';
    
    // ذخیره سفر در دیتابیس
    if (currentUser) {
        try {
            const { data, error } = await supabase
                .from('trips')
                .insert([{
                    user_id: currentUser.id,
                    pickup_address: currentTrip.pickup,
                    destination_address: currentTrip.destination,
                    ride_type: currentTrip.type,
                    distance: currentTrip.distance,
                    fare: currentTrip.fare,
                    payment_method: paymentMethod,
                    status: 'completed',
                    driver_name: currentTrip.driver ? currentTrip.driver.name : 'راننده تست',
                    driver_rating: currentTrip.driver ? currentTrip.driver.rating : 4.5
                }]);
                
            if (error) throw error;
            
            // به‌روزرسانی لیست سفرها
            loadMyTrips();
            
            // نمایش مدال امتیازدهی
            setTimeout(() => {
                showRatingModal();
            }, 1500);
            
        } catch (error) {
            console.error('خطا در ذخیره سفر:', error);
            showNotification('سفر با موفقیت انجام شد اما ذخیره اطلاعات با خطا مواجه شد', 'warning');
        }
    }
    
    // ریست کردن فرم
    resetRideForm();
    
    // بازگشت راننده به حالت آماده
    if (currentTrip.driver) {
        currentTrip.driver.status = 'available';
    }
    
    currentTrip = null;
}

// ============================================
// توابع امتیازدهی
// ============================================

// نمایش مدال امتیازدهی
function showRatingModal(tripId) {
    const modal = document.getElementById('ratingModal');
    const ratingDriverAvatar = document.getElementById('ratingDriverAvatar');
    const ratingDriverName = document.getElementById('ratingDriverName');
    
    if (currentTrip && currentTrip.driver) {
        ratingDriverAvatar.textContent = currentTrip.driver.name.charAt(0);
        ratingDriverName.textContent = currentTrip.driver.name;
    } else {
        ratingDriverAvatar.textContent = 'ا';
        ratingDriverName.textContent = 'احمد ظاهر';
    }
    
    // ریست کردن ستاره‌ها
    document.querySelectorAll('.rating-star').forEach(star => {
        star.classList.remove('active');
    });
    
    // نمایش مدال
    modal.style.display = 'block';
}

// ثبت امتیاز
async function submitRating() {
    const stars = document.querySelectorAll('.rating-star.active').length;
    const comment = document.getElementById('ratingComment').value.trim();
    
    if (stars === 0) {
        showNotification('لطفاً امتیاز خود را انتخاب کنید', 'warning');
        return;
    }
    
    // بستن مدال
    document.getElementById('ratingModal').style.display = 'none';
    
    // نمایش پیام موفقیت
    showNotification(`امتیاز ${stars} ستاره شما ثبت شد. سپاس!`, 'success');
    
    // پاک کردن کامنت
    document.getElementById('ratingComment').value = '';
}

// ============================================
// توابع پنل مدیریت
// ============================================

// بارگذاری داده‌های پنل مدیریت
async function loadAdminData() {
    // بارگذاری آمار
    await loadAdminStats();
    
    // بارگذاری کاربران
    await loadAdminUsers();
    
    // بارگذاری رانندگان
    await loadAdminDrivers();
    
    // بارگذاری سفرها
    await loadAdminTrips();
    
    // بارگذاری تخفیف‌ها
    await loadAdminDiscounts();
    
    // بارگذاری تیکت‌های پشتیبانی
    await loadAdminSupportTickets();
}

// بارگذاری آمار پنل مدیریت
async function loadAdminStats() {
    try {
        // شبیه‌سازی داده‌های آمار
        document.getElementById('totalTrips').textContent = '۱,۲۵۴';
        document.getElementById('activeUsers').textContent = '۵۸۹';
        document.getElementById('totalDrivers').textContent = '۱۲۷';
        document.getElementById('totalRevenue').textContent = '۲۵۸,۴۰۰ افغانی';
        
    } catch (error) {
        console.error('خطا در بارگذاری آمار:', error);
    }
}

// بارگذاری کاربران برای پنل مدیریت
async function loadAdminUsers() {
    const pendingUsersTable = document.getElementById('pendingUsersTable');
    const allUsersTable = document.getElementById('allUsersTable');
    
    // داده‌های نمونه
    const sampleUsers = [
        { id: 1, name: 'احمد محمدی', email: 'ahmad@example.com', phone: '۰۷۰۰۱۱۱۲۲۲', role: 'passenger', status: 'approved', created_at: '۱۴۰۲/۱۲/۱۵' },
        { id: 2, name: 'رضا کریمی', email: 'reza@example.com', phone: '۰۷۰۰۲۲۳۳۳', role: 'driver', status: 'pending', created_at: '۱۴۰۳/۰۱/۱۰' },
        { id: 3, name: 'سارا احمدی', email: 'sara@example.com', phone: '۰۷۰۰۳۳۴۴۴', role: 'passenger', status: 'approved', created_at: '۱۴۰۳/۰۱/۲۵' },
        { id: 4, name: 'محمد حسینی', email: 'mohammad@example.com', phone: '۰۷۰۰۴۴۵۵۵', role: 'admin', status: 'approved', created_at: '۱۴۰۲/۱۱/۰۵' },
        { id: 5, name: 'فاطمه رضایی', email: 'fatemeh@example.com', phone: '۰۷۰۰۵۵۶۶۶', role: 'passenger', status: 'rejected', created_at: '۱۴۰۳/۰۲/۰۳' }
    ];
    
    // کاربران در انتظار تایید
    const pendingUsers = sampleUsers.filter(user => user.status === 'pending');
    pendingUsersTable.innerHTML = '';
    
    if (pendingUsers.length === 0) {
        pendingUsersTable.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 30px; color: var(--gray);">
                    کاربری در انتظار تایید وجود ندارد
                </td>
            </tr>
        `;
    } else {
        pendingUsers.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${user.phone}</td>
                <td>${getUserRoleName(user.role)}</td>
                <td>${user.created_at}</td>
                <td>
                    <button class="table-action approve-user" data-id="${user.id}">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="table-action reject-user" data-id="${user.id}">
                        <i class="fas fa-times"></i>
                    </button>
                    <button class="table-action view-user" data-id="${user.id}">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            `;
            pendingUsersTable.appendChild(row);
        });
    }
    
    // همه کاربران
    allUsersTable.innerHTML = '';
    sampleUsers.forEach(user => {
        const row = document.createElement('tr');
        
        let statusBadge = '';
        switch(user.status) {
            case 'approved':
                statusBadge = '<span class="status-badge status-completed">تایید شده</span>';
                break;
            case 'pending':
                statusBadge = '<span class="status-badge status-in-progress">در انتظار</span>';
                break;
            case 'rejected':
                statusBadge = '<span class="status-badge status-cancelled">رد شده</span>';
                break;
        }
        
        row.innerHTML = `
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td>${user.phone}</td>
            <td>${getUserRoleName(user.role)}</td>
            <td>${statusBadge}</td>
            <td>${user.created_at}</td>
            <td>
                <button class="table-action edit-user" data-id="${user.id}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="table-action delete-user" data-id="${user.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        allUsersTable.appendChild(row);
    });
}

// ============================================
// توابع کمکی
// ============================================

// نمایش نوتیفیکیشن
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    
    // تنظیم کلاس نوع
    notification.className = 'notification';
    notification.classList.add(`notification-${type}`);
    
    // تنظیم متن
    notification.innerHTML = `
        <i class="fas ${getNotificationIcon(type)}"></i>
        <span>${message}</span>
    `;
    
    // نمایش
    notification.classList.add('show');
    
    // مخفی کردن بعد از 3 ثانیه
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// دریافت آیکون مناسب برای نوتیفیکیشن
function getNotificationIcon(type) {
    switch(type) {
        case 'success': return 'fa-check-circle';
        case 'error': return 'fa-exclamation-circle';
        case 'warning': return 'fa-exclamation-triangle';
        default: return 'fa-info-circle';
    }
}

// دریافت نام نوع سفر
function getRideTypeName(type) {
    switch(type) {
        case 'economy': return 'اقتصادی';
        case 'comfort': return 'کلاسیک';
        case 'bike': return 'موتور';
        default: return type;
    }
}

// دریافت نام نقش کاربر
function getUserRoleName(role) {
    switch(role) {
        case 'passenger': return 'مسافر';
        case 'driver': return 'راننده';
        case 'admin': return 'مدیر';
        default: return role;
    }
}

// ریست کردن فرم درخواست سفر
function resetRideForm() {
    document.getElementById('rideForm').reset();
    hideTripCalculator();
    
    // ریست کردن انتخاب نوع سفر
    document.querySelectorAll('.ride-type').forEach(type => {
        type.classList.remove('selected');
    });
    document.querySelector('.ride-type.economy').classList.add('selected');
    currentRideType = 'economy';
    
    // ریست کردن نقشه
    if (userMarker) {
        map.setView(userMarker.getLatLng(), 12);
    }
    
    // پاک کردن مسیر
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    
    // پاک کردن نشانگر راننده
    if (driverMarker) {
        map.removeLayer(driverMarker);
        driverMarker = null;
    }
}

// ============================================
// رویدادهای عمومی
// ============================================

// راه‌اندازی رویدادها
function setupEventListeners() {
    // دکمه شروع استفاده در صفحه خوشآمدگویی
    document.getElementById('start-using-btn').addEventListener('click', function() {
        if (!currentUser) {
            showAuthModal();
        } else {
            showAppContent();
        }
    });
    
    // دکمه اطلاعات بیشتر
    document.getElementById('learn-more-btn').addEventListener('click', function() {
        showNotification('اسنپ افغانستان - سرویس تاکسی اینترنتی در سراسر کابل', 'info');
    });
    
    // ناوبری
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const page = this.getAttribute('data-page');
            switchPage(page);
            
            // بستن منوی موبایل
            document.getElementById('mobileMenu').classList.remove('show');
            document.getElementById('overlay').style.display = 'none';
        });
    });
    
    // دکمه ورود/خروج
    document.getElementById('loginBtn').addEventListener('click', showAuthModal);
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('mobileLoginBtn').addEventListener('click', showAuthModal);
    document.getElementById('mobileLogoutBtn').addEventListener('click', logout);
    
    // منوی موبایل
    document.getElementById('hamburger').addEventListener('click', function() {
        document.getElementById('mobileMenu').classList.add('show');
        document.getElementById('overlay').style.display = 'block';
    });
    
    document.getElementById('closeMenu').addEventListener('click', function() {
        document.getElementById('mobileMenu').classList.remove('show');
        document.getElementById('overlay').style.display = 'none';
    });
    
    document.getElementById('overlay').addEventListener('click', function() {
        document.getElementById('mobileMenu').classList.remove('show');
        this.style.display = 'none';
    });
    
    // فرم درخواست سفر
    document.getElementById('rideForm').addEventListener('submit', submitRideRequest);
    
    // انتخاب نوع سفر
    document.querySelectorAll('.ride-type').forEach(type => {
        type.addEventListener('click', function() {
            document.querySelectorAll('.ride-type').forEach(t => t.classList.remove('selected'));
            this.classList.add('selected');
            currentRideType = this.getAttribute('data-type');
            calculateTripPrice();
        });
    });
    
    // جابجایی مبدا و مقصد
    document.getElementById('swapLocations').addEventListener('click', function() {
        const pickup = document.getElementById('pickup');
        const destination = document.getElementById('destination');
        
        const temp = pickup.value;
        pickup.value = destination.value;
        destination.value = temp;
        
        calculateTripPrice();
    });
    
    // محاسبه قیمت هنگام تغییر آدرس
    document.getElementById('pickup').addEventListener('input', calculateTripPrice);
    document.getElementById('destination').addEventListener('input', calculateTripPrice);
    
    // انتخاب روش پرداخت
    document.querySelectorAll('.payment-method').forEach(method => {
        method.addEventListener('click', function() {
            document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('selected'));
            this.classList.add('selected');
        });
    });
    
    // لغو جستجو
    document.getElementById('cancelSearch').addEventListener('click', function() {
        hideSearchingOverlay();
        
        if (activeRideSearch) {
            clearTimeout(activeRideSearch);
            activeRideSearch = null;
        }
        
        showNotification('جستجوی راننده لغو شد', 'warning');
    });
    
    // مدال راننده
    document.getElementById('closeModal').addEventListener('click', function() {
        document.getElementById('driverModal').style.display = 'none';
    });
    
    document.getElementById('cancelRide').addEventListener('click', function() {
        document.getElementById('driverModal').style.display = 'none';
        showNotification('سفر لغو شد', 'warning');
        
        if (currentTrip && currentTrip.driver) {
            currentTrip.driver.status = 'available';
        }
        
        resetRideForm();
    });
    
    document.getElementById('confirmRide').addEventListener('click', function() {
        document.getElementById('driverModal').style.display = 'none';
        showNotification('راننده در راه است', 'success');
        showLiveTracking();
    });
    
    // ردیابی زنده
    document.getElementById('closeTracking').addEventListener('click', function() {
        document.getElementById('liveTracking').style.display = 'none';
        
        if (trackingInterval) {
            clearInterval(trackingInterval);
        }
    });
    
    document.getElementById('cancelTracking').addEventListener('click', function() {
        document.getElementById('liveTracking').style.display = 'none';
        
        if (trackingInterval) {
            clearInterval(trackingInterval);
        }
        
        showNotification('سفر لغو شد', 'warning');
        
        if (currentTrip && currentTrip.driver) {
            currentTrip.driver.status = 'available';
        }
        
        resetRideForm();
    });
    
    // مدال پرداخت
    document.getElementById('closePaymentModal').addEventListener('click', function() {
        document.getElementById('paymentModal').style.display = 'none';
    });
    
    document.getElementById('cancelPayment').addEventListener('click', function() {
        document.getElementById('paymentModal').style.display = 'none';
        showNotification('پرداخت لغو شد', 'warning');
    });
    
    document.getElementById('confirmPayment').addEventListener('click', processPayment);
    
    // انتخاب روش پرداخت در مدال پرداخت
    document.querySelectorAll('#paymentModal .payment-method').forEach(method => {
        method.addEventListener('click', function() {
            document.querySelectorAll('#paymentModal .payment-method').forEach(m => m.classList.remove('selected'));
            this.classList.add('selected');
            
            const method = this.getAttribute('data-method');
            const walletPayment = document.getElementById('walletPayment');
            
            if (method === 'wallet') {
                walletPayment.style.display = 'block';
            } else {
                walletPayment.style.display = 'none';
            }
        });
    });
    
    // مدال امتیازدهی
    document.getElementById('closeRatingModal').addEventListener('click', function() {
        document.getElementById('ratingModal').style.display = 'none';
    });
    
    document.getElementById('submitRating').addEventListener('click', submitRating);
    
    // ستاره‌های امتیازدهی
    document.querySelectorAll('.rating-star').forEach(star => {
        star.addEventListener('click', function() {
            const rating = parseInt(this.getAttribute('data-rating'));
            
            document.querySelectorAll('.rating-star').forEach(s => {
                s.classList.remove('active');
            });
            
            for (let i = 0; i < rating; i++) {
                document.querySelectorAll('.rating-star')[i].classList.add('active');
            }
        });
    });
    
    // پنل مدیریت - تب‌ها
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.admin-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
    
    // دکمه‌های پنل مدیریت
    document.getElementById('refreshUsersBtn')?.addEventListener('click', loadAdminUsers);
    document.getElementById('filterUsersBtn')?.addEventListener('click', function() {
        const filters = document.getElementById('usersFilters');
        filters.style.display = filters.style.display === 'none' ? 'block' : 'none';
    });
    
    // چت پشتیبانی
    document.getElementById('sendMessage').addEventListener('click', function() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (message) {
            const chatMessages = document.getElementById('chatMessages');
            const time = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
            
            const messageElement = document.createElement('div');
            messageElement.className = 'message sent';
            messageElement.innerHTML = `
                ${message}
                <div class="message-time">${time}</div>
            `;
            
            chatMessages.appendChild(messageElement);
            input.value = '';
            
            // اسکرول به پایین
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            // پاسخ خودکار بعد از 1 ثانیه
            setTimeout(() => {
                const responses = [
                    'ممنون از پیام شما. چگونه میتوانم کمک‌کنم؟',
                    'پیام شما دریافت شد. تیم پشتیبانی به زودی با شما تماس می‌گیرد.',
                    'سوال شما را دریافت کردیم. لطفاً شماره تماس خود را وارد کنید.'
                ];
                
                const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                const responseTime = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
                
                const responseElement = document.createElement('div');
                responseElement.className = 'message received';
                responseElement.innerHTML = `
                    ${randomResponse}
                    <div class="message-time">${responseTime}</div>
                `;
                
                chatMessages.appendChild(responseElement);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }, 1000);
        }
    });
    
    // ارسال پیام با Enter
    document.getElementById('chatInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('sendMessage').click();
        }
    });
    
    // نمایش/مخفی کردن رمز عبور
    document.querySelectorAll('.password-toggle').forEach(toggle => {
        toggle.addEventListener('click', function() {
            const input = this.previousElementSibling;
            const icon = this.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        });
    });
}

// ============================================
// توابع احراز هویت و پروفایل
// ============================================

// نمایش مدال احراز هویت
function showAuthModal() {
    const modal = document.getElementById('authModal');
    modal.style.display = 'block';
    
    // ریست کردن فرم‌ها
    document.getElementById('loginForm').reset();
    document.getElementById('registerForm').reset();
    
    // مخفی کردن خطاها
    document.querySelectorAll('.error-message').forEach(el => {
        el.textContent = '';
    });
    
    // تب‌های فرم
    document.querySelectorAll('.form-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            
            document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.form-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
}

// بستن مدال احراز هویت
document.getElementById('closeAuthModal').addEventListener('click', function() {
    document.getElementById('authModal').style.display = 'none';
});

// ورود کاربر
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    // اعتبارسنجی ساده
    if (!email) {
        document.getElementById('loginEmailError').textContent = 'لطفاً ایمیل یا شماره تماس وارد کنید';
        return;
    }
    
    if (!password) {
        document.getElementById('loginPasswordError').textContent = 'لطفاً رمز عبور وارد کنید';
        return;
    }
    
    try {
        // در نسخه واقعی، اینجا با Supabase وارد می‌شویم
        // شبیه‌سازی ورود موفق
        showNotification('ورود موفقیت‌آمیز بود!', 'success');
        
        // بستن مدال
        document.getElementById('authModal').style.display = 'none';
        
        // شبیه‌سازی کاربر
        currentUser = {
            id: 'user_' + Date.now(),
            email: email,
            full_name: 'کاربر تست'
        };
        
        // نمایش محتوای برنامه
        showAppContent();
        loadUserProfile();
        
    } catch (error) {
        console.error('خطا در ورود:', error);
        showNotification('خطا در ورود. لطفاً دوباره تلاش کنید.', 'error');
    }
});

// ثبت‌نام کاربر
document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const phone = document.getElementById('registerPhone').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    const userType = document.getElementById('userType').value;
    
    // اعتبارسنجی
    let isValid = true;
    
    if (!name) {
        document.getElementById('registerNameError').textContent = 'لطفاً نام کامل وارد کنید';
        isValid = false;
    }
    
    if (!email || !email.includes('@')) {
        document.getElementById('registerEmailError').textContent = 'لطفاً ایمیل معتبر وارد کنید';
        isValid = false;
    }
    
    if (!phone || phone.length < 10) {
        document.getElementById('registerPhoneError').textContent = 'لطفاً شماره تماس معتبر وارد کنید';
        isValid = false;
    }
    
    if (!password || password.length < 6) {
        document.getElementById('registerPasswordError').textContent = 'رمز عبور باید حداقل ۶ کاراکتر باشد';
        isValid = false;
    }
    
    if (password !== confirmPassword) {
        document.getElementById('registerConfirmPasswordError').textContent = 'رمز عبور و تکرار آن یکسان نیستند';
        isValid = false;
    }
    
    if (!userType) {
        document.getElementById('userTypeError').textContent = 'لطفاً نوع کاربر را انتخاب کنید';
        isValid = false;
    }
    
    if (!isValid) return;
    
    try {
        // در نسخه واقعی، اینجا ثبت‌نام در Supabase انجام می‌شود
        // شبیه‌سازی ثبت‌نام موفق
        showNotification('ثبت‌نام موفقیت‌آمیز بود!', 'success');
        
        // بستن مدال
        document.getElementById('authModal').style.display = 'none';
        
        // شبیه‌سازی کاربر جدید
        currentUser = {
            id: 'user_' + Date.now(),
            email: email,
            full_name: name,
            phone: phone,
            role: userType
        };
        
        // نمایش محتوای برنامه
        showAppContent();
        loadUserProfile();
        
    } catch (error) {
        console.error('خطا در ثبت‌نام:', error);
        showNotification('خطا در ثبت‌نام. لطفاً دوباره تلاش کنید.', 'error');
    }
});

// خروج کاربر
async function logout() {
    try {
        // در نسخه واقعی، اینجا از Supabase خارج می‌شویم
        currentUser = null;
        showWelcomePage();
        showNotification('با موفقیت خارج شدید', 'success');
    } catch (error) {
        console.error('خطا در خروج:', error);
        showNotification('خطا در خروج', 'error');
    }
}

// ============================================
// توابع تغییر صفحه
// ============================================

function switchPage(pageName) {
    // مخفی کردن همه صفحات
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // غیرفعال کردن همه لینک‌های ناوبری
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // فعال کردن صفحه مورد نظر
    document.getElementById(`${pageName}-page`).classList.add('active');
    
    // فعال کردن لینک مربوطه
    document.querySelectorAll(`.nav-link[data-page="${pageName}"]`).forEach(link => {
        link.classList.add('active');
    });
    
    // بارگذاری داده‌های صفحه
    switch(pageName) {
        case 'my-trips':
            loadMyTrips();
            break;
        case 'discounts':
            loadDiscounts();
            break;
        case 'profile':
            loadProfileData();
            break;
        case 'admin':
            if (currentUser && currentUser.role === 'admin') {
                loadAdminData();
            } else {
                showNotification('دسترسی غیرمجاز', 'error');
                switchPage('home');
            }
            break;
    }
}

// ============================================
// بارگذاری داده‌های پروفایل
// ============================================

async function loadProfileData(userData = null) {
    if (!currentUser) return;
    
    let profileData = userData;
    
    if (!profileData) {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', currentUser.id)
                .single();
                
            if (error) throw error;
            profileData = data;
        } catch (error) {
            console.error('خطا در بارگذاری پروفایل:', error);
            // استفاده از داده‌های پیش‌فرض
            profileData = {
                full_name: currentUser.full_name || 'کاربر',
                email: currentUser.email,
                phone: currentUser.phone || '--',
                role: currentUser.role || 'passenger'
            };
        }
    }
    
    // به‌روزرسانی اطلاعات پروفایل
    document.getElementById('profileName').textContent = profileData.full_name || 'کاربر';
    document.getElementById('profileEmail').textContent = profileData.email;
    document.getElementById('profilePhone').textContent = profileData.phone || '--';
    document.getElementById('profileRole').textContent = getUserRoleName(profileData.role);
    
    const initial = profileData.full_name ? profileData.full_name.charAt(0) : 'ا';
    document.getElementById('profileAvatar').textContent = initial;
    
    // بارگذاری آمار کاربر
    loadUserStats();
    
    // پر کردن فرم ویرایش
    document.getElementById('editName').value = profileData.full_name || '';
    document.getElementById('editEmail').value = profileData.email || '';
    document.getElementById('editPhone').value = profileData.phone || '';
}

// بارگذاری آمار کاربر
async function loadUserStats() {
    try {
        // شبیه‌سازی داده‌های آمار
        document.getElementById('totalTripsCount').textContent = '۱۲';
        document.getElementById('totalSpent').textContent = '۲,۸۵۰ افغانی';
        document.getElementById('userRating').textContent = '۴.۸';
    } catch (error) {
        console.error('خطا در بارگذاری آمار کاربر:', error);
    }
}

// ذخیره تغییرات پروفایل
document.getElementById('saveProfile').addEventListener('click', async function() {
    const name = document.getElementById('editName').value.trim();
    const email = document.getElementById('editEmail').value.trim();
    const phone = document.getElementById('editPhone').value.trim();
    
    if (!name) {
        showNotification('لطفاً نام خود را وارد کنید', 'warning');
        return;
    }
    
    if (!email || !email.includes('@')) {
        showNotification('لطفاً ایمیل معتبر وارد کنید', 'warning');
        return;
    }
    
    // شبیه‌سازی ذخیره
    showNotification('پروفایل با موفقیت به‌روزرسانی شد', 'success');
    
    // به‌روزرسانی نمایش
    if (currentUser) {
        currentUser.full_name = name;
        currentUser.email = email;
        currentUser.phone = phone;
        loadUserProfile();
    }
});

// تغییر رمز عبور
document.getElementById('changePassword').addEventListener('click', function() {
    const currentPass = document.getElementById('currentPassword').value;
    const newPass = document.getElementById('newPassword').value;
    const confirmPass = document.getElementById('confirmNewPassword').value;
    
    if (!currentPass || !newPass || !confirmPass) {
        showNotification('لطفاً تمام فیلدها را پر کنید', 'warning');
        return;
    }
    
    if (newPass.length < 6) {
        showNotification('رمز عبور جدید باید حداقل ۶ کاراکتر باشد', 'warning');
        return;
    }
    
    if (newPass !== confirmPass) {
        showNotification('رمز عبور جدید و تکرار آن یکسان نیستند', 'warning');
        return;
    }
    
    // شبیه‌سازی تغییر رمز
    showNotification('رمز عبور با موفقیت تغییر یافت', 'success');
    
    // پاک کردن فیلدها
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
});

// ============================================
// توابع پنل مدیریت (ادامه)
// ============================================

async function loadAdminDrivers() {
    const driversTable = document.getElementById('driversTable');
    
    // داده‌های نمونه
    const sampleDrivers = [
        { id: 1, name: 'رضا کریمی', phone: '۰۷۰۰۲۲۳۳۳', vehicle_type: 'car', car_model: 'تویوتا کورولا', plate: 'کابل ۱۲۳۴', status: 'available' },
        { id: 2, name: 'احمد ناصری', phone: '۰۷۰۰۳۳۴۴۴', vehicle_type: 'car', car_model: 'هیوندا سوناتا', plate: 'کابل ۵۶۷۸', status: 'busy' },
        { id: 3, name: 'محمد رحیمی', phone: '۰۷۰۰۴۴۵۵۵', vehicle_type: 'bike', car_model: 'هوندا CBR', plate: 'کابل ۹۰۱۲', status: 'available' },
        { id: 4, name: 'حسن محمدی', phone: '۰۷۰۰۵۵۶۶۶', vehicle_type: 'car', car_model: 'سانگ یانگ', plate: 'کابل ۳۴۵۶', status: 'offline' },
        { id: 5, name: 'علی احمدی', phone: '۰۷۰۰۶۶۷۷۷', vehicle_type: 'car', car_model: 'تویوتا پرادو', plate: 'کابل ۷۸۹۰', status: 'available' }
    ];
    
    driversTable.innerHTML = '';
    
    sampleDrivers.forEach(driver => {
        const row = document.createElement('tr');
        
        let statusBadge = '';
        switch(driver.status) {
            case 'available':
                statusBadge = '<span class="status-badge status-completed">آماده به کار</span>';
                break;
            case 'busy':
                statusBadge = '<span class="status-badge status-in-progress">مشغول</span>';
                break;
            case 'offline':
                statusBadge = '<span class="status-badge status-cancelled">آفلاین</span>';
                break;
        }
        
        row.innerHTML = `
            <td>${driver.name}</td>
            <td>${driver.phone}</td>
            <td>${driver.vehicle_type === 'car' ? 'خودرو' : 'موتور'}</td>
            <td>${driver.car_model}</td>
            <td>${driver.plate}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="table-action edit-driver" data-id="${driver.id}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="table-action view-driver" data-id="${driver.id}">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="table-action delete-driver" data-id="${driver.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        driversTable.appendChild(row);
    });
}

async function loadAdminTrips() {
    const adminTripsTable = document.getElementById('adminTripsTable');
    
    // داده‌های نمونه
    const sampleTrips = [
        { id: 1, date: '۱۴۰۳/۰۲/۱۵ ۱۰:۳۰', passenger: 'احمد محمدی', driver: 'رضا کریمی', pickup: 'وزیر اکبرخان', destination: 'فرودگاه کابل', fare: ۲۵۰, status: 'completed' },
        { id: 2, date: '۱۴۰۳/۰۲/۱۵ ۱۱:۱۵', passenger: 'سارا احمدی', driver: 'احمد ناصری', pickup: 'شهر نو', destination: 'بیمارستان علی‌آباد', fare: ۱۸۰, status: 'in_progress' },
        { id: 3, date: '۱۴۰۳/۰۲/۱۴ ۱۴:۲۰', passenger: 'محمد حسینی', driver: 'محمد رحیمی', pickup: 'کارته ۴', destination: 'دانشگاه کابل', fare: ۱۲۰, status: 'completed' },
        { id: 4, date: '۱۴۰۳/۰۲/۱۴ ۱۶:۴۵', passenger: 'فاطمه رضایی', driver: 'حسن محمدی', pickup: 'ده افغانان', destination: 'بازار شاه‌دوست', fare: ۹۰, status: 'cancelled' },
        { id: 5, date: '۱۴۰۳/۰۲/۱۳ ۰۹:۱۰', passenger: 'علی محمدی', driver: 'علی احمدی', pickup: 'پغمان', destination: 'سینما پامیر', fare: ۳۰۰, status: 'completed' }
    ];
    
    adminTripsTable.innerHTML = '';
    
    sampleTrips.forEach(trip => {
        const row = document.createElement('tr');
        
        let statusBadge = '';
        switch(trip.status) {
            case 'completed':
                statusBadge = '<span class="status-badge status-completed">تکمیل شده</span>';
                break;
            case 'in_progress':
                statusBadge = '<span class="status-badge status-in-progress">در حال سفر</span>';
                break;
            case 'cancelled':
                statusBadge = '<span class="status-badge status-cancelled">لغو شده</span>';
                break;
        }
        
        row.innerHTML = `
            <td>${trip.date}</td>
            <td>${trip.passenger}</td>
            <td>${trip.driver}</td>
            <td>${trip.pickup}</td>
            <td>${trip.destination}</td>
            <td>${trip.fare.toLocaleString('fa-IR')} افغانی</td>
            <td>${statusBadge}</td>
            <td>
                <button class="table-action view-trip-admin" data-id="${trip.id}">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="table-action edit-trip" data-id="${trip.id}">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        `;
        adminTripsTable.appendChild(row);
    });
}

async function loadAdminDiscounts() {
    const discountsTable = document.getElementById('discountsTable');
    
    // داده‌های نمونه
    const sampleDiscounts = [
        { id: 1, code: 'WELCOME100', discount_percent: ۲۰, expires_at: '۱۴۰۳/۰۳/۱۵', used_count: ۴۵, status: 'active' },
        { id: 2, code: 'SPRING50', discount_percent: ۱۵, expires_at: '۱۴۰۳/۰۲/۳۰', used_count: ۸۹, status: 'active' },
        { id: 3, code: 'FIRSTRIDE', discount_percent: ۱۰۰, expires_at: '۱۴۰۳/۰۱/۳۱', used_count: ۱۰۰, status: 'exhausted' },
        { id: 4, code: 'WEEKEND30', discount_percent: ۳۰, expires_at: '۱۴۰۳/۰۲/۲۰', used_count: ۶۷, status: 'expired' },
        { id: 5, code: 'REFER20', discount_percent: ۲۰, expires_at: '۱۴۰۳/۰۴/۱۰', used_count: ۲۳, status: 'active' }
    ];
    
    discountsTable.innerHTML = '';
    
    sampleDiscounts.forEach(discount => {
        const row = document.createElement('tr');
        
        let statusBadge = '';
        switch(discount.status) {
            case 'active':
                statusBadge = '<span class="status-badge status-completed">فعال</span>';
                break;
            case 'expired':
                statusBadge = '<span class="status-badge status-cancelled">منقضی شده</span>';
                break;
            case 'exhausted':
                statusBadge = '<span class="status-badge status-in-progress">تمام شده</span>';
                break;
        }
        
        row.innerHTML = `
            <td>${discount.code}</td>
            <td>${discount.discount_percent}%</td>
            <td>${discount.expires_at}</td>
            <td>${discount.used_count} نفر</td>
            <td>${statusBadge}</td>
            <td>
                <button class="table-action edit-discount" data-id="${discount.id}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="table-action delete-discount" data-id="${discount.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        discountsTable.appendChild(row);
    });
}

async function loadAdminSupportTickets() {
    const adminSupportTable = document.getElementById('adminSupportTable');
    
    // داده‌های نمونه
    const sampleTickets = [
        { id: 1, user: 'احمد محمدی', subject: 'مشکل در پرداخت', message: 'پرداخت من انجام نشد اما پول از حسابم کسر شد.', date: '۱۴۰۳/۰۲/۱۵ ۱۰:۳۰', status: 'pending' },
        { id: 2, user: 'سارا احمدی', subject: 'درخواست بازگشت وجه', message: 'سفر من لغو شد اما هزینه برگشت داده نشد.', date: '۱۴۰۳/۰۲/۱۴ ۱۵:۴۵', status: 'answered' },
        { id: 3, user: 'محمد حسینی', subject: 'مشکل با راننده', message: 'راننده رفتار مناسبی نداشت.', date: '۱۴۰۳/۰۲/۱۴ ۱۱:۲۰', status: 'pending' },
        { id: 4, user: 'فاطمه رضایی', subject: 'سوال درباره تخفیف', message: 'چگونه می‌توانم از کد تخفیف استفاده کنم؟', date: '۱۴۰۳/۰۲/۱۳ ۰۹:۱۰', status: 'closed' },
        { id: 5, user: 'علی محمدی', subject: 'پیشنهاد', message: 'ایده‌ای برای بهبود سرویس دارم.', date: '۱۴۰۳/۰۲/۱۲ ۱۶:۳۰', status: 'answered' }
    ];
    
    adminSupportTable.innerHTML = '';
    
    sampleTickets.forEach(ticket => {
        const row = document.createElement('tr');
        
        let statusBadge = '';
        switch(ticket.status) {
            case 'pending':
                statusBadge = '<span class="status-badge status-in-progress">در انتظار پاسخ</span>';
                break;
            case 'answered':
                statusBadge = '<span class="status-badge status-completed">پاسخ داده شده</span>';
                break;
            case 'closed':
                statusBadge = '<span class="status-badge status-cancelled">بسته شده</span>';
                break;
        }
        
        row.innerHTML = `
            <td>${ticket.user}</td>
            <td>${ticket.subject}</td>
            <td>${ticket.message.length > 50 ? ticket.message.substring(0, 50) + '...' : ticket.message}</td>
            <td>${ticket.date}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="table-action view-ticket" data-id="${ticket.id}">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="table-action respond-ticket" data-id="${ticket.id}">
                    <i class="fas fa-reply"></i>
                </button>
                <button class="table-action close-ticket" data-id="${ticket.id}">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        `;
        adminSupportTable.appendChild(row);
    });
}

// ============================================
// توابع کمکی اضافی
// ============================================

// اعمال کد تخفیف
function applyDiscountCode(code) {
    showNotification(`کد تخفیف ${code} با موفقیت اعمال شد`, 'success');
}

// مشاهده جزئیات سفر
function viewTripDetails(tripId) {
    showNotification(`جزئیات سفر #${tripId} در حال بارگذاری...`, 'info');
}

// بستن مدال‌ها با کلیک خارج از محتوا
window.addEventListener('click', function(event) {
    const modals = ['authModal', 'driverModal', 'paymentModal', 'ratingModal'];
    
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal && event.target === modal) {
            modal.style.display = 'none';
        }
    });
});

// ============================================
// راه‌اندازی نهایی
// ============================================

console.log('سیستم اسنپ افغانستان آماده استفاده است!');