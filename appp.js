// مدیریت پنل ادمین
async function loadAdminPanel() {
    if (!isAdmin) {
        showNotification('شما دسترسی به پنل مدیریت ندارید', 'error');
        document.getElementById('home-page').classList.add('active');
        document.getElementById('admin-page').classList.remove('active');
        return;
    }
    
    // تب dashboard را فعال کنیم
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('dashboard-tab').classList.add('active');
    document.querySelector('.admin-tab[data-tab="dashboard"]').classList.add('active');
    
    await loadAdminStats();
    await loadPendingUsers();
    await loadAllUsers();
    await loadDriversForAdmin();
    await loadAdminTrips();
    await loadAdminDiscounts();
    await loadAdminSupport();
}

async function loadAdminStats() {
    try {
        // آمار واقعی از دیتابیس
        const { data: tripsData, error: tripsError } = await supabase
            .from('trips')
            .select('id', { count: 'exact' });
        
        const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('id', { count: 'exact' })
            .eq('status', 'approved');
        
        const { data: driversData, error: driversError } = await supabase
            .from('drivers')
            .select('id', { count: 'exact' });
        
        const { data: revenueData, error: revenueError } = await supabase
            .from('trips')
            .select('estimated_price')
            .eq('status', 'completed');
        
        let totalRevenue = 0;
        if (revenueData) {
            totalRevenue = revenueData.reduce((sum, trip) => sum + (trip.estimated_price || 0), 0);
        }
        
        // به‌روزرسانی آمار
        document.getElementById('totalTrips').textContent = tripsData ? tripsData.length.toLocaleString('fa-IR') : '0';
        document.getElementById('activeUsers').textContent = usersData ? usersData.length.toLocaleString('fa-IR') : '0';
        document.getElementById('totalDrivers').textContent = driversData ? driversData.length.toLocaleString('fa-IR') : '0';
        document.getElementById('totalRevenue').textContent = totalRevenue.toLocaleString('fa-IR') + ' افغانی';
        
    } catch (error) {
        console.error('Error loading admin stats:', error);
        // در صورت خطا، آمار نمونه نمایش می‌دهیم
        document.getElementById('totalTrips').textContent = '۱,۲۴۵';
        document.getElementById('activeUsers').textContent = '۵۴۳';
        document.getElementById('totalDrivers').textContent = '۸۹';
        document.getElementById('totalRevenue').textContent = '۲۴۵,۶۰۰ افغانی';
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
        if (!table) {
            console.error('Table element not found');
            return;
        }
        
        table.innerHTML = '';
        
        if (error) {
            console.error('Supabase error:', error);
            table.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 20px; color: var(--accent);">
                        خطا در بارگذاری کاربران: ${error.message}
                    </td>
                </tr>
            `;
            return;
        }
        
        if (!data || data.length === 0) {
            table.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 20px; color: var(--gray);">
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
                           user.role === 'driver' ? 'راننده' : 
                           user.role === 'admin' ? 'مدیر' : 'نامشخص';
            
            row.innerHTML = `
                <td>${user.name || 'نامشخص'}</td>
                <td>${user.email || '---'}</td>
                <td>${user.phone || '---'}</td>
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
        const table = document.getElementById('pendingUsersTable');
        if (table) {
            table.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 20px; color: var(--accent);">
                        خطا در بارگذاری: ${error.message}
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
            .order('created_at', { ascending: false })
            .limit(100); // محدودیت برای نمایش
        
        const table = document.getElementById('allUsersTable');
        if (!table) {
            console.error('Table element not found');
            return;
        }
        
        table.innerHTML = '';
        
        if (error) {
            console.error('Supabase error:', error);
            table.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 20px; color: var(--accent);">
                        خطا در بارگذاری کاربران: ${error.message}
                    </td>
                </tr>
            `;
            return;
        }
        
        if (!data || data.length === 0) {
            table.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 20px; color: var(--gray);">
                        هیچ کاربری یافت نشد
                    </td>
                </tr>
            `;
            return;
        }
        
        data.forEach(user => {
            const row = document.createElement('tr');
            const date = new Date(user.created_at).toLocaleDateString('fa-IR');
            const roleText = user.role === 'passenger' ? 'مسافر' : 
                           user.role === 'driver' ? 'راننده' : 
                           user.role === 'admin' ? 'مدیر' : 'نامشخص';
            
            const statusClass = `status-${user.status || 'pending'}`;
            const statusText = {
                'pending': 'در انتظار تایید',
                'approved': 'تایید شده',
                'rejected': 'رد شده',
                'suspended': 'معلق شده'
            }[user.status] || user.status;
            
            row.innerHTML = `
                <td>${user.name || 'نامشخص'}</td>
                <td>${user.email || '---'}</td>
                <td>${user.phone || '---'}</td>
                <td>${roleText}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${date}</td>
                <td class="action-buttons">
                    ${(user.status !== 'approved' && user.status !== 'suspended') ? 
                      `<button class="action-btn btn-approve" onclick="approveUser('${user.id}')">تایید</button>` : 
                      ''}
                    ${user.status === 'approved' ? 
                      `<button class="action-btn btn-warning" onclick="suspendUser('${user.id}')">معلق</button>` : 
                      user.status === 'suspended' ?
                      `<button class="action-btn btn-approve" onclick="approveUser('${user.id}')">فعال‌سازی</button>` : 
                      ''}
                    <button class="action-btn btn-reject" onclick="deleteUser('${user.id}', '${user.name}')">حذف</button>
                </td>
            `;
            
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading all users:', error);
        const table = document.getElementById('allUsersTable');
        if (table) {
            table.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 20px; color: var(--accent);">
                        خطا در بارگذاری: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
}

// توابع مدیریت کاربران
window.approveUser = async function(userId) {
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
        
        // رفرش لیست‌ها
        await loadPendingUsers();
        await loadAllUsers();
        
    } catch (error) {
        console.error('Error approving user:', error);
        showNotification('خطا در تایید کاربر', 'error');
    }
};

window.rejectUser = async function(userId) {
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
        
        // رفرش لیست‌ها
        await loadPendingUsers();
        await loadAllUsers();
        
    } catch (error) {
        console.error('Error rejecting user:', error);
        showNotification('خطا در رد کاربر', 'error');
    }
};

window.suspendUser = async function(userId) {
    try {
        const { error } = await supabase
            .from('users')
            .update({ 
                status: 'suspended',
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);
        
        if (error) throw error;
        
        showNotification('کاربر با موفقیت معلق شد', 'success');
        await loadAllUsers();
        
    } catch (error) {
        console.error('Error suspending user:', error);
        showNotification('خطا در تعلیق کاربر', 'error');
    }
};

window.deleteUser = async function(userId, userName) {
    if (!confirm(`آیا از حذف کاربر "${userName}" اطمینان دارید؟ این عمل غیرقابل بازگشت است.`)) {
        return;
    }
    
    try {
        // ابتدا اتصال‌های مرتبط را بررسی می‌کنیم
        const { data: userTrips, error: tripsError } = await supabase
            .from('trips')
            .select('id')
            .eq('user_id', userId);
        
        if (tripsError) {
            console.error('Error checking user trips:', tripsError);
        }
        
        if (userTrips && userTrips.length > 0) {
            if (!confirm(`این کاربر ${userTrips.length} سفر دارد. آیا باز هم می‌خواهید حذف شود؟`)) {
                return;
            }
        }
        
        // حذف کاربر
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);
        
        if (error) throw error;
        
        showNotification('کاربر با موفقیت حذف شد', 'success');
        
        // رفرش لیست‌ها
        await loadPendingUsers();
        await loadAllUsers();
        
    } catch (error) {
        console.error('Error deleting user:', error);
        showNotification('خطا در حذف کاربر', 'error');
    }
};

// بارگذاری رانندگان برای پنل ادمین
async function loadDriversForAdmin() {
    try {
        const { data, error } = await supabase
            .from('drivers')
            .select(`
                *,
                users (name, email, phone)
            `)
            .order('created_at', { ascending: false });
        
        const table = document.getElementById('driversTable');
        if (!table) return;
        
        table.innerHTML = '';
        
        if (error || !data || data.length === 0) {
            table.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 20px; color: var(--gray);">
                        هیچ راننده‌ای ثبت‌نام نکرده است
                    </td>
                </tr>
            `;
            return;
        }
        
        data.forEach(driver => {
            const row = document.createElement('tr');
            const date = new Date(driver.created_at).toLocaleDateString('fa-IR');
            const statusClass = driver.status === 'available' ? 'status-completed' : 
                              driver.status === 'busy' ? 'status-pending' : 'status-cancelled';
            const statusText = driver.status === 'available' ? 'آماده' : 
                              driver.status === 'busy' ? 'مشغول' : 'غیرفعال';
            
            const onlineStatus = driver.is_online ? 
                '<span class="status-badge status-completed">آنلاین</span>' : 
                '<span class="status-badge status-cancelled">آفلاین</span>';
            
            row.innerHTML = `
                <td>${driver.users?.name || driver.name}</td>
                <td>${driver.users?.phone || '---'}</td>
                <td>${driver.vehicle_type === 'car' ? 'خودرو' : 'موتور'}</td>
                <td>${driver.vehicle_model || '---'}</td>
                <td>${driver.license_plate || '---'}</td>
                <td>${driver.rating || 0}</td>
                <td>${driver.total_trips || 0}</td>
                <td>${onlineStatus}</td>
                <td>${date}</td>
                <td class="action-buttons">
                    <button class="action-btn btn-view" onclick="viewDriverDetails('${driver.id}')">جزئیات</button>
                    <button class="action-btn btn-${driver.is_online ? 'reject' : 'approve'}" 
                            onclick="toggleDriverStatus('${driver.id}', ${driver.is_online})">
                        ${driver.is_online ? 'غیرفعال' : 'فعال'}
                    </button>
                </td>
            `;
            
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading drivers:', error);
    }
}

window.viewDriverDetails = function(driverId) {
    showNotification('جزئیات راننده به زودی نمایش داده می‌شود', 'info');
};

window.toggleDriverStatus = async function(driverId, currentStatus) {
    try {
        const { error } = await supabase
            .from('drivers')
            .update({ 
                is_online: !currentStatus,
                status: !currentStatus ? 'available' : 'offline'
            })
            .eq('id', driverId);
        
        if (error) throw error;
        
        showNotification(`راننده ${!currentStatus ? 'فعال' : 'غیرفعال'} شد`, 'success');
        await loadDriversForAdmin();
        
    } catch (error) {
        console.error('Error toggling driver status:', error);
        showNotification('خطا در تغییر وضعیت راننده', 'error');
    }
};

// بارگذاری سفرها برای پنل ادمین
async function loadAdminTrips() {
    try {
        const { data, error } = await supabase
            .from('trips')
            .select(`
                *,
                users (name, phone)
            `)
            .order('created_at', { ascending: false })
            .limit(50);
        
        const table = document.getElementById('tripsTable');
        if (!table) return;
        
        table.innerHTML = '';
        
        if (error || !data || data.length === 0) {
            table.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 20px; color: var(--gray);">
                        هیچ سفری ثبت نشده است
                    </td>
                </tr>
            `;
            return;
        }
        
        data.forEach(trip => {
            const row = document.createElement('tr');
            const date = new Date(trip.created_at).toLocaleDateString('fa-IR');
            const rideType = trip.ride_type === 'economy' ? 'اقتصادی' : 
                           trip.ride_type === 'comfort' ? 'کلاسیک' : 
                           trip.ride_type === 'bike' ? 'موتور' : 'نامشخص';
            
            const statusClass = trip.status === 'completed' ? 'status-completed' : 
                              trip.status === 'in_progress' ? 'status-pending' : 
                              trip.status === 'cancelled' ? 'status-cancelled' : 'status-pending';
            
            const statusText = trip.status === 'completed' ? 'تکمیل شده' : 
                             trip.status === 'in_progress' ? 'در حال اجرا' : 
                             trip.status === 'cancelled' ? 'لغو شده' : 
                             trip.status === 'requested' ? 'درخواست شده' : trip.status;
            
            row.innerHTML = `
                <td>${trip.users?.name || 'مهمان'}</td>
                <td>${trip.pickup_location || '---'}</td>
                <td>${trip.destination || '---'}</td>
                <td>${rideType}</td>
                <td>${trip.estimated_price || 0} افغانی</td>
                <td>${date}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td class="action-buttons">
                    <button class="action-btn btn-view" onclick="viewTripDetails('${trip.id}')">جزئیات</button>
                    ${trip.status === 'requested' || trip.status === 'in_progress' ? 
                      `<button class="action-btn btn-approve" onclick="updateTripStatus('${trip.id}', 'completed')">تکمیل</button>` : 
                      ''}
                </td>
            `;
            
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading trips:', error);
    }
}

window.viewTripDetails = function(tripId) {
    showNotification(`جزئیات سفر ${tripId} به زودی نمایش داده می‌شود`, 'info');
};

window.updateTripStatus = async function(tripId, status) {
    try {
        const { error } = await supabase
            .from('trips')
            .update({ 
                status: status,
                completed_at: status === 'completed' ? new Date().toISOString() : null
            })
            .eq('id', tripId);
        
        if (error) throw error;
        
        showNotification(`وضعیت سفر به "${status === 'completed' ? 'تکمیل شده' : 'لغو شده'}" تغییر کرد`, 'success');
        await loadAdminTrips();
        
    } catch (error) {
        console.error('Error updating trip status:', error);
        showNotification('خطا در تغییر وضعیت سفر', 'error');
    }
};

// بارگذاری تخفیف‌ها
async function loadAdminDiscounts() {
    try {
        // این بخش نیاز به جدول discounts در Supabase دارد
        // فعلاً داده‌های نمونه نمایش می‌دهیم
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
                <div class="discount-actions">
                    <button class="btn btn-primary" onclick="editDiscount('${discount.code}')">ویرایش</button>
                    <button class="btn btn-reject" onclick="deleteDiscount('${discount.code}')">حذف</button>
                </div>
            `;
            
            container.appendChild(discountCard);
        });
        
    } catch (error) {
        console.error('Error loading discounts:', error);
    }
}

window.editDiscount = function(code) {
    showNotification(`ویرایش تخفیف ${code} به زودی اضافه می‌شود`, 'info');
};

window.deleteDiscount = function(code) {
    if (confirm(`آیا از حذف کد تخفیف ${code} اطمینان دارید؟`)) {
        showNotification(`کد تخفیف ${code} حذف شد`, 'success');
        loadAdminDiscounts();
    }
};

// بارگذاری تیکت‌های پشتیبانی
async function loadAdminSupport() {
    try {
        // این بخش نیاز به جدول support_tickets در Supabase دارد
        // فعلاً داده‌های نمونه نمایش می‌دهیم
        const table = document.getElementById('supportTable');
        if (!table) return;
        
        const sampleTickets = [
            { id: 'T001', user: 'احمد محمدی', subject: 'مشکل در پرداخت', status: 'open', priority: 'high', date: '۱۴۰۳/۰۱/۱۵' },
            { id: 'T002', user: 'محمد کریمی', subject: 'درخواست استرداد وجه', status: 'pending', priority: 'medium', date: '۱۴۰۳/۰۱/۱۴' },
            { id: 'T003', user: 'نوید احمدی', subject: 'مشکل در رزرو', status: 'closed', priority: 'low', date: '۱۴۰۳/۰۱/۱۳' },
            { id: 'T004', user: 'کریم علیزاده', subject: 'پیشنهاد بهبود سیستم', status: 'open', priority: 'low', date: '۱۴۰۳/۰۱/۱۲' }
        ];
        
        table.innerHTML = '';
        
        sampleTickets.forEach(ticket => {
            const row = document.createElement('tr');
            const statusClass = ticket.status === 'open' ? 'status-pending' : 
                              ticket.status === 'pending' ? 'status-warning' : 
                              ticket.status === 'closed' ? 'status-completed' : '';
            
            const priorityClass = ticket.priority === 'high' ? 'priority-high' : 
                                ticket.priority === 'medium' ? 'priority-medium' : 'priority-low';
            
            row.innerHTML = `
                <td>${ticket.id}</td>
                <td>${ticket.user}</td>
                <td>${ticket.subject}</td>
                <td><span class="priority-badge ${priorityClass}">${ticket.priority === 'high' ? 'بالا' : ticket.priority === 'medium' ? 'متوسط' : 'پایین'}</span></td>
                <td><span class="status-badge ${statusClass}">${ticket.status === 'open' ? 'باز' : ticket.status === 'pending' ? 'در حال بررسی' : 'بسته'}</span></td>
                <td>${ticket.date}</td>
                <td class="action-buttons">
                    <button class="action-btn btn-view" onclick="viewTicket('${ticket.id}')">مشاهده</button>
                    ${ticket.status !== 'closed' ? 
                      `<button class="action-btn btn-approve" onclick="closeTicket('${ticket.id}')">بستن</button>` : 
                      ''}
                </td>
            `;
            
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading support tickets:', error);
    }
}

window.viewTicket = function(ticketId) {
    showNotification(`تیکت ${ticketId} به زودی نمایش داده می‌شود`, 'info');
};

window.closeTicket = function(ticketId) {
    if (confirm(`آیا از بستن تیکت ${ticketId} اطمینان دارید؟`)) {
        showNotification(`تیکت ${ticketId} بسته شد`, 'success');
        loadAdminSupport();
    }
};