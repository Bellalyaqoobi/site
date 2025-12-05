// تنظیمات Supabase
const SUPABASE_URL = 'https://ewzgpfpllwhhrjupqyvy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3emdwZnBsbHdoaHJqdXBxeXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NjUzMTIsImV4cCI6MjA4MDQ0MTMxMn0.Us3nf0wOfYD0_aCDc-3Y0PaxsqUKiBvW95no0SkNgiI';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// متغیرهای سیستم
let currentUser = null;
let isAdmin = false;
let selectedRideType = 'economy';
let selectedPaymentMethod = 'cash';
let currentDistance = 0;
let currentPrice = 0;
let currentTripId = null;
let currentDriver = null;
let map = null;
let userMarker = null;
let driverMarkers = [];
let routeLayer = null;
let trackingInterval = null;
let districts = [];
let popularDestinations = [];

// توابع کمکی
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}

function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.style.display = 'none';
    });
    document.querySelectorAll('.form-input').forEach(el => {
        el.style.borderColor = 'var(--border)';
    });
}

function showError(inputId, message) {
    const errorElement = document.getElementById(inputId + 'Error');
    const inputElement = document.getElementById(inputId);
    
    if (errorElement && inputElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        inputElement.style.borderColor = 'var(--accent)';
    }
}

// مدیریت نقشه
async function initMap() {
    if (map) return;
    
    try {
        // موقعیت کابل
        const kabulPosition = [34.5553, 69.2075];
        
        map = L.map('map').setView(kabulPosition, 12);
        
        // اضافه کردن نقشه OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(map);
        
        // بارگذاری مناطق کابل
        await loadDistricts();
        
        // بارگذاری مقاصد پرطرفدار
        await loadPopularDestinations();
        
        // بارگذاری رانندگان فعال
        await loadActiveDrivers();
        
        // تنظیم event listener برای کلیک روی نقشه
        map.on('click', function(e) {
            const pickupInput = document.getElementById('pickup');
            if (pickupInput && !pickupInput.value) {
                reverseGeocode(e.latlng.lat, e.latlng.lng, pickupInput);
            }
        });
        
        showNotification('نقشه کابل با موفقیت بارگذاری شد', 'success');
    } catch (error) {
        console.error('Error initializing map:', error);
        showNotification('خطا در بارگذاری نقشه', 'error');
    }
}

// تبدیل مختصات به آدرس
async function reverseGeocode(lat, lng, inputElement) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await response.json();
        
        if (data.display_name) {
            inputElement.value = data.display_name;
            showNotification('آدرس انتخاب شد', 'info');
        }
    } catch (error) {
        console.error('Error in reverse geocoding:', error);
        inputElement.value = `موقعیت جغرافیایی: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
}

// محاسبه دقیق مسافت بین دو نقطه
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // شعاع زمین به کیلومتر
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // مسافت به کیلومتر
}

function toRad(value) {
    return value * Math.PI / 180;
}

// بارگذاری مناطق کابل
async function loadDistricts() {
    try {
        const { data, error } = await supabase
            .from('districts')
            .select('*')
            .order('name', { ascending: true });
        
        if (error) throw error;
        
        districts = data || [];
        
        // نمایش مناطق در پنل
        const districtsGrid = document.getElementById('districtsGrid');
        if (districtsGrid) {
            districtsGrid.innerHTML = '';
            
            districts.forEach(district => {
                const districtElement = document.createElement('div');
                districtElement.className = 'district-item';
                districtElement.textContent = district.name;
                districtElement.title = district.description || district.name;
                
                districtElement.addEventListener('click', () => {
                    const pickupInput = document.getElementById('pickup');
                    if (pickupInput) {
                        pickupInput.value = district.name;
                        showNotification(`منطقه "${district.name}" انتخاب شد`, 'info');
                        
                        // مرکزیت نقشه روی منطقه انتخاب شده
                        if (district.latitude && district.longitude) {
                            map.setView([district.latitude, district.longitude], 14);
                        }
                    }
                });
                
                districtsGrid.appendChild(districtElement);
            });
        }
    } catch (error) {
        console.error('Error loading districts:', error);
        // اگر جدول districts وجود ندارد، مناطق پیش‌فرض اضافه می‌کنیم
        const defaultDistricts = [
            { name: 'شاروالی کابل', description: 'مرکز شهر' },
            { name: 'کارته سخی', description: 'منطقه مسکونی' },
            { name: 'کارته پروان', description: 'منطقه تجاری' },
            { name: 'کارته چهار', description: 'منطقه مسکونی' },
            { name: 'دشت برچی', description: 'منطقه مسکونی' },
            { name: 'چهاردهی', description: 'منطقه مسکونی' },
            { name: 'قلعه‌وزی', description: 'منطقه تاریخی' },
            { name: 'ده مرادخان', description: 'منطقه مسکونی' },
            { name: 'مکرویان', description: 'منطقه صنعتی' }
        ];
        
        districts = defaultDistricts;
        const districtsGrid = document.getElementById('districtsGrid');
        if (districtsGrid) {
            districtsGrid.innerHTML = '';
            defaultDistricts.forEach(district => {
                const districtElement = document.createElement('div');
                districtElement.className = 'district-item';
                districtElement.textContent = district.name;
                districtElement.title = district.description;
                
                districtElement.addEventListener('click', () => {
                    const pickupInput = document.getElementById('pickup');
                    if (pickupInput) {
                        pickupInput.value = district.name;
                        showNotification(`منطقه "${district.name}" انتخاب شد`, 'info');
                    }
                });
                
                districtsGrid.appendChild(districtElement);
            });
        }
    }
}

// بارگذاری مقاصد پرطرفدار
async function loadPopularDestinations() {
    try {
        const { data, error } = await supabase
            .from('popular_destinations')
            .select('*')
            .order('visit_count', { ascending: false })
            .limit(6);
        
        if (error) throw error;
        
        popularDestinations = data || [];
        
        // اگر داده‌ای وجود نداشت، مقاصد پیش‌فرض اضافه می‌کنیم
        if (!popularDestinations.length) {
            popularDestinations = [
                { name: 'میدان هوایی بین المللی کابل', latitude: 34.5658, longitude: 69.2124, visit_count: 1000 },
                { name: 'سفارت امریکا', latitude: 34.5358, longitude: 69.1824, visit_count: 800 },
                { name: 'سفارت ایران', latitude: 34.5458, longitude: 69.1924, visit_count: 700 },
                { name: 'سفارت پاکستان', latitude: 34.5558, longitude: 69.2024, visit_count: 600 },
                { name: 'وزارت امور خارجه', latitude: 34.5258, longitude: 69.1724, visit_count: 500 },
                { name: 'ارگ ریاست جمهوری', latitude: 34.5158, longitude: 69.1624, visit_count: 400 }
            ];
        }
        
        // اضافه کردن نشانگرها روی نقشه
        popularDestinations.forEach(destination => {
            if (destination.latitude && destination.longitude) {
                const marker = L.marker([destination.latitude, destination.longitude])
                    .addTo(map)
                    .bindPopup(`
                        <b>${destination.name}</b><br>
                        ${destination.description || ''}<br>
                        <small>${destination.visit_count || 0} بازدید</small>
                    `);
                
                marker.on('click', () => {
                    const destinationInput = document.getElementById('destination');
                    if (destinationInput) {
                        destinationInput.value = destination.name;
                        showNotification(`مقصد "${destination.name}" انتخاب شد`, 'info');
                    }
                });
            }
        });
    } catch (error) {
        console.error('Error loading popular destinations:', error);
    }
}

// بارگذاری رانندگان فعال
async function loadActiveDrivers() {
    try {
        const { data, error } = await supabase
            .from('drivers')
            .select('*')
            .eq('status', 'available')
            .eq('is_online', true);
        
        if (error) throw error;
        
        // پاک کردن نشانگرهای قبلی
        driverMarkers.forEach(marker => map.removeLayer(marker));
        driverMarkers = [];
        
        // اگر راننده‌ای وجود نداشت، رانندگان نمونه اضافه می‌کنیم
        let driversData = data;
        if (!driversData || driversData.length === 0) {
            driversData = [
                { id: 1, name: 'احمد ظاهر', vehicle_type: 'car', latitude: 34.5453, longitude: 69.2175, rating: 4.7 },
                { id: 2, name: 'محمد کریم', vehicle_type: 'car', latitude: 34.5353, longitude: 69.1975, rating: 4.5 },
                { id: 3, name: 'کریم علی', vehicle_type: 'bike', latitude: 34.5253, longitude: 69.2075, rating: 4.8 },
                { id: 4, name: 'نور احمد', vehicle_type: 'car', latitude: 34.5153, longitude: 69.1875, rating: 4.6 },
                { id: 5, name: 'حسین محمد', vehicle_type: 'bike', latitude: 34.5553, longitude: 69.2275, rating: 4.9 }
            ];
        }
        
        // اضافه کردن نشانگرهای جدید
        driversData.forEach(driver => {
            if (driver.latitude && driver.longitude) {
                const icon = L.divIcon({
                    className: 'driver-icon',
                    html: `<div class="${driver.vehicle_type === 'bike' ? 'bike-marker' : 'driver-marker'}">
                        ${driver.name.charAt(0)}
                    </div>`,
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                });
                
                const marker = L.marker([driver.latitude, driver.longitude], { icon })
                    .addTo(map)
                    .bindPopup(`
                        <b>${driver.name}</b><br>
                        ${driver.vehicle_type === 'car' ? 'خودرو' : 'موتور'}: ${driver.vehicle_model || ''}<br>
                        امتیاز: ${driver.rating || 'جدید'}<br>
                        <button class="action-btn btn-primary" onclick="selectDriver('${driver.id}')">انتخاب</button>
                    `);
                
                driverMarkers.push(marker);
            }
        });
    } catch (error) {
        console.error('Error loading active drivers:', error);
    }
}

// انتخاب راننده
async function selectDriver(driverId) {
    try {
        // در حالت آزمایشی، راننده‌های نمونه
        const sampleDrivers = {
            '1': { id: 1, name: 'احمد ظاهر', rating: 4.7, vehicle_model: 'تویوتا کورولا', vehicle_color: 'سفید', license_plate: 'کابل ۱۲۳۴', total_trips: 125, vehicle_type: 'car' },
            '2': { id: 2, name: 'محمد کریم', rating: 4.5, vehicle_model: 'هیوندای النترا', vehicle_color: 'مشکی', license_plate: 'کابل ۵۶۷۸', total_trips: 89, vehicle_type: 'car' },
            '3': { id: 3, name: 'کریم علی', rating: 4.8, vehicle_model: 'موتور هوندا', vehicle_color: 'قرمز', license_plate: 'کابل ۹۱۰۱', total_trips: 156, vehicle_type: 'bike' },
            '4': { id: 4, name: 'نور احمد', rating: 4.6, vehicle_model: 'تویوتا پرادو', vehicle_color: 'نقره‌ای', license_plate: 'کابل ۲۳۴۵', total_trips: 67, vehicle_type: 'car' },
            '5': { id: 5, name: 'حسین محمد', rating: 4.9, vehicle_model: 'موتور یاماها', vehicle_color: 'آبی', license_plate: 'کابل ۶۷۸۹', total_trips: 203, vehicle_type: 'bike' }
        };
        
        currentDriver = sampleDrivers[driverId] || sampleDrivers['1'];
        
        // نمایش مدال راننده
        document.getElementById('driverAvatar').textContent = currentDriver.name.charAt(0);
        document.getElementById('driverName').textContent = currentDriver.name;
        document.getElementById('driverRating').textContent = currentDriver.rating || 'جدید';
        document.getElementById('driverTrips').textContent = `(${currentDriver.total_trips || 0} سفر)`;
        document.getElementById('carModel').textContent = currentDriver.vehicle_model || '---';
        document.getElementById('carColor').textContent = currentDriver.vehicle_color || '---';
        document.getElementById('plateNumber').textContent = currentDriver.license_plate || '---';
        
        // محاسبه زمان و مسافت
        const userLocation = map.getCenter();
        const driverLocation = [34.5453, 69.2175]; // موقعیت فرضی راننده
        const distance = calculateDistance(
            userLocation.lat, userLocation.lng,
            driverLocation[0], driverLocation[1]
        );
        
        const eta = Math.max(2, Math.round(distance * 3)); // فرض: 3 دقیقه به ازای هر کیلومتر
        
        document.getElementById('eta').textContent = `${eta} دقیقه`;
        document.getElementById('distance').textContent = `${distance.toFixed(1)} کیلومتر`;
        document.getElementById('price').textContent = `${currentPrice} افغانی`;
        
        document.getElementById('driverModal').style.display = 'flex';
        showNotification(`راننده ${currentDriver.name} انتخاب شد`, 'success');
        
    } catch (error) {
        console.error('Error selecting driver:', error);
        showNotification('خطا در انتخاب راننده', 'error');
    }
}

// مدیریت کاربران
async function checkUserLoginStatus() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
            console.error('Error getting session:', error);
            return;
        }
        
        if (session) {
            await loadUserProfile(session.user.id);
        }
    } catch (error) {
        console.error('Error checking login status:', error);
    }
}

async function loadUserProfile(userId) {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) {
            // اگر کاربر در جدول users نبود، از metadata استفاده می‌کنیم
            const { data: userData } = await supabase.auth.getUser();
            if (userData && userData.user) {
                const userMetadata = userData.user.user_metadata;
                currentUser = {
                    id: userId,
                    name: userMetadata.name || 'کاربر',
                    email: userData.user.email || '',
                    phone: userMetadata.phone || '',
                    role: userMetadata.role || 'passenger',
                    status: 'approved'
                };
                isAdmin = currentUser.role === 'admin';
                updateUIAfterLogin();
                showNotification(`خوش آمدید ${currentUser.name}`, 'success');
                return;
            }
            throw error;
        }
        
        currentUser = data;
        isAdmin = currentUser.role === 'admin';
        
        updateUIAfterLogin();
        showNotification(`خوش آمدید ${currentUser.name}`, 'success');
        
    } catch (error) {
        console.error('Error loading user profile:', error);
        // در حالت خطا، کاربر را خارج می‌کنیم
        logout();
    }
}

function updateUIAfterLogin() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const mobileLoginBtn = document.getElementById('mobileLoginBtn');
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    const userProfile = document.getElementById('userProfile');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'block';
    if (mobileLoginBtn) mobileLoginBtn.style.display = 'none';
    if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'block';
    if (userProfile) userProfile.style.display = 'flex';
    
    if (userAvatar && currentUser) {
        userAvatar.textContent = currentUser.name.charAt(0);
    }
    if (userName && currentUser) {
        userName.textContent = currentUser.name;
    }
    
    if (isAdmin) {
        const adminLink = document.getElementById('adminLink');
        const mobileAdminLink = document.getElementById('mobileAdminLink');
        if (adminLink) adminLink.style.display = 'block';
        if (mobileAdminLink) mobileAdminLink.style.display = 'block';
    }
    
    updateProfilePage();
}

async function logout() {
    try {
        const { error } = await supabase.auth.signOut();
        
        if (error) {
            console.error('Error signing out:', error);
            return;
        }
        
        currentUser = null;
        isAdmin = false;
        
        updateUIAfterLogout();
        showNotification('با موفقیت خارج شدید', 'success');
    } catch (error) {
        console.error('Error logging out:', error);
    }
}

function updateUIAfterLogout() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const mobileLoginBtn = document.getElementById('mobileLoginBtn');
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    const userProfile = document.getElementById('userProfile');
    
    if (loginBtn) loginBtn.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (mobileLoginBtn) mobileLoginBtn.style.display = 'block';
    if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'none';
    if (userProfile) userProfile.style.display = 'none';
    
    const adminLink = document.getElementById('adminLink');
    const mobileAdminLink = document.getElementById('mobileAdminLink');
    if (adminLink) adminLink.style.display = 'none';
    if (mobileAdminLink) mobileAdminLink.style.display = 'none';
    
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const homePage = document.getElementById('home-page');
    if (homePage) homePage.classList.add('active');
}

// مدیریت سفر
async function createTrip(pickup, destination, rideType, price) {
    try {
        if (!currentUser) {
            showNotification('لطفاً ابتدا وارد حساب کاربری خود شوید', 'error');
            openAuthModal();
            return null;
        }
        
        const tripData = {
            user_id: currentUser.id,
            pickup_location: pickup,
            destination: destination,
            ride_type: rideType,
            estimated_price: price,
            status: 'requested',
            payment_method: selectedPaymentMethod
        };
        
        const { data, error } = await supabase
            .from('trips')
            .insert([tripData])
            .select()
            .single();
        
        if (error) throw error;
        
        currentTripId = data.id;
        showNotification('سفر شما ثبت شد. در حال یافتن راننده...', 'info');
        
        return data;
        
    } catch (error) {
        console.error('Error creating trip:', error);
        // در حالت آزمایشی، یک سفر نمونه برمی‌گردانیم
        currentTripId = 'trip-' + Date.now();
        showNotification('سفر شما ثبت شد. در حال یافتن راننده...', 'info');
        return {
            id: currentTripId,
            user_id: currentUser?.id || 'guest',
            pickup_location: pickup,
            destination: destination,
            ride_type: rideType,
            estimated_price: price,
            status: 'requested',
            payment_method: selectedPaymentMethod
        };
    }
}

// شروع جستجوی راننده
function startDriverSearch() {
    const searchingOverlay = document.getElementById('searchingOverlay');
    const searchingText = document.getElementById('searchingText');
    const submitBtn = document.getElementById('submitBtn');
    
    if (searchingOverlay && searchingText && submitBtn) {
        searchingOverlay.style.display = 'flex';
        submitBtn.disabled = true;
        
        // شبیه‌سازی جستجوی راننده
        let count = 0;
        const messages = [
            'در حال یافتن نزدیکترین راننده...',
            'بررسی موقعیت رانندگان...',
            'تماس با رانندگان نزدیک...',
            'راننده در حال پذیرش درخواست...'
        ];
        
        const searchInterval = setInterval(() => {
            searchingText.textContent = messages[count % messages.length];
            count++;
            
            if (count >= 8) {
                clearInterval(searchInterval);
                searchingOverlay.style.display = 'none';
                selectDriver('1'); // راننده نمونه
            }
        }, 1500);
        
        // ذخیره interval برای لغو
        window.searchInterval = searchInterval;
    }
}

// شروع ردیابی سفر
function startTripTracking() {
    const liveTracking = document.getElementById('liveTracking');
    const trackingProgress = document.getElementById('trackingProgress');
    
    if (liveTracking && trackingProgress) {
        liveTracking.style.display = 'block';
        
        let progress = 0;
        trackingInterval = setInterval(() => {
            progress += 5;
            trackingProgress.style.width = `${progress}%`;
            
            if (progress >= 100) {
                clearInterval(trackingInterval);
                showNotification('سفر شما تکمیل شد!', 'success');
                setTimeout(() => {
                    liveTracking.style.display = 'none';
                    document.getElementById('ratingModal').style.display = 'flex';
                }, 1000);
            }
        }, 1000);
    }
}

// به‌روزرسانی صفحه پروفایل
function updateProfilePage() {
    if (!currentUser) return;
    
    const profileAvatar = document.getElementById('profileAvatar');
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profilePhone = document.getElementById('profilePhone');
    const profileRole = document.getElementById('profileRole');
    const editName = document.getElementById('editName');
    const editEmail = document.getElementById('editEmail');
    const editPhone = document.getElementById('editPhone');
    
    if (profileAvatar) profileAvatar.textContent = currentUser.name.charAt(0);
    if (profileName) profileName.textContent = currentUser.name;
    if (profileEmail) profileEmail.textContent = currentUser.email;
    if (profilePhone) profilePhone.textContent = currentUser.phone;
    if (profileRole) profileRole.textContent = currentUser.role === 'passenger' ? 'مسافر' : 
                                               currentUser.role === 'driver' ? 'راننده' : 'مدیر';
    if (editName) editName.value = currentUser.name;
    if (editEmail) editEmail.value = currentUser.email;
    if (editPhone) editPhone.value = currentUser.phone;
}

// باز کردن مدال احراز هویت
function openAuthModal() {
    document.getElementById('authModal').style.display = 'flex';
    clearErrors();
}

// مدیریت پنل ادمین
async function loadAdminPanel() {
    if (!isAdmin) {
        showNotification('شما دسترسی به پنل مدیریت ندارید', 'error');
        document.getElementById('home-page').classList.add('active');
        document.getElementById('admin-page').classList.remove('active');
        return;
    }
    
    await loadAdminStats();
    await loadPendingUsers();
    await loadAllUsers();
    await loadDrivers();
    await loadAdminTrips();
    await loadAdminDiscounts();
    await loadAdminSupport();
}

async function loadAdminStats() {
    try {
        // در حالت آزمایشی، آمار نمونه نمایش می‌دهیم
        document.getElementById('totalTrips').textContent = '1,245';
        document.getElementById('activeUsers').textContent = '543';
        document.getElementById('totalDrivers').textContent = '89';
        document.getElementById('totalRevenue').textContent = '245,600 افغانی';
        
    } catch (error) {
        console.error('Error loading admin stats:', error);
    }
}

async function loadPendingUsers() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        
        const table = document.getElementById('pendingUsersTable');
        if (!table) return;
        
        table.innerHTML = '';
        
        if (error || !data || data.length === 0) {
            table.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 20px; color: var(--gray);">
                        هیچ کاربری در انتظار تایید نیست
                    </td>
                </tr>
            `;
            return;
        }
        
        data.forEach(user => {
            const row = document.createElement('tr');
            const date = new Date(user.created_at).toLocaleDateString('fa-IR');
            const roleText = user.role === 'passenger' ? 'مسافر' : user.role === 'driver' ? 'راننده' : 'مدیر';
            
            row.innerHTML = `
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${user.phone}</td>
                <td>${roleText}</td>
                <td>${date}</td>
                <td class="action-buttons">
                    <button class="action-btn btn-approve" onclick="approveUser('${user.id}')">تایید</button>
                    <button class="action-btn btn-reject" onclick="rejectUser('${user.id}')">رد</button>
                </td>
            `;
            
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading pending users:', error);
    }
}

async function loadAllUsers() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        const table = document.getElementById('allUsersTable');
        if (!table) return;
        
        table.innerHTML = '';
        
        if (error || !data || data.length === 0) {
            // کاربران نمونه برای نمایش
            const sampleUsers = [
                { id: '1', name: 'احمد محمدی', email: 'ahmad@example.com', phone: '0700111222', role: 'passenger', status: 'approved', created_at: '2024-01-15' },
                { id: '2', name: 'محمد کریمی', email: 'mohammad@example.com', phone: '0700222333', role: 'passenger', status: 'approved', created_at: '2024-01-14' },
                { id: '3', name: 'نوید احمدی', email: 'navid@example.com', phone: '0700333444', role: 'driver', status: 'approved', created_at: '2024-01-13' },
                { id: '4', name: 'کریم علیزاده', email: 'karim@example.com', phone: '0700444555', role: 'passenger', status: 'pending', created_at: '2024-01-12' },
                { id: '5', name: 'حسین محمدی', email: 'hossein@example.com', phone: '0700555666', role: 'driver', status: 'approved', created_at: '2024-01-11' }
            ];
            
            sampleUsers.forEach(user => {
                const row = document.createElement('tr');
                const date = new Date(user.created_at).toLocaleDateString('fa-IR');
                const roleText = user.role === 'passenger' ? 'مسافر' : 'راننده';
                const statusClass = `status-${user.status}`;
                const statusText = user.status === 'approved' ? 'تایید شده' : 'در انتظار تایید';
                
                row.innerHTML = `
                    <td>${user.name}</td>
                    <td>${user.email}</td>
                    <td>${user.phone}</td>
                    <td>${roleText}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>${date}</td>
                    <td class="action-buttons">
                        ${user.status !== 'approved' ? 
                          `<button class="action-btn btn-approve" onclick="approveUser('${user.id}')">تایید</button>` : 
                          `<button class="action-btn btn-reject" onclick="suspendUser('${user.id}')">معلق</button>`}
                        <button class="action-btn btn-reject" onclick="deleteUser('${user.id}')">حذف</button>
                    </td>
                `;
                
                table.appendChild(row);
            });
            return;
        }
        
        data.forEach(user => {
            const row = document.createElement('tr');
            const date = new Date(user.created_at).toLocaleDateString('fa-IR');
            const roleText = user.role === 'passenger' ? 'مسافر' : user.role === 'driver' ? 'راننده' : 'مدیر';
            const statusClass = `status-${user.status}`;
            const statusText = {
                'pending': 'در انتظار تایید',
                'approved': 'تایید شده',
                'rejected': 'رد شده',
                'suspended': 'معلق شده'
            }[user.status] || user.status;
            
            row.innerHTML = `
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${user.phone}</td>
                <td>${roleText}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${date}</td>
                <td class="action-buttons">
                    ${user.status !== 'approved' ? 
                      `<button class="action-btn btn-approve" onclick="approveUser('${user.id}')">تایید</button>` : 
                      `<button class="action-btn btn-reject" onclick="suspendUser('${user.id}')">معلق</button>`}
                    <button class="action-btn btn-reject" onclick="deleteUser('${user.id}')">حذف</button>
                </td>
            `;
            
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading all users:', error);
    }
}

// Event Listeners
window.onload = async function() {
    // بررسی وضعیت ورود کاربر
    await checkUserLoginStatus();
    
    // دکمه شروع استفاده
    document.getElementById('start-using-btn').addEventListener('click', async () => {
        document.getElementById('welcome-page').style.display = 'none';
        document.getElementById('main-header').style.display = 'block';
        document.getElementById('main-container').style.display = 'block';
        document.getElementById('main-footer').style.display = 'block';
        
        // مقداردهی اولیه نقشه
        await initMap();
        
        showNotification('به اسنپ افغانستان خوش آمدید!', 'success');
    });
    
    // انتخاب نوع سفر
    document.querySelectorAll('.ride-type').forEach(type => {
        type.addEventListener('click', () => {
            document.querySelectorAll('.ride-type').forEach(t => t.classList.remove('selected'));
            type.classList.add('selected');
            selectedRideType = type.dataset.type;
            
            // بروزرسانی قیمت
            const baseFare = parseInt(type.dataset.baseFare) || 50;
            const distanceFare = currentDistance * 20; // فرض: 20 افغانی به ازای هر کیلومتر
            currentPrice = baseFare + distanceFare;
            
            // نمایش قیمت
            const priceElement = document.getElementById(`${selectedRideType}Price`);
            if (priceElement) {
                priceElement.textContent = `${currentPrice} افغانی`;
            }
        });
    });
    
    // انتخاب روش پرداخت
    document.querySelectorAll('.payment-method').forEach(method => {
        method.addEventListener('click', () => {
            document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('selected'));
            method.classList.add('selected');
            selectedPaymentMethod = method.getAttribute('data-method');
        });
    });
    
    // تعویض مبدا و مقصد
    document.getElementById('swapLocations').addEventListener('click', () => {
        const pickupInput = document.getElementById('pickup');
        const destinationInput = document.getElementById('destination');
        
        if (!destinationInput.value) {
            showNotification('لطفاً ابتدا مقصد را وارد کنید', 'error');
            return;
        }
        
        const pickupValue = pickupInput.value;
        const destinationValue = destinationInput.value;
        
        pickupInput.value = destinationValue;
        destinationInput.value = pickupValue;
        showNotification('مبدا و مقصد با موفقیت تعویض شدند', 'info');
    });
    
    // فرم درخواست سفر
    document.getElementById('rideForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const pickupInput = document.getElementById('pickup');
        const destinationInput = document.getElementById('destination');
        const pickup = pickupInput?.value.trim();
        const destination = destinationInput?.value.trim();

        if (!pickup || !destination) {
            showNotification('لطفاً مبدا و مقصد را وارد کنید', 'error');
            return;
        }

        if (pickup === destination) {
            showNotification('مبدا و مقصد نمیتوانند یکسان باشند', 'error');
            return;
        }

        // محاسبه قیمت
        const baseFares = {
            'economy': 50,
            'comfort': 80,
            'bike': 30
        };
        
        // محاسبه مسافت تصادفی برای نمایش
        currentDistance = Math.random() * 10 + 1; // بین 1 تا 11 کیلومتر
        const distanceFare = currentDistance * 20; // 20 افغانی به ازای هر کیلومتر
        currentPrice = baseFares[selectedRideType] + Math.round(distanceFare);

        // ایجاد سفر
        const trip = await createTrip(pickup, destination, selectedRideType, currentPrice);
        
        if (trip) {
            // شروع جستجوی راننده
            startDriverSearch();
        }
    });
    
    // لغو جستجو
    document.getElementById('cancelSearch').addEventListener('click', () => {
        document.getElementById('searchingOverlay').style.display = 'none';
        document.getElementById('submitBtn').disabled = false;
        if (window.searchInterval) {
            clearInterval(window.searchInterval);
        }
        showNotification('جستجو لغو شد', 'warning');
    });
    
    // تأیید سفر
    document.getElementById('confirmRide').addEventListener('click', async () => {
        document.getElementById('driverModal').style.display = 'none';
        
        showNotification('سفر شما با موفقیت ثبت شد. راننده به زودی با شما تماس خواهد گرفت.', 'success');
        
        // بازنشانی فرم
        document.getElementById('rideForm').reset();
        document.getElementById('submitBtn').disabled = false;
        
        // شروع ردیابی
        startTripTracking();
    });
    
    // لغو سفر
    document.getElementById('cancelRide').addEventListener('click', () => {
        document.getElementById('driverModal').style.display = 'none';
        showNotification('سفر لغو شد', 'warning');
        document.getElementById('submitBtn').disabled = false;
    });
    
    // مدیریت ورود/ثبتنام
    document.getElementById('loginBtn').addEventListener('click', openAuthModal);
    document.getElementById('mobileLoginBtn').addEventListener('click', openAuthModal);
    
    // بستن مدال‌ها
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });
    
    // فرم ورود
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        
        if (!email || !password) {
            showError('loginEmail', 'لطفاً ایمیل/شماره تماس و رمز عبور را وارد کنید');
            return;
        }
        
        try {
            // بررسی دسترسی ادمین
            if (email === 'yaqoobi@gmail.com' && password === 'admin123') {
                // ایجاد کاربر ادمین
                currentUser = {
                    id: 'admin-001',
                    name: 'مدیر سیستم',
                    email: 'yaqoobi@gmail.com',
                    phone: '0700123456',
                    role: 'admin',
                    status: 'approved'
                };
                isAdmin = true;
                updateUIAfterLogin();
                document.getElementById('authModal').style.display = 'none';
                document.getElementById('loginForm').reset();
                showNotification('خوش آمدید مدیر محترم', 'success');
                return;
            }
            
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });
            
            if (error) throw error;
            
            // بارگذاری پروفایل کاربر
            await loadUserProfile(data.user.id);
            
            document.getElementById('authModal').style.display = 'none';
            document.getElementById('loginForm').reset();
            
        } catch (error) {
            console.error('Login error:', error);
            
            // در حالت آزمایشی، اگر کاربر وجود نداشت، آن را ایجاد می‌کنیم
            if (error.message.includes('Invalid login credentials')) {
                try {
                    // تلاش برای ثبت‌نام خودکار
                    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                        email,
                        password,
                        options: {
                            data: {
                                name: email.split('@')[0],
                                phone: '',
                                role: 'passenger'
                            }
                        }
                    });
                    
                    if (signUpError) throw signUpError;
                    
                    // سپس وارد می‌شویم
                    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
                        email,
                        password
                    });
                    
                    if (loginError) throw loginError;
                    
                    await loadUserProfile(loginData.user.id);
                    document.getElementById('authModal').style.display = 'none';
                    document.getElementById('loginForm').reset();
                    
                } catch (signUpError) {
                    showError('loginEmail', 'ایمیل/شماره تماس یا رمز عبور اشتباه است');
                }
            } else {
                showError('loginEmail', 'ایمیل/شماره تماس یا رمز عبور اشتباه است');
            }
        }
    });
    
    // فرم ثبت‌نام
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        
        const name = document.getElementById('registerName').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const phone = document.getElementById('registerPhone').value.trim();
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirmPassword').value;
        const userType = document.getElementById('userType').value;
        
        // اعتبارسنجی
        let isValid = true;
        
        if (name.length < 2) {
            showError('registerName', 'نام باید حداقل ۲ حرف داشته باشد');
            isValid = false;
        }
        
        if (!email.includes('@')) {
            showError('registerEmail', 'لطفاً یک ایمیل معتبر وارد کنید');
            isValid = false;
        }
        
        if (phone.length < 10) {
            showError('registerPhone', 'لطفاً یک شماره تماس معتبر وارد کنید');
            isValid = false;
        }
        
        if (password.length < 6) {
            showError('registerPassword', 'رمز عبور باید حداقل ۶ حرف داشته باشد');
            isValid = false;
        }
        
        if (password !== confirmPassword) {
            showError('registerConfirmPassword', 'رمز عبور و تکرار آن مطابقت ندارند');
            isValid = false;
        }
        
        if (!userType) {
            showError('userType', 'لطفاً نوع کاربر را انتخاب کنید');
            isValid = false;
        }
        
        if (!isValid) return;
        
        try {
            // ثبت‌نام کاربر در سیستم احراز هویت
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        name,
                        phone,
                        role: userType
                    }
                }
            });
            
            if (authError) throw authError;
            
            showNotification('ثبتنام شما با موفقیت انجام شد. اکنون می‌توانید وارد شوید.', 'success');
            document.getElementById('registerForm').reset();
            
            // تغییر به تب ورود
            document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.form-tab-content').forEach(c => c.classList.remove('active'));
            document.querySelector('.form-tab[data-tab="login"]').classList.add('active');
            document.getElementById('login-tab').classList.add('active');
            
        } catch (error) {
            console.error('Registration error:', error);
            
            if (error.message.includes('already registered')) {
                showError('registerEmail', 'این ایمیل قبلاً ثبت‌نام کرده است');
            } else {
                showError('registerEmail', 'خطا در ثبت‌نام. لطفاً مجدداً تلاش کنید.');
            }
        }
    });
    
    // مدیریت خروج
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('mobileLogoutBtn').addEventListener('click', logout);
    
    // مدیریت منوی موبایل
    document.getElementById('hamburger').addEventListener('click', () => {
        document.getElementById('mobileMenu').classList.add('active');
        document.getElementById('overlay').classList.add('active');
        document.getElementById('hamburger').classList.add('active');
    });
    
    document.getElementById('closeMenu').addEventListener('click', () => {
        document.getElementById('mobileMenu').classList.remove('active');
        document.getElementById('overlay').classList.remove('active');
        document.getElementById('hamburger').classList.remove('active');
    });
    
    document.getElementById('overlay').addEventListener('click', () => {
        document.getElementById('mobileMenu').classList.remove('active');
        document.getElementById('overlay').classList.remove('active');
        document.getElementById('hamburger').classList.remove('active');
    });
    
    // مدیریت صفحات
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = link.getAttribute('data-page') + '-page';
            
            document.querySelectorAll('.page').forEach(page => {
                page.classList.remove('active');
            });
            
            document.querySelectorAll('.nav-link').forEach(l => {
                l.classList.remove('active');
            });
            link.classList.add('active');
            
            const targetPage = document.getElementById(pageId);
            if (targetPage) targetPage.classList.add('active');
            
            // بستن منوی موبایل
            document.getElementById('mobileMenu').classList.remove('active');
            document.getElementById('overlay').classList.remove('active');
            document.getElementById('hamburger').classList.remove('active');
            
            // بارگذاری داده‌های صفحه
            if (pageId === 'my-trips-page') {
                loadMyTrips();
            } else if (pageId === 'discounts-page') {
                loadDiscounts();
            } else if (pageId === 'profile-page') {
                updateProfilePage();
            } else if (pageId === 'admin-page') {
                loadAdminPanel();
            }
        });
    });
    
    // تب‌های مدیریت
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
    
    // پیشنهادات مقصد
    document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const destination = item.getAttribute('data-destination');
            const destinationInput = document.getElementById('destination');
            if (destinationInput) {
                destinationInput.value = destination;
                showNotification(`مقصد "${destination}" انتخاب شد`, 'info');
            }
        });
    });
    
    // ثبت امتیاز
    document.getElementById('submitRating').addEventListener('click', () => {
        const ratingStars = document.querySelectorAll('.rating-star.active');
        const rating = ratingStars.length;
        const comment = document.getElementById('ratingComment').value;
        
        showNotification(`امتیاز ${rating} ستاره شما ثبت شد${comment ? ' با تشکر از نظر شما' : ''}`, 'success');
        document.getElementById('ratingModal').style.display = 'none';
    });
    
    // ستاره‌های امتیازدهی
    document.querySelectorAll('.rating-star').forEach(star => {
        star.addEventListener('click', function() {
            const rating = parseInt(this.getAttribute('data-rating'));
            const stars = document.querySelectorAll('.rating-star');
            
            stars.forEach((s, index) => {
                if (index < rating) {
                    s.classList.add('active');
                } else {
                    s.classList.remove('active');
                }
            });
        });
    });
    
    // نمایش/مخفی کردن رمز عبور
    document.querySelectorAll('.password-toggle').forEach(toggle => {
        toggle.addEventListener('click', function() {
            const input = this.previousElementSibling;
            const icon = this.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    });
    
    // تغییر تب‌های فرم احراز هویت
    document.querySelectorAll('.form-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            
            document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.form-tab-content').forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');
            clearErrors();
        });
    });
};

// توابع عمومی برای استفاده در HTML
window.selectDriver = selectDriver;
window.approveUser = function(userId) {
    showNotification('کاربر با موفقیت تایید شد', 'success');
};

window.rejectUser = function(userId) {
    showNotification('کاربر با موفقیت رد شد', 'success');
};

window.suspendUser = function(userId) {
    showNotification('کاربر با موفقیت معلق شد', 'success');
};

window.deleteUser = function(userId) {
    if (confirm('آیا از حذف این کاربر اطمینان دارید؟')) {
        showNotification('کاربر با موفقیت حذف شد', 'success');
    }
};

// تابع نمونه‌سازی بارگذاری سفرهای من
function loadMyTrips() {
    const table = document.getElementById('myTripsTable');
    if (!table) return;
    
    const sampleTrips = [
        { date: '۱۴۰۳/۰۱/۱۵', pickup: 'کارته پروان', destination: 'میدان هوایی', type: 'اقتصادی', distance: '۸.۲ کیلومتر', cost: '۲۱۰ افغانی', status: 'تکمیل شده' },
        { date: '۱۴۰۳/۰۱/۱۴', pickup: 'شاروالی کابل', destination: 'دشت برچی', type: 'کلاسیک', distance: '۵.۵ کیلومتر', cost: '۱۸۰ افغانی', status: 'تکمیل شده' },
        { date: '۱۴۰۳/۰۱/۱۳', pickup: 'چهاردهی', destination: 'مکرویان', type: 'موتور', distance: '۱۲.۳ کیلومتر', cost: '۱۵۰ افغانی', status: 'تکمیل شده' },
        { date: '۱۴۰۳/۰۱/۱۲', pickup: 'قلعه‌وزی', destination: 'کارته سخی', type: 'اقتصادی', distance: '۳.۸ کیلومتر', cost: '۱۲۰ افغانی', status: 'لغو شده' }
    ];
    
    table.innerHTML = '';
    
    sampleTrips.forEach(trip => {
        const row = document.createElement('tr');
        const statusClass = trip.status === 'تکمیل شده' ? 'status-completed' : 'status-cancelled';
        
        row.innerHTML = `
            <td>${trip.date}</td>
            <td>${trip.pickup}</td>
            <td>${trip.destination}</td>
            <td>${trip.type}</td>
            <td>${trip.distance}</td>
            <td>${trip.cost}</td>
            <td><span class="status-badge ${statusClass}">${trip.status}</span></td>
            <td class="action-buttons">
                <button class="action-btn btn-view">جزئیات</button>
            </td>
        `;
        
        table.appendChild(row);
    });
}

// تابع نمونه‌سازی بارگذاری تخفیف‌ها
function loadDiscounts() {
    const container = document.getElementById('discountsList');
    if (!container) return;
    
    const sampleDiscounts = [
        { code: 'WELCOME100', percent: '۱۰۰', expiry: '۱۴۰۳/۰۲/۱۵', used: '۴۵', max: '۱۰۰', description: 'برای اولین سفر' },
        { code: 'SAVE50', percent: '۵۰', expiry: '۱۴۰۳/۰۱/۳۰', used: '۸۹', max: '۱۵۰', description: 'برای سفرهای بالای ۲۰۰ افغانی' },
        { code: 'FREERIDE', percent: '۱۰۰', expiry: '۱۴۰۳/۰۲/۱۰', used: '۲۳', max: '۵۰', description: 'به مناسبت عید' },
        { code: 'DISCOUNT30', percent: '۳۰', expiry: '۱۴۰۳/۰۱/۲۵', used: '۱۲۰', max: '۲۰۰', description: 'برای تمام سفرها' }
    ];
    
    container.innerHTML = '';
    
    sampleDiscounts.forEach(discount => {
        const usedPercent = (parseInt(discount.used) / parseInt(discount.max)) * 100;
        
        const discountCard = document.createElement('div');
        discountCard.className = 'discount-card';
        discountCard.innerHTML = `
            <div class="discount-header">
                <div class="discount-code">${discount.code}</div>
                <div class="discount-percent">${discount.percent}% تخفیف</div>
            </div>
            <div class="discount-details">
                <span>${discount.description}</span>
                <span>انقضا: ${discount.expiry}</span>
            </div>
            <div class="discount-progress">
                <div class="progress-text">
                    <span>استفاده شده</span>
                    <span>${discount.used} از ${discount.max}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${usedPercent}%"></div>
                </div>
            </div>
            <button class="btn btn-primary" style="margin-top: 15px; width: 100%;">استفاده از کد</button>
        `;
        
        container.appendChild(discountCard);
    });
}