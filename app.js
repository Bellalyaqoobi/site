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
let currentPage = 1;
let pageSize = 10;
let currentFilter = {};

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

// ============================================
// مدیریت نقشه
// ============================================

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

// ============================================
// پنل مدیریت - اصلی
// ============================================

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
    
    showNotification('پنل مدیریت با موفقیت بارگذاری شد', 'success');
}

// ============================================
// 1. دکمه بروزرسانی
// ============================================

window.refreshAdminData = async function() {
    try {
        showNotification('در حال بروزرسانی داده‌ها...', 'info');
        
        // بروزرسانی آمار
        await loadAdminStats();
        
        // بروزرسانی کاربران
        await loadPendingUsers();
        await loadAllUsers();
        
        // بروزرسانی رانندگان
        await loadDrivers();
        
        // بروزرسانی سفرها
        await loadAdminTrips();
        
        // بروزرسانی تخفیف‌ها
        await loadAdminDiscounts();
        
        // بروزرسانی پشتیبانی
        await loadAdminSupport();
        
        showNotification('همه داده‌ها با موفقیت بروزرسانی شدند', 'success');
    } catch (error) {
        console.error('Error refreshing data:', error);
        showNotification('خطا در بروزرسانی داده‌ها', 'error');
    }
};

// ============================================
// 2. خروجی اکسل
// ============================================

window.exportToExcel = function(type) {
    try {
        let data = [];
        let filename = '';
        
        switch(type) {
            case 'users':
                data = prepareUsersData();
                filename = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
                break;
            case 'trips':
                data = prepareTripsData();
                filename = `trips-export-${new Date().toISOString().split('T')[0]}.csv`;
                break;
            case 'revenue':
                data = prepareRevenueData();
                filename = `revenue-export-${new Date().toISOString().split('T')[0]}.csv`;
                break;
            case 'drivers':
                data = prepareDriversData();
                filename = `drivers-export-${new Date().toISOString().split('T')[0]}.csv`;
                break;
        }
        
        exportCSV(data, filename);
        showNotification(`فایل ${filename} با موفقیت دانلود شد`, 'success');
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        showNotification('خطا در تولید فایل اکسل', 'error');
    }
};

function prepareUsersData() {
    const table = document.getElementById('allUsersTable');
    if (!table) return [];
    
    const data = [['نام', 'ایمیل', 'شماره تماس', 'نقش', 'وضعیت', 'تاریخ عضویت']];
    
    // جمع‌آوری داده‌ها از جدول
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
            const rowData = [
                cells[0].textContent,
                cells[1].textContent,
                cells[2].textContent,
                cells[3].textContent,
                cells[4].querySelector('.status-badge')?.textContent || cells[4].textContent,
                cells[5].textContent
            ];
            data.push(rowData);
        }
    });
    
    return data;
}

function prepareTripsData() {
    const table = document.getElementById('adminTripsTable');
    if (!table) return [];
    
    const data = [['تاریخ', 'مسافر', 'راننده', 'مبدا', 'مقصد', 'هزینه', 'وضعیت', 'مسافت']];
    
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 7) {
            const rowData = [
                cells[0].textContent,
                cells[1].textContent,
                cells[2].textContent,
                cells[3].textContent,
                cells[4].textContent,
                cells[5].textContent,
                cells[6].querySelector('.status-badge')?.textContent || cells[6].textContent,
                '8.2 km' // می‌توان از داده واقعی استفاده کرد
            ];
            data.push(rowData);
        }
    });
    
    return data;
}

function prepareRevenueData() {
    // داده‌های نمونه برای گزارش مالی
    return [
        ['ماه', 'تعداد سفر', 'درآمد کل', 'میانگین درآمد هر سفر', 'سفرهای موفق', 'سفرهای لغو شده'],
        ['دی 1402', '1245', '245,600', '197', '1180', '65'],
        ['بهمن 1402', '1320', '261,800', '198', '1254', '66'],
        ['اسفند 1402', '1400', '277,200', '198', '1330', '70'],
        ['فروردین 1403', '1520', '300,960', '198', '1444', '76']
    ];
}

function prepareDriversData() {
    const table = document.getElementById('driversTable');
    if (!table) return [];
    
    const data = [['نام', 'شماره تماس', 'نوع وسیله', 'مدل', 'پلاک', 'وضعیت', 'امتیاز', 'تعداد سفر']];
    
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
            const rowData = [
                cells[0].textContent,
                cells[1].textContent,
                cells[2].textContent,
                cells[3].textContent,
                cells[4].textContent,
                cells[5].querySelector('.status-badge')?.textContent || cells[5].textContent,
                '4.7', // امتیاز نمونه
                '125' // تعداد سفر نمونه
            ];
            data.push(rowData);
        }
    });
    
    return data;
}

function exportCSV(data, filename) {
    // تبدیل داده‌ها به فرمت CSV
    const csvContent = data.map(row => 
        row.map(cell => `"${cell}"`).join(',')
    ).join('\n');
    
    // ایجاد فایل و دانلود
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ============================================
// 3. فیلتر
// ============================================

window.applyFilter = function(type) {
    const filterModal = document.createElement('div');
    filterModal.className = 'modal';
    
    let filterContent = '';
    let filterTitle = '';
    
    switch(type) {
        case 'users':
            filterTitle = 'فیلتر کاربران';
            filterContent = `
                <div class="form-group">
                    <label for="filterUserRole">نقش</label>
                    <select id="filterUserRole" class="form-input">
                        <option value="">همه</option>
                        <option value="passenger">مسافر</option>
                        <option value="driver">راننده</option>
                        <option value="admin">مدیر</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="filterUserStatus">وضعیت</label>
                    <select id="filterUserStatus" class="form-input">
                        <option value="">همه</option>
                        <option value="pending">در انتظار تایید</option>
                        <option value="approved">تایید شده</option>
                        <option value="suspended">معلق شده</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="filterUserDate">تاریخ عضویت از</label>
                    <input type="date" id="filterUserDate" class="form-input">
                </div>
            `;
            break;
            
        case 'trips':
            filterTitle = 'فیلتر سفرها';
            filterContent = `
                <div class="form-group">
                    <label for="filterTripStatus">وضعیت سفر</label>
                    <select id="filterTripStatus" class="form-input">
                        <option value="">همه</option>
                        <option value="completed">تکمیل شده</option>
                        <option value="in_progress">در حال سفر</option>
                        <option value="cancelled">لغو شده</option>
                        <option value="requested">درخواست شده</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="filterTripDateFrom">از تاریخ</label>
                    <input type="date" id="filterTripDateFrom" class="form-input">
                </div>
                <div class="form-group">
                    <label for="filterTripDateTo">تا تاریخ</label>
                    <input type="date" id="filterTripDateTo" class="form-input">
                </div>
                <div class="form-group">
                    <label for="filterTripMinPrice">حداقل هزینه (افغانی)</label>
                    <input type="number" id="filterTripMinPrice" class="form-input" min="0">
                </div>
                <div class="form-group">
                    <label for="filterTripMaxPrice">حداکثر هزینه (افغانی)</label>
                    <input type="number" id="filterTripMaxPrice" class="form-input" min="0">
                </div>
            `;
            break;
            
        case 'drivers':
            filterTitle = 'فیلتر رانندگان';
            filterContent = `
                <div class="form-group">
                    <label for="filterDriverStatus">وضعیت</label>
                    <select id="filterDriverStatus" class="form-input">
                        <option value="">همه</option>
                        <option value="available">آماده به کار</option>
                        <option value="busy">مشغول</option>
                        <option value="offline">آفلاین</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="filterDriverType">نوع وسیله</label>
                    <select id="filterDriverType" class="form-input">
                        <option value="">همه</option>
                        <option value="car">خودرو</option>
                        <option value="bike">موتور</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="filterDriverRating">حداقل امتیاز</label>
                    <select id="filterDriverRating" class="form-input">
                        <option value="0">همه</option>
                        <option value="3">۳ ستاره و بالاتر</option>
                        <option value="4">۴ ستاره و بالاتر</option>
                        <option value="5">۵ ستاره</option>
                    </select>
                </div>
            `;
            break;
    }
    
    filterModal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3>${filterTitle}</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="filterForm">
                    ${filterContent}
                    <div class="form-buttons">
                        <button type="submit" class="btn btn-primary">اعمال فیلتر</button>
                        <button type="button" class="btn btn-secondary" onclick="clearFilter('${type}')">پاک کردن فیلتر</button>
                        <button type="button" class="btn btn-secondary close-modal">بستن</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(filterModal);
    
    // رویداد بستن مدال
    filterModal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.body.removeChild(filterModal);
        });
    });
    
    // رویداد کلیک روی overlay
    filterModal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(filterModal);
        }
    });
    
    // رویداد ارسال فرم
    const form = filterModal.querySelector('#filterForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // ذخیره فیلترها
        currentFilter[type] = {};
        const formData = new FormData(form);
        
        for (let [key, value] of formData.entries()) {
            if (value) {
                currentFilter[type][key.replace('filter', '').toLowerCase()] = value;
            }
        }
        
        // اعمال فیلتر
        applyTableFilter(type);
        
        document.body.removeChild(filterModal);
        showNotification('فیلترها اعمال شدند', 'success');
    });
};

window.clearFilter = function(type) {
    currentFilter[type] = {};
    applyTableFilter(type);
    showNotification('فیلترها پاک شدند', 'info');
};

function applyTableFilter(type) {
    switch(type) {
        case 'users':
            filterUsersTable();
            break;
        case 'trips':
            filterTripsTable();
            break;
        case 'drivers':
            filterDriversTable();
            break;
    }
}

function filterUsersTable() {
    const table = document.getElementById('allUsersTable');
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr');
    const filter = currentFilter['users'] || {};
    
    rows.forEach(row => {
        let shouldShow = true;
        const cells = row.querySelectorAll('td');
        
        if (cells.length >= 6) {
            // فیلتر بر اساس نقش
            if (filter.role && cells[3].textContent !== filter.role) {
                shouldShow = false;
            }
            
            // فیلتر بر اساس وضعیت
            if (filter.status) {
                const statusText = cells[4].querySelector('.status-badge')?.textContent || '';
                if (!statusText.includes(filter.status)) {
                    shouldShow = false;
                }
            }
        }
        
        row.style.display = shouldShow ? '' : 'none';
    });
}

// ============================================
// 4. افزودن راننده جدید
// ============================================

window.addNewDriver = function() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3>افزودن راننده جدید</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="addDriverForm">
                    <div class="row">
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newDriverName">نام راننده *</label>
                                <input type="text" id="newDriverName" class="form-input" required>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newDriverPhone">شماره تماس *</label>
                                <input type="tel" id="newDriverPhone" class="form-input" required pattern="07[0-9]{8}">
                            </div>
                        </div>
                    </div>
                    
                    <div class="row">
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newDriverEmail">ایمیل</label>
                                <input type="email" id="newDriverEmail" class="form-input">
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newDriverNID">شماره تذکره</label>
                                <input type="text" id="newDriverNID" class="form-input">
                            </div>
                        </div>
                    </div>
                    
                    <div class="row">
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newVehicleType">نوع وسیله *</label>
                                <select id="newVehicleType" class="form-input" required>
                                    <option value="car">خودرو</option>
                                    <option value="bike">موتور</option>
                                </select>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newVehicleModel">مدل وسیله *</label>
                                <input type="text" id="newVehicleModel" class="form-input" required>
                            </div>
                        </div>
                    </div>
                    
                    <div class="row">
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newLicensePlate">پلاک *</label>
                                <input type="text" id="newLicensePlate" class="form-input" required>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newVehicleColor">رنگ</label>
                                <input type="text" id="newVehicleColor" class="form-input">
                            </div>
                        </div>
                    </div>
                    
                    <div class="row">
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newDriverStatus">وضعیت *</label>
                                <select id="newDriverStatus" class="form-input" required>
                                    <option value="available">آماده به کار</option>
                                    <option value="offline">آفلاین</option>
                                    <option value="busy">مشغول</option>
                                </select>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newDriverRating">امتیاز اولیه</label>
                                <input type="number" id="newDriverRating" class="form-input" min="1" max="5" step="0.1" value="5.0">
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="newDriverAddress">آدرس</label>
                        <textarea id="newDriverAddress" class="form-input" rows="2"></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label for="newDriverNotes">یادداشت</label>
                        <textarea id="newDriverNotes" class="form-input" rows="3"></textarea>
                    </div>
                    
                    <div class="form-buttons">
                        <button type="submit" class="btn btn-primary">ثبت راننده</button>
                        <button type="button" class="btn btn-secondary close-modal">لغو</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // رویداد بستن مدال
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    });
    
    // رویداد کلیک روی overlay
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // رویداد ارسال فرم
    const form = modal.querySelector('#addDriverForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const driverData = {
            name: document.getElementById('newDriverName').value,
            phone: document.getElementById('newDriverPhone').value,
            email: document.getElementById('newDriverEmail').value || null,
            national_id: document.getElementById('newDriverNID').value || null,
            vehicle_type: document.getElementById('newVehicleType').value,
            vehicle_model: document.getElementById('newVehicleModel').value,
            license_plate: document.getElementById('newLicensePlate').value,
            vehicle_color: document.getElementById('newVehicleColor').value || null,
            status: document.getElementById('newDriverStatus').value,
            rating: parseFloat(document.getElementById('newDriverRating').value) || 5.0,
            address: document.getElementById('newDriverAddress').value || null,
            notes: document.getElementById('newDriverNotes').value || null,
            is_online: document.getElementById('newDriverStatus').value === 'available',
            total_trips: 0,
            created_at: new Date().toISOString()
        };
        
        try {
            // ذخیره در Supabase
            const { data, error } = await supabase
                .from('drivers')
                .insert([driverData])
                .select()
                .single();
            
            if (error) throw error;
            
            // اضافه کردن به لیست محلی
            activeDrivers.push(data);
            
            // بروزرسانی UI
            document.body.removeChild(modal);
            await loadDrivers();
            updateDriverMarkers();
            
            showNotification('راننده جدید با موفقیت اضافه شد', 'success');
            
            // ایجاد حساب کاربری برای راننده
            await createDriverUserAccount(driverData);
            
        } catch (error) {
            console.error('Error adding driver:', error);
            showNotification('خطا در افزودن راننده: ' + error.message, 'error');
        }
    });
};

async function createDriverUserAccount(driverData) {
    try {
        // ایجاد کاربر راننده در سیستم
        const { data, error } = await supabase.auth.admin.createUser({
            email: driverData.email || `${driverData.phone}@snap.af`,
            phone: driverData.phone,
            password: 'driver123', // رمز موقت
            email_confirm: true,
            user_metadata: {
                name: driverData.name,
                phone: driverData.phone,
                role: 'driver'
            }
        });
        
        if (error) throw error;
        
        // ایجاد رکورد در جدول users
        const { error: userError } = await supabase
            .from('users')
            .insert([{
                id: data.user.id,
                name: driverData.name,
                email: driverData.email || `${driverData.phone}@snap.af`,
                phone: driverData.phone,
                role: 'driver',
                status: 'approved',
                driver_id: driverData.id,
                created_at: new Date().toISOString()
            }]);
        
        if (userError) throw userError;
        
        showNotification('حساب کاربری برای راننده ایجاد شد', 'info');
        
    } catch (error) {
        console.error('Error creating driver user account:', error);
        // خطای این بخش مانع اصلی نیست
    }
}

// ============================================
// 5. گزارش سفرها
// ============================================

window.generateTripReport = function() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header">
                <h3>گزارش سفرها</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="tripReportForm">
                    <div class="row">
                        <div class="col-6">
                            <div class="form-group">
                                <label for="reportTripDateFrom">از تاریخ</label>
                                <input type="date" id="reportTripDateFrom" class="form-input" required>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="form-group">
                                <label for="reportTripDateTo">تا تاریخ</label>
                                <input type="date" id="reportTripDateTo" class="form-input" required>
                            </div>
                        </div>
                    </div>
                    
                    <div class="row">
                        <div class="col-6">
                            <div class="form-group">
                                <label for="reportTripStatus">وضعیت سفر</label>
                                <select id="reportTripStatus" class="form-input">
                                    <option value="all">همه</option>
                                    <option value="completed">تکمیل شده</option>
                                    <option value="cancelled">لغو شده</option>
                                    <option value="in_progress">در حال سفر</option>
                                </select>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="form-group">
                                <label for="reportTripType">نوع سفر</label>
                                <select id="reportTripType" class="form-input">
                                    <option value="all">همه</option>
                                    <option value="economy">اقتصادی</option>
                                    <option value="comfort">کلاسیک</option>
                                    <option value="bike">موتور</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div class="row">
                        <div class="col-6">
                            <div class="form-group">
                                <label for="reportDriverId">راننده (اختیاری)</label>
                                <select id="reportDriverId" class="form-input">
                                    <option value="">همه رانندگان</option>
                                </select>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="form-group">
                                <label for="reportPaymentMethod">روش پرداخت</label>
                                <select id="reportPaymentMethod" class="form-input">
                                    <option value="all">همه</option>
                                    <option value="cash">نقدی</option>
                                    <option value="wallet">کیف پول</option>
                                    <option value="card">کارت بانکی</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="reportGroupBy">گروه‌بندی بر اساس</label>
                        <select id="reportGroupBy" class="form-input">
                            <option value="day">روز</option>
                            <option value="week">هفته</option>
                            <option value="month">ماه</option>
                            <option value="driver">راننده</option>
                            <option value="ride_type">نوع سفر</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="includeDetails" checked>
                            شامل جزئیات سفرها
                        </label>
                    </div>
                    
                    <div class="form-buttons">
                        <button type="submit" class="btn btn-primary">تولید گزارش</button>
                        <button type="button" class="btn btn-secondary" onclick="previewTripReport()">پیش‌نمایش</button>
                        <button type="button" class="btn btn-secondary close-modal">بستن</button>
                    </div>
                </form>
                
                <div id="reportPreview" style="margin-top: 30px; display: none;">
                    <h4>پیش‌نمایش گزارش</h4>
                    <div id="previewContent" class="report-preview"></div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // بارگذاری رانندگان برای انتخاب
    loadDriversForReport();
    
    // تنظیم تاریخ‌های پیش‌فرض
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setMonth(today.getMonth() - 1);
    
    document.getElementById('reportTripDateFrom').value = lastMonth.toISOString().split('T')[0];
    document.getElementById('reportTripDateTo').value = today.toISOString().split('T')[0];
    
    // رویداد بستن مدال
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    });
    
    // رویداد کلیک روی overlay
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // رویداد ارسال فرم
    const form = modal.querySelector('#tripReportForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await generateFinalTripReport();
    });
};

async function loadDriversForReport() {
    try {
        const { data: drivers, error } = await supabase
            .from('drivers')
            .select('id, name')
            .order('name');
        
        if (error) throw error;
        
        const select = document.getElementById('reportDriverId');
        if (select && drivers) {
            drivers.forEach(driver => {
                const option = document.createElement('option');
                option.value = driver.id;
                option.textContent = driver.name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading drivers for report:', error);
    }
}

window.previewTripReport = async function() {
    try {
        const formData = getTripReportFormData();
        const reportData = await fetchTripReportData(formData);
        
        displayTripReportPreview(reportData);
        
        const previewSection = document.getElementById('reportPreview');
        if (previewSection) {
            previewSection.style.display = 'block';
        }
        
    } catch (error) {
        console.error('Error generating preview:', error);
        showNotification('خطا در تولید پیش‌نمایش گزارش', 'error');
    }
};

async function generateFinalTripReport() {
    try {
        showNotification('در حال تولید گزارش...', 'info');
        
        const formData = getTripReportFormData();
        const reportData = await fetchTripReportData(formData);
        
        // تولید گزارش نهایی
        const reportHTML = generateTripReportHTML(reportData, formData);
        
        // باز کردن گزارش در پنجره جدید
        const reportWindow = window.open('', '_blank');
        reportWindow.document.write(`
            <!DOCTYPE html>
            <html dir="rtl" lang="fa">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>گزارش سفرها - اسنپ افغانستان</title>
                <style>
                    body { font-family: Vazir, Tahoma; padding: 20px; }
                    .header { text-align: center; margin-bottom: 30px; }
                    .header h1 { color: #333; }
                    .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
                    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
                    .summary-item { text-align: center; padding: 15px; background: white; border-radius: 6px; }
                    .summary-value { font-size: 24px; font-weight: bold; color: #4CAF50; }
                    .summary-label { font-size: 14px; color: #666; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { padding: 12px; text-align: center; border: 1px solid #ddd; }
                    th { background: #4CAF50; color: white; }
                    tr:nth-child(even) { background: #f9f9f9; }
                    .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
                    @media print {
                        button { display: none; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                ${reportHTML}
                <div class="footer no-print">
                    <button onclick="window.print()">چاپ گزارش</button>
                    <button onclick="window.close()">بستن</button>
                </div>
            </body>
            </html>
        `);
        reportWindow.document.close();
        
        showNotification('گزارش با موفقیت تولید شد', 'success');
        
        // بستن مدال
        const modal = document.querySelector('.modal:last-child');
        if (modal) {
            document.body.removeChild(modal);
        }
        
    } catch (error) {
        console.error('Error generating final report:', error);
        showNotification('خطا در تولید گزارش', 'error');
    }
};

function getTripReportFormData() {
    return {
        dateFrom: document.getElementById('reportTripDateFrom').value,
        dateTo: document.getElementById('reportTripDateTo').value,
        status: document.getElementById('reportTripStatus').value,
        rideType: document.getElementById('reportTripType').value,
        driverId: document.getElementById('reportDriverId').value,
        paymentMethod: document.getElementById('reportPaymentMethod').value,
        groupBy: document.getElementById('reportGroupBy').value,
        includeDetails: document.getElementById('includeDetails').checked
    };
}

async function fetchTripReportData(formData) {
    try {
        // ساخت کوئری بر اساس فیلترها
        let query = supabase
            .from('trips')
            .select(`
                *,
                user:users(name),
                driver:drivers(name)
            `)
            .gte('created_at', `${formData.dateFrom}T00:00:00`)
            .lte('created_at', `${formData.dateTo}T23:59:59`);
        
        // فیلتر وضعیت
        if (formData.status !== 'all') {
            query = query.eq('status', formData.status);
        }
        
        // فیلتر نوع سفر
        if (formData.rideType !== 'all') {
            query = query.eq('ride_type', formData.rideType);
        }
        
        // فیلتر راننده
        if (formData.driverId) {
            query = query.eq('driver_id', formData.driverId);
        }
        
        // فیلتر روش پرداخت
        if (formData.paymentMethod !== 'all') {
            query = query.eq('payment_method', formData.paymentMethod);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        return data || [];
        
    } catch (error) {
        console.error('Error fetching trip report data:', error);
        return [];
    }
}

function displayTripReportPreview(data) {
    const previewContent = document.getElementById('previewContent');
    if (!previewContent) return;
    
    if (!data || data.length === 0) {
        previewContent.innerHTML = '<p style="color: #666; text-align: center;">داده‌ای برای نمایش وجود ندارد</p>';
        return;
    }
    
    // محاسبه آمار
    const totalTrips = data.length;
    const completedTrips = data.filter(t => t.status === 'completed').length;
    const totalRevenue = data
        .filter(t => t.status === 'completed')
        .reduce((sum, trip) => sum + (parseFloat(trip.estimated_price) || 0), 0);
    const avgTripValue = completedTrips > 0 ? totalRevenue / completedTrips : 0;
    
    let html = `
        <div class="summary">
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="summary-value">${totalTrips}</div>
                    <div class="summary-label">کل سفرها</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${completedTrips}</div>
                    <div class="summary-label">سفرهای تکمیل شده</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${Math.round(totalRevenue).toLocaleString('fa-IR')}</div>
                    <div class="summary-label">درآمد کل (افغانی)</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${Math.round(avgTripValue).toLocaleString('fa-IR')}</div>
                    <div class="summary-label">میانگین هر سفر</div>
                </div>
            </div>
        </div>
    `;
    
    // نمایش نمونه از داده‌ها
    if (data.length > 0) {
        html += `
            <h4>نمونه داده‌ها (${Math.min(5, data.length)} مورد اول)</h4>
            <table>
                <thead>
                    <tr>
                        <th>تاریخ</th>
                        <th>مسافر</th>
                        <th>راننده</th>
                        <th>مبدا</th>
                        <th>مقصد</th>
                        <th>هزینه</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        data.slice(0, 5).forEach(trip => {
            html += `
                <tr>
                    <td>${new Date(trip.created_at).toLocaleDateString('fa-IR')}</td>
                    <td>${trip.user?.name || '---'}</td>
                    <td>${trip.driver?.name || '---'}</td>
                    <td>${trip.pickup_location?.substring(0, 20) || '---'}</td>
                    <td>${trip.destination?.substring(0, 20) || '---'}</td>
                    <td>${trip.estimated_price || 0} افغانی</td>
                </tr>
            `;
        });
        
        html += `
                </tbody>
            </table>
        `;
    }
    
    previewContent.innerHTML = html;
}

function generateTripReportHTML(data, formData) {
    // محاسبه آمار کامل
    const totalTrips = data.length;
    const completedTrips = data.filter(t => t.status === 'completed').length;
    const cancelledTrips = data.filter(t => t.status === 'cancelled').length;
    const totalRevenue = data
        .filter(t => t.status === 'completed')
        .reduce((sum, trip) => sum + (parseFloat(trip.estimated_price) || 0), 0);
    
    // گروه‌بندی داده‌ها
    let groupedData = {};
    if (formData.groupBy === 'day') {
        groupedData = groupByDay(data);
    } else if (formData.groupBy === 'month') {
        groupedData = groupByMonth(data);
    } else if (formData.groupBy === 'driver') {
        groupedData = groupByDriver(data);
    }
    
    let html = `
        <div class="header">
            <h1>گزارش سفرها - اسنپ افغانستان</h1>
            <p>بازه زمانی: ${new Date(formData.dateFrom).toLocaleDateString('fa-IR')} تا ${new Date(formData.dateTo).toLocaleDateString('fa-IR')}</p>
            <p>تاریخ تولید: ${new Date().toLocaleDateString('fa-IR')}</p>
        </div>
        
        <div class="summary">
            <h3>خلاصه گزارش</h3>
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="summary-value">${totalTrips.toLocaleString('fa-IR')}</div>
                    <div class="summary-label">کل سفرها</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${completedTrips.toLocaleString('fa-IR')}</div>
                    <div class="summary-label">سفرهای موفق</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${cancelledTrips.toLocaleString('fa-IR')}</div>
                    <div class="summary-label">سفرهای لغو شده</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${Math.round(totalRevenue).toLocaleString('fa-IR')}</div>
                    <div class="summary-label">درآمد کل (افغانی)</div>
                </div>
            </div>
        </div>
    `;
    
    // نمایش جدول گروه‌بندی شده
    if (Object.keys(groupedData).length > 0) {
        html += `
            <h3>گروه‌بندی بر اساس ${getGroupByLabel(formData.groupBy)}</h3>
            <table>
                <thead>
                    <tr>
                        <th>${getGroupByLabel(formData.groupBy)}</th>
                        <th>تعداد سفر</th>
                        <th>درآمد کل</th>
                        <th>میانگین درآمد</th>
                        <th>نرخ موفقیت</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        Object.entries(groupedData).forEach(([key, value]) => {
            const successRate = value.total > 0 ? Math.round((value.completed / value.total) * 100) : 0;
            const avgRevenue = value.completed > 0 ? value.revenue / value.completed : 0;
            
            html += `
                <tr>
                    <td>${key}</td>
                    <td>${value.total.toLocaleString('fa-IR')}</td>
                    <td>${Math.round(value.revenue).toLocaleString('fa-IR')} افغانی</td>
                    <td>${Math.round(avgRevenue).toLocaleString('fa-IR')} افغانی</td>
                    <td>${successRate}%</td>
                </tr>
            `;
        });
        
        html += `
                </tbody>
            </table>
        `;
    }
    
    // نمایش جزئیات سفرها
    if (formData.includeDetails && data.length > 0) {
        html += `
            <h3>جزئیات سفرها</h3>
            <table>
                <thead>
                    <tr>
                        <th>ردیف</th>
                        <th>تاریخ</th>
                        <th>مسافر</th>
                        <th>راننده</th>
                        <th>مبدا</th>
                        <th>مقصد</th>
                        <th>نوع سفر</th>
                        <th>هزینه</th>
                        <th>وضعیت</th>
                        <th>روش پرداخت</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        data.forEach((trip, index) => {
            html += `
                <tr>
                    <td>${(index + 1).toLocaleString('fa-IR')}</td>
                    <td>${new Date(trip.created_at).toLocaleDateString('fa-IR')}</td>
                    <td>${trip.user?.name || '---'}</td>
                    <td>${trip.driver?.name || '---'}</td>
                    <td>${trip.pickup_location || '---'}</td>
                    <td>${trip.destination || '---'}</td>
                    <td>${getRideTypeLabel(trip.ride_type)}</td>
                    <td>${trip.estimated_price || 0} افغانی</td>
                    <td>${getStatusLabel(trip.status)}</td>
                    <td>${getPaymentMethodLabel(trip.payment_method)}</td>
                </tr>
            `;
        });
        
        html += `
                </tbody>
            </table>
        `;
    }
    
    return html;
}

function groupByDay(data) {
    const groups = {};
    
    data.forEach(trip => {
        const date = new Date(trip.created_at).toLocaleDateString('fa-IR');
        if (!groups[date]) {
            groups[date] = {
                total: 0,
                completed: 0,
                revenue: 0
            };
        }
        
        groups[date].total++;
        if (trip.status === 'completed') {
            groups[date].completed++;
            groups[date].revenue += parseFloat(trip.estimated_price) || 0;
        }
    });
    
    return groups;
}

function groupByMonth(data) {
    const groups = {};
    const monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
    
    data.forEach(trip => {
        const date = new Date(trip.created_at);
        const monthKey = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
        
        if (!groups[monthKey]) {
            groups[monthKey] = {
                total: 0,
                completed: 0,
                revenue: 0
            };
        }
        
        groups[monthKey].total++;
        if (trip.status === 'completed') {
            groups[monthKey].completed++;
            groups[monthKey].revenue += parseFloat(trip.estimated_price) || 0;
        }
    });
    
    return groups;
}

function groupByDriver(data) {
    const groups = {};
    
    data.forEach(trip => {
        const driverName = trip.driver?.name || 'نامعلوم';
        
        if (!groups[driverName]) {
            groups[driverName] = {
                total: 0,
                completed: 0,
                revenue: 0
            };
        }
        
        groups[driverName].total++;
        if (trip.status === 'completed') {
            groups[driverName].completed++;
            groups[driverName].revenue += parseFloat(trip.estimated_price) || 0;
        }
    });
    
    return groups;
}

function getGroupByLabel(groupBy) {
    const labels = {
        'day': 'روز',
        'week': 'هفته',
        'month': 'ماه',
        'driver': 'راننده',
        'ride_type': 'نوع سفر'
    };
    return labels[groupBy] || groupBy;
}

function getRideTypeLabel(type) {
    const labels = {
        'economy': 'اقتصادی',
        'comfort': 'کلاسیک',
        'bike': 'موتور'
    };
    return labels[type] || type;
}

function getStatusLabel(status) {
    const labels = {
        'completed': 'تکمیل شده',
        'cancelled': 'لغو شده',
        'in_progress': 'در حال سفر',
        'requested': 'درخواست شده',
        'confirmed': 'تأیید شده'
    };
    return labels[status] || status;
}

function getPaymentMethodLabel(method) {
    const labels = {
        'cash': 'نقدی',
        'wallet': 'کیف پول',
        'card': 'کارت بانکی'
    };
    return labels[method] || method;
}

// ============================================
// 6. گزارش مالی
// ============================================

window.generateFinancialReport = function() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header">
                <h3>گزارش مالی</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="financialReportForm">
                    <div class="row">
                        <div class="col-6">
                            <div class="form-group">
                                <label for="reportFinancialPeriod">دوره زمانی</label>
                                <select id="reportFinancialPeriod" class="form-input" onchange="toggleCustomDate()">
                                    <option value="today">امروز</option>
                                    <option value="yesterday">دیروز</option>
                                    <option value="this_week">این هفته</option>
                                    <option value="last_week">هفته گذشته</option>
                                    <option value="this_month">این ماه</option>
                                    <option value="last_month">ماه گذشته</option>
                                    <option value="custom">انتخابی</option>
                                </select>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="form-group">
                                <label for="reportCurrency">واحد پول</label>
                                <select id="reportCurrency" class="form-input">
                                    <option value="AFN">افغانی</option>
                                    <option value="USD">دلار</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div id="customDateRange" style="display: none;">
                        <div class="row">
                            <div class="col-6">
                                <div class="form-group">
                                    <label for="reportFinancialDateFrom">از تاریخ</label>
                                    <input type="date" id="reportFinancialDateFrom" class="form-input">
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="form-group">
                                    <label for="reportFinancialDateTo">تا تاریخ</label>
                                    <input type="date" id="reportFinancialDateTo" class="form-input">
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="row">
                        <div class="col-6">
                            <div class="form-group">
                                <label for="reportRevenueType">نوع درآمد</label>
                                <select id="reportRevenueType" class="form-input">
                                    <option value="all">همه</option>
                                    <option value="ride_fares">کرایه سفرها</option>
                                    <option value="commission">کمیسیون</option>
                                    <option value="other">سایر</option>
                                </select>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="form-group">
                                <label for="reportGroupByFinancial">گروه‌بندی</label>
                                <select id="reportGroupByFinancial" class="form-input">
                                    <option value="daily">روزانه</option>
                                    <option value="weekly">هفتگی</option>
                                    <option value="monthly">ماهانه</option>
                                    <option value="driver">بر اساس راننده</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="includeExpenses" checked>
                            شامل هزینه‌ها
                        </label>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="includeTaxes" checked>
                            شامل مالیات
                        </label>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="showCharts" checked>
                            نمایش نمودارها
                        </label>
                    </div>
                    
                    <div class="form-buttons">
                        <button type="submit" class="btn btn-primary">تولید گزارش مالی</button>
                        <button type="button" class="btn btn-secondary close-modal">بستن</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // تنظیم تاریخ امروز
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('reportFinancialDateFrom').value = today;
    document.getElementById('reportFinancialDateTo').value = today;
    
    // رویداد بستن مدال
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    });
    
    // رویداد کلیک روی overlay
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // رویداد ارسال فرم
    const form = modal.querySelector('#financialReportForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await generateFinalFinancialReport();
    });
};

window.toggleCustomDate = function() {
    const period = document.getElementById('reportFinancialPeriod').value;
    const customDateRange = document.getElementById('customDateRange');
    
    if (customDateRange) {
        customDateRange.style.display = period === 'custom' ? 'block' : 'none';
    }
};

async function generateFinalFinancialReport() {
    try {
        showNotification('در حال تولید گزارش مالی...', 'info');
        
        const formData = getFinancialReportFormData();
        const reportData = await fetchFinancialReportData(formData);
        
        // تولید گزارش HTML
        const reportHTML = generateFinancialReportHTML(reportData, formData);
        
        // باز کردن در پنجره جدید
        const reportWindow = window.open('', '_blank');
        reportWindow.document.write(`
            <!DOCTYPE html>
            <html dir="rtl" lang="fa">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>گزارش مالی - اسنپ افغانستان</title>
                <style>
                    body { font-family: Vazir, Tahoma; padding: 20px; }
                    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #4CAF50; padding-bottom: 20px; }
                    .financial-summary { background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 30px; border: 1px solid #dee2e6; }
                    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
                    .summary-item { background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    .summary-value { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
                    .revenue { color: #4CAF50; }
                    .expense { color: #f44336; }
                    .profit { color: #2196F3; }
                    .summary-label { font-size: 14px; color: #666; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th, td { padding: 12px; text-align: center; border: 1px solid #ddd; }
                    th { background: #4CAF50; color: white; }
                    tr:nth-child(even) { background: #f9f9f9; }
                    .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px; }
                    .chart-container { margin: 30px 0; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    @media print {
                        button { display: none; }
                        .no-print { display: none; }
                    }
                </style>
                <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            </head>
            <body>
                ${reportHTML}
                <div class="footer no-print">
                    <button onclick="window.print()" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin: 5px;">چاپ گزارش</button>
                    <button onclick="window.close()" style="padding: 10px 20px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; margin: 5px;">بستن</button>
                </div>
            </body>
            </html>
        `);
        reportWindow.document.close();
        
        showNotification('گزارش مالی با موفقیت تولید شد', 'success');
        
        // بستن مدال
        const modal = document.querySelector('.modal:last-child');
        if (modal) {
            document.body.removeChild(modal);
        }
        
    } catch (error) {
        console.error('Error generating financial report:', error);
        showNotification('خطا در تولید گزارش مالی', 'error');
    }
};

function getFinancialReportFormData() {
    return {
        period: document.getElementById('reportFinancialPeriod').value,
        dateFrom: document.getElementById('reportFinancialDateFrom').value,
        dateTo: document.getElementById('reportFinancialDateTo').value,
        currency: document.getElementById('reportCurrency').value,
        revenueType: document.getElementById('reportRevenueType').value,
        groupBy: document.getElementById('reportGroupByFinancial').value,
        includeExpenses: document.getElementById('includeExpenses').checked,
        includeTaxes: document.getElementById('includeTaxes').checked,
        showCharts: document.getElementById('showCharts').checked
    };
}

async function fetchFinancialReportData(formData) {
    try {
        // تعیین تاریخ‌ها بر اساس دوره انتخاب شده
        let dateFrom, dateTo;
        const today = new Date();
        
        switch(formData.period) {
            case 'today':
                dateFrom = today.toISOString().split('T')[0];
                dateTo = dateFrom;
                break;
            case 'yesterday':
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                dateFrom = yesterday.toISOString().split('T')[0];
                dateTo = dateFrom;
                break;
            case 'this_week':
                const firstDayOfWeek = new Date(today);
                firstDayOfWeek.setDate(today.getDate() - today.getDay());
                dateFrom = firstDayOfWeek.toISOString().split('T')[0];
                dateTo = today.toISOString().split('T')[0];
                break;
            case 'this_month':
                dateFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
                dateTo = today.toISOString().split('T')[0];
                break;
            case 'custom':
                dateFrom = formData.dateFrom;
                dateTo = formData.dateTo;
                break;
            default:
                dateFrom = formData.dateFrom;
                dateTo = formData.dateTo;
        }
        
        // دریافت داده‌های سفرهای تکمیل شده
        const { data: trips, error: tripsError } = await supabase
            .from('trips')
            .select('*, driver:drivers(name)')
            .eq('status', 'completed')
            .gte('created_at', `${dateFrom}T00:00:00`)
            .lte('created_at', `${dateTo}T23:59:59`);
        
        if (tripsError) throw tripsError;
        
        // دریافت داده‌های هزینه‌ها (در جدول expenses)
        let expenses = [];
        if (formData.includeExpenses) {
            const { data: expensesData, error: expensesError } = await supabase
                .from('expenses')
                .select('*')
                .gte('date', dateFrom)
                .lte('date', dateTo);
            
            if (!expensesError) {
                expenses = expensesData || [];
            }
        }
        
        // محاسبه مالیات (فرضی)
        const taxRate = formData.includeTaxes ? 0.10 : 0; // 10% مالیات
        
        return {
            trips: trips || [],
            expenses: expenses,
            dateFrom: dateFrom,
            dateTo: dateTo,
            currency: formData.currency,
            taxRate: taxRate,
            groupBy: formData.groupBy
        };
        
    } catch (error) {
        console.error('Error fetching financial data:', error);
        return {
            trips: [],
            expenses: [],
            dateFrom: formData.dateFrom,
            dateTo: formData.dateTo,
            currency: formData.currency,
            taxRate: 0.10,
            groupBy: formData.groupBy
        };
    }
}

function generateFinancialReportHTML(data, formData) {
    // محاسبات مالی
    const totalRevenue = data.trips.reduce((sum, trip) => sum + (parseFloat(trip.estimated_price) || 0), 0);
    const totalExpenses = data.expenses.reduce((sum, expense) => sum + (parseFloat(expense.amount) || 0), 0);
    const commission = totalRevenue * 0.20; // 20% کمیسیون
    const taxes = formData.includeTaxes ? (totalRevenue - commission) * data.taxRate : 0;
    const netProfit = totalRevenue - commission - totalExpenses - taxes;
    
    // گروه‌بندی درآمد
    const revenueGroups = groupFinancialData(data.trips, data.groupBy);
    
    let html = `
        <div class="header">
            <h1>گزارش مالی - اسنپ افغانستان</h1>
            <p>دوره: ${new Date(data.dateFrom).toLocaleDateString('fa-IR')} تا ${new Date(data.dateTo).toLocaleDateString('fa-IR')}</p>
            <p>تاریخ تولید: ${new Date().toLocaleDateString('fa-IR')} | واحد پول: ${data.currency}</p>
        </div>
        
        <div class="financial-summary">
            <h3>خلاصه مالی</h3>
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="summary-value revenue">${formatCurrency(totalRevenue, data.currency)}</div>
                    <div class="summary-label">درآمد کل</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value expense">${formatCurrency(commission, data.currency)}</div>
                    <div class="summary-label">کمیسیون (20%)</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value expense">${formatCurrency(totalExpenses, data.currency)}</div>
                    <div class="summary-label">هزینه‌ها</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value profit">${formatCurrency(netProfit, data.currency)}</div>
                    <div class="summary-label">سود خالص</div>
                </div>
            </div>
            
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="summary-value">${data.trips.length}</div>
                    <div class="summary-label">تعداد سفرها</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${formatCurrency(taxes, data.currency)}</div>
                    <div class="summary-label">مالیات</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${formatCurrency(totalRevenue / Math.max(data.trips.length, 1), data.currency)}</div>
                    <div class="summary-label">میانگین هر سفر</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${Math.round((netProfit / Math.max(totalRevenue, 1)) * 100)}%</div>
                    <div class="summary-label">حاشیه سود</div>
                </div>
            </div>
        </div>
    `;
    
    // نمایش نمودار درآمد
    if (formData.showCharts && Object.keys(revenueGroups).length > 0) {
        html += `
            <div class="chart-container">
                <h3>نمودار درآمد ${getFinancialGroupByLabel(data.groupBy)}</h3>
                <canvas id="revenueChart" width="400" height="200"></canvas>
                <script>
                    const ctx = document.getElementById('revenueChart').getContext('2d');
                    const labels = ${JSON.stringify(Object.keys(revenueGroups))};
                    const revenues = ${JSON.stringify(Object.values(revenueGroups).map(g => g.revenue))};
                    
                    new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: 'درآمد (${data.currency})',
                                data: revenues,
                                backgroundColor: '#4CAF50',
                                borderColor: '#388E3C',
                                borderWidth: 1
                            }]
                        },
                        options: {
                            responsive: true,
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        callback: function(value) {
                                            return value.toLocaleString('fa-IR') + ' ${data.currency}';
                                        }
                                    }
                                },
                                x: {
                                    ticks: {
                                        font: {
                                            family: 'Vazir'
                                        }
                                    }
                                }
                            },
                            plugins: {
                                legend: {
                                    labels: {
                                        font: {
                                            family: 'Vazir'
                                        }
                                    }
                                }
                            }
                        }
                    });
                </script>
            </div>
        `;
    }
    
    // جدول درآمد گروه‌بندی شده
    if (Object.keys(revenueGroups).length > 0) {
        html += `
            <h3>درآمد ${getFinancialGroupByLabel(data.groupBy)}</h3>
            <table>
                <thead>
                    <tr>
                        <th>${getFinancialGroupByLabel(data.groupBy)}</th>
                        <th>تعداد سفر</th>
                        <th>درآمد کل</th>
                        <th>میانگین درآمد</th>
                        <th>کمیسیون</th>
                        <th>سود</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        Object.entries(revenueGroups).forEach(([key, value]) => {
            const commission = value.revenue * 0.20;
            const profit = value.revenue - commission;
            const avgRevenue = value.count > 0 ? value.revenue / value.count : 0;
            
            html += `
                <tr>
                    <td>${key}</td>
                    <td>${value.count.toLocaleString('fa-IR')}</td>
                    <td>${formatCurrency(value.revenue, data.currency)}</td>
                    <td>${formatCurrency(avgRevenue, data.currency)}</td>
                    <td>${formatCurrency(commission, data.currency)}</td>
                    <td>${formatCurrency(profit, data.currency)}</td>
                </tr>
            `;
        });
        
        html += `
                </tbody>
            </table>
        `;
    }
    
    // نمایش هزینه‌ها
    if (data.expenses.length > 0) {
        html += `
            <h3>هزینه‌ها</h3>
            <table>
                <thead>
                    <tr>
                        <th>تاریخ</th>
                        <th>عنوان</th>
                        <th>دسته‌بندی</th>
                        <th>مبلغ</th>
                        <th>توضیحات</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        data.expenses.forEach(expense => {
            html += `
                <tr>
                    <td>${new Date(expense.date).toLocaleDateString('fa-IR')}</td>
                    <td>${expense.title || '---'}</td>
                    <td>${expense.category || 'عمومی'}</td>
                    <td>${formatCurrency(expense.amount || 0, data.currency)}</td>
                    <td>${expense.description || '---'}</td>
                </tr>
            `;
        });
        
        html += `
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="3"><strong>مجموع هزینه‌ها</strong></td>
                        <td colspan="2"><strong>${formatCurrency(totalExpenses, data.currency)}</strong></td>
                    </tr>
                </tfoot>
            </table>
        `;
    }
    
    return html;
}

function groupFinancialData(trips, groupBy) {
    const groups = {};
    
    trips.forEach(trip => {
        let key;
        
        switch(groupBy) {
            case 'daily':
                key = new Date(trip.created_at).toLocaleDateString('fa-IR');
                break;
            case 'weekly':
                const date = new Date(trip.created_at);
                const weekNumber = getWeekNumber(date);
                key = `هفته ${weekNumber} - ${date.getFullYear()}`;
                break;
            case 'monthly':
                const monthDate = new Date(trip.created_at);
                const monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
                key = `${monthNames[monthDate.getMonth()]} ${monthDate.getFullYear()}`;
                break;
            case 'driver':
                key = trip.driver?.name || 'نامعلوم';
                break;
            default:
                key = new Date(trip.created_at).toLocaleDateString('fa-IR');
        }
        
        if (!groups[key]) {
            groups[key] = {
                count: 0,
                revenue: 0
            };
        }
        
        groups[key].count++;
        groups[key].revenue += parseFloat(trip.estimated_price) || 0;
    });
    
    return groups;
}

function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

function getFinancialGroupByLabel(groupBy) {
    const labels = {
        'daily': 'روزانه',
        'weekly': 'هفتگی',
        'monthly': 'ماهانه',
        'driver': 'بر اساس راننده'
    };
    return labels[groupBy] || groupBy;
}

function formatCurrency(amount, currency) {
    const formatted = Math.round(amount).toLocaleString('fa-IR');
    return `${formatted} ${currency === 'USD' ? '$' : 'افغانی'}`;
}

// ============================================
// 7. افزودن تخفیف
// ============================================

window.addNewDiscount = function() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3>افزودن کد تخفیف جدید</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="addDiscountForm">
                    <div class="row">
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newDiscountCode">کد تخفیف *</label>
                                <input type="text" id="newDiscountCode" class="form-input" required 
                                       pattern="[A-Z0-9]{6,12}" 
                                       title="کد باید بین ۶ تا ۱۲ کاراکتر و شامل حروف بزرگ و اعداد باشد">
                                <small style="color: #666;">فقط حروف بزرگ و اعداد مجاز است</small>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newDiscountPercent">درصد تخفیف *</label>
                                <div class="input-with-unit">
                                    <input type="number" id="newDiscountPercent" class="form-input" 
                                           min="1" max="100" step="1" value="20" required>
                                    <span class="input-unit">%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="row">
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newDiscountType">نوع تخفیف</label>
                                <select id="newDiscountType" class="form-input">
                                    <option value="percentage">درصدی</option>
                                    <option value="fixed">مبلغ ثابت</option>
                                </select>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newDiscountFixedAmount">مبلغ ثابت (افغانی)</label>
                                <input type="number" id="newDiscountFixedAmount" class="form-input" 
                                       min="0" value="100" disabled>
                            </div>
                        </div>
                    </div>
                    
                    <div class="row">
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newDiscountMaxUses">حداکثر استفاده *</label>
                                <input type="number" id="newDiscountMaxUses" class="form-input" 
                                       min="1" value="100" required>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newDiscountMinAmount">حداقل خرید (افغانی)</label>
                                <input type="number" id="newDiscountMinAmount" class="form-input" 
                                       min="0" value="0">
                            </div>
                        </div>
                    </div>
                    
                    <div class="row">
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newDiscountStartDate">تاریخ شروع</label>
                                <input type="datetime-local" id="newDiscountStartDate" class="form-input">
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="form-group">
                                <label for="newDiscountExpiryDate">تاریخ انقضا *</label>
                                <input type="datetime-local" id="newDiscountExpiryDate" class="form-input" required>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="newDiscountUserType">مخاطبان</label>
                        <select id="newDiscountUserType" class="form-input">
                            <option value="all">همه کاربران</option>
                            <option value="new_users">کاربران جدید</option>
                            <option value="existing_users">کاربران موجود</option>
                            <option value="specific_users">کاربران خاص</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="newDiscountRideType">نوع سفر</label>
                        <select id="newDiscountRideType" class="form-input" multiple style="height: 100px;">
                            <option value="all" selected>همه</option>
                            <option value="economy">اقتصادی</option>
                            <option value="comfort">کلاسیک</option>
                            <option value="bike">موتور</option>
                        </select>
                        <small style="color: #666;">برای انتخاب چندگانه Ctrl+Click کنید</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="newDiscountDescription">توضیحات</label>
                        <textarea id="newDiscountDescription" class="form-input" rows="3" 
                                  placeholder="توضیحات درباره کد تخفیف..."></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="newDiscountActive" checked>
                            فعال باشد
                        </label>
                    </div>
                    
                    <div class="form-buttons">
                        <button type="submit" class="btn btn-primary">ثبت تخفیف</button>
                        <button type="button" class="btn btn-secondary close-modal">لغو</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // تنظیم تاریخ‌های پیش‌فرض
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 30);
    
    document.getElementById('newDiscountStartDate').value = now.toISOString().slice(0, 16);
    document.getElementById('newDiscountExpiryDate').value = tomorrow.toISOString().slice(0, 16);
    
    // رویداد تغییر نوع تخفیف
    document.getElementById('newDiscountType').addEventListener('change', function() {
        const fixedAmountInput = document.getElementById('newDiscountFixedAmount');
        const percentInput = document.getElementById('newDiscountPercent');
        
        if (this.value === 'fixed') {
            fixedAmountInput.disabled = false;
            percentInput.disabled = true;
        } else {
            fixedAmountInput.disabled = true;
            percentInput.disabled = false;
        }
    });
    
    // رویداد بستن مدال
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    });
    
    // رویداد کلیک روی overlay
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // رویداد ارسال فرم
    const form = modal.querySelector('#addDiscountForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const discountData = {
            code: document.getElementById('newDiscountCode').value.toUpperCase(),
            discount_type: document.getElementById('newDiscountType').value,
            percentage: parseFloat(document.getElementById('newDiscountPercent').value),
            fixed_amount: parseFloat(document.getElementById('newDiscountFixedAmount').value) || 0,
            max_uses: parseInt(document.getElementById('newDiscountMaxUses').value),
            min_amount: parseFloat(document.getElementById('newDiscountMinAmount').value) || 0,
            start_date: document.getElementById('newDiscountStartDate').value || new Date().toISOString(),
            expiry_date: document.getElementById('newDiscountExpiryDate').value,
            user_type: document.getElementById('newDiscountUserType').value,
            ride_types: Array.from(document.getElementById('newDiscountRideType').selectedOptions)
                           .map(opt => opt.value),
            description: document.getElementById('newDiscountDescription').value || '',
            is_active: document.getElementById('newDiscountActive').checked,
            used_count: 0,
            created_at: new Date().toISOString()
        };
        
        try {
            // ذخیره در Supabase
            const { data, error } = await supabase
                .from('discounts')
                .insert([discountData])
                .select()
                .single();
            
            if (error) throw error;
            
            // بروزرسانی UI
            document.body.removeChild(modal);
            await loadAdminDiscounts();
            
            showNotification('کد تخفیف جدید با موفقیت اضافه شد', 'success');
            
            // کپی کردن کد تخفیف برای استفاده
            navigator.clipboard.writeText(discountData.code).then(() => {
                showNotification(`کد تخفیف ${discountData.code} در کلیپ‌بورد کپی شد`, 'info');
            });
            
        } catch (error) {
            console.error('Error adding discount:', error);
            
            if (error.code === '23505') { // کد تکراری
                showNotification('این کد تخفیف قبلاً ثبت شده است', 'error');
            } else {
                showNotification('خطا در افزودن کد تخفیف: ' + error.message, 'error');
            }
        }
    });
};

// ============================================
// 8. ارسال پیام به کاربران
// ============================================

window.sendMessageToUsers = function() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header">
                <h3>ارسال پیام به کاربران</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="sendMessageForm">
                    <div class="form-group">
                        <label for="messageRecipients">گیرندگان</label>
                        <div class="recipient-options">
                            <label>
                                <input type="radio" name="recipientType" value="all" checked onchange="toggleRecipientOptions()">
                                همه کاربران
                            </label>
                            <label>
                                <input type="radio" name="recipientType" value="passengers" onchange="toggleRecipientOptions()">
                                مسافران
                            </label>
                            <label>
                                <input type="radio" name="recipientType" value="drivers" onchange="toggleRecipientOptions()">
                                رانندگان
                            </label>
                            <label>
                                <input type="radio" name="recipientType" value="specific" onchange="toggleRecipientOptions()">
                                کاربران خاص
                            </label>
                        </div>
                    </div>
                    
                    <div id="specificUsersSection" style="display: none;">
                        <div class="form-group">
                            <label for="specificUsers">انتخاب کاربران</label>
                            <div style="border: 1px solid var(--border); border-radius: 8px; padding: 10px; max-height: 200px; overflow-y: auto;">
                                <div id="usersList">
                                    <!-- لیست کاربران اینجا بارگذاری می‌شود -->
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="messageType">نوع پیام</label>
                        <select id="messageType" class="form-input">
                            <option value="notification">اعلان سیستمی</option>
                            <option value="sms">پیامک</option>
                            <option value="email">ایمیل</option>
                            <option value="push">نوتیفیکیشن Push</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="messageSubject">عنوان پیام *</label>
                        <input type="text" id="messageSubject" class="form-input" required 
                               placeholder="عنوان پیام را وارد کنید...">
                    </div>
                    
                    <div class="form-group">
                        <label for="messageContent">متن پیام *</label>
                        <textarea id="messageContent" class="form-input" rows="6" required 
                                  placeholder="متن پیام را وارد کنید..."></textarea>
                        <div class="char-count">
                            <span id="charCount">0</span> / 1000 کاراکتر
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="messageLanguage">زبان</label>
                        <select id="messageLanguage" class="form-input">
                            <option value="fa">فارسی</option>
                            <option value="en">English</option>
                            <option value="ps">پشتو</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="messagePriority">اولویت</label>
                        <select id="messagePriority" class="form-input">
                            <option value="normal">عادی</option>
                            <option value="high">بالا</option>
                            <option value="urgent">فوری</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="scheduleMessage">
                            برنامه‌ریزی برای ارسال بعدی
                        </label>
                    </div>
                    
                    <div id="scheduleSection" style="display: none;">
                        <div class="row">
                            <div class="col-6">
                                <div class="form-group">
                                    <label for="scheduleDate">تاریخ ارسال</label>
                                    <input type="date" id="scheduleDate" class="form-input">
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="form-group">
                                    <label for="scheduleTime">زمان ارسال</label>
                                    <input type="time" id="scheduleTime" class="form-input">
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="sendCopyToAdmin">
                            ارسال کپی به مدیر
                        </label>
                    </div>
                    
                    <div class="preview-section">
                        <h4>پیش‌نمایش پیام</h4>
                        <div id="messagePreview" class="message-preview">
                            <div class="preview-header">
                                <span id="previewSubject">عنوان پیام</span>
                                <span class="preview-time">اکنون</span>
                            </div>
                            <div id="previewContent" class="preview-content">
                                متن پیام اینجا نمایش داده می‌شود...
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-buttons">
                        <button type="button" class="btn btn-secondary" onclick="updatePreview()">بروزرسانی پیش‌نمایش</button>
                        <button type="submit" class="btn btn-primary">ارسال پیام</button>
                        <button type="button" class="btn btn-secondary close-modal">لغو</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // بارگذاری لیست کاربران
    loadUsersForMessaging();
    
    // رویداد شمارش کاراکترها
    const messageContent = document.getElementById('messageContent');
    const charCount = document.getElementById('charCount');
    
    messageContent.addEventListener('input', function() {
        charCount.textContent = this.value.length;
    });
    
    // رویداد برنامه‌ریزی
    document.getElementById('scheduleMessage').addEventListener('change', function() {
        const scheduleSection = document.getElementById('scheduleSection');
        scheduleSection.style.display = this.checked ? 'block' : 'none';
    });
    
    // رویداد بستن مدال
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    });
    
    // رویداد کلیک روی overlay
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // رویداد ارسال فرم
    const form = modal.querySelector('#sendMessageForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await sendBulkMessage();
    });
    
    // بروزرسانی اولیه پیش‌نمایش
    updatePreview();
};

window.toggleRecipientOptions = function() {
    const specificSection = document.getElementById('specificUsersSection');
    const recipientType = document.querySelector('input[name="recipientType"]:checked').value;
    
    specificSection.style.display = recipientType === 'specific' ? 'block' : 'none';
};

async function loadUsersForMessaging() {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, name, email, phone, role')
            .eq('status', 'approved')
            .order('name');
        
        if (error) throw error;
        
        const usersList = document.getElementById('usersList');
        if (usersList && users) {
            usersList.innerHTML = '';
            
            users.forEach(user => {
                const userItem = document.createElement('div');
                userItem.className = 'user-checkbox-item';
                userItem.innerHTML = `
                    <label>
                        <input type="checkbox" name="selectedUsers" value="${user.id}" data-role="${user.role}">
                        <span class="user-info">
                            <span class="user-name">${user.name}</span>
                            <span class="user-details">
                                ${user.role === 'driver' ? 'راننده' : 'مسافر'} | 
                                ${user.email || '---'} | 
                                ${user.phone || '---'}
                            </span>
                        </span>
                    </label>
                `;
                usersList.appendChild(userItem);
            });
        }
    } catch (error) {
        console.error('Error loading users for messaging:', error);
    }
}

window.updatePreview = function() {
    const subject = document.getElementById('messageSubject').value || 'عنوان پیام';
    const content = document.getElementById('messageContent').value || 'متن پیام اینجا نمایش داده می‌شود...';
    const messageType = document.getElementById('messageType').value;
    
    document.getElementById('previewSubject').textContent = subject;
    document.getElementById('previewContent').textContent = content;
    
    // تغییر استایل بر اساس نوع پیام
    const preview = document.getElementById('messagePreview');
    preview.className = 'message-preview ' + messageType;
};

async function sendBulkMessage() {
    try {
        showNotification('در حال ارسال پیام...', 'info');
        
        const messageData = {
            subject: document.getElementById('messageSubject').value,
            content: document.getElementById('messageContent').value,
            message_type: document.getElementById('messageType').value,
            recipient_type: document.querySelector('input[name="recipientType"]:checked').value,
            language: document.getElementById('messageLanguage').value,
            priority: document.getElementById('messagePriority').value,
            send_copy: document.getElementById('sendCopyToAdmin').checked,
            scheduled: document.getElementById('scheduleMessage').checked,
            schedule_date: document.getElementById('scheduleDate').value,
            schedule_time: document.getElementById('scheduleTime').value,
            created_at: new Date().toISOString()
        };
        
        // اگر کاربران خاص انتخاب شده‌اند
        if (messageData.recipient_type === 'specific') {
            const selectedUsers = Array.from(document.querySelectorAll('input[name="selectedUsers"]:checked'))
                .map(input => input.value);
            messageData.specific_users = selectedUsers;
        }
        
        // ذخیره پیام در دیتابیس
        const { data, error } = await supabase
            .from('messages')
            .insert([messageData])
            .select()
            .single();
        
        if (error) throw error;
        
        // ارسال واقعی پیام‌ها
        await sendActualMessages(data);
        
        // بستن مدال
        const modal = document.querySelector('.modal:last-child');
        if (modal) {
            document.body.removeChild(modal);
        }
        
        showNotification('پیام با موفقیت ارسال شد', 'success');
        
    } catch (error) {
        console.error('Error sending bulk message:', error);
        showNotification('خطا در ارسال پیام: ' + error.message, 'error');
    }
}

async function sendActualMessages(messageData) {
    try {
        // شبیه‌سازی ارسال پیام
        let recipientsCount = 0;
        
        switch(messageData.recipient_type) {
            case 'all':
                recipientsCount = await countAllUsers();
                break;
            case 'passengers':
                recipientsCount = await countPassengers();
                break;
            case 'drivers':
                recipientsCount = await countDrivers();
                break;
            case 'specific':
                recipientsCount = messageData.specific_users?.length || 0;
                break;
        }
        
        // بروزرسانی تعداد گیرندگان
        await supabase
            .from('messages')
            .update({ 
                recipients_count: recipientsCount,
                sent_at: new Date().toISOString(),
                status: 'sent'
            })
            .eq('id', messageData.id);
        
        showNotification(`پیام به ${recipientsCount} نفر ارسال شد`, 'success');
        
    } catch (error) {
        console.error('Error in sendActualMessages:', error);
    }
}

async function countAllUsers() {
    const { count, error } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved');
    
    return count || 0;
}

async function countPassengers() {
    const { count, error } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')
        .eq('role', 'passenger');
    
    return count || 0;
}

async function countDrivers() {
    const { count, error } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')
        .eq('role', 'driver');
    
    return count || 0;
}

// ============================================
// 9. ارسال اعلان عمومی
// ============================================

window.sendPublicNotification = function() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3>ارسال اعلان عمومی</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="publicNotificationForm">
                    <div class="form-group">
                        <label for="notificationTitle">عنوان اعلان *</label>
                        <input type="text" id="notificationTitle" class="form-input" required 
                               placeholder="عنوان اعلان را وارد کنید...">
                    </div>
                    
                    <div class="form-group">
                        <label for="notificationMessage">متن اعلان *</label>
                        <textarea id="notificationMessage" class="form-input" rows="4" required 
                                  placeholder="متن اعلان را وارد کنید..."></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label for="notificationType">نوع اعلان</label>
                        <select id="notificationType" class="form-input">
                            <option value="info">اطلاعیه</option>
                            <option value="success">موفقیت</option>
                            <option value="warning">هشدار</option>
                            <option value="error">خطا</option>
                            <option value="promotion">تخفیف و پیشنهاد</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="notificationAudience">مخاطبان</label>
                        <select id="notificationAudience" class="form-input" multiple>
                            <option value="all" selected>همه کاربران</option>
                            <option value="passengers">مسافران</option>
                            <option value="drivers">رانندگان</option>
                            <option value="online">کاربران آنلاین</option>
                            <option value="new_users">کاربران جدید (۷ روز اخیر)</option>
                        </select>
                        <small style="color: #666;">برای انتخاب چندگانه Ctrl+Click کنید</small>
                    </div>
                    
                    <div class="row">
                        <div class="col-6">
                            <div class="form-group">
                                <label for="notificationIcon">آیکون</label>
                                <select id="notificationIcon" class="form-input">
                                    <option value="bell">🔔</option>
                                    <option value="info">ℹ️</option>
                                    <option value="warning">⚠️</option>
                                    <option value="success">✅</option>
                                    <option value="discount">💰</option>
                                    <option value="car">🚗</option>
                                    <option value="bike">🏍️</option>
                                </select>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="form-group">
                                <label for="notificationDuration">مدت نمایش (ثانیه)</label>
                                <input type="number" id="notificationDuration" class="form-input" 
                                       min="3" max="30" value="5">
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="notificationAction">عملیات همراه</label>
                        <select id="notificationAction" class="form-input">
                            <option value="none">بدون عملیات</option>
                            <option value="open_app">باز کردن برنامه</option>
                            <option value="go_to_profile">رفتن به پروفایل</option>
                            <option value="go_to_trips">رفتن به سفرها</option>
                            <option value="go_to_discounts">رفتن به تخفیف‌ها</option>
                            <option value="open_url">باز کردن لینک</option>
                        </select>
                    </div>
                    
                    <div id="urlSection" style="display: none;">
                        <div class="form-group">
                            <label for="notificationUrl">آدرس URL</label>
                            <input type="url" id="notificationUrl" class="form-input" 
                                   placeholder="https://example.com">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="notificationImportant">
                            علامت‌گذاری به عنوان مهم
                        </label>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="notificationSound">
                            پخش صدا
                        </label>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="notificationVibrate">
                            لرزش
                        </label>
                    </div>
                    
                    <div class="preview-section">
                        <h4>پیش‌نمایش اعلان</h4>
                        <div id="notificationPreview" class="notification-preview">
                            <div class="notification-icon" id="previewIcon">🔔</div>
                            <div class="notification-content">
                                <div class="notification-title" id="previewNotificationTitle">عنوان اعلان</div>
                                <div class="notification-text" id="previewNotificationText">متن اعلان</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-buttons">
                        <button type="button" class="btn btn-secondary" onclick="updateNotificationPreview()">بروزرسانی پیش‌نمایش</button>
                        <button type="submit" class="btn btn-primary">ارسال اعلان</button>
                        <button type="button" class="btn btn-secondary close-modal">لغو</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // رویداد تغییر عملیات
    document.getElementById('notificationAction').addEventListener('change', function() {
        const urlSection = document.getElementById('urlSection');
        urlSection.style.display = this.value === 'open_url' ? 'block' : 'none';
    });
    
    // رویداد بستن مدال
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    });
    
    // رویداد کلیک روی overlay
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // رویداد ارسال فرم
    const form = modal.querySelector('#publicNotificationForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await sendNotificationToAll();
    });
    
    // بروزرسانی اولیه پیش‌نمایش
    updateNotificationPreview();
};

window.updateNotificationPreview = function() {
    const title = document.getElementById('notificationTitle').value || 'عنوان اعلان';
    const message = document.getElementById('notificationMessage').value || 'متن اعلان';
    const type = document.getElementById('notificationType').value;
    const icon = document.getElementById('notificationIcon').value;
    
    document.getElementById('previewNotificationTitle').textContent = title;
    document.getElementById('previewNotificationText').textContent = message;
    
    // تنظیم آیکون
    let iconChar = '🔔';
    switch(icon) {
        case 'info': iconChar = 'ℹ️'; break;
        case 'warning': iconChar = '⚠️'; break;
        case 'success': iconChar = '✅'; break;
        case 'discount': iconChar = '💰'; break;
        case 'car': iconChar = '🚗'; break;
        case 'bike': iconChar = '🏍️'; break;
    }
    document.getElementById('previewIcon').textContent = iconChar;
    
    // تغییر رنگ بر اساس نوع
    const preview = document.getElementById('notificationPreview');
    preview.className = `notification-preview notification-${type}`;
};

async function sendNotificationToAll() {
    try {
        showNotification('در حال ارسال اعلان...', 'info');
        
        const notificationData = {
            title: document.getElementById('notificationTitle').value,
            message: document.getElementById('notificationMessage').value,
            type: document.getElementById('notificationType').value,
            audience: Array.from(document.getElementById('notificationAudience').selectedOptions)
                          .map(opt => opt.value),
            icon: document.getElementById('notificationIcon').value,
            duration: parseInt(document.getElementById('notificationDuration').value),
            action: document.getElementById('notificationAction').value,
            url: document.getElementById('notificationUrl').value || null,
            important: document.getElementById('notificationImportant').checked,
            sound: document.getElementById('notificationSound').checked,
            vibrate: document.getElementById('notificationVibrate').checked,
            created_at: new Date().toISOString(),
            status: 'active'
        };
        
        // ذخیره اعلان در دیتابیس
        const { data, error } = await supabase
            .from('notifications')
            .insert([notificationData])
            .select()
            .single();
        
        if (error) throw error;
        
        // نمایش اعلان برای کاربران آنلاین
        displayPublicNotification(data);
        
        // بستن مدال
        const modal = document.querySelector('.modal:last-child');
        if (modal) {
            document.body.removeChild(modal);
        }
        
        showNotification('اعلان عمومی با موفقیت ارسال شد', 'success');
        
    } catch (error) {
        console.error('Error sending public notification:', error);
        showNotification('خطا در ارسال اعلان: ' + error.message, 'error');
    }
}

function displayPublicNotification(notification) {
    // ایجاد عنصر اعلان
    const notificationElement = document.createElement('div');
    notificationElement.className = `global-notification notification-${notification.type}`;
    notificationElement.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        min-width: 300px;
        max-width: 400px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 15px;
        border-right: 4px solid var(--accent);
        animation: slideIn 0.3s ease;
        font-family: Vazir, Tahoma;
    `;
    
    notificationElement.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px;">
            <div style="font-size: 20px;">${getNotificationIcon(notification.icon)}</div>
            <div style="flex: 1;">
                <div style="font-weight: bold; margin-bottom: 5px; color: var(--text);">
                    ${notification.title}
                </div>
                <div style="color: var(--gray); font-size: 14px;">
                    ${notification.message}
                </div>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="background: none; border: none; cursor: pointer; color: var(--gray);">
                ×
            </button>
        </div>
        ${notification.important ? '<div style="margin-top: 10px; font-size: 12px; color: var(--accent);">⚠️ مهم</div>' : ''}
    `;
    
    document.body.appendChild(notificationElement);
    
    // حذف خودکار بعد از مدت مشخص
    setTimeout(() => {
        if (notificationElement.parentNode) {
            notificationElement.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notificationElement.parentNode) {
                    notificationElement.parentNode.removeChild(notificationElement);
                }
            }, 300);
        }
    }, notification.duration * 1000);
    
    // اضافه کردن استایل‌های انیمیشن
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            .notification-info { border-right-color: #2196F3; }
            .notification-success { border-right-color: #4CAF50; }
            .notification-warning { border-right-color: #FF9800; }
            .notification-error { border-right-color: #f44336; }
            .notification-promotion { border-right-color: #9C27B0; }
        `;
        document.head.appendChild(style);
    }
    
    // پخش صدا اگر فعال باشد
    if (notification.sound) {
        playNotificationSound();
    }
    
    // لرزش اگر فعال باشد
    if (notification.vibrate && 'vibrate' in navigator) {
        navigator.vibrate(200);
    }
}

function getNotificationIcon(icon) {
    const icons = {
        'bell': '🔔',
        'info': 'ℹ️',
        'warning': '⚠️',
        'success': '✅',
        'discount': '💰',
        'car': '🚗',
        'bike': '🏍️'
    };
    return icons[icon] || '🔔';
}

function playNotificationSound() {
    try {
        const audio = new Audio();
        audio.src = 'https://assets.mixkit.co/sfx/preview/mixkit-correct-answer-tone-2870.mp3';
        audio.play();
    } catch (error) {
        console.error('Error playing notification sound:', error);
    }
}

// ============================================
// سایر توابع مدیریت
// ============================================

// مدیریت تب‌های پنل ادمین
document.addEventListener('DOMContentLoaded', function() {
    // تب‌های مدیریت
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            
            // حذف کلاس active از همه تب‌ها
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
            
            // اضافه کردن کلاس active به تب انتخاب شده
            this.classList.add('active');
            const targetTab = document.getElementById(`${tabId}-tab`);
            if (targetTab) targetTab.classList.add('active');
        });
    });
    
    // دکمه‌های اکشن در پنل مدیریت
    const addDriverBtn = document.getElementById('addDriverBtn');
    if (addDriverBtn) {
        addDriverBtn.addEventListener('click', window.addNewDriver);
    }
    
    const addDiscountBtn = document.getElementById('addDiscountBtn');
    if (addDiscountBtn) {
        addDiscountBtn.addEventListener('click', window.addNewDiscount);
    }
    
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', window.refreshAdminData);
    }
    
    // دکمه‌های گزارش
    const exportUsersBtn = document.getElementById('exportUsersBtn');
    if (exportUsersBtn) {
        exportUsersBtn.addEventListener('click', () => window.exportToExcel('users'));
    }
    
    const exportTripsBtn = document.getElementById('exportTripsBtn');
    if (exportTripsBtn) {
        exportTripsBtn.addEventListener('click', () => window.exportToExcel('trips'));
    }
    
    const exportRevenueBtn = document.getElementById('exportRevenueBtn');
    if (exportRevenueBtn) {
        exportRevenueBtn.addEventListener('click', () => window.exportToExcel('revenue'));
    }
    
    const exportDriversBtn = document.getElementById('exportDriversBtn');
    if (exportDriversBtn) {
        exportDriversBtn.addEventListener('click', () => window.exportToExcel('drivers'));
    }
    
    // دکمه‌های فیلتر
    const filterUsersBtn = document.getElementById('filterUsersBtn');
    if (filterUsersBtn) {
        filterUsersBtn.addEventListener('click', () => window.applyFilter('users'));
    }
    
    const filterTripsBtn = document.getElementById('filterTripsBtn');
    if (filterTripsBtn) {
        filterTripsBtn.addEventListener('click', () => window.applyFilter('trips'));
    }
    
    const filterDriversBtn = document.getElementById('filterDriversBtn');
    if (filterDriversBtn) {
        filterDriversBtn.addEventListener('click', () => window.applyFilter('drivers'));
    }
    
    // دکمه‌های گزارش
    const tripReportBtn = document.getElementById('tripReportBtn');
    if (tripReportBtn) {
        tripReportBtn.addEventListener('click', window.generateTripReport);
    }
    
    const financialReportBtn = document.getElementById('financialReportBtn');
    if (financialReportBtn) {
        financialReportBtn.addEventListener('click', window.generateFinancialReport);
    }
    
    // دکمه‌های پیام‌رسانی
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    if (sendMessageBtn) {
        sendMessageBtn.addEventListener('click', window.sendMessageToUsers);
    }
    
    const publicNotificationBtn = document.getElementById('publicNotificationBtn');
    if (publicNotificationBtn) {
        publicNotificationBtn.addEventListener('click', window.sendPublicNotification);
    }
});

// تابع بارگذاری آمار ادمین
async function loadAdminStats() {
    try {
        // در حالت آزمایشی، آمار نمونه
        const stats = {
            totalTrips: 1245,
            activeUsers: 543,
            totalDrivers: 89,
            totalRevenue: 245600,
            todayTrips: 45,
            todayRevenue: 8500,
            pendingUsers: 12,
            activeTrips: 8
        };
        
        // بروزرسانی UI
        document.getElementById('totalTrips').textContent = stats.totalTrips.toLocaleString('fa-IR');
        document.getElementById('activeUsers').textContent = stats.activeUsers.toLocaleString('fa-IR');
        document.getElementById('totalDrivers').textContent = stats.totalDrivers.toLocaleString('fa-IR');
        document.getElementById('totalRevenue').textContent = stats.totalRevenue.toLocaleString('fa-IR') + ' افغانی';
        document.getElementById('todayTrips').textContent = stats.todayTrips.toLocaleString('fa-IR');
        document.getElementById('todayRevenue').textContent = stats.todayRevenue.toLocaleString('fa-IR') + ' افغانی';
        document.getElementById('pendingUsers').textContent = stats.pendingUsers.toLocaleString('fa-IR');
        document.getElementById('activeTrips').textContent = stats.activeTrips.toLocaleString('fa-IR');
        
    } catch (error) {
        console.error('Error loading admin stats:', error);
    }
}

// تابع بارگذاری کاربران در انتظار تایید
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
                    <button class="action-btn btn-view" onclick="viewUserDetails('${user.id}')">جزئیات</button>
                </td>
            `;
            
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading pending users:', error);
    }
}

// تابع‌های مدیریت کاربران
window.approveUser = async function(userId) {
    if (confirm('آیا از تایید این کاربر اطمینان دارید؟')) {
        try {
            const { error } = await supabase
                .from('users')
                .update({ 
                    status: 'approved',
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);
            
            if (error) throw error;
            
            showNotification('کاربر با موفقیت تایید شد', 'success');
            await loadPendingUsers();
            await loadAllUsers();
            
        } catch (error) {
            console.error('Error approving user:', error);
            showNotification('خطا در تایید کاربر', 'error');
        }
    }
};

window.rejectUser = async function(userId) {
    if (confirm('آیا از رد این کاربر اطمینان دارید؟')) {
        try {
            const { error } = await supabase
                .from('users')
                .update({ 
                    status: 'rejected',
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);
            
            if (error) throw error;
            
            showNotification('کاربر با موفقیت رد شد', 'success');
            await loadPendingUsers();
            await loadAllUsers();
            
        } catch (error) {
            console.error('Error rejecting user:', error);
            showNotification('خطا در رد کاربر', 'error');
        }
    }
};

window.viewUserDetails = async function(userId) {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error || !user) {
            showNotification('کاربر یافت نشد', 'error');
            return;
        }
        
        // نمایش مدال جزئیات کاربر
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>جزئیات کاربر: ${user.name}</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="user-details">
                        <div class="detail-row">
                            <span class="detail-label">نام کامل:</span>
                            <span class="detail-value">${user.name}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">ایمیل:</span>
                            <span class="detail-value">${user.email || '---'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">شماره تماس:</span>
                            <span class="detail-value">${user.phone || '---'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">نقش:</span>
                            <span class="detail-value">${user.role === 'passenger' ? 'مسافر' : user.role === 'driver' ? 'راننده' : 'مدیر'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">وضعیت:</span>
                            <span class="detail-value status-badge status-${user.status}">
                                ${user.status === 'pending' ? 'در انتظار تایید' : 
                                  user.status === 'approved' ? 'تایید شده' : 
                                  user.status === 'rejected' ? 'رد شده' : user.status}
                            </span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">تاریخ عضویت:</span>
                            <span class="detail-value">${new Date(user.created_at).toLocaleDateString('fa-IR')}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">آخرین ورود:</span>
                            <span class="detail-value">${user.last_login ? new Date(user.last_login).toLocaleDateString('fa-IR') : '---'}</span>
                        </div>
                    </div>
                    
                    ${user.role === 'driver' ? `
                    <div class="driver-info" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border);">
                        <h4>اطلاعات راننده</h4>
                        <div class="detail-row">
                            <span class="detail-label">پلاک خودرو:</span>
                            <span class="detail-value">${user.license_plate || '---'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">مدل خودرو:</span>
                            <span class="detail-value">${user.vehicle_model || '---'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">رنگ خودرو:</span>
                            <span class="detail-value">${user.vehicle_color || '---'}</span>
                        </div>
                    </div>
                    ` : ''}
                    
                    <div class="form-buttons" style="margin-top: 20px;">
                        <button type="button" class="btn btn-secondary close-modal">بستن</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // رویداد بستن مدال
        modal.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        });
        
        // رویداد کلیک روی overlay
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
    } catch (error) {
        console.error('Error viewing user details:', error);
        showNotification('خطا در نمایش جزئیات کاربر', 'error');
    }
};

// ============================================
// تابع‌های کمکی اضافی
// ============================================

// محاسبه فاصله
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // شعاع زمین به کیلومتر
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function toRad(value) {
    return value * Math.PI / 180;
}

// اضافه کردن توابع به window برای دسترسی جهانی
window.logout = logout;
window.openAuthModal = openAuthModal;
window.showNotification = showNotification;
window.selectDriver = selectDriver;
window.clearMap = clearMap;
window.refreshMap = refreshMap;
window.loadMyTrips = loadMyTrips;
window.loadDiscounts = loadDiscounts;
window.loadAdminPanel = loadAdminPanel;
window.exportToExcel = exportToExcel;
window.applyFilter = applyFilter;
window.clearFilter = clearFilter;
window.addNewDriver = addNewDriver;
window.generateTripReport = generateTripReport;
window.generateFinancialReport = generateFinancialReport;
window.addNewDiscount = addNewDiscount;
window.sendMessageToUsers = sendMessageToUsers;
window.sendPublicNotification = sendPublicNotification;
window.approveUser = approveUser;
window.rejectUser = rejectUser;
window.viewUserDetails = viewUserDetails;

// بارگذاری اولیه
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Snap Afghanistan Admin Panel loaded successfully!');
    
    // بررسی وضعیت ورود کاربر
    await checkUserLoginStatus();
    
    // اگر کاربر ادمین است، پنل مدیریت را بارگذاری کن
    if (isAdmin && window.location.hash === '#admin') {
        await loadAdminPanel();
    }
});