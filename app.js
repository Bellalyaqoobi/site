// تنظیمات Supabase
const SUPABASE_URL = 'https://ewzgpfpllwhhrjupqyvy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3emdwZnBsbHdoaHJqdXBxeXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NjUzMTIsImV4cCI6MjA4MDQ0MTMxMn0.Us3nf0wOfYD0_aCDc-3Y0PaxsqUKiBvW95no0SkNgiI';

// مقداردهی اولیه Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// متغیرهای سیستمی
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
let activeDrivers = [];

// توابع کمکی
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, 5000);
    }
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
        
        // اضافه کردن کنترل موقعیت کاربر
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const userLat = position.coords.latitude;
                    const userLng = position.coords.longitude;
                    
                    if (userMarker) map.removeLayer(userMarker);
                    
                    userMarker = L.marker([userLat, userLng], {
                        icon: L.divIcon({
                            className: 'user-marker',
                            html: '<div class="marker-icon"><i class="fas fa-user"></i></div>',
                            iconSize: [40, 40]
                        })
                    }).addTo(map)
                    .bindPopup('موقعیت شما<br><small>برای انتخاب مبدا، روی نقشه کلیک کنید</small>');
                    
                    map.setView([userLat, userLng], 14);
                    
                    // نمایش آدرس فعلی در فیلد مبدا
                    reverseGeocode(userLat, userLng, document.getElementById('pickup'));
                },
                () => {
                    showNotification('دسترسی به موقعیت مکانی فعال نیست', 'warning');
                }
            );
        }
        
        // بارگذاری مناطق کابل
        await loadDistricts();
        
        // بارگذاری مقاصد پرطرفدار
        await loadPopularDestinations();
        
        // بارگذاری رانندگان فعال
        await loadActiveDrivers();
        
        // تنظیم event listener برای کلیک روی نقشه
        map.on('click', function(e) {
            const pickupInput = document.getElementById('pickup');
            if (pickupInput) {
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
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fa`);
        const data = await response.json();
        
        if (data.display_name) {
            inputElement.value = data.display_name;
            
            // اضافه کردن نشانگر
            if (userMarker) map.removeLayer(userMarker);
            
            userMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'pickup-marker',
                    html: '<div class="marker-icon"><i class="fas fa-map-marker-alt"></i></div>',
                    iconSize: [40, 40]
                })
            }).addTo(map)
            .bindPopup('مبدا انتخاب شده<br><small>' + data.display_name + '</small>');
            
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
        
        if (error) {
            // اگر جدول وجود نداشت، ایجاد کنیم
            await createTablesIfNotExist();
            throw error;
        }
        
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
                            
                            // اضافه کردن نشانگر
                            if (userMarker) map.removeLayer(userMarker);
                            
                            userMarker = L.marker([district.latitude, district.longitude], {
                                icon: L.divIcon({
                                    className: 'district-marker',
                                    html: '<div class="marker-icon"><i class="fas fa-map-pin"></i></div>',
                                    iconSize: [40, 40]
                                })
                            }).addTo(map)
                            .bindPopup(district.name + '<br><small>' + (district.description || '') + '</small>');
                        }
                    }
                });
                
                districtsGrid.appendChild(districtElement);
            });
        }
    } catch (error) {
        console.error('Error loading districts:', error);
        // اگر جدول districts وجود ندارد، مناطق پیش‌فرض اضافه می‌کنیم
        districts = [
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
        
        const districtsGrid = document.getElementById('districtsGrid');
        if (districtsGrid) {
            districtsGrid.innerHTML = '';
            districts.forEach(district => {
                const districtElement = document.createElement('div');
                districtElement.className = 'district-item';
                districtElement.textContent = district.name;
                districtElement.title = district.description;
                
                districtElement.addEventListener('click', () => {
                    const pickupInput = document.getElementById('pickup');
                    if (pickupInput) {
                        pickupInput.value = district.name;
                        showNotification(`منطقه "${district.name}" انتخاب شد`, 'info');
                        
                        if (map && district.latitude && district.longitude) {
                            map.setView([district.latitude, district.longitude], 14);
                        }
                    }
                });
                
                districtsGrid.appendChild(districtElement);
            });
        }
    }
}

// ایجاد جداول در صورت عدم وجود
async function createTablesIfNotExist() {
    try {
        // ایجاد جدول districts
        const { error: districtsError } = await supabase.rpc('create_districts_table');
        
        // ایجاد جدول drivers
        const { error: driversError } = await supabase.rpc('create_drivers_table');
        
        // ایجاد جدول trips
        const { error: tripsError } = await supabase.rpc('create_trips_table');
        
        if (!districtsError && !driversError && !tripsError) {
            console.log('Tables created successfully');
        }
    } catch (error) {
        console.error('Error creating tables:', error);
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
        
        if (error) {
            // اگر خطا داد، یعنی جدول وجود ندارد - مقاصد پیش‌فرض
            throw error;
        }
        
        popularDestinations = data || [];
        
        // اگر داده‌ای وجود نداشت، مقاصد پیش‌فرض اضافه می‌کنیم
        if (popularDestinations.length === 0) {
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
                const marker = L.marker([destination.latitude, destination.longitude], {
                    icon: L.divIcon({
                        className: 'destination-marker',
                        html: '<div class="marker-icon"><i class="fas fa-star"></i></div>',
                        iconSize: [40, 40]
                    })
                })
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
                        
                        // اضافه کردن نشانگر مقصد
                        const destMarker = L.marker([destination.latitude, destination.longitude], {
                            icon: L.divIcon({
                                className: 'selected-destination-marker',
                                html: '<div class="marker-icon"><i class="fas fa-flag-checkered"></i></div>',
                                iconSize: [40, 40]
                            })
                        }).addTo(map)
                        .bindPopup('مقصد انتخاب شده<br><small>' + destination.name + '</small>');
                        
                        // اگر نقشه‌ای داشته باشیم، خط بین مبدا و مقصد رسم کنیم
                        if (userMarker && userMarker.getLatLng()) {
                            if (routeLayer) map.removeLayer(routeLayer);
                            
                            const pickupLatLng = userMarker.getLatLng();
                            const destinationLatLng = marker.getLatLng();
                            
                            // محاسبه فاصله
                            const distance = calculateDistance(
                                pickupLatLng.lat, pickupLatLng.lng,
                                destinationLatLng.lat, destinationLatLng.lng
                            );
                            
                            // رسم خط بین مبدا و مقصد
                            routeLayer = L.polyline([pickupLatLng, destinationLatLng], {
                                color: 'var(--accent)',
                                weight: 4,
                                opacity: 0.7,
                                dashArray: '10, 10'
                            }).addTo(map);
                            
                            // محاسبه قیمت
                            calculateAndShowPrice(distance);
                        }
                    }
                });
            }
        });
    } catch (error) {
        console.error('Error loading popular destinations:', error);
        // در حالت خطا، از مقاصد پیش‌فرض استفاده می‌کنیم
        popularDestinations = [
            { name: 'میدان هوایی بین المللی کابل', latitude: 34.5658, longitude: 69.2124, visit_count: 1000 },
            { name: 'سفارت امریکا', latitude: 34.5358, longitude: 69.1824, visit_count: 800 },
            { name: 'سفارت ایران', latitude: 34.5458, longitude: 69.1924, visit_count: 700 },
            { name: 'سفارت پاکستان', latitude: 34.5558, longitude: 69.2024, visit_count: 600 }
        ];
        
        // نمایش در لیست پیشنهادی
        const suggestionsList = document.querySelector('.suggestion-list');
        if (suggestionsList) {
            suggestionsList.innerHTML = '';
            popularDestinations.forEach(destination => {
                const suggestionItem = document.createElement('div');
                suggestionItem.className = 'suggestion-item';
                suggestionItem.innerHTML = `
                    <div class="suggestion-icon">
                        <i class="fas fa-landmark"></i>
                    </div>
                    <div class="suggestion-text">${destination.name}</div>
                `;
                suggestionItem.setAttribute('data-destination', destination.name);
                
                suggestionItem.addEventListener('click', () => {
                    const destinationInput = document.getElementById('destination');
                    if (destinationInput) {
                        destinationInput.value = destination.name;
                        showNotification(`مقصد "${destination.name}" انتخاب شد`, 'info');
                    }
                });
                
                suggestionsList.appendChild(suggestionItem);
            });
        }
    }
}

// محاسبه و نمایش قیمت
function calculateAndShowPrice(distance) {
    currentDistance = distance;
    
    const baseFares = {
        'economy': 50,
        'comfort': 80,
        'bike': 30
    };
    
    const distanceFare = distance * 20; // 20 افغانی به ازای هر کیلومتر
    const baseFare = baseFares[selectedRideType] || 50;
    currentPrice = Math.round(baseFare + distanceFare);
    
    // بروزرسانی قیمت در UI
    const priceElement = document.getElementById(`${selectedRideType}Price`);
    if (priceElement) {
        priceElement.textContent = `${currentPrice} افغانی`;
    }
    
    // نمایش مسافت در ماشین حساب
    const tripCalculator = document.getElementById('tripCalculator');
    if (tripCalculator) {
        tripCalculator.style.display = 'block';
        
        const distanceElement = document.getElementById('distanceValue');
        const baseFareElement = document.getElementById('baseFareValue');
        const distanceFareElement = document.getElementById('distanceFareValue');
        const totalFareElement = document.getElementById('totalFareValue');
        
        if (distanceElement) distanceElement.textContent = `${distance.toFixed(1)} کیلومتر`;
        if (baseFareElement) baseFareElement.textContent = `${baseFare} افغانی`;
        if (distanceFareElement) distanceFareElement.textContent = `${Math.round(distanceFare)} افغانی`;
        if (totalFareElement) totalFareElement.textContent = `${currentPrice} افغانی`;
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
        
        activeDrivers = data || [];
        
        // اگر راننده‌ای وجود نداشت، رانندگان نمونه اضافه می‌کنیم
        if (activeDrivers.length === 0) {
            activeDrivers = [
                { id: 1, name: 'احمد ظاهر', vehicle_type: 'car', vehicle_model: 'تویوتا کورولا', 
                  latitude: 34.5453, longitude: 69.2175, rating: 4.7, total_trips: 125, 
                  license_plate: 'کابل ۱۲۳۴', vehicle_color: 'سفید' },
                { id: 2, name: 'محمد کریم', vehicle_type: 'car', vehicle_model: 'هیوندای النترا',
                  latitude: 34.5353, longitude: 69.1975, rating: 4.5, total_trips: 89,
                  license_plate: 'کابل ۵۶۷۸', vehicle_color: 'مشکی' },
                { id: 3, name: 'کریم علی', vehicle_type: 'bike', vehicle_model: 'موتور هوندا',
                  latitude: 34.5253, longitude: 69.2075, rating: 4.8, total_trips: 156,
                  license_plate: 'کابل ۹۱۰۱', vehicle_color: 'قرمز' }
            ];
        }
        
        updateDriverMarkers();
        
    } catch (error) {
        console.error('Error loading active drivers:', error);
        activeDrivers = [
            { id: 1, name: 'احمد ظاهر', vehicle_type: 'car', vehicle_model: 'تویوتا کورولا', 
              latitude: 34.5453, longitude: 69.2175, rating: 4.7, total_trips: 125 },
            { id: 2, name: 'محمد کریم', vehicle_type: 'car', vehicle_model: 'هیوندای النترا',
              latitude: 34.5353, longitude: 69.1975, rating: 4.5, total_trips: 89 }
        ];
        updateDriverMarkers();
    }
}

// بروزرسانی نشانگرهای رانندگان روی نقشه
function updateDriverMarkers() {
    // پاک کردن نشانگرهای قبلی
    driverMarkers.forEach(marker => map.removeLayer(marker));
    driverMarkers = [];
    
    // اضافه کردن نشانگرهای جدید
    activeDrivers.forEach(driver => {
        if (driver.latitude && driver.longitude) {
            const icon = L.divIcon({
                className: 'driver-icon',
                html: `
                    <div class="${driver.vehicle_type === 'bike' ? 'bike-marker' : 'driver-marker'}">
                        <i class="${driver.vehicle_type === 'bike' ? 'fas fa-motorcycle' : 'fas fa-car'}"></i>
                    </div>
                `,
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });
            
            const marker = L.marker([driver.latitude, driver.longitude], { icon })
                .addTo(map)
                .bindPopup(`
                    <b>${driver.name}</b><br>
                    ${driver.vehicle_type === 'car' ? 'خودرو' : 'موتور'}: ${driver.vehicle_model || ''}<br>
                    امتیاز: ${driver.rating || 'جدید'}<br>
                    سفرها: ${driver.total_trips || 0}<br>
                    <button class="action-btn btn-primary" onclick="selectDriver('${driver.id}')">انتخاب راننده</button>
                `);
            
            driverMarkers.push(marker);
        }
    });
}

// انتخاب راننده
async function selectDriver(driverId) {
    try {
        // یافتن راننده انتخاب شده
        let driver = activeDrivers.find(d => d.id == driverId);
        
        if (!driver) {
            // در صورت عدم یافتن، اولین راننده را انتخاب می‌کنیم
            driver = activeDrivers[0] || {
                id: 1,
                name: 'احمد ظاهر',
                rating: 4.7,
                vehicle_model: 'تویوتا کورولا',
                vehicle_color: 'سفید',
                license_plate: 'کابل ۱۲۳۴',
                total_trips: 125,
                vehicle_type: 'car'
            };
        }
        
        currentDriver = driver;
        
        // نمایش مدال راننده
        const driverAvatar = document.getElementById('driverAvatar');
        const driverName = document.getElementById('driverName');
        const driverRating = document.getElementById('driverRating');
        const driverTrips = document.getElementById('driverTrips');
        const carModel = document.getElementById('carModel');
        const carColor = document.getElementById('carColor');
        const plateNumber = document.getElementById('plateNumber');
        const etaElement = document.getElementById('eta');
        const distanceElement = document.getElementById('distance');
        const priceElement = document.getElementById('price');
        
        if (driverAvatar) driverAvatar.textContent = driver.name.charAt(0);
        if (driverName) driverName.textContent = driver.name;
        if (driverRating) driverRating.textContent = driver.rating || 'جدید';
        if (driverTrips) driverTrips.textContent = `(${driver.total_trips || 0} سفر)`;
        if (carModel) carModel.textContent = driver.vehicle_model || '---';
        if (carColor) carColor.textContent = driver.vehicle_color || '---';
        if (plateNumber) plateNumber.textContent = driver.license_plate || '---';
        
        // محاسبه زمان و مسافت
        let userLocation;
        if (userMarker && userMarker.getLatLng()) {
            userLocation = userMarker.getLatLng();
        } else {
            userLocation = map.getCenter();
        }
        
        const driverLocation = driver.latitude && driver.longitude ? 
            [driver.latitude, driver.longitude] : [34.5453, 69.2175];
        
        const distance = calculateDistance(
            userLocation.lat, userLocation.lng,
            driverLocation[0], driverLocation[1]
        );
        
        const eta = Math.max(2, Math.round(distance * 3)); // فرض: 3 دقیقه به ازای هر کیلومتر
        
        if (etaElement) etaElement.textContent = `${eta} دقیقه`;
        if (distanceElement) distanceElement.textContent = `${distance.toFixed(1)} کیلومتر`;
        if (priceElement) priceElement.textContent = `${currentPrice} افغانی`;
        
        const driverModal = document.getElementById('driverModal');
        if (driverModal) {
            driverModal.style.display = 'flex';
        }
        
        showNotification(`راننده ${driver.name} انتخاب شد`, 'success');
        
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
        
        if (session && session.user) {
            await loadUserProfile(session.user.id);
        }
    } catch (error) {
        console.error('Error checking login status:', error);
    }
}

async function loadUserProfile(userId) {
    try {
        // ابتدا از جدول public.users اطلاعات را می‌گیریم
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error || !data) {
            // اگر کاربر در جدول public.users نبود، از auth.users استفاده می‌کنیم
            const { data: userData } = await supabase.auth.getUser();
            if (userData && userData.user) {
                const userMetadata = userData.user.user_metadata;
                currentUser = {
                    id: userId,
                    name: userMetadata.name || userData.user.email?.split('@')[0] || 'کاربر',
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
            throw error || new Error('User not found');
        }
        
        currentUser = data;
        isAdmin = currentUser.role === 'admin';
        
        updateUIAfterLogin();
        showNotification(`خوش آمدید ${currentUser.name}`, 'success');
        
    } catch (error) {
        console.error('Error loading user profile:', error);
        showNotification('خطا در بارگذاری پروفایل کاربر', 'error');
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
    
    // نمایش لینک‌های ادمین
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
            showNotification('خطا در خروج از سیستم', 'error');
            return;
        }
        
        currentUser = null;
        isAdmin = false;
        
        updateUIAfterLogout();
        showNotification('با موفقیت خارج شدید', 'success');
    } catch (error) {
        console.error('Error logging out:', error);
        showNotification('خطا در خروج از سیستم', 'error');
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
            payment_method: selectedPaymentMethod,
            distance: currentDistance
        };
        
        const { data, error } = await supabase
            .from('trips')
            .insert([tripData])
            .select()
            .single();
        
        if (error) {
            // اگر جدول trips وجود نداشت، از ذخیره داخلی استفاده می‌کنیم
            console.error('Error creating trip:', error);
            currentTripId = 'trip-' + Date.now();
            showNotification('سفر شما ثبت شد. در حال یافتن راننده...', 'info');
            return {
                id: currentTripId,
                user_id: currentUser.id,
                pickup_location: pickup,
                destination: destination,
                ride_type: rideType,
                estimated_price: price,
                status: 'requested',
                payment_method: selectedPaymentMethod,
                distance: currentDistance
            };
        }
        
        currentTripId = data.id;
        showNotification('سفر شما ثبت شد. در حال یافتن راننده...', 'info');
        
        return data;
        
    } catch (error) {
        console.error('Error creating trip:', error);
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
            payment_method: selectedPaymentMethod,
            distance: currentDistance
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
            if (searchingText) {
                searchingText.textContent = messages[count % messages.length];
            }
            count++;
            
            if (count >= 8) {
                clearInterval(searchInterval);
                if (searchingOverlay) searchingOverlay.style.display = 'none';
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
    const trackingDriverName = document.getElementById('trackingDriverName');
    const trackingETA = document.getElementById('trackingETA');
    const trackingDistance = document.getElementById('trackingDistance');
    
    if (liveTracking && trackingProgress && currentDriver) {
        liveTracking.style.display = 'block';
        
        if (trackingDriverName) trackingDriverName.textContent = currentDriver.name;
        if (trackingETA) trackingETA.textContent = '۴ دقیقه';
        if (trackingDistance) trackingDistance.textContent = '۲.۸ کیلومتر';
        
        let progress = 0;
        trackingInterval = setInterval(() => {
            progress += 5;
            trackingProgress.style.width = `${progress}%`;
            
            if (progress >= 100) {
                clearInterval(trackingInterval);
                showNotification('سفر شما تکمیل شد!', 'success');
                setTimeout(() => {
                    liveTracking.style.display = 'none';
                    const ratingModal = document.getElementById('ratingModal');
                    if (ratingModal) {
                        const ratingDriverAvatar = document.getElementById('ratingDriverAvatar');
                        const ratingDriverName = document.getElementById('ratingDriverName');
                        if (ratingDriverAvatar) ratingDriverAvatar.textContent = currentDriver.name.charAt(0);
                        if (ratingDriverName) ratingDriverName.textContent = currentDriver.name;
                        ratingModal.style.display = 'flex';
                    }
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
    
    // آمار نمونه
    const totalTripsCount = document.getElementById('totalTripsCount');
    const totalSpent = document.getElementById('totalSpent');
    const userRating = document.getElementById('userRating');
    
    if (totalTripsCount) totalTripsCount.textContent = '۱۲';
    if (totalSpent) totalSpent.textContent = '۲,۵۴۰';
    if (userRating) userRating.textContent = '۵.۰';
    
    // بارگذاری سفرهای کاربر
    loadMyTrips();
}

// باز کردن مدال احراز هویت
function openAuthModal() {
    const authModal = document.getElementById('authModal');
    if (authModal) {
        authModal.style.display = 'flex';
    }
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
        const stats = {
            totalTrips: 1245,
            activeUsers: 543,
            totalDrivers: 89,
            totalRevenue: 245600
        };
        
        document.getElementById('totalTrips').textContent = stats.totalTrips.toLocaleString('fa-IR');
        document.getElementById('activeUsers').textContent = stats.activeUsers.toLocaleString('fa-IR');
        document.getElementById('totalDrivers').textContent = stats.totalDrivers.toLocaleString('fa-IR');
        document.getElementById('totalRevenue').textContent = stats.totalRevenue.toLocaleString('fa-IR') + ' افغانی';
        
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
            const roleText = user.role === 'passenger' ? 'مسافر' : 
                             user.role === 'driver' ? 'راننده' : 'مدیر';
            
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
        // نمایش نمونه
        const table = document.getElementById('pendingUsersTable');
        if (table) {
            table.innerHTML = `
                <tr>
                    <td>کریم علیزاده</td>
                    <td>karim@example.com</td>
                    <td>0700444555</td>
                    <td>مسافر</td>
                    <td>۱۴۰۳/۰۱/۱۲</td>
                    <td class="action-buttons">
                        <button class="action-btn btn-approve" onclick="approveUser('4')">تایید</button>
                        <button class="action-btn btn-reject" onclick="rejectUser('4')">رد</button>
                    </td>
                </tr>
            `;
        }
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
                { id: '4', name: 'کریم علیزاده', email: 'karim@example.com', phone: '0700444555', role: 'passenger', status: 'pending', created_at: '2024-01-12' }
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
            const roleText = user.role === 'passenger' ? 'مسافر' : 
                             user.role === 'driver' ? 'راننده' : 'مدیر';
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
    const startUsingBtn = document.getElementById('start-using-btn');
    if (startUsingBtn) {
        startUsingBtn.addEventListener('click', async () => {
            const welcomePage = document.getElementById('welcome-page');
            const mainHeader = document.getElementById('main-header');
            const mainContainer = document.getElementById('main-container');
            const mainFooter = document.getElementById('main-footer');
            
            if (welcomePage) welcomePage.style.display = 'none';
            if (mainHeader) mainHeader.style.display = 'block';
            if (mainContainer) mainContainer.style.display = 'block';
            if (mainFooter) mainFooter.style.display = 'block';
            
            // مقداردهی اولیه نقشه
            await initMap();
            
            showNotification('به اسنپ افغانستان خوش آمدید!', 'success');
        });
    }
    
    // دکمه اطلاعات بیشتر
    const learnMoreBtn = document.getElementById('learn-more-btn');
    if (learnMoreBtn) {
        learnMoreBtn.addEventListener('click', () => {
            showNotification('اسنپ افغانستان - سرویس تاکسی اینترنتی در سراسر کابل', 'info');
        });
    }
    
    // انتخاب نوع سفر
    document.querySelectorAll('.ride-type').forEach(type => {
        type.addEventListener('click', () => {
            document.querySelectorAll('.ride-type').forEach(t => t.classList.remove('selected'));
            type.classList.add('selected');
            selectedRideType = type.dataset.type;
            
            // بروزرسانی قیمت
            if (currentDistance > 0) {
                calculateAndShowPrice(currentDistance);
            }
        });
    });
    
    // انتخاب روش پرداخت
    document.querySelectorAll('.payment-method').forEach(method => {
        method.addEventListener('click', () => {
            document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('selected'));
            method.classList.add('selected');
            selectedPaymentMethod = method.getAttribute('data-method');
            
            // نمایش/مخفی کردن کیف پول
            const walletPayment = document.getElementById('walletPayment');
            if (walletPayment) {
                if (selectedPaymentMethod === 'wallet') {
                    walletPayment.style.display = 'block';
                } else {
                    walletPayment.style.display = 'none';
                }
            }
        });
    });
    
    // تعویض مبدا و مقصد
    const swapLocationsBtn = document.getElementById('swapLocations');
    if (swapLocationsBtn) {
        swapLocationsBtn.addEventListener('click', () => {
            const pickupInput = document.getElementById('pickup');
            const destinationInput = document.getElementById('destination');
            
            if (!pickupInput || !destinationInput) return;
            
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
    }
    
    // فرم درخواست سفر
    const rideForm = document.getElementById('rideForm');
    if (rideForm) {
        rideForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const pickupInput = document.getElementById('pickup');
            const destinationInput = document.getElementById('destination');
            
            if (!pickupInput || !destinationInput) return;
            
            const pickup = pickupInput.value.trim();
            const destination = destinationInput.value.trim();

            if (!pickup || !destination) {
                showNotification('لطفاً مبدا و مقصد را وارد کنید', 'error');
                return;
            }

            if (pickup === destination) {
                showNotification('مبدا و مقصد نمی‌توانند یکسان باشند', 'error');
                return;
            }

            // محاسبه قیمت
            const baseFares = {
                'economy': 50,
                'comfort': 80,
                'bike': 30
            };
            
            // اگر مسافت محاسبه نشده، تصادفی محاسبه می‌کنیم
            if (currentDistance === 0) {
                currentDistance = Math.random() * 10 + 1; // بین 1 تا 11 کیلومتر
            }
            
            const distanceFare = currentDistance * 20; // 20 افغانی به ازای هر کیلومتر
            const baseFare = baseFares[selectedRideType] || 50;
            currentPrice = Math.round(baseFare + distanceFare);

            // ایجاد سفر
            const trip = await createTrip(pickup, destination, selectedRideType, currentPrice);
            
            if (trip) {
                // شروع جستجوی راننده
                startDriverSearch();
            }
        });
    }
    
    // لغو جستجو
    const cancelSearchBtn = document.getElementById('cancelSearch');
    if (cancelSearchBtn) {
        cancelSearchBtn.addEventListener('click', () => {
            const searchingOverlay = document.getElementById('searchingOverlay');
            const submitBtn = document.getElementById('submitBtn');
            
            if (searchingOverlay) searchingOverlay.style.display = 'none';
            if (submitBtn) submitBtn.disabled = false;
            
            if (window.searchInterval) {
                clearInterval(window.searchInterval);
            }
            showNotification('جستجو لغو شد', 'warning');
        });
    }
    
    // تأیید سفر
    const confirmRideBtn = document.getElementById('confirmRide');
    if (confirmRideBtn) {
        confirmRideBtn.addEventListener('click', async () => {
            const driverModal = document.getElementById('driverModal');
            if (driverModal) driverModal.style.display = 'none';
            
            showNotification('سفر شما با موفقیت ثبت شد. راننده به زودی با شما تماس خواهد گرفت.', 'success');
            
            // بازنشانی فرم
            const rideForm = document.getElementById('rideForm');
            const submitBtn = document.getElementById('submitBtn');
            
            if (rideForm) rideForm.reset();
            if (submitBtn) submitBtn.disabled = false;
            
            // شروع ردیابی
            startTripTracking();
        });
    }
    
    // لغو سفر
    const cancelRideBtn = document.getElementById('cancelRide');
    if (cancelRideBtn) {
        cancelRideBtn.addEventListener('click', () => {
            const driverModal = document.getElementById('driverModal');
            if (driverModal) driverModal.style.display = 'none';
            
            const submitBtn = document.getElementById('submitBtn');
            if (submitBtn) submitBtn.disabled = false;
            
            showNotification('سفر لغو شد', 'warning');
        });
    }
    
    // بستن ردیابی
    const closeTrackingBtn = document.getElementById('closeTracking');
    if (closeTrackingBtn) {
        closeTrackingBtn.addEventListener('click', () => {
            const liveTracking = document.getElementById('liveTracking');
            if (liveTracking) liveTracking.style.display = 'none';
            
            if (trackingInterval) {
                clearInterval(trackingInterval);
            }
        });
    }
    
    // لغو ردیابی
    const cancelTrackingBtn = document.getElementById('cancelTracking');
    if (cancelTrackingBtn) {
        cancelTrackingBtn.addEventListener('click', () => {
            const liveTracking = document.getElementById('liveTracking');
            if (liveTracking) liveTracking.style.display = 'none';
            
            if (trackingInterval) {
                clearInterval(trackingInterval);
            }
            
            showNotification('ردیابی سفر لغو شد', 'warning');
        });
    }
    
    // مدیریت ورود/ثبتنام
    const loginBtn = document.getElementById('loginBtn');
    const mobileLoginBtn = document.getElementById('mobileLoginBtn');
    
    if (loginBtn) loginBtn.addEventListener('click', openAuthModal);
    if (mobileLoginBtn) mobileLoginBtn.addEventListener('click', openAuthModal);
    
    // بستن مدال‌ها
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });
    
    // فرم ورود
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
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
                if (email === 'admin@snap.af' && password === 'admin123') {
                    // ایجاد کاربر ادمین
                    currentUser = {
                        id: 'admin-001',
                        name: 'مدیر سیستم',
                        email: 'admin@snap.af',
                        phone: '0700123456',
                        role: 'admin',
                        status: 'approved'
                    };
                    isAdmin = true;
                    updateUIAfterLogin();
                    
                    const authModal = document.getElementById('authModal');
                    if (authModal) authModal.style.display = 'none';
                    
                    loginForm.reset();
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
                
                const authModal = document.getElementById('authModal');
                if (authModal) authModal.style.display = 'none';
                
                loginForm.reset();
                
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
                        
                        const authModal = document.getElementById('authModal');
                        if (authModal) authModal.style.display = 'none';
                        
                        loginForm.reset();
                        
                    } catch (signUpError) {
                        showError('loginEmail', 'ایمیل/شماره تماس یا رمز عبور اشتباه است');
                    }
                } else {
                    showError('loginEmail', 'ایمیل/شماره تماس یا رمز عبور اشتباه است');
                }
            }
        });
    }
    
    // فرم ثبت‌نام
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
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
                
                showNotification('ثبت‌نام شما با موفقیت انجام شد. اکنون می‌توانید وارد شوید.', 'success');
                registerForm.reset();
                
                // تغییر به تب ورود
                document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.form-tab-content').forEach(c => c.classList.remove('active'));
                
                const loginTab = document.querySelector('.form-tab[data-tab="login"]');
                const loginTabContent = document.getElementById('login-tab');
                
                if (loginTab) loginTab.classList.add('active');
                if (loginTabContent) loginTabContent.classList.add('active');
                
            } catch (error) {
                console.error('Registration error:', error);
                
                if (error.message.includes('already registered')) {
                    showError('registerEmail', 'این ایمیل قبلاً ثبت‌نام کرده است');
                } else {
                    showError('registerEmail', 'خطا در ثبت‌نام. لطفاً مجدداً تلاش کنید.');
                }
            }
        });
    }
    
    // مدیریت خروج
    const logoutBtn = document.getElementById('logoutBtn');
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', logout);
    
    // مدیریت منوی موبایل
    const hamburger = document.getElementById('hamburger');
    const closeMenu = document.getElementById('closeMenu');
    const overlay = document.getElementById('overlay');
    const mobileMenu = document.getElementById('mobileMenu');
    
    if (hamburger) {
        hamburger.addEventListener('click', () => {
            if (mobileMenu) mobileMenu.classList.add('active');
            if (overlay) overlay.classList.add('active');
            hamburger.classList.add('active');
        });
    }
    
    if (closeMenu) {
        closeMenu.addEventListener('click', () => {
            if (mobileMenu) mobileMenu.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
            if (hamburger) hamburger.classList.remove('active');
        });
    }
    
    if (overlay) {
        overlay.addEventListener('click', () => {
            if (mobileMenu) mobileMenu.classList.remove('active');
            overlay.classList.remove('active');
            if (hamburger) hamburger.classList.remove('active');
        });
    }
    
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
            if (mobileMenu) mobileMenu.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
            if (hamburger) hamburger.classList.remove('active');
            
            // بارگذاری داده‌های صفحه
            if (pageId === 'my-trips-page') {
                loadMyTrips();
            } else if (pageId === 'discounts-page') {
                loadDiscounts();
            } else if (pageId === 'profile-page') {
                updateProfilePage();
            } else if (pageId === 'admin-page') {
                loadAdminPanel();
            } else if (pageId === 'home-page') {
                // بارگذاری نقشه برای صفحه اصلی
                if (!map) initMap();
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
            const targetTab = document.getElementById(`${tabId}-tab`);
            if (targetTab) targetTab.classList.add('active');
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
    const submitRatingBtn = document.getElementById('submitRating');
    if (submitRatingBtn) {
        submitRatingBtn.addEventListener('click', () => {
            const ratingStars = document.querySelectorAll('.rating-star.active');
            const rating = ratingStars.length;
            const commentInput = document.getElementById('ratingComment');
            const comment = commentInput ? commentInput.value : '';
            
            showNotification(`امتیاز ${rating} ستاره شما ثبت شد${comment ? ' با تشکر از نظر شما' : ''}`, 'success');
            
            const ratingModal = document.getElementById('ratingModal');
            if (ratingModal) ratingModal.style.display = 'none';
            
            // بازنشانی فرم امتیازدهی
            const stars = document.querySelectorAll('.rating-star');
            stars.forEach(star => star.classList.remove('active'));
            
            if (commentInput) commentInput.value = '';
        });
    }
    
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
            
            if (!input || !icon) return;
            
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
            const targetTab = document.getElementById(`${tabId}-tab`);
            if (targetTab) targetTab.classList.add('active');
            
            clearErrors();
        });
    });
    
    // رویدادهای کلیک بر روی overlay ها
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // ذخیره پروفایل
    const saveProfileBtn = document.getElementById('saveProfile');
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            const editName = document.getElementById('editName');
            const editEmail = document.getElementById('editEmail');
            const editPhone = document.getElementById('editPhone');
            
            if (!editName || !editEmail || !editPhone) return;
            
            if (!currentUser) {
                showNotification('لطفاً ابتدا وارد حساب کاربری خود شوید', 'error');
                return;
            }
            
            try {
                // به‌روزرسانی پروفایل کاربر
                const { data, error } = await supabase
                    .from('users')
                    .update({
                        name: editName.value.trim(),
                        email: editEmail.value.trim(),
                        phone: editPhone.value.trim(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', currentUser.id)
                    .select()
                    .single();
                
                if (error) throw error;
                
                currentUser = data;
                updateProfilePage();
                updateUIAfterLogin();
                showNotification('پروفایل شما با موفقیت به‌روزرسانی شد', 'success');
                
            } catch (error) {
                console.error('Error updating profile:', error);
                showNotification('خطا در به‌روزرسانی پروفایل', 'error');
            }
        });
    }
    
    // ارسال پیام در چت پشتیبانی
    const sendMessageBtn = document.getElementById('sendMessage');
    const chatInput = document.getElementById('chatInput');
    
    if (sendMessageBtn && chatInput) {
        sendMessageBtn.addEventListener('click', () => {
            const message = chatInput.value.trim();
            if (!message) {
                showNotification('لطفاً پیام خود را وارد کنید', 'error');
                return;
            }
            
            if (!currentUser) {
                showNotification('لطفاً ابتدا وارد حساب کاربری خود شوید', 'error');
                openAuthModal();
                return;
            }
            
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                const messageElement = document.createElement('div');
                messageElement.className = 'message sent';
                messageElement.innerHTML = `
                    ${message}
                    <div class="message-time">اکنون</div>
                `;
                chatMessages.appendChild(messageElement);
                chatMessages.scrollTop = chatMessages.scrollHeight;
                
                // شبیه‌سازی پاسخ پشتیبانی
                setTimeout(() => {
                    const responseElement = document.createElement('div');
                    responseElement.className = 'message received';
                    responseElement.innerHTML = `
                        پیام شما دریافت شد. همکاران ما در اولین فرصت با شما تماس خواهند گرفت.
                        <div class="message-time">اکنون</div>
                    `;
                    chatMessages.appendChild(responseElement);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }, 1000);
            }
            
            chatInput.value = '';
            showNotification('پیام شما ارسال شد', 'success');
        });
        
        // ارسال با Enter
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessageBtn.click();
            }
        });
    }
    
    // بارگذاری اولیه مقاصد پیشنهادی
    setTimeout(() => {
        const suggestionsList = document.querySelector('.suggestion-list');
        if (suggestionsList && popularDestinations.length === 0) {
            const defaultSuggestions = [
                { name: 'میدان هوایی بین المللی کابل', icon: 'fas fa-plane' },
                { name: 'سفارت امریکا', icon: 'fas fa-landmark' },
                { name: 'سفارت ایران', icon: 'fas fa-landmark' },
                { name: 'سفارت پاکستان', icon: 'fas fa-landmark' },
                { name: 'وزارت امور خارجه', icon: 'fas fa-building' },
                { name: 'ارگ ریاست جمهوری', icon: 'fas fa-monument' }
            ];
            
            defaultSuggestions.forEach(destination => {
                const suggestionItem = document.createElement('div');
                suggestionItem.className = 'suggestion-item';
                suggestionItem.innerHTML = `
                    <div class="suggestion-icon">
                        <i class="${destination.icon}"></i>
                    </div>
                    <div class="suggestion-text">${destination.name}</div>
                `;
                suggestionItem.setAttribute('data-destination', destination.name);
                
                suggestionItem.addEventListener('click', () => {
                    const destinationInput = document.getElementById('destination');
                    if (destinationInput) {
                        destinationInput.value = destination.name;
                        showNotification(`مقصد "${destination.name}" انتخاب شد`, 'info');
                    }
                });
                
                suggestionsList.appendChild(suggestionItem);
            });
        }
    }, 1000);
};

// تابع بارگذاری سفرهای من
function loadMyTrips() {
    const table = document.getElementById('myTripsTable');
    if (!table) return;
    
    // سفرهای نمونه
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
                <button class="action-btn btn-view" onclick="viewTripDetails('${trip.date}')">جزئیات</button>
            </td>
        `;
        
        table.appendChild(row);
    });
}

// تابع بارگذاری تخفیف‌ها
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
            <button class="btn btn-primary" style="margin-top: 15px; width: 100%;" onclick="useDiscount('${discount.code}')">استفاده از کد</button>
        `;
        
        container.appendChild(discountCard);
    });
}

// توابع اضافی برای پنل ادمین
async function loadDrivers() {
    const table = document.getElementById('driversTable');
    if (!table) return;
    
    // رانندگان نمونه
    const sampleDrivers = [
        { name: 'احمد ظاهر', phone: '0700111222', vehicle_type: 'car', vehicle_model: 'تویوتا کورولا', license_plate: 'کابل ۱۲۳۴', status: 'available' },
        { name: 'محمد کریمی', phone: '0700222333', vehicle_type: 'car', vehicle_model: 'هیوندای النترا', license_plate: 'کابل ۵۶۷۸', status: 'busy' },
        { name: 'کریم علی', phone: '0700333444', vehicle_type: 'bike', vehicle_model: 'موتور هوندا', license_plate: 'کابل ۹۱۰۱', status: 'available' },
        { name: 'نوید احمدی', phone: '0700444555', vehicle_type: 'car', vehicle_model: 'پراید', license_plate: 'کابل ۱۱۱۲', status: 'offline' }
    ];
    
    table.innerHTML = '';
    
    sampleDrivers.forEach(driver => {
        const row = document.createElement('tr');
        const statusClass = `status-${driver.status}`;
        const statusText = {
            'available': 'آماده به کار',
            'busy': 'مشغول',
            'offline': 'آفلاین'
        }[driver.status] || driver.status;
        const vehicleTypeText = driver.vehicle_type === 'car' ? 'خودرو' : 'موتور';
        
        row.innerHTML = `
            <td>${driver.name}</td>
            <td>${driver.phone}</td>
            <td>${vehicleTypeText}</td>
            <td>${driver.vehicle_model}</td>
            <td>${driver.license_plate}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td class="action-buttons">
                <button class="action-btn btn-edit" onclick="editDriver('${driver.name}')">ویرایش</button>
                <button class="action-btn btn-reject" onclick="deleteDriver('${driver.name}')">حذف</button>
            </td>
        `;
        
        table.appendChild(row);
    });
}

async function loadAdminTrips() {
    const table = document.getElementById('adminTripsTable');
    if (!table) return;
    
    // سفرهای نمونه
    const sampleTrips = [
        { date: '۱۴۰۳/۰۱/۱۵', passenger: 'احمد محمدی', driver: 'احمد ظاهر', pickup: 'کارته پروان', destination: 'میدان هوایی', cost: '۲۱۰ افغانی', status: 'completed' },
        { date: '۱۴۰۳/۰۱/۱۴', passenger: 'محمد کریمی', driver: 'محمد کریمی', pickup: 'شاروالی کابل', destination: 'دشت برچی', cost: '۱۸۰ افغانی', status: 'in_progress' },
        { date: '۱۴۰۳/۰۱/۱۳', passenger: 'نوید احمدی', driver: 'کریم علی', pickup: 'چهاردهی', destination: 'مکرویان', cost: '۱۵۰ افغانی', status: 'completed' },
        { date: '۱۴۰۳/۰۱/۱۲', passenger: 'کریم علیزاده', driver: 'احمد ظاهر', pickup: 'قلعه‌وزی', destination: 'کارته سخی', cost: '۱۲۰ افغانی', status: 'cancelled' }
    ];
    
    table.innerHTML = '';
    
    sampleTrips.forEach(trip => {
        const row = document.createElement('tr');
        const statusClass = `status-${trip.status}`;
        const statusText = {
            'completed': 'تکمیل شده',
            'in_progress': 'در حال سفر',
            'cancelled': 'لغو شده',
            'requested': 'درخواست شده',
            'confirmed': 'تأیید شده'
        }[trip.status] || trip.status;
        
        row.innerHTML = `
            <td>${trip.date}</td>
            <td>${trip.passenger}</td>
            <td>${trip.driver}</td>
            <td>${trip.pickup}</td>
            <td>${trip.destination}</td>
            <td>${trip.cost}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td class="action-buttons">
                <button class="action-btn btn-view" onclick="viewTripDetails('${trip.date}')">جزئیات</button>
                <button class="action-btn btn-edit" onclick="editTrip('${trip.date}')">ویرایش</button>
            </td>
        `;
        
        table.appendChild(row);
    });
}

async function loadAdminDiscounts() {
    const table = document.getElementById('discountsTable');
    if (!table) return;
    
    // تخفیف‌های نمونه
    const sampleDiscounts = [
        { code: 'WELCOME100', percent: '۱۰۰', expiry: '۱۴۰۳/۰۲/۱۵', users: '۴۵', status: 'active' },
        { code: 'SAVE50', percent: '۵۰', expiry: '۱۴۰۳/۰۱/۳۰', users: '۸۹', status: 'active' },
        { code: 'FREERIDE', percent: '۱۰۰', expiry: '۱۴۰۳/۰۲/۱۰', users: '۵۰', status: 'exhausted' },
        { code: 'DISCOUNT30', percent: '۳۰', expiry: '۱۴۰۳/۰۱/۲۰', users: '۲۰۰', status: 'expired' }
    ];
    
    table.innerHTML = '';
    
    sampleDiscounts.forEach(discount => {
        const row = document.createElement('tr');
        const statusClass = `status-${discount.status === 'active' ? 'approved' : 'rejected'}`;
        const statusText = {
            'active': 'فعال',
            'expired': 'منقضی شده',
            'exhausted': 'تمام شده'
        }[discount.status] || discount.status;
        
        row.innerHTML = `
            <td>${discount.code}</td>
            <td>${discount.percent}%</td>
            <td>${discount.expiry}</td>
            <td>${discount.users} نفر</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td class="action-buttons">
                <button class="action-btn btn-edit" onclick="editDiscount('${discount.code}')">ویرایش</button>
                <button class="action-btn btn-reject" onclick="deleteDiscount('${discount.code}')">حذف</button>
            </td>
        `;
        
        table.appendChild(row);
    });
}

async function loadAdminSupport() {
    const table = document.getElementById('adminSupportTable');
    if (!table) return;
    
    // درخواست‌های پشتیبانی نمونه
    const sampleTickets = [
        { user: 'احمد محمدی', subject: 'مشکل در پرداخت', message: 'پرداخت من تکمیل نشده است...', date: '۱۴۰۳/۰۱/۱۵', status: 'pending' },
        { user: 'محمد کریمی', subject: 'سوال درباره تخفیف', message: 'چگونه از کد تخفیف استفاده کنم؟', date: '۱۴۰۳/۰۱/۱۴', status: 'answered' },
        { user: 'نوید احمدی', subject: 'مشکل با راننده', message: 'راننده دیر آمد...', date: '۱۴۰۳/۰۱/۱۳', status: 'closed' },
        { user: 'کریم علیزاده', subject: 'درخواست بازگشت وجه', message: 'سفر من لغو شد اما پولم برنگشت...', date: '۱۴۰۳/۰۱/۱۲', status: 'pending' }
    ];
    
    table.innerHTML = '';
    
    sampleTickets.forEach(ticket => {
        const row = document.createElement('tr');
        const statusClass = `status-${ticket.status === 'pending' ? 'pending' : ticket.status === 'answered' ? 'approved' : 'completed'}`;
        const statusText = {
            'pending': 'در انتظار پاسخ',
            'answered': 'پاسخ داده شده',
            'closed': 'بسته شده'
        }[ticket.status] || ticket.status;
        const shortMessage = ticket.message.length > 50 ? ticket.message.substring(0, 50) + '...' : ticket.message;
        
        row.innerHTML = `
            <td>${ticket.user}</td>
            <td>${ticket.subject}</td>
            <td>${shortMessage}</td>
            <td>${ticket.date}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td class="action-buttons">
                <button class="action-btn btn-view" onclick="viewSupportTicket('${ticket.user}')">مشاهده</button>
                <button class="action-btn btn-edit" onclick="replySupportTicket('${ticket.user}')">پاسخ</button>
            </td>
        `;
        
        table.appendChild(row);
    });
}

// تابع‌های عمومی برای استفاده در HTML
window.selectDriver = selectDriver;
window.approveUser = function(userId) {
    showNotification('کاربر با موفقیت تایید شد', 'success');
    // در اینجا می‌توانید درخواست به Supabase اضافه کنید
};

window.rejectUser = function(userId) {
    if (confirm('آیا از رد این کاربر اطمینان دارید؟')) {
        showNotification('کاربر با موفقیت رد شد', 'success');
    }
};

window.suspendUser = function(userId) {
    if (confirm('آیا از معلق کردن این کاربر اطمینان دارید؟')) {
        showNotification('کاربر با موفقیت معلق شد', 'success');
    }
};

window.deleteUser = function(userId) {
    if (confirm('آیا از حذف این کاربر اطمینان دارید؟')) {
        showNotification('کاربر با موفقیت حذف شد', 'success');
    }
};

window.viewTripDetails = function(tripId) {
    showNotification(`جزئیات سفر ${tripId} نمایش داده شد`, 'info');
};

window.useDiscount = function(discountCode) {
    if (!currentUser) {
        showNotification('لطفاً ابتدا وارد حساب کاربری خود شوید', 'error');
        openAuthModal();
        return;
    }
    showNotification(`کد تخفیف ${discountCode} با موفقیت اعمال شد`, 'success');
};

window.editDriver = function(driverName) {
    showNotification(`ویرایش راننده ${driverName}`, 'info');
};

window.deleteDriver = function(driverName) {
    if (confirm(`آیا از حذف راننده ${driverName} اطمینان دارید؟`)) {
        showNotification(`راننده ${driverName} با موفقیت حذف شد`, 'success');
    }
};

window.editTrip = function(tripId) {
    showNotification(`ویرایش سفر ${tripId}`, 'info');
};

window.editDiscount = function(discountCode) {
    showNotification(`ویرایش تخفیف ${discountCode}`, 'info');
};

window.deleteDiscount = function(discountCode) {
    if (confirm(`آیا از حذف تخفیف ${discountCode} اطمینان دارید؟`)) {
        showNotification(`تخفیف ${discountCode} با موفقیت حذف شد`, 'success');
    }
};

window.viewSupportTicket = function(userName) {
    showNotification(`مشاهده تیکت پشتیبانی کاربر ${userName}`, 'info');
};

window.replySupportTicket = function(userName) {
    showNotification(`پاسخ به تیکت پشتیبانی کاربر ${userName}`, 'info');
};

// تابع برای به‌روزرسانی نقشه
window.refreshMap = function() {
    if (map) {
        loadActiveDrivers();
        showNotification('نقشه به‌روزرسانی شد', 'success');
    }
};

// تابع برای پاک کردن نقشه
window.clearMap = function() {
    if (userMarker) {
        map.removeLayer(userMarker);
        userMarker = null;
    }
    
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    
    const pickupInput = document.getElementById('pickup');
    const destinationInput = document.getElementById('destination');
    
    if (pickupInput) pickupInput.value = '';
    if (destinationInput) destinationInput.value = '';
    
    const tripCalculator = document.getElementById('tripCalculator');
    if (tripCalculator) tripCalculator.style.display = 'none';
    
    showNotification('نقشه پاک شد', 'info');
};

// اضافه کردن توابع به window برای دسترسی جهانی
window.logout = logout;
window.openAuthModal = openAuthModal;
window.showNotification = showNotification;